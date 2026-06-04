import { NextRequest, NextResponse } from "next/server";
import {
  estimateStage1RoofSqftFromCountry,
  formatRoofAreaDisplay,
  previewMaterialForRegion,
  previewPriceRangeFromEstimate,
  STAGE1_ROOF_SIZE_LABEL,
} from "@/lib/roof-estimate";
import { getSettings, getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const address = typeof body.address === "string" ? body.address : "";
    const countryCode = typeof body.country_code === "string" ? body.country_code : null;
    const leadId = Number(body.lead_id);

    const settings = await getSettings();

    if (Number.isFinite(leadId) && isSupabaseConfigured()) {
      const supabase = getSupabaseAdmin();
      const { data: lead } = await supabase.from("leads").select("roof_sqft, roof_type").eq("id", leadId).single();
      if (lead?.roof_sqft != null) {
        const area = formatRoofAreaDisplay(lead.roof_sqft, address, countryCode);
        return NextResponse.json({
          roof_sqft: lead.roof_sqft,
          source: "vision",
          area,
          material: lead.roof_type ? String(lead.roof_type).replace(/_/g, " ") : previewMaterialForRegion(address, countryCode),
          price_range: previewPriceRangeFromEstimate(lead.roof_sqft, address, settings, countryCode),
        });
      }
    }

    if (!address.trim() && !countryCode) {
      return NextResponse.json(
        { error: "Enter an address or select one from the dropdown" },
        { status: 400 },
      );
    }

    const roof_sqft = estimateStage1RoofSqftFromCountry(countryCode, address);
    const area = formatRoofAreaDisplay(roof_sqft, address, countryCode);

    return NextResponse.json({
      roof_sqft,
      source: "regional_median",
      roof_size_label: STAGE1_ROOF_SIZE_LABEL,
      area,
      material: previewMaterialForRegion(address, countryCode),
      price_range: previewPriceRangeFromEstimate(roof_sqft, address, settings, countryCode),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Preview estimate failed" },
      { status: 500 },
    );
  }
}
