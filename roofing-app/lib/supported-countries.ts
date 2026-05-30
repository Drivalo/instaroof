/** Countries available in the landing-page address selector (Google ISO 3166-1 alpha-2). */
export const SUPPORTED_COUNTRIES = [
  { code: "gb", displayCode: "UK", label: "United Kingdom", flag: "🇬🇧" },
  { code: "au", displayCode: "AU", label: "Australia", flag: "🇦🇺" },
  { code: "nz", displayCode: "NZ", label: "New Zealand", flag: "🇳🇿" },
  { code: "us", displayCode: "US", label: "United States", flag: "🇺🇸" },
  { code: "ca", displayCode: "CA", label: "Canada", flag: "🇨🇦" },
] as const;

export type SupportedCountryCode = (typeof SUPPORTED_COUNTRIES)[number]["code"];

export const DEFAULT_SUPPORTED_COUNTRY: SupportedCountryCode = "us";

const SUPPORTED_CODES = new Set<string>(SUPPORTED_COUNTRIES.map((c) => c.code));

export function isSupportedCountryCode(code: string): code is SupportedCountryCode {
  return SUPPORTED_CODES.has(code.toLowerCase());
}

/** Map ipapi / arbitrary ISO2 to a supported country, or fall back to default. */
export function resolveSupportedCountry(code: string | null | undefined): SupportedCountryCode {
  const lower = code?.trim().toLowerCase();
  if (lower && isSupportedCountryCode(lower)) return lower;
  return DEFAULT_SUPPORTED_COUNTRY;
}

export function getSupportedCountry(code: SupportedCountryCode) {
  return SUPPORTED_COUNTRIES.find((c) => c.code === code) ?? SUPPORTED_COUNTRIES[3];
}

/**
 * Geocoder `region` parameter uses ccTLD (e.g. UK → "uk", not "gb").
 * componentRestrictions still uses ISO2 ("gb").
 */
export function geocoderRegionBias(countryCode: SupportedCountryCode): string {
  if (countryCode === "gb") return "uk";
  return countryCode;
}

/** Example placeholder per country — no format validation implied. */
export function postcodePlaceholder(countryCode: SupportedCountryCode): string {
  switch (countryCode) {
    case "gb":
      return "e.g. NW9 5FA";
    case "us":
      return "e.g. 90210";
    case "au":
      return "e.g. 4066";
    case "nz":
      return "e.g. 6011";
    case "ca":
      return "e.g. M5V 3A8";
    default:
      return "Enter postcode / ZIP";
  }
}
