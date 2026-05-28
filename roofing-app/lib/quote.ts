import { RoofType, SettingsRow, VisionAnalysis } from "@/lib/types";

const typeMultiplier = (roofType: RoofType, settings: SettingsRow) => {
  if (roofType === "metal") return settings.material_multiplier_metal;
  if (roofType === "tile") return settings.material_multiplier_tile;
  return 1;
};

export function calcQuoteRanges(roofSqft: number, roofType: RoofType, settings: SettingsRow) {
  const multiplier = typeMultiplier(roofType, settings);
  const multiply = (value: number) => Math.round(value * roofSqft * multiplier);
  return {
    quote_repair_low: multiply(settings.price_per_sqft_repair_low),
    quote_repair_high: multiply(settings.price_per_sqft_repair_high),
    quote_standard_low: multiply(settings.price_per_sqft_standard_low),
    quote_standard_high: multiply(settings.price_per_sqft_standard_high),
    quote_premium_low: multiply(settings.price_per_sqft_premium_low),
    quote_premium_high: multiply(settings.price_per_sqft_premium_high),
  };
}

export function fallbackVisionAnalysis(): VisionAnalysis {
  return {
    roof_sqft: 2200,
    roof_type: "asphalt_shingle",
    complexity: "moderate",
    confidence: 62,
    polygon_coordinates: [
      { x: 180, y: 205 },
      { x: 430, y: 185 },
      { x: 460, y: 350 },
      { x: 190, y: 370 },
    ],
  };
}
