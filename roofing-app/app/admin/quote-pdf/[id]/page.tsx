import { format } from "date-fns";
import { notFound, redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getSettings, getSupabaseAdmin } from "@/lib/supabase";
import { SettingsRow } from "@/lib/types";
import { PrintButton } from "./print-button";
import "./quote-pdf.css";

type QuoteCurrency = "GB" | "AU" | "NZ" | "US" | "CA";

function formatLeadReference(id: number): string {
  return `IR-${String(id).padStart(4, "0")}`;
}

function isUkRegion(address: string, countryCode?: string | null): boolean {
  const raw = String(address ?? "").trim();
  const addr = raw.toLowerCase();
  const code = String(countryCode ?? "").trim().toLowerCase();

  if (code === "gb" || code === "uk") return true;
  if (addr === "uk") return true;
  if (addr.includes("united kingdom")) return true;
  if (/\buk\b/i.test(raw)) return true;

  return false;
}

function detectQuoteCurrency(address: string, countryCode?: string | null): QuoteCurrency {
  const addr = String(address ?? "").trim().toLowerCase();
  const code = String(countryCode ?? "").trim().toLowerCase();

  if (isUkRegion(address, countryCode)) return "GB";
  if (addr.includes("australia") || addr === "au" || code === "au" || code === "aus") return "AU";
  if (addr.includes("new zealand") || addr === "nz" || code === "nz" || code === "nzl") return "NZ";
  if (addr.includes("canada") || code === "ca") return "CA";

  return "US";
}

function formatQuotePriceRange(
  lowUsd: number | string | null | undefined,
  highUsd: number | string | null | undefined,
  address: string,
  settings: SettingsRow | null,
  countryCode?: string | null,
): string {
  const low = Number(lowUsd) || 0;
  const high = Number(highUsd) || 0;
  const currency = detectQuoteCurrency(address, countryCode);

  const rateGbp = Number(settings?.currency_rate_gbp ?? 0.79);
  const rateAud = Number(settings?.currency_rate_aud ?? 1.53);
  const rateNzd = Number(settings?.currency_rate_nzd ?? 1.64);
  const rateCad = Number(
    (settings as { currency_rate_cad?: number } | null)?.currency_rate_cad ?? 1.36,
  );

  const fmt = (amount: number) => Math.round(amount).toLocaleString("en-US");

  switch (currency) {
    case "GB":
      return `£${fmt(low * rateGbp)} - £${fmt(high * rateGbp)}`;
    case "AU":
      return `A$${fmt(low * rateAud)} - A$${fmt(high * rateAud)}`;
    case "NZ":
      return `NZ$${fmt(low * rateNzd)} - NZ$${fmt(high * rateNzd)}`;
    case "CA":
      return `C$${fmt(low * rateCad)} - C$${fmt(high * rateCad)}`;
    default:
      return `$${fmt(low)} - $${fmt(high)}`;
  }
}

function formatRoofSqm(roofSqft: number | null | undefined): string {
  const sqft = Number(roofSqft);
  if (!Number.isFinite(sqft) || sqft <= 0) return "—";
  return `${Math.round(sqft / 10.764)} m²`;
}

function formatGeneratedDate(createdAt: string): string {
  try {
    return format(new Date(createdAt), "dd MMM yyyy");
  } catch {
    return createdAt;
  }
}

export default async function AdminQuotePdfPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin");
  }

  const { id } = await params;
  const leadId = Number(id);
  if (!Number.isFinite(leadId) || leadId <= 0) {
    notFound();
  }

  const supabase = getSupabaseAdmin();
  const [{ data: lead, error }, settings] = await Promise.all([
    supabase.from("leads").select("*").eq("id", leadId).single(),
    getSettings(),
  ]);

  if (error || !lead) {
    notFound();
  }

  const companyName = process.env.NEXT_PUBLIC_COMPANY_NAME?.trim() || "InstaRoof";
  const address = String(lead.address ?? "").trim() || "—";
  const countryCode = lead.country_code != null ? String(lead.country_code) : null;
  const hasStandardQuote =
    (lead.quote_standard_low != null && Number(lead.quote_standard_low) > 0) ||
    (lead.quote_standard_high != null && Number(lead.quote_standard_high) > 0);
  const priceRange = hasStandardQuote
    ? formatQuotePriceRange(
        lead.quote_standard_low,
        lead.quote_standard_high,
        address === "—" ? "" : address,
        settings,
        countryCode,
      )
    : "—";

  const rows = [
    { label: "Quote reference", value: formatLeadReference(leadId) },
    { label: "Property address", value: address },
    { label: "Roof size estimate", value: formatRoofSqm(lead.roof_sqft) },
    { label: "Standard replacement", value: priceRange, highlight: true },
    { label: "Date generated", value: formatGeneratedDate(String(lead.created_at)) },
  ];

  return (
    <main className="quote-pdf-document">
      <div className="quote-pdf-inner">
        <PrintButton />

        <header className="quote-pdf-header">
          <p className="quote-pdf-company">{companyName}</p>
          <p className="quote-pdf-title">Roof replacement estimate</p>
        </header>

        <div className="quote-pdf-grid">
          {rows.map((row) => (
            <div key={row.label} className="quote-pdf-row">
              <dt className="quote-pdf-label">{row.label}</dt>
              <dd className={`quote-pdf-value ${row.highlight ? "quote-pdf-price" : ""}`}>
                {row.value}
              </dd>
            </div>
          ))}
        </div>

        <footer className="quote-pdf-footer">
          This is an estimate only. Final price confirmed after site inspection.
        </footer>
      </div>
    </main>
  );
}
