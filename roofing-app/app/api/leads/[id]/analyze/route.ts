import { NextRequest, NextResponse } from "next/server";
import { ensureEnvLoaded } from "@/lib/env.server";
import { getGoogleMapsApiKey, mapsStaticSatelliteUrl, satelliteImageSrcForLead } from "@/lib/maps-static";
import { calcQuoteRanges } from "@/lib/quote";
import { getSettings, getSupabaseAdmin } from "@/lib/supabase";
import { runVisionAnalysis, sendEmail } from "@/lib/integrations";
import { VISION_TIMEOUT_MESSAGE } from "@/lib/vision-constants";
import { VisionAnalysisTimeoutError } from "@/lib/vision";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureEnvLoaded();

  try {
    const { id } = await params;
    const leadId = Number(id);
    if (!Number.isFinite(leadId)) {
      return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const settings = await getSettings();

    const { data: lead, error: fetchError } = await supabase.from("leads").select("*").eq("id", leadId).single();
    if (fetchError || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (lead.roof_sqft != null) {
      return NextResponse.json({
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
    const analysis = await runVisionAnalysis(staticUrlForVision);
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

    return NextResponse.json({ lead: leadWithImage });
  } catch (error) {
    if (error instanceof VisionAnalysisTimeoutError) {
      return NextResponse.json(
        { error: VISION_TIMEOUT_MESSAGE, code: "VISION_TIMEOUT" },
        { status: 504 },
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analysis failed" },
      { status: 500 },
    );
  }
}
