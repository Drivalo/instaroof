/** ISO 3166-1 alpha-2 (lowercase) from a BCP 47 locale tag, e.g. en-AU → au */
export function countryFromLocaleTag(tag: string): string | null {
  const trimmed = tag.trim();
  if (!trimmed) return null;

  try {
    const locale = new Intl.Locale(trimmed);
    const region = locale.region;
    if (region && /^[A-Z]{2}$/i.test(region)) {
      return region.toLowerCase();
    }
  } catch {
    const match = trimmed.match(/[-_]([A-Za-z]{2})$/);
    if (match) return match[1].toLowerCase();
  }

  return null;
}

/** Browser locale / language preferences (client only). */
export function countryFromBrowserLocale(): string | null {
  if (typeof navigator === "undefined") return null;

  const tags = [navigator.language, ...(navigator.languages ?? [])];
  for (const tag of tags) {
    const code = countryFromLocaleTag(tag);
    if (code) return code;
  }

  return null;
}

function isValidCountryCode(code: unknown): code is string {
  return typeof code === "string" && /^[a-z]{2}$/.test(code);
}

/**
 * Resolve a single country for Places Autocomplete restrictions.
 * Tries browser locale first, then server geo from IP headers.
 * Returns null to allow all countries when detection fails.
 */
export async function detectUserCountry(): Promise<string | null> {
  const fromLocale = countryFromBrowserLocale();
  if (fromLocale) return fromLocale;

  try {
    const res = await fetch("/api/public/geo-country", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { country?: unknown };
    if (isValidCountryCode(data.country)) return data.country;
  } catch {
    // fall through to unrestricted autocomplete
  }

  return null;
}
