export type MapBoundsLiteral = {
  north: number;
  south: number;
  east: number;
  west: number;
};

export type ParsedPlaceDetails = {
  address: string;
  latitude: number;
  longitude: number;
  zipCode: string;
  countryCode: string;
  bounds?: MapBoundsLiteral;
};

type AddressComponent = { types: string[]; short_name: string; long_name: string };

type GooglePlaceResult = {
  formatted_address?: string;
  geometry?: {
    location?: { lat: () => number; lng: () => number };
    viewport?: {
      getNorthEast: () => { lat: () => number; lng: () => number };
      getSouthWest: () => { lat: () => number; lng: () => number };
    };
  };
  address_components?: AddressComponent[];
};

export function boundsFromViewport(
  viewport: NonNullable<GooglePlaceResult["geometry"]>["viewport"],
): MapBoundsLiteral | undefined {
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

export function boundsAroundPoint(lat: number, lng: number, delta = 0.04): MapBoundsLiteral {
  return {
    north: lat + delta,
    south: lat - delta,
    east: lng + delta,
    west: lng - delta,
  };
}

export function parseGooglePlace(place: GooglePlaceResult | null | undefined): ParsedPlaceDetails | null {
  if (!place) return null;

  const latFn = place.geometry?.location?.lat;
  const lngFn = place.geometry?.location?.lng;
  const latitude = typeof latFn === "function" ? latFn() : Number.NaN;
  const longitude = typeof lngFn === "function" ? lngFn() : Number.NaN;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const zipCode =
    place.address_components?.find((c) => c.types.includes("postal_code"))?.short_name ||
    place.address_components?.find((c) => c.types.includes("postal_code"))?.long_name ||
    "";

  const countryCode =
    place.address_components?.find((c) => c.types.includes("country"))?.short_name || "";

  const bounds =
    boundsFromViewport(place.geometry?.viewport) ?? boundsAroundPoint(latitude, longitude, 0.06);

  return {
    address: place.formatted_address || "",
    latitude,
    longitude,
    zipCode,
    countryCode,
    bounds,
  };
}
