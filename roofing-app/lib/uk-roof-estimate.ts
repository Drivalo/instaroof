import { fallbackVisionAnalysis } from "@/lib/quote";
import { RoofComplexity, RoofType, VisionAnalysis } from "@/lib/types";

const SQFT_PER_SQM = 10.76391041671;

export type UkSettlement = "urban" | "suburban" | "rural";
export type UkPropertyStyle = "terraced" | "semi" | "detached";

const UK_CITY_CENTRES: Array<{ name: string; lat: number; lng: number }> = [
  { name: "London", lat: 51.5074, lng: -0.1278 },
  { name: "Birmingham", lat: 52.4862, lng: -1.8904 },
  { name: "Manchester", lat: 53.4808, lng: -2.2426 },
  { name: "Leeds", lat: 53.8008, lng: -1.5491 },
  { name: "Glasgow", lat: 55.8642, lng: -4.2518 },
  { name: "Edinburgh", lat: 55.9533, lng: -3.1883 },
  { name: "Bristol", lat: 51.4545, lng: -2.5879 },
  { name: "Liverpool", lat: 53.4084, lng: -2.9916 },
  { name: "Sheffield", lat: 53.3811, lng: -1.4701 },
  { name: "Cardiff", lat: 51.4816, lng: -3.1791 },
];

/** Roof area bands in m² by settlement + typical UK housing style. */
const UK_ROOF_SQM_BANDS: Record<
  UkPropertyStyle,
  Record<UkSettlement, [number, number]>
> = {
  terraced: {
    urban: [55, 72],
    suburban: [60, 78],
    rural: [65, 82],
  },
  semi: {
    urban: [68, 88],
    suburban: [72, 92],
    rural: [78, 98],
  },
  detached: {
    urban: [82, 105],
    suburban: [88, 112],
    rural: [95, 120],
  },
};

function kmBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isInUkBounds(lat: number, lng: number): boolean {
  return lat >= 49.5 && lat <= 60.95 && lng >= -8.65 && lng <= 1.85;
}

export function isUkProperty(
  lat?: number | null,
  lng?: number | null,
  address?: string | null,
  countryCode?: string | null,
): boolean {
  const code = String(countryCode ?? "").trim().toUpperCase();
  if (code === "GB" || code === "UK") return true;

  const addr = String(address ?? "").trim().toLowerCase();
  if (
    addr.includes(", uk") ||
    addr.endsWith(" uk") ||
    addr.includes("united kingdom") ||
    /\b(england|scotland|wales|northern ireland)\b/.test(addr)
  ) {
    return true;
  }

  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    return isInUkBounds(lat, lng);
  }

  return false;
}

export function classifyUkSettlement(lat: number, lng: number): UkSettlement {
  let nearestKm = Infinity;
  for (const city of UK_CITY_CENTRES) {
    nearestKm = Math.min(nearestKm, kmBetween(lat, lng, city.lat, city.lng));
  }

  if (nearestKm <= 12) return "urban";
  if (nearestKm <= 35) return "suburban";
  return "rural";
}

function coordFraction(lat: number, lng: number, salt: number): number {
  const n = Math.sin(lat * 12.9898 + lng * 78.233 + salt) * 43758.5453;
  return n - Math.floor(n);
}

function pickUkPropertyStyle(lat: number, lng: number, settlement: UkSettlement): UkPropertyStyle {
  const frac = coordFraction(lat, lng, 1.2);
  if (settlement === "urban") {
    if (frac < 0.5) return "terraced";
    if (frac < 0.85) return "semi";
    return "detached";
  }
  if (settlement === "suburban") {
    if (frac < 0.35) return "terraced";
    if (frac < 0.75) return "semi";
    return "detached";
  }
  if (frac < 0.2) return "terraced";
  if (frac < 0.55) return "semi";
  return "detached";
}

export type UkRoofCoordinateEstimate = {
  roof_area_sqm: number;
  roof_sqft: number;
  settlement: UkSettlement;
  property_style: UkPropertyStyle;
  source: "uk_coordinate_fallback";
};

export function estimateUkRoofFromCoordinates(lat: number, lng: number): UkRoofCoordinateEstimate {
  const settlement = classifyUkSettlement(lat, lng);
  const property_style = pickUkPropertyStyle(lat, lng, settlement);
  const [minSqm, maxSqm] = UK_ROOF_SQM_BANDS[property_style][settlement];
  const frac = coordFraction(lat, lng, 4.7);
  const roof_area_sqm = Math.round(minSqm + frac * (maxSqm - minSqm));
  const roof_sqft = Math.max(500, Math.round(roof_area_sqm * SQFT_PER_SQM));

  return {
    roof_area_sqm,
    roof_sqft,
    settlement,
    property_style,
    source: "uk_coordinate_fallback",
  };
}

export function visionAnalysisFromUkFallback(
  lat: number,
  lng: number,
  visionError?: string,
): VisionAnalysis & { source: string; roof_area_sqm: number; settlement: UkSettlement; property_style: UkPropertyStyle; vision_error?: string } {
  const estimate = estimateUkRoofFromCoordinates(lat, lng);
  const roof_type: RoofType = "tile";
  const complexity: RoofComplexity = estimate.property_style === "terraced" ? "simple" : "moderate";

  return {
    roof_sqft: estimate.roof_sqft,
    roof_type,
    complexity,
    confidence: 58,
    roof_visible: true,
    fallback_reason: null,
    polygon_coordinates: fallbackVisionAnalysis().polygon_coordinates,
    source: estimate.source,
    roof_area_sqm: estimate.roof_area_sqm,
    settlement: estimate.settlement,
    property_style: estimate.property_style,
    vision_error: visionError,
  };
}
