import { calcQuoteRanges } from "@/lib/quote";
import { RoofType, SettingsRow } from "@/lib/types";

export const ROOF_MATERIAL_NOT_SURE = "not_sure";

export type RoofMaterialOption = {
  id: string;
  label: string;
  icon: string;
};

export type MaterialRegion = "AU" | "NZ" | "GB" | "US_CA" | "DEFAULT";

export function normalizeMaterialRegion(
  countryCode: string | null | undefined,
  address?: string | null,
): MaterialRegion {
  const code = String(countryCode ?? "")
    .trim()
    .toUpperCase();
  if (code === "UK") return "GB";
  if (code === "AU" || code === "AUS") return "AU";
  if (code === "NZ" || code === "NZL") return "NZ";
  if (code === "GB") return "GB";
  if (code === "US" || code === "CA") return "US_CA";

  const addr = String(address ?? "").toLowerCase();
  if (addr.includes("australia")) return "AU";
  if (addr.includes("new zealand")) return "NZ";
  if (addr.includes("united kingdom") || /\buk\b/.test(addr)) return "GB";
  if (addr.includes("canada")) return "US_CA";

  return "DEFAULT";
}

const MATERIALS_BY_REGION: Record<MaterialRegion, RoofMaterialOption[]> = {
  AU: [
    { id: "colorbond", label: "Colorbond (metal)", icon: "🏗️" },
    { id: "terracotta_tiles", label: "Terracotta tiles", icon: "🧱" },
    { id: "concrete_tiles", label: "Concrete tiles", icon: "🧱" },
    { id: "zincalume", label: "Zincalume", icon: "🔩" },
    { id: "slate", label: "Slate", icon: "🪨" },
    { id: ROOF_MATERIAL_NOT_SURE, label: "Not sure? Show me all options", icon: "❓" },
  ],
  NZ: [
    { id: "colorbond", label: "Colorbond", icon: "🏗️" },
    { id: "concrete_tiles", label: "Concrete tiles", icon: "🧱" },
    { id: "terracotta_tiles", label: "Terracotta tiles", icon: "🧱" },
    { id: "zincalume", label: "Zincalume", icon: "🔩" },
    { id: "slate", label: "Slate", icon: "🪨" },
    { id: ROOF_MATERIAL_NOT_SURE, label: "Not sure? Show me all options", icon: "❓" },
  ],
  GB: [
    { id: "concrete_tiles", label: "Concrete tiles", icon: "🧱" },
    { id: "clay_terracotta", label: "Clay/terracotta tiles", icon: "🧱" },
    { id: "slate", label: "Slate", icon: "🪨" },
    { id: "felt_flat", label: "Felt (flat roof)", icon: "📐" },
    { id: "metal", label: "Metal", icon: "🔩" },
    { id: ROOF_MATERIAL_NOT_SURE, label: "Not sure? Show me all options", icon: "❓" },
  ],
  US_CA: [
    { id: "asphalt_shingles", label: "Asphalt shingles", icon: "🏠" },
    { id: "metal", label: "Metal", icon: "🔩" },
    { id: "slate", label: "Slate", icon: "🪨" },
    { id: "clay_terracotta", label: "Clay/terracotta tiles", icon: "🧱" },
    { id: "wood_shingles", label: "Wood shingles", icon: "🪵" },
    { id: ROOF_MATERIAL_NOT_SURE, label: "Not sure? Show me all options", icon: "❓" },
  ],
  DEFAULT: [
    { id: "tiles", label: "Tiles", icon: "🧱" },
    { id: "metal", label: "Metal", icon: "🔩" },
    { id: "slate", label: "Slate", icon: "🪨" },
    { id: "other", label: "Other", icon: "🏠" },
    { id: ROOF_MATERIAL_NOT_SURE, label: "Not sure? Show me all options", icon: "❓" },
  ],
};

export function getMaterialOptionsForLead(
  countryCode: string | null | undefined,
  address?: string | null,
): RoofMaterialOption[] {
  const region = normalizeMaterialRegion(countryCode, address);
  return MATERIALS_BY_REGION[region];
}

export function isValidRoofMaterialForLead(
  material: string,
  countryCode: string | null | undefined,
  address?: string | null,
): boolean {
  return getMaterialOptionsForLead(countryCode, address).some((o) => o.id === material);
}

export function roofMaterialLabel(
  materialId: string | null | undefined,
  countryCode?: string | null,
  address?: string | null,
): string {
  if (!materialId) return "—";
  const match = getMaterialOptionsForLead(countryCode, address).find((o) => o.id === materialId);
  return match?.label ?? materialId.replace(/_/g, " ");
}

export function roofMaterialToRoofType(materialId: string): RoofType {
  if (["colorbond", "zincalume", "metal"].includes(materialId)) return "metal";
  if (
    ["terracotta_tiles", "concrete_tiles", "clay_terracotta", "tiles", "slate"].includes(materialId)
  ) {
    return "tile";
  }
  if (materialId === "felt_flat") return "flat";
  return "asphalt_shingle";
}

export function calcQuotesForMaterial(
  roofSqft: number,
  materialId: string,
  settings: SettingsRow,
) {
  return calcQuoteRanges(roofSqft, roofMaterialToRoofType(materialId), settings);
}

export function calcStandardRangeForMaterial(
  roofSqft: number,
  materialId: string,
  settings: SettingsRow,
): { low: number; high: number } {
  const quotes = calcQuotesForMaterial(roofSqft, materialId, settings);
  return {
    low: quotes.quote_standard_low,
    high: quotes.quote_standard_high,
  };
}

export function comparisonMaterialsForLead(
  countryCode: string | null | undefined,
  address?: string | null,
): RoofMaterialOption[] {
  return getMaterialOptionsForLead(countryCode, address).filter((o) => o.id !== ROOF_MATERIAL_NOT_SURE);
}

export function isRoofMaterialNotSure(material: string | null | undefined): boolean {
  return material === ROOF_MATERIAL_NOT_SURE;
}
