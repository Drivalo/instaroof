/** Turn getAddress.io comma-separated line into a readable UK address string. */
export function formatUkAddressLine(segmentsCsv: string, postcode: string): string {
  const parts = segmentsCsv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const base = parts.join(", ");
  if (!base) return postcode.trim();
  return `${base}, ${postcode.trim()}`;
}
