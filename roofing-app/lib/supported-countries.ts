/** Countries available in the landing-page address selector (Google Places ISO2 codes). */
export const SUPPORTED_COUNTRIES = [
  { code: "gb", displayCode: "UK", label: "United Kingdom", flag: "🇬🇧" },
  { code: "au", displayCode: "AU", label: "Australia", flag: "🇦🇺" },
  { code: "nz", displayCode: "NZ", label: "New Zealand", flag: "🇳🇿" },
  { code: "us", displayCode: "US", label: "United States", flag: "🇺🇸" },
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
