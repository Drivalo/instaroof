import { loadGoogleMapsScript } from "@/lib/google-maps-script";
import {
  boundsAroundPoint,
  type MapBoundsLiteral,
  type ParsedPlaceDetails,
} from "@/lib/parse-google-place";
import { getSupportedCountry, type SupportedCountryCode } from "@/lib/supported-countries";

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

function parseGeocoderResult(result: GeocoderResult, fallbackPostcode: string): ParsedPlaceDetails | null {
  const latitude = readCoord(result.geometry?.location?.lat as (() => number) | number | undefined);
  const longitude = readCoord(result.geometry?.location?.lng as (() => number) | number | undefined);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const zipCode =
    result.address_components?.find((c) => c.types.includes("postal_code"))?.short_name ||
    result.address_components?.find((c) => c.types.includes("postal_code"))?.long_name ||
    fallbackPostcode;

  const countryCode =
    result.address_components?.find((c) => c.types.includes("country"))?.short_name || "";

  const bounds =
    boundsFromGeocoderViewport(result.geometry) ?? boundsAroundPoint(latitude, longitude, 0.06);

  return {
    address: result.formatted_address || fallbackPostcode,
    latitude,
    longitude,
    zipCode,
    countryCode,
    bounds,
  };
}

/** Resolve a typed postcode to coordinates and bounds for address autocomplete bias. */
export async function geocodePostcode(
  postcode: string,
  countryCode: SupportedCountryCode,
): Promise<ParsedPlaceDetails | null> {
  const trimmed = postcode.trim();
  if (!trimmed) return null;

  await loadGoogleMapsScript();
  if (!window.google?.maps?.Geocoder) {
    console.error("[geocode-postcode] Geocoder unavailable — enable Maps JavaScript API");
    return null;
  }

  const country = getSupportedCountry(countryCode);
  const geocoder = new window.google.maps.Geocoder();

  return new Promise((resolve) => {
    geocoder.geocode(
      {
        address: `${trimmed}, ${country.label}`,
        componentRestrictions: { country: countryCode },
      },
      (results: GeocoderResult[] | null, status: string) => {
        if (status !== "OK" || !results?.[0]) {
          console.log("[geocode-postcode] failed:", status, trimmed, countryCode);
          resolve(null);
          return;
        }
        const parsed = parseGeocoderResult(results[0], trimmed);
        console.log("[geocode-postcode] resolved:", trimmed, "→", parsed?.zipCode, parsed?.bounds);
        resolve(parsed);
      },
    );
  });
}
