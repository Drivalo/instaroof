export type UkPostcodeAddressResult =
  | {
      ok: true;
      postcode: string;
      latitude: number;
      longitude: number;
      addresses: string[];
    }
  | { ok: false; error: "invalid_postcode" | "no_addresses" | "service_unavailable" | "lookup_failed" };

export async function fetchUkPostcodeAddresses(postcode: string): Promise<UkPostcodeAddressResult> {
  const params = new URLSearchParams({ postcode: postcode.trim() });
  const res = await fetch(`/api/addresses/uk?${params.toString()}`, { cache: "no-store" });
  const data = (await res.json()) as { error?: string; postcode?: string; latitude?: number; longitude?: number; addresses?: string[] };

  if (res.status === 404) {
    const error = data.error === "no_addresses" ? "no_addresses" : "invalid_postcode";
    return { ok: false, error };
  }

  if (res.status === 503) {
    return { ok: false, error: "service_unavailable" };
  }

  if (!res.ok || !data.postcode || !data.addresses?.length) {
    if (data.error === "no_addresses") return { ok: false, error: "no_addresses" };
    if (data.error === "invalid_postcode") return { ok: false, error: "invalid_postcode" };
    return { ok: false, error: "lookup_failed" };
  }

  const latitude = data.latitude;
  const longitude = data.longitude;
  if (latitude == null || longitude == null || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { ok: false, error: "lookup_failed" };
  }

  return {
    ok: true,
    postcode: data.postcode,
    latitude,
    longitude,
    addresses: data.addresses,
  };
}

export function ukAddressLookupErrorMessage(
  error: "invalid_postcode" | "no_addresses" | "service_unavailable" | "lookup_failed",
): string {
  switch (error) {
    case "invalid_postcode":
      return "We couldn't find that postcode, please check and try again";
    case "no_addresses":
      return "No addresses found for this postcode";
    case "service_unavailable":
      return "Address lookup is temporarily unavailable. Please try again later.";
    default:
      return "We couldn't load addresses for this postcode. Please try again.";
  }
}
