/**
 * Permissive postcode / ZIP input check — formats differ by country.
 * No country-specific regex; geocoding validates the value.
 */
export function isPostcodeInputValid(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 16) return false;
  return /^[\p{L}\p{N}\s-]+$/u.test(trimmed);
}
