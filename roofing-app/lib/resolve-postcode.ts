import { geocoderRegionBias, type SupportedCountryCode } from "@/lib/supported-countries";

const TIGHT_RADIUS_M = 200;
const FALLBACK_RADIUS_M = 1000;

export type PostcodeLocation = {
  latitude: number;
  longitude: number;
  label: string;
  radiusMeters: number;
  strictBounds: boolean;
  source: "postcodes.io" | "google-geocoding" | "google-geocoding-fallback";
};

export type PostcodeResolveResult =
  | { ok: true; location: PostcodeLocation }
  | { ok: false; error: "invalid"; zeroResults?: boolean };

type GoogleGeocodeResponse = {
  status: string;
  results?: Array<{
    formatted_address?: string;
    geometry?: { location?: { lat: number; lng: number } };
    address_components?: Array<{ types: string[]; long_name: string; short_name: string }>;
  }>;
};

type PostcodesIoResponse = {
  status: number;
  result?: {
    postcode?: string;
    latitude?: number;
    longitude?: number;
  };
};

function normalizeUkPostcodeForApi(postcode: string): string {
  return encodeURIComponent(postcode.replace(/\s+/g, " ").trim());
}

function extractPostalFromGoogleResult(
  result: NonNullable<GoogleGeocodeResponse["results"]>[number],
  fallback: string,
): string {
  const pc = result.address_components?.find((c) => c.types.includes("postal_code"));
  return pc?.long_name || pc?.short_name || fallback;
}

function googleMapsKey(): string | undefined {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  if (!key || key.includes("paste_")) return undefined;
  return key;
}

async function fetchGoogleGeocode(
  postcode: string,
  countryCode: SupportedCountryCode,
  mode: "strict" | "loose",
): Promise<PostcodeResolveResult & { zeroResults?: boolean }> {
  const key = googleMapsKey();
  if (!key) {
    console.error("[resolve-postcode] NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set");
    return { ok: false, error: "invalid" };
  }

  const region = geocoderRegionBias(countryCode);
  const params = new URLSearchParams({
    address: postcode.trim(),
    key,
  });

  if (mode === "strict") {
    params.set("components", `country:${countryCode}`);
    params.set("region", region);
  } else {
    params.set("region", region);
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    const data = (await res.json()) as GoogleGeocodeResponse;

    if (data.status === "ZERO_RESULTS") {
      return { ok: false, error: "invalid", zeroResults: true };
    }

    if (data.status !== "OK" || !data.results?.[0]?.geometry?.location) {
      console.log("[resolve-postcode] Google Geocoding failed:", {
        status: data.status,
        postcode,
        countryCode,
        mode,
      });
      return { ok: false, error: "invalid", zeroResults: false };
    }

    const loc = data.results[0].geometry!.location!;
    const latitude = loc.lat;
    const longitude = loc.lng;

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return { ok: false, error: "invalid" };
    }

    const location: PostcodeLocation = {
      latitude,
      longitude,
      label: extractPostalFromGoogleResult(data.results[0], postcode.trim()),
      radiusMeters: mode === "strict" ? TIGHT_RADIUS_M : FALLBACK_RADIUS_M,
      strictBounds: mode === "strict",
      source: mode === "strict" ? "google-geocoding" : "google-geocoding-fallback",
    };

    console.log("[resolve-postcode] Google Geocoding resolved:", {
      postcode,
      countryCode,
      mode,
      center: { lat: latitude, lng: longitude },
      radiusMeters: location.radiusMeters,
      strictBounds: location.strictBounds,
    });

    return { ok: true, location };
  } catch (err) {
    console.error("[resolve-postcode] Google Geocoding request error:", err);
    return { ok: false, error: "invalid" };
  }
}

async function fetchUkPostcode(postcode: string): Promise<PostcodeResolveResult> {
  const encoded = normalizeUkPostcodeForApi(postcode);
  const url = `https://api.postcodes.io/postcodes/${encoded}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    const data = (await res.json()) as PostcodesIoResponse;

    if (res.status === 404 || data.status === 404) {
      return { ok: false, error: "invalid" };
    }

    if (!res.ok || data.status !== 200 || !data.result) {
      console.log("[resolve-postcode] Postcodes.io failed:", res.status, postcode);
      return { ok: false, error: "invalid" };
    }

    const latitude = data.result.latitude;
    const longitude = data.result.longitude;

    if (latitude == null || longitude == null || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return { ok: false, error: "invalid" };
    }

    const location: PostcodeLocation = {
      latitude,
      longitude,
      label: data.result.postcode || postcode.trim(),
      radiusMeters: TIGHT_RADIUS_M,
      strictBounds: true,
      source: "postcodes.io",
    };

    console.log("[resolve-postcode] Postcodes.io resolved:", {
      postcode: location.label,
      center: { lat: latitude, lng: longitude },
      radiusMeters: TIGHT_RADIUS_M,
      strictBounds: true,
    });

    return { ok: true, location };
  } catch (err) {
    console.error("[resolve-postcode] Postcodes.io request error:", err);
    return { ok: false, error: "invalid" };
  }
}

/**
 * Resolve postcode to lat/lng for address autocomplete.
 * UK: Postcodes.io. Other countries: Google Geocoding REST API.
 * On non-UK geocode failure after strict attempt, falls back to 1000 m / no strictBounds.
 */
export async function resolvePostcode(
  postcode: string,
  countryCode: SupportedCountryCode,
): Promise<PostcodeResolveResult> {
  const trimmed = postcode.trim();
  if (!trimmed) return { ok: false, error: "invalid" };

  if (countryCode === "gb") {
    const uk = await fetchUkPostcode(trimmed);
    if (uk.ok) return uk;
    return { ok: false, error: "invalid" };
  }

  const strict = await fetchGoogleGeocode(trimmed, countryCode, "strict");
  if (strict.ok) return strict;
  if (!strict.ok && strict.zeroResults) {
    return { ok: false, error: "invalid" };
  }

  const loose = await fetchGoogleGeocode(trimmed, countryCode, "loose");
  if (loose.ok) return loose;
  return { ok: false, error: "invalid" };
}
