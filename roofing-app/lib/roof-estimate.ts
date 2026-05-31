import { DEFAULT_SETTINGS } from "@/lib/defaults";
import { calcQuoteRanges } from "@/lib/quote";
import { SettingsRow } from "@/lib/types";

/** Deterministic roof size (sq ft) from address text when coordinates are unavailable. */
export function estimateRoofSqftFromAddress(address: string): number {
  const normalized = address.trim().toLowerCase();
  if (!normalized) return 0;

  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  const frac = (hash % 1000) / 1000;
  return Math.round(1100 + frac * 2300);
}

/** Deterministic roof size (sq ft) from property coordinates — varies per lat/lng. */
export function estimateRoofSqftFromCoordinates(lat: number, lng: number): number {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 0;

  const h1 = Math.sin(lat * 12.9898 + lng * 78.233) * 43758.5453;
  const frac1 = h1 - Math.floor(h1);
  const h2 = Math.cos(lat * 39.123 + lng * 11.717) * 9172.11;
  const frac2 = h2 - Math.floor(h2);
  const blend = frac1 * 0.65 + frac2 * 0.35;

  const minSqft = 1100;
  const maxSqft = 3400;
  let sqft = Math.round(minSqft + blend * (maxSqft - minSqft));

  const latFactor = 1 + (Math.abs(lat) % 12) / 200;
  const lngFactor = 1 + (Math.abs(lng) % 8) / 250;
  sqft = Math.round(sqft * latFactor * lngFactor);

  return Math.max(900, Math.min(4500, sqft));
}

export function usesMetricRoofDisplay(address?: string | null, countryCode?: string | null): boolean {
  const code = String(countryCode ?? "").trim().toUpperCase();
  if (code === "GB" || code === "UK" || code === "AU" || code === "NZ" || code === "CA") return true;
  const addr = String(address ?? "").toLowerCase();
  return (
    addr.includes(", uk") ||
    addr.endsWith(" uk") ||
    addr.includes("united kingdom") ||
    addr.includes("australia") ||
    addr.includes("new zealand") ||
    addr.includes("canada")
  );
}

export function formatRoofAreaDisplay(
  roofSqft: number,
  address?: string | null,
  countryCode?: string | null,
): { roof_sqft: number; value: number; unit: string; label: string } {
  if (usesMetricRoofDisplay(address, countryCode)) {
    const sqm = Math.round(roofSqft * 0.092903);
    return { roof_sqft: roofSqft, value: sqm, unit: "m²", label: `${sqm.toLocaleString("en-US")} m²` };
  }
  return {
    roof_sqft: roofSqft,
    value: roofSqft,
    unit: "sq ft",
    label: `${roofSqft.toLocaleString("en-US")} sq ft`,
  };
}

export function previewMaterialForRegion(address?: string | null, countryCode?: string | null): string {
  const code = String(countryCode ?? "").trim().toUpperCase();
  const addr = String(address ?? "").toLowerCase();
  if (code === "GB" || code === "UK" || addr.includes("uk") || addr.includes("united kingdom")) {
    return "Concrete tile";
  }
  if (code === "AU" || code === "NZ" || addr.includes("australia") || addr.includes("new zealand")) {
    return "Colorbond steel";
  }
  if (code === "CA" || addr.includes("canada")) {
    return "Asphalt shingle";
  }
  return "Asphalt shingle";
}

export function previewPriceRangeFromEstimate(
  roofSqft: number,
  address: string,
  settings?: Partial<SettingsRow> | null,
  countryCode?: string | null,
): string {
  const merged = { id: 0, ...DEFAULT_SETTINGS, ...settings } as SettingsRow;
  const quotes = calcQuoteRanges(roofSqft, "asphalt_shingle", merged);
  const lowUsd = quotes.quote_standard_low;
  const highUsd = quotes.quote_standard_high;
  const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

  if (address.includes("UK") || countryCode === "GB" || countryCode === "UK") {
    const rate = Number(merged.currency_rate_gbp ?? 0.79);
    return `£${fmt(lowUsd * rate)}-£${fmt(highUsd * rate)}`;
  }
  if (address.includes("Australia") || countryCode === "AU") {
    const rate = Number(merged.currency_rate_aud ?? 1.53);
    return `A$${fmt(lowUsd * rate)}-A$${fmt(highUsd * rate)}`;
  }
  if (address.includes("New Zealand") || countryCode === "NZ") {
    const rate = Number(merged.currency_rate_nzd ?? 1.64);
    return `NZ$${fmt(lowUsd * rate)}-NZ$${fmt(highUsd * rate)}`;
  }
  if (address.includes("Canada") || countryCode === "CA") {
    const rate = Number(
      (merged as { currency_rate_cad?: number }).currency_rate_cad ?? 1.36,
    );
    return `C$${fmt(lowUsd * rate)}-C$${fmt(highUsd * rate)}`;
  }
  return `$${fmt(lowUsd)}-$${fmt(highUsd)}`;
}
