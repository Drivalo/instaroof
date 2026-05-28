/** Normalize zip/postcode for comparison (AU, UK, US, NZ formats). */
function normalizePostcode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * Returns true when the address may receive a full quote.
 * An empty `serviceAreaZipCodes` list means all areas are accepted.
 */
export function isInServiceArea(serviceAreaZipCodes: string[] | null | undefined, zipCode?: string | null) {
  const allowed = (serviceAreaZipCodes ?? []).map((z) => z.trim()).filter(Boolean);
  if (allowed.length === 0) return true;

  const zip = zipCode?.trim();
  if (!zip) return true;

  const normalized = normalizePostcode(zip);
  return allowed.some((entry) => normalizePostcode(entry) === normalized);
}
