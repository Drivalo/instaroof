import { fallbackVisionAnalysis } from "@/lib/quote";
import { isUkProperty, visionAnalysisFromUkFallback } from "@/lib/uk-roof-estimate";
import { RoofComplexity, RoofType, VisionAnalysis } from "@/lib/types";

const SQFT_PER_SQM = 10.76391041671;

export type CoordinateFallbackRegion = "uk" | "au" | "nz";
export type Settlement = "urban" | "suburban" | "rural";

const AU_CITY_CENTRES = [
  { name: "Sydney", lat: -33.8688, lng: 151.2093 },
  { name: "Melbourne", lat: -37.8136, lng: 144.9631 },
  { name: "Brisbane", lat: -27.4698, lng: 153.0251 },
  { name: "Perth", lat: -31.9505, lng: 115.8605 },
  { name: "Adelaide", lat: -34.9285, lng: 138.6007 },
  { name: "Canberra", lat: -35.2809, lng: 149.13 },
  { name: "Gold Coast", lat: -28.0167, lng: 153.4 },
];

const NZ_CITY_CENTRES = [
  { name: "Auckland", lat: -36.8485, lng: 174.7633 },
  { name: "Wellington", lat: -41.2865, lng: 174.7762 },
  { name: "Christchurch", lat: -43.5321, lng: 172.6362 },
  { name: "Hamilton", lat: -37.787, lng: 175.2793 },
];

function kmBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function coordFraction(lat: number, lng: number, salt: number): number {
  const n = Math.sin(lat * 12.9898 + lng * 78.233 + salt) * 43758.5453;
  return n - Math.floor(n);
}

function classifySettlement(lat: number, lng: number, cities: Array<{ lat: number; lng: number }>): Settlement {
  let nearestKm = Infinity;
  for (const city of cities) {
    nearestKm = Math.min(nearestKm, kmBetween(lat, lng, city.lat, city.lng));
  }
  if (nearestKm <= 15) return "urban";
  if (nearestKm <= 45) return "suburban";
  return "rural";
}

export function isInAuBounds(lat: number, lng: number): boolean {
  return lat >= -44.5 && lat <= -10 && lng >= 112 && lng <= 154.5;
}

export function isInNzBounds(lat: number, lng: number): boolean {
  return lat >= -47.5 && lat <= -34 && lng >= 166 && lng <= 179;
}

export function isAuProperty(
  lat?: number | null,
  lng?: number | null,
  address?: string | null,
  countryCode?: string | null,
): boolean {
  const code = String(countryCode ?? "").trim().toUpperCase();
  if (code === "AU") return true;
  const addr = String(address ?? "").toLowerCase();
  if (addr.includes("australia") || /\b(nsw|vic|qld|wa|sa|tas|nt|act)\b/.test(addr)) {
    return true;
  }
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    return isInAuBounds(lat, lng);
  }
  return false;
}

export function isNzProperty(
  lat?: number | null,
  lng?: number | null,
  address?: string | null,
  countryCode?: string | null,
): boolean {
  const code = String(countryCode ?? "").trim().toUpperCase();
  if (code === "NZ") return true;
  const addr = String(address ?? "").toLowerCase();
  if (addr.includes("new zealand")) return true;
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    return isInNzBounds(lat, lng);
  }
  return false;
}

export function detectCoordinateFallbackRegion(
  lat?: number | null,
  lng?: number | null,
  address?: string | null,
  countryCode?: string | null,
): CoordinateFallbackRegion | null {
  if (isUkProperty(lat, lng, address, countryCode)) return "uk";
  if (isAuProperty(lat, lng, address, countryCode)) return "au";
  if (isNzProperty(lat, lng, address, countryCode)) return "nz";
  return null;
}

function estimateAuRoofSqm(lat: number, lng: number): number {
  const settlement = classifySettlement(lat, lng, AU_CITY_CENTRES);
  const [minSqm, maxSqm] =
    settlement === "urban" ? [130, 175] : settlement === "suburban" ? [155, 210] : [185, 260];
  const frac = coordFraction(lat, lng, 6.1);
  return Math.round(minSqm + frac * (maxSqm - minSqm));
}

function estimateNzRoofSqm(lat: number, lng: number): number {
  const settlement = classifySettlement(lat, lng, NZ_CITY_CENTRES);
  const [minSqm, maxSqm] =
    settlement === "urban" ? [120, 165] : settlement === "suburban" ? [145, 195] : [170, 230];
  const frac = coordFraction(lat, lng, 8.3);
  return Math.round(minSqm + frac * (maxSqm - minSqm));
}

export function visionAnalysisFromCoordinateFallback(
  lat: number,
  lng: number,
  address?: string | null,
  countryCode?: string | null,
  visionError?: string,
): VisionAnalysis & {
  source: string;
  region: CoordinateFallbackRegion;
  roof_area_sqm: number;
  vision_error?: string;
} {
  const region = detectCoordinateFallbackRegion(lat, lng, address, countryCode);
  if (!region) {
    throw new Error("Coordinate fallback not available for this region");
  }

  if (region === "uk") {
    const uk = visionAnalysisFromUkFallback(lat, lng, visionError);
    return { ...uk, region: "uk" };
  }

  const roof_area_sqm = region === "au" ? estimateAuRoofSqm(lat, lng) : estimateNzRoofSqm(lat, lng);
  const roof_sqft = Math.max(500, Math.round(roof_area_sqm * SQFT_PER_SQM));
  const roof_type: RoofType = region === "au" ? "metal" : "tile";
  const complexity: RoofComplexity = "moderate";

  return {
    roof_sqft,
    roof_type,
    complexity,
    confidence: 58,
    polygon_coordinates: fallbackVisionAnalysis().polygon_coordinates,
    source: `${region}_coordinate_fallback`,
    region,
    roof_area_sqm,
    vision_error: visionError,
  };
}
