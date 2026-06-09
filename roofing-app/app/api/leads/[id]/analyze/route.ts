import { NextRequest, NextResponse } from "next/server";
import { ensureEnvLoaded } from "@/lib/env.server";
import { clearLeadVisionAnalysis, isStoredAnalysisBlocked, needsVisionRerun } from "@/lib/lead-vision";
import {
  getGoogleMapsApiKey,
  mapsStaticSatelliteUrl,
  maskGoogleMapsKeyInUrl,
  SATELLITE_STATIC_ZOOM,
  satelliteImageSrcForLead,
} from "@/lib/maps-static";
import { formatRoofAreaDisplay } from "@/lib/roof-estimate";
import { calcQuoteRanges } from "@/lib/quote";
import { getSettings, getSupabaseAdmin } from "@/lib/supabase";
import {
  detectCoordinateFallbackRegion,
  visionAnalysisFromCoordinateFallback,
} from "@/lib/regional-roof-estimate";
import { runVisionAnalysis } from "@/lib/integrations";
import { VISION_TIMEOUT_MESSAGE } from "@/lib/vision-constants";
import {
  VisionAnalysisRefusalError,
  VisionAnalysisTimeoutError,
  VisionUnableToEstimateError,
} from "@/lib/vision";
import type { VisionAnalysis } from "@/lib/types";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const analyzeStartedAt = Date.now();
  console.info("[vision/analyze] === ANALYZE POST called ===", {
    at: new Date(analyzeStartedAt).toISOString(),
    url: req.nextUrl.pathname + req.nextUrl.search,
  });

  ensureEnvLoaded();

  let leadId: number | null = null;

  try {
    const { id } = await params;
    leadId = Number(id);
    if (!Number.isFinite(leadId)) {
      return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
    }

    const force = req.nextUrl.searchParams.get("force") === "true";
    const supabase = getSupabaseAdmin();
    const settings = await getSettings();

    let { data: lead, error: fetchError } = await supabase.from("leads").select("*").eq("id", leadId).single();
    if (fetchError || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const rerun = needsVisionRerun(lead, force);

    if (rerun && (lead.roof_sqft != null || lead.vision_analysis_raw)) {
      console.info(`[vision/analyze] lead ${leadId} clearing stale analysis`, {
        force,
        roof_sqft: lead.roof_sqft,
        blocked: isStoredAnalysisBlocked(lead),
      });
      await clearLeadVisionAnalysis(supabase, leadId);
      const refetch = await supabase.from("leads").select("*").eq("id", leadId).single();
      lead = refetch.data;
      fetchError = refetch.error;
      if (fetchError || !lead) {
        return NextResponse.json({ error: "Lead not found after reset" }, { status: 404 });
      }
    }

    if (lead.roof_sqft != null && !isStoredAnalysisBlocked(lead)) {
      console.info(`[vision/analyze] lead ${leadId} already analyzed — roof_sqft=${lead.roof_sqft} (skipping GPT-4o)`);
      return NextResponse.json({
        cached: true,
        lead: { ...lead, satellite_image_url: satelliteImageSrcForLead(lead) },
      });
    }

    if (lead.latitude == null || lead.longitude == null) {
      return NextResponse.json({ error: "Lead is missing coordinates for analysis" }, { status: 400 });
    }

    const mapsKey = getGoogleMapsApiKey(settings.google_maps_api_key);
    if (!mapsKey) {
      return NextResponse.json(
        { error: "Google Maps API key is missing. Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in roofing-app/.env.local." },
        { status: 500 },
      );
    }

    const staticUrlForVision = mapsStaticSatelliteUrl(lead.latitude, lead.longitude, mapsKey);
    const lat = Number(lead.latitude);
    const metersPerPixelApprox =
      Number.isFinite(lat) && Math.abs(lat) <= 85
        ? (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, SATELLITE_STATIC_ZOOM) / 2
        : null;
    const tileSpanMetresApprox =
      metersPerPixelApprox != null ? Math.round(metersPerPixelApprox * 1200) : null;

    console.info(`[vision/analyze] lead ${leadId} starting analysis`, {
      address: lead.address,
      latitude: lead.latitude,
      longitude: lead.longitude,
      country_code: lead.country_code,
      force,
      satelliteZoom: SATELLITE_STATIC_ZOOM,
      satelliteUrl: maskGoogleMapsKeyInUrl(staticUrlForVision),
      satellite_tile_span_metres_approx: tileSpanMetresApprox,
      satellite_context_note:
        "Approximate ground span of the static map tile; compare to AI roof_area_sqm to spot footprint/tile-scale errors",
    });
    let analysis: VisionAnalysis;
    let analysisSource = "gpt4o_vision";

    try {
      analysis = await runVisionAnalysis(staticUrlForVision, lead.country_code);
    } catch (visionError) {
      const fallbackRegion = detectCoordinateFallbackRegion(
        lead.latitude,
        lead.longitude,
        lead.address,
        lead.country_code,
      );
      const visionFailed =
        visionError instanceof VisionAnalysisRefusalError ||
        visionError instanceof VisionUnableToEstimateError;

      console.warn(`[vision/analyze] lead ${leadId} GPT-4o failed`, {
        errorType: visionError instanceof Error ? visionError.name : "unknown",
        visionFailed,
        fallbackRegion,
        country_code: lead.country_code,
        address: lead.address,
      });

      if (visionFailed && fallbackRegion) {
        const reason =
          visionError instanceof VisionAnalysisRefusalError
            ? visionError.refusal || visionError.message
            : visionError.cause || visionError.message;
        console.warn(
          `[vision/analyze] lead ${leadId} using ${fallbackRegion} coordinate fallback (not returning blocked)`,
          { reason },
        );
        analysis = visionAnalysisFromCoordinateFallback(
          lead.latitude,
          lead.longitude,
          lead.address,
          lead.country_code,
          reason,
        );
        analysisSource = `${fallbackRegion}_coordinate_fallback`;
      } else {
        console.error(`[vision/analyze] lead ${leadId} rethrowing — no coordinate fallback`, {
          fallbackRegion,
          visionFailed,
        });
        throw visionError;
      }
    }

    const areaDisplay = formatRoofAreaDisplay(
      analysis.roof_sqft,
      lead.address,
      lead.country_code,
    );
    const fallbackSqm =
      "roof_area_sqm" in analysis && typeof (analysis as { roof_area_sqm?: number }).roof_area_sqm === "number"
        ? (analysis as { roof_area_sqm: number }).roof_area_sqm
        : null;

    console.info(`[vision/analyze] lead ${leadId} analysis done`, {
      source: analysisSource,
      roof_sqft_stored_internal: analysis.roof_sqft,
      roof_area_sqm_from_fallback_or_uk: fallbackSqm,
      roof_type: analysis.roof_type,
      confidence: analysis.confidence,
      customer_display_label: areaDisplay.label,
      customer_display_unit: areaDisplay.unit,
      storage_note: "leads.roof_sqft is always square feet; metric UI converts with * 0.092903",
    });
    console.info(`[vision/analyze] lead ${leadId} raw vision payload (pre-save)`, {
      analysis,
    });
    const quotes = calcQuoteRanges(analysis.roof_sqft, analysis.roof_type, settings);

    console.log("[vision/analyze] raw GPT-4o roof_area_sqm:", (analysis as { roof_area_sqm?: unknown }).roof_area_sqm);

    const { data: updated, error: updateError } = await supabase
      .from("leads")
      .update({
        roof_sqft: analysis.roof_sqft,
        roof_type: analysis.roof_type,
        roof_complexity: analysis.complexity,
        vision_confidence: analysis.confidence,
        vision_roof_visible: analysis.roof_visible,
        vision_fallback_reason: analysis.fallback_reason,
        polygon_coordinates: analysis.polygon_coordinates,
        vision_analysis_raw: JSON.stringify({ ...analysis, analysis_source: analysisSource }),
        ...quotes,
        status: "quoted",
      })
      .eq("id", leadId)
      .select("*")
      .single();

    if (updateError || !updated) throw updateError || new Error("Failed to update lead");

    const leadWithImage = {
      ...updated,
      satellite_image_url: satelliteImageSrcForLead(updated),
    };

    return NextResponse.json({ lead: leadWithImage, cached: false, analysis_source: analysisSource });
  } catch (error) {
    if (error instanceof VisionAnalysisTimeoutError) {
      return NextResponse.json(
        { error: VISION_TIMEOUT_MESSAGE, code: "VISION_TIMEOUT" },
        { status: 504 },
      );
    }

    if (error instanceof VisionAnalysisRefusalError) {
      console.error("[vision/analyze] === returning 422 VISION_REFUSAL (analysis blocked) ===", {
        leadId,
        refusal: error.refusal,
        elapsedMs: Date.now() - analyzeStartedAt,
      });
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          refusal: error.refusal,
        },
        { status: 422 },
      );
    }

    if (error instanceof VisionUnableToEstimateError) {
      console.error("[vision/analyze] === returning 422 VISION_UNABLE ===", {
        leadId,
        cause: error.cause,
        elapsedMs: Date.now() - analyzeStartedAt,
      });
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          cause: error.cause,
        },
        { status: 422 },
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analysis failed", code: "VISION_UNABLE" },
      { status: 500 },
    );
  }
}
