import { SettingsRow } from "@/lib/types";

export type CurrencyRegion = "US" | "GB" | "AU" | "NZ";

export type CurrencyRates = {
  gbp: number;
  aud: number;
  nzd: number;
};

export const DEFAULT_CURRENCY_RATES: CurrencyRates = {
  gbp: 0.79,
  aud: 1.53,
  nzd: 1.64,
};

const REGION_META: Record<
  CurrencyRegion,
  { code: string; label: string; formatRange: (low: number, high: number) => string }
> = {
  US: {
    code: "USD",
    label: "US Dollars",
    formatRange: (low, high) => `$${fmt(low)} - $${fmt(high)} USD`,
  },
  GB: {
    code: "GBP",
    label: "British Pounds",
    formatRange: (low, high) => `£${fmt(low)} - £${fmt(high)} GBP`,
  },
  AU: {
    code: "AUD",
    label: "Australian Dollars",
    formatRange: (low, high) => `AUD $${fmt(low)} - AUD $${fmt(high)}`,
  },
  NZ: {
    code: "NZD",
    label: "New Zealand Dollars",
    formatRange: (low, high) => `NZD $${fmt(low)} - NZD $${fmt(high)}`,
  },
};

function fmt(amount: number) {
  return Math.round(amount).toLocaleString("en-US");
}

function regionFromCountryCode(countryCode?: string | null): CurrencyRegion | null {
  const code = countryCode?.trim().toUpperCase();
  if (!code) return null;
  if (code === "GB" || code === "UK") return "GB";
  if (code === "AU") return "AU";
  if (code === "NZ") return "NZ";
  if (code === "US") return "US";
  return null;
}

/** Fallback when country code is missing (older leads). */
function regionFromCoordinates(lat?: number | null, lng?: number | null): CurrencyRegion | null {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat >= -47 && lat <= -34 && lng >= 166 && lng <= 179) return "NZ";
  if (lat >= -44 && lat <= -10 && lng >= 113 && lng <= 154) return "AU";
  if (lat >= 49 && lat <= 61 && lng >= -8.5 && lng <= 2.5) return "GB";
  if (lat >= 24 && lat <= 50 && lng >= -125 && lng <= -66) return "US";
  return null;
}

/** Detect market from Google country code, address text, or coordinates. */
export function detectCurrencyRegion(
  address?: string | null,
  countryCode?: string | null,
  latitude?: number | null,
  longitude?: number | null,
): CurrencyRegion {
  const fromCode = regionFromCountryCode(countryCode);
  if (fromCode) return fromCode;

  if (address?.trim()) {
    const normalized = address.trim().toLowerCase();
    const raw = address.trim();

    if (
      /,\s*(uk|gb|united kingdom)\s*$/i.test(raw) ||
      /\b(uk|united kingdom|great britain|england|scotland|wales|northern ireland)\b/i.test(normalized) ||
      /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i.test(raw)
    ) {
      return "GB";
    }

    if (
      /,\s*(australia)\s*$/i.test(raw) ||
      /\b(australia|australian)\b/i.test(normalized) ||
      /\b(nsw|vic|qld|sa|tas|nt|act)\b/i.test(normalized) ||
      /\b(sydney|melbourne|brisbane|perth|adelaide|canberra|hobart|darwin)\b/i.test(normalized)
    ) {
      return "AU";
    }

    if (
      /,\s*(new zealand)\s*$/i.test(raw) ||
      /\b(new zealand|aotearoa)\b/i.test(normalized) ||
      /\b(auckland|wellington|christchurch|hamilton|tauranga)\b/i.test(normalized)
    ) {
      return "NZ";
    }

    if (/\b(usa|u\.s\.a\.|united states|u\.s\.)\b/i.test(normalized) || /,\s*(usa|united states)\s*$/i.test(raw)) {
      return "US";
    }
  }

  const fromCoords = regionFromCoordinates(latitude, longitude);
  if (fromCoords) return fromCoords;

  return "US";
}

/** UK, Australia, and New Zealand use British English spelling in customer UI. */
export function usesBritishSpelling(region: CurrencyRegion): boolean {
  return region === "GB" || region === "AU" || region === "NZ";
}

export function analyzingHeadline(region: CurrencyRegion): string {
  return usesBritishSpelling(region) ? "Analysing your roof..." : "Analyzing your roof...";
}

export function analyzingProgressSteps(region: CurrencyRegion): string[] {
  const verb = usesBritishSpelling(region) ? "Analysing" : "Analyzing";
  return [
    "Locating property...",
    "Capturing satellite imagery...",
    `${verb} roof outline...`,
    "Measuring square footage...",
    "Detecting roof material...",
    "Calculating quote...",
  ];
}

export function getCurrencyRates(settings?: Partial<SettingsRow> | null): CurrencyRates {
  return {
    gbp: Number(settings?.currency_rate_gbp ?? DEFAULT_CURRENCY_RATES.gbp),
    aud: Number(settings?.currency_rate_aud ?? DEFAULT_CURRENCY_RATES.aud),
    nzd: Number(settings?.currency_rate_nzd ?? DEFAULT_CURRENCY_RATES.nzd),
  };
}

/** Coerce quote amounts from API/DB (number or numeric string) to a finite number. */
function parseUsdAmount(value: number | string): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Convert a USD amount to local currency units (unformatted number only). */
function usdToLocal(usd: number, region: CurrencyRegion, rates: CurrencyRates): number {
  if (!Number.isFinite(usd)) return 0;
  switch (region) {
    case "GB":
      return usd * rates.gbp;
    case "AU":
      return usd * rates.aud;
    case "NZ":
      return usd * rates.nzd;
    default:
      return usd;
  }
}

export type CurrencyDisplay = {
  region: CurrencyRegion;
  code: string;
  label: string;
  formatRange: (lowUsd: number | string, highUsd: number | string) => string;
};

export function getCurrencyDisplay(
  address?: string | null,
  settings?: Partial<SettingsRow> | null,
  countryCode?: string | null,
  latitude?: number | null,
  longitude?: number | null,
): CurrencyDisplay {
  const region = detectCurrencyRegion(address, countryCode, latitude, longitude);
  const rates = getCurrencyRates(settings);
  const meta = REGION_META[region];

  return {
    region,
    code: meta.code,
    label: meta.label,
    formatRange: (lowUsd, highUsd) =>
      meta.formatRange(
        usdToLocal(parseUsdAmount(lowUsd), region, rates),
        usdToLocal(parseUsdAmount(highUsd), region, rates),
      ),
  };
}

export function formatDeposit(
  usdDeposit: number,
  address?: string | null,
  settings?: Partial<SettingsRow> | null,
  countryCode?: string | null,
  latitude?: number | null,
  longitude?: number | null,
) {
  const region = detectCurrencyRegion(address, countryCode, latitude, longitude);
  const rates = getCurrencyRates(settings);
  const local = usdToLocal(usdDeposit, region, rates);

  switch (region) {
    case "GB":
      return `£${fmt(local)} GBP`;
    case "AU":
      return `AUD $${fmt(local)}`;
    case "NZ":
      return `NZD $${fmt(local)}`;
    default:
      return `$${fmt(local)} USD`;
  }
}
