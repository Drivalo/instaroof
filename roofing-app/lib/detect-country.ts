import { resolveSupportedCountry, type SupportedCountryCode } from "@/lib/supported-countries";

const IPAPI_URL = "https://ipapi.co/json/";

function isValidCountryCode(code: unknown): code is string {
  return typeof code === "string" && /^[a-z]{2}$/i.test(code);
}

type IpApiResponse = {
  country_code?: unknown;
  error?: boolean;
  reason?: string;
};

/**
 * Detect country from the visitor's IP via ipapi.co, mapped to a supported market.
 */
export async function detectDefaultSupportedCountry(): Promise<SupportedCountryCode> {
  try {
    const res = await fetch(IPAPI_URL, { cache: "no-store" });
    if (!res.ok) {
      console.log("[address-autocomplete] Country detection failed: ipapi.co HTTP", res.status);
      return resolveSupportedCountry(null);
    }

    const data = (await res.json()) as IpApiResponse;
    if (data.error) {
      console.log(
        "[address-autocomplete] Country detection failed:",
        data.reason ?? "ipapi.co returned an error",
      );
      return resolveSupportedCountry(null);
    }

    const raw = data.country_code;
    if (!isValidCountryCode(raw)) {
      console.log("[address-autocomplete] Country detection failed: invalid country_code", raw);
      return resolveSupportedCountry(null);
    }

    const detected = raw.toLowerCase();
    const selected = resolveSupportedCountry(detected);
    console.log("[address-autocomplete] Detected country code:", detected, "→ using", selected);
    return selected;
  } catch (err) {
    console.log("[address-autocomplete] Country detection failed:", err);
    return resolveSupportedCountry(null);
  }
}
