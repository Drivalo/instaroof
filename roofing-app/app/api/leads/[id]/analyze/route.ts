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
import { calcQuoteRanges } from "@/lib/quote";
import { getSettings, getSupabaseAdmin } from "@/lib/supabase";
import {
  detectCoordinateFallbackRegion,
  visionAnalysisFromCoordinateFallback,
} from "@/lib/regional-roof-estimate";
import { runVisionAnalysis, sendEmail } from "@/lib/integrations";
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
    console.info(`[vision/analyze] lead ${leadId} starting analysis`, {
      address: lead.address,
      latitude: lead.latitude,
      longitude: lead.longitude,
      force,
      satelliteZoom: SATELLITE_STATIC_ZOOM,
      satelliteUrl: maskGoogleMapsKeyInUrl(staticUrlForVision),
    });
    let analysis: VisionAnalysis;
    let analysisSource = "gpt4o_vision";

    try {
      analysis = await runVisionAnalysis(staticUrlForVision);
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

    console.info(`[vision/analyze] lead ${leadId} analysis done`, {
      source: analysisSource,
      roof_sqft: analysis.roof_sqft,
      roof_type: analysis.roof_type,
      confidence: analysis.confidence,
    });
    const quotes = calcQuoteRanges(analysis.roof_sqft, analysis.roof_type, settings);

    const { data: updated, error: updateError } = await supabase
      .from("leads")
      .update({
        roof_sqft: analysis.roof_sqft,
        roof_type: analysis.roof_type,
        roof_complexity: analysis.complexity,
        vision_confidence: analysis.confidence,
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

    if (updated.email) {
      const quoteRange = `$${updated.quote_standard_low} - $${updated.quote_standard_high}`;
      await sendEmail(
        updated.email,
        "Your roof quote is ready",
        settings.email_template_quote_ready
          .replace("{{customer_name}}", updated.name || "Homeowner")
          .replace("{{quote_range}}", quoteRange)
          .replace("{{booking_link}}", `${req.nextUrl.origin}/book/${updated.id}`),
      );
    }

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
