import type { SupabaseClient } from "@supabase/supabase-js";

type LeadVisionRow = {
  roof_sqft?: number | null;
  vision_confidence?: number | null;
  vision_analysis_raw?: string | null;
};

function parseVisionAnalysisRaw(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** True when DB has no usable analysis or a prior blocked/failed result. */
export function isStoredAnalysisBlocked(lead: LeadVisionRow): boolean {
  if (lead.roof_sqft == null) return true;

  const rawText = String(lead.vision_analysis_raw ?? "").toLowerCase();
  if (rawText.includes("analysis blocked") || rawText.includes("vision_refusal")) {
    return true;
  }

  const raw = parseVisionAnalysisRaw(lead.vision_analysis_raw);
  if (!raw) {
    return false;
  }

  const code = String(raw.code ?? "").toUpperCase();
  if (code === "VISION_REFUSAL" || code === "VISION_UNABLE") return true;

  const userMessage = String(raw.userMessage ?? raw.error ?? "").toLowerCase();
  if (userMessage.includes("analysis blocked")) return true;

  const refusal = String(raw.refusal ?? raw.vision_error ?? "").toLowerCase();
  if (refusal.includes("can't help") || refusal.includes("cannot help")) return true;

  const source = String(raw.analysis_source ?? raw.source ?? "");
  const validSource =
    source === "gpt4o_vision" ||
    source === "uk_coordinate_fallback" ||
    source === "au_coordinate_fallback" ||
    source === "nz_coordinate_fallback" ||
    source.endsWith("_coordinate_fallback") ||
    source === "openai" ||
    source === "coordinates";

  if (!validSource) {
    const looksLikeOldFallback =
      lead.roof_sqft === 2200 && lead.vision_confidence === 62 && !raw.roof_area_sqm;
    if (looksLikeOldFallback) return true;
  }

  return false;
}

export function needsVisionRerun(lead: LeadVisionRow, force: boolean): boolean {
  if (force) return true;
  return isStoredAnalysisBlocked(lead);
}

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
