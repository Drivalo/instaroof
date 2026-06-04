function normalizeCountryCode(countryCode: string | null | undefined): string {
  const code = String(countryCode ?? "").trim().toUpperCase();
  if (code === "UK") return "GB";
  return code;
}

/** Localised prompt shown on the quote results page. */
export function gutteringInspectionQuestion(countryCode: string | null | undefined): string {
  const code = normalizeCountryCode(countryCode);
  if (code === "NZ") return "Would you also like a spouting inspection quoted?";
  if (code === "US" || code === "CA") return "Would you also like a gutters inspection quoted?";
  if (code === "GB" || code === "AU") return "Would you also like a guttering inspection quoted?";
  return "Would you also like a guttering inspection quoted?";
}

/** Noun used in business owner notification (e.g. "Guttering inspection requested: Yes"). */
export function gutteringInspectionTerm(countryCode: string | null | undefined): string {
  const code = normalizeCountryCode(countryCode);
  if (code === "NZ") return "Spouting";
  if (code === "US" || code === "CA") return "Gutters";
  return "Guttering";
}

export function gutteringInspectionRequestedLine(
  countryCode: string | null | undefined,
): string {
  const term = gutteringInspectionTerm(countryCode);
  return `${term} inspection requested: Yes`;
}
