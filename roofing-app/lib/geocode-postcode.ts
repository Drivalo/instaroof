import { loadGoogleMapsScript } from "@/lib/google-maps-script";
import {
  boundsAroundPoint,
  type MapBoundsLiteral,
  type ParsedPlaceDetails,
} from "@/lib/parse-google-place";
import {
  geocoderRegionBias,
  type SupportedCountryCode,
} from "@/lib/supported-countries";

type GeocoderGeometry = {
  location?: { lat: () => number; lng: () => number } | { lat: number; lng: number };
  viewport?: {
    getNorthEast: () => { lat: () => number; lng: () => number };
    getSouthWest: () => { lat: () => number; lng: () => number };
  };
};

type GeocoderResult = {
  formatted_address?: string;
  geometry?: GeocoderGeometry;
  address_components?: Array<{ types: string[]; short_name: string; long_name: string }>;
};

/** Half-span (degrees) for strictBounds when geocoder viewport is too wide. */
const TIGHT_DELTA: Record<SupportedCountryCode, number> = {
  gb: 0.0045,
  au: 0.006,
  us: 0.012,
  nz: 0.006,
  ca: 0.005,
};

const MAX_VIEWPORT_SPAN = 0.015;

function normalizePostcode(value: string): string {
  return value.replace(/\s+/g, " ").trim().toUpperCase();
}

function readCoord(value: (() => number) | number | undefined): number {
  if (typeof value === "function") return value();
  if (typeof value === "number") return value;
  return Number.NaN;
}

function boundsFromGeocoderViewport(geometry: GeocoderGeometry | undefined): MapBoundsLiteral | undefined {
  const viewport = geometry?.viewport;
  if (!viewport) return undefined;
  const ne = viewport.getNorthEast();
  const sw = viewport.getSouthWest();
  return {
    north: ne.lat(),
    east: ne.lng(),
    south: sw.lat(),
    west: sw.lng(),
  };
}

function viewportIsTight(bounds: MapBoundsLiteral): boolean {
  const latSpan = bounds.north - bounds.south;
  const lngSpan = bounds.east - bounds.west;
  return latSpan <= MAX_VIEWPORT_SPAN && lngSpan <= MAX_VIEWPORT_SPAN;
}

export function strictBoundsForPostcode(
  latitude: number,
  longitude: number,
  countryCode: SupportedCountryCode,
  geocoderViewport?: MapBoundsLiteral,
): MapBoundsLiteral {
  if (geocoderViewport && viewportIsTight(geocoderViewport)) {
    return geocoderViewport;
  }
  return boundsAroundPoint(latitude, longitude, TIGHT_DELTA[countryCode] ?? 0.005);
}

function extractPostcodeFromResult(result: GeocoderResult): string {
  const pc = result.address_components?.find((c) => c.types.includes("postal_code"));
  return pc?.long_name || pc?.short_name || "";
}

function postcodesMatch(
  entered: string,
  fromGeocoder: string,
  countryCode: SupportedCountryCode,
): boolean {
  const want = normalizePostcode(entered);
  const got = normalizePostcode(fromGeocoder);
  if (!got) return false;

  if (want === got || want.replace(/\s/g, "") === got.replace(/\s/g, "")) return true;

  if (countryCode === "us" || countryCode === "ca") {
    const wantBase = want.replace(/\s/g, "").split("-")[0];
    const gotBase = got.replace(/\s/g, "").split("-")[0];
    if (wantBase.length >= 3 && wantBase === gotBase) return true;
  }

  return false;
}

function parseGeocoderResult(
  result: GeocoderResult,
  fallbackPostcode: string,
  countryCode: SupportedCountryCode,
): ParsedPlaceDetails | null {
  const latitude = readCoord(result.geometry?.location?.lat as (() => number) | number | undefined);
  const longitude = readCoord(result.geometry?.location?.lng as (() => number) | number | undefined);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const zipCode = extractPostcodeFromResult(result) || fallbackPostcode;

  const countryFromResult =
    result.address_components?.find((c) => c.types.includes("country"))?.short_name || "";

  const viewport = boundsFromGeocoderViewport(result.geometry);
  const bounds = strictBoundsForPostcode(latitude, longitude, countryCode, viewport);

  return {
    address: result.formatted_address || fallbackPostcode,
    latitude,
    longitude,
    zipCode,
    countryCode: countryFromResult || countryCode.toUpperCase(),
    bounds,
  };
}

/**
 * Geocode a postcode/ZIP with the selected country's ISO2 restriction and region bias.
 * Returns tight LatLngBounds for Step 2 strictBounds autocomplete.
 */
export async function geocodePostcode(
  postcode: string,
  countryCode: SupportedCountryCode,
): Promise<ParsedPlaceDetails | null> {
  const trimmed = postcode.trim();
  if (!trimmed) return null;

  await loadGoogleMapsScript();
  if (!window.google?.maps?.Geocoder) {
    console.error("[geocode-postcode] Geocoder unavailable — enable Geocoding API");
    return null;
  }

  const geocoder = new window.google.maps.Geocoder();
  const region = geocoderRegionBias(countryCode);

  return new Promise((resolve) => {
    geocoder.geocode(
      {
        address: trimmed,
        componentRestrictions: { country: countryCode },
        region,
      },
      (results: GeocoderResult[] | null, status: string) => {
        if (status !== "OK" || !results?.length) {
          console.log("[geocode-postcode] failed:", {
            status,
            postcode: trimmed,
            componentRestrictions: { country: countryCode },
            region,
          });
          resolve(null);
          return;
        }

        const match =
          results.find((r) => postcodesMatch(trimmed, extractPostcodeFromResult(r), countryCode)) ??
          results[0];
        const parsed = parseGeocoderResult(match, trimmed, countryCode);

        console.log("[geocode-postcode] resolved:", {
          postcode: trimmed,
          countryCode,
          geocoderRegion: region,
          zipCode: parsed?.zipCode,
          center: parsed ? { lat: parsed.latitude, lng: parsed.longitude } : null,
          strictBounds: parsed?.bounds,
        });

        resolve(parsed);
      },
    );
  });
}
