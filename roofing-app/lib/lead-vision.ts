import type { SupabaseClient } from "@supabase/supabase-js";

/** Clears cached vision/quote fields so analyze can run again. */
export async function clearLeadVisionAnalysis(supabase: SupabaseClient, leadId: number) {
  const { error } = await supabase
    .from("leads")
    .update({
      roof_sqft: null,
      roof_type: null,
      roof_complexity: null,
      vision_confidence: null,
      polygon_coordinates: [],
      vision_analysis_raw: null,
      quote_repair_low: null,
      quote_repair_high: null,
      quote_standard_low: null,
      quote_standard_high: null,
      quote_premium_low: null,
      quote_premium_high: null,
    })
    .eq("id", leadId);

  if (error) throw error;
}
