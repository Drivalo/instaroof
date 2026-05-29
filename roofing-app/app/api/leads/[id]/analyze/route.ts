import { NextRequest, NextResponse } from "next/server";
import { ensureEnvLoaded } from "@/lib/env.server";
import { clearLeadVisionAnalysis } from "@/lib/lead-vision";
import { getGoogleMapsApiKey, mapsStaticSatelliteUrl, satelliteImageSrcForLead } from "@/lib/maps-static";
import { calcQuoteRanges } from "@/lib/quote";
import { getSettings, getSupabaseAdmin } from "@/lib/supabase";
import { runVisionAnalysis, sendEmail } from "@/lib/integrations";
import {
  VISION_REFUSAL_MESSAGE,
  VISION_TIMEOUT_MESSAGE,
  VISION_UNABLE_MESSAGE,
} from "@/lib/vision-constants";
import {
  VisionAnalysisRefusalError,
  VisionAnalysisTimeoutError,
  VisionUnableToEstimateError,
} from "@/lib/vision";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureEnvLoaded();

  try {
    const { id } = await params;
    const leadId = Number(id);
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

    if (force && lead.roof_sqft != null) {
      console.info(`[vision/analyze] lead ${leadId} force=true — clearing cached vision`);
      await clearLeadVisionAnalysis(supabase, leadId);
      const refetch = await supabase.from("leads").select("*").eq("id", leadId).single();
      lead = refetch.data;
      fetchError = refetch.error;
      if (fetchError || !lead) {
        return NextResponse.json({ error: "Lead not found after reset" }, { status: 404 });
      }
    }

    if (lead.roof_sqft != null) {
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
    });
    const analysis = await runVisionAnalysis(staticUrlForVision);
    console.info(`[vision/analyze] lead ${leadId} analysis done`, {
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
        vision_analysis_raw: JSON.stringify(analysis),
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

    return NextResponse.json({ lead: leadWithImage, cached: false });
  } catch (error) {
    if (error instanceof VisionAnalysisTimeoutError) {
      return NextResponse.json(
        { error: VISION_TIMEOUT_MESSAGE, code: "VISION_TIMEOUT" },
        { status: 504 },
      );
    }

    if (error instanceof VisionAnalysisRefusalError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          userMessage: VISION_REFUSAL_MESSAGE,
          refusal: error.refusal,
        },
        { status: 422 },
      );
    }

    if (error instanceof VisionUnableToEstimateError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          userMessage: VISION_UNABLE_MESSAGE,
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
