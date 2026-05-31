import { detectCurrencyRegion, type CurrencyRegion } from "@/lib/currency";

const REGION_TO_ISO2: Record<CurrencyRegion, string> = {
  US: "US",
  GB: "GB",
  AU: "AU",
  NZ: "NZ",
  CA: "CA",
};

export type LeadCountryFallback = {
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

/**
 * Normalize a Google Places ISO2 country code (or supported-market selector value) for storage on leads.
 * Falls back to address/coordinates when the raw value is missing (legacy clients).
 */
export function normalizeLeadCountryCode(
  raw: unknown,
  fallback?: LeadCountryFallback,
): string | null {
  let code = String(raw ?? "").trim().toUpperCase();
  if (code === "UK") code = "GB";
  if (/^[A-Z]{2}$/.test(code)) return code;

  if (fallback) {
    const region = detectCurrencyRegion(
      fallback.address,
      null,
      fallback.latitude,
      fallback.longitude,
    );
    return REGION_TO_ISO2[region];
  }

  return null;
}
