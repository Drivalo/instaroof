import type { PostcodeLocation, PostcodeResolveResult } from "@/lib/resolve-postcode";
import { resolvePostcode } from "@/lib/resolve-postcode";
import type { SupportedCountryCode } from "@/lib/supported-countries";

/** @deprecated Use resolvePostcode — kept for existing imports. */
export async function geocodePostcode(
  postcode: string,
  countryCode: SupportedCountryCode,
): Promise<{
  address: string;
  latitude: number;
  longitude: number;
  zipCode: string;
  countryCode: string;
  radiusMeters: number;
  strictBounds: boolean;
} | null> {
  const result = await resolvePostcode(postcode, countryCode);
  if (!result.ok) return null;
  const { location } = result;
  return {
    address: location.label,
    latitude: location.latitude,
    longitude: location.longitude,
    zipCode: location.label,
    countryCode: countryCode.toUpperCase(),
    radiusMeters: location.radiusMeters,
    strictBounds: location.strictBounds,
  };
}

export type { PostcodeLocation, PostcodeResolveResult };
