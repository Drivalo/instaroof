/** Regional privacy block shown on /privacy (one per visitor). */
export type PrivacyRegion =
  | "gdpr"
  | "australia"
  | "new_zealand"
  | "canada"
  | "california"
  | "us_other";

const EU_EEA_COUNTRY_CODES = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "IS",
  "LI",
  "NO",
  "CH",
  "GB",
  "UK",
]);

function regionFromCountryCode(code: string): PrivacyRegion | null {
  const upper = code.toUpperCase();
  if (upper === "AU") return "australia";
  if (upper === "NZ") return "new_zealand";
  if (upper === "CA") return "canada";
  if (upper === "US") return "us_other";
  if (EU_EEA_COUNTRY_CODES.has(upper)) return "gdpr";
  return null;
}

function extractCountryCodeFromLocaleTag(tag: string): string | null {
  const normalized = tag.trim().replace(/_/g, "-");
  if (!normalized) return null;

  try {
    if (typeof Intl !== "undefined" && "Locale" in Intl) {
      const locale = new Intl.Locale(normalized);
      if (locale.region) return locale.region.toUpperCase();
    }
  } catch {
    // fall through to manual parse
  }

  const parts = normalized.split("-");
  for (let i = parts.length - 1; i >= 1; i--) {
    const part = parts[i];
    if (/^[a-z]{2}$/i.test(part)) return part.toUpperCase();
  }
  return null;
}

/**
 * Infer privacy region from BCP 47 locale tags (e.g. navigator.languages).
 * Returns null when the tag does not map to a supported regional section.
 */
export function privacyRegionFromLocaleTag(tag: string): PrivacyRegion | null {
  const country = extractCountryCodeFromLocaleTag(tag);
  if (!country) return null;
  return regionFromCountryCode(country);
}

/**
 * Browser locale → single regional privacy section. Defaults to UK/EU (GDPR) when unknown.
 */
export function detectPrivacyRegionFromBrowser(): PrivacyRegion {
  if (typeof navigator === "undefined") return "gdpr";

  const tags =
    navigator.languages?.length > 0
      ? [...navigator.languages]
      : navigator.language
        ? [navigator.language]
        : [];

  for (const tag of tags) {
    const region = privacyRegionFromLocaleTag(tag);
    if (region) return region;
  }

  return "gdpr";
}

export const PRIVACY_REGION_HEADINGS: Record<PrivacyRegion, string> = {
  gdpr: "United Kingdom & European Union",
  australia: "Australia",
  new_zealand: "New Zealand",
  canada: "Canada",
  california: "California, United States",
  us_other: "United States",
};
