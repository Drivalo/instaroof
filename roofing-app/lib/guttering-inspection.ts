function normalizeCountryCode(countryCode: string | null | undefined): string {
  const code = String(countryCode ?? "").trim().toUpperCase();
  if (code === "UK") return "GB";
  return code;
}

/** Localised prompt shown on the quote results page. */
export function gutteringInspectionQuestion(countryCode: string | null | undefined): string {
  const code = normalizeCountryCode(countryCode);
  if (code === "NZ") {
    return "Would you also like a free spouting inspection included with your roof survey?";
  }
  if (code === "US" || code === "CA") {
    return "Would you also like a free gutters inspection included with your roof survey?";
  }
  if (code === "GB" || code === "AU") {
    return "Would you also like a free guttering inspection included with your roof survey?";
  }
  return "Would you also like a free guttering inspection included with your roof survey?";
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
