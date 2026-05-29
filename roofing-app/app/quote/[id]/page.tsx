"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SettingsRow } from "@/lib/types";

const contactFieldClass =
  "w-full rounded-lg border border-border-subtle bg-surface px-4 py-3 text-foreground placeholder:text-muted/70 focus:outline-none focus:border-accent transition-colors";

function isValidEmail(value: string) {
  const trimmed = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

function isValidPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

type QuoteCurrency = "GB" | "AU" | "NZ" | "US";

/** UK: "UK", "uk", "United Kingdom", or country code GB (case-insensitive). */
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

/** Simple case-insensitive currency detection from lead address + country_code. */
function detectQuoteCurrency(address: string, countryCode?: string | null): QuoteCurrency {
  const addr = String(address ?? "").trim().toLowerCase();
  const code = String(countryCode ?? "").trim().toLowerCase();

  if (isUkRegion(address, countryCode)) {
    return "GB";
  }

  if (addr.includes("australia") || addr === "au" || code === "au" || code === "aus") {
    return "AU";
  }

  if (addr.includes("new zealand") || addr === "nz" || code === "nz" || code === "nzl") {
    return "NZ";
  }

  return "US";
}

/** Convert USD quote amounts and format for display on quote cards. */
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

  const fmt = (amount: number) => Math.round(amount).toLocaleString("en-US");

  switch (currency) {
    case "GB": {
      const lowLocal = low * rateGbp;
      const highLocal = high * rateGbp;
      return `£${fmt(lowLocal)} - £${fmt(highLocal)}`;
    }
    case "AU": {
      const lowLocal = low * rateAud;
      const highLocal = high * rateAud;
      return `A$${fmt(lowLocal)} - A$${fmt(highLocal)}`;
    }
    case "NZ": {
      const lowLocal = low * rateNzd;
      const highLocal = high * rateNzd;
      return `NZ$${fmt(lowLocal)} - NZ$${fmt(highLocal)}`;
    }
    default:
      return `$${fmt(low)} - $${fmt(high)}`;
  }
}

function formatDepositPrice(
  usdDeposit: number,
  address: string,
  settings: SettingsRow | null,
  countryCode?: string | null,
): string {
  const currency = detectQuoteCurrency(address, countryCode);
  const rateGbp = Number(settings?.currency_rate_gbp ?? 0.79);
  const rateAud = Number(settings?.currency_rate_aud ?? 1.53);
  const rateNzd = Number(settings?.currency_rate_nzd ?? 1.64);
  const fmt = (amount: number) => Math.round(amount).toLocaleString("en-US");

  switch (currency) {
    case "GB":
      return `£${fmt(usdDeposit * rateGbp)}`;
    case "AU":
      return `A$${fmt(usdDeposit * rateAud)}`;
    case "NZ":
      return `NZ$${fmt(usdDeposit * rateNzd)}`;
    default:
      return `$${fmt(usdDeposit)}`;
  }
}

export default function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [id, setId] = useState("");
  const [lead, setLead] = useState<any>(null);
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [contact, setContact] = useState({ name: "", email: "", phone: "" });
  const [savingContact, setSavingContact] = useState(false);

  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  useEffect(() => {
    if (!id) return;
    Promise.all([fetch(`/api/leads/${id}`), fetch("/api/public/bootstrap")])
      .then(async ([leadRes, bootstrapRes]) => {
        const leadData = await leadRes.json();
        const bootstrapData = await bootstrapRes.json();
        if (leadData.lead) setLead(leadData.lead);
        if (bootstrapData.settings) setSettings(bootstrapData.settings);
      })
      .catch((err) => console.error("quote page load failed:", err));
  }, [id]);

  const squares = useMemo(() => (lead?.roof_sqft ? (Number(lead.roof_sqft) / 100).toFixed(1) : "0"), [lead]);

  const customerAddress = String(lead?.address ?? "");
  const customerCountry = lead?.country_code != null ? String(lead.country_code) : null;

  useEffect(() => {
    if (!lead) return;
    console.log("[quote] lead.address:", lead.address, "| typeof:", typeof lead.address);
    console.log("[quote] lead.country_code:", lead.country_code);
    console.log("[quote] isUkRegion:", isUkRegion(customerAddress, customerCountry));
    console.log("[quote] currency detected:", detectQuoteCurrency(customerAddress, customerCountry));
  }, [lead, customerAddress, customerCountry]);

  const quoteCurrency = useMemo(
    () => detectQuoteCurrency(customerAddress, customerCountry),
    [customerAddress, customerCountry],
  );

  useEffect(() => {
    if (!lead) return;
    setContact({
      name: String(lead.name ?? ""),
      email: String(lead.email ?? ""),
      phone: String(lead.phone ?? ""),
    });
  }, [lead]);

  const contactReady =
    contact.name.trim().length > 0 && isValidEmail(contact.email) && isValidPhone(contact.phone);

  async function continueToBooking() {
    const name = contact.name.trim();
    const email = contact.email.trim();
    const phone = contact.phone.trim();

    if (!name) {
      alert("Please enter your name.");
      return;
    }
    if (!isValidEmail(email)) {
      alert("Please enter a valid email address.");
      return;
    }
    if (!isValidPhone(phone)) {
      alert("Please enter a valid phone number.");
      return;
    }

    setSavingContact(true);
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not save your details");
      }
      router.push(`/book/${id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not save your details. Please try again.");
    } finally {
      setSavingContact(false);
    }
  }

  const polygonPoints = useMemo(() => {
    const raw = lead?.polygon_coordinates;
    if (!Array.isArray(raw)) return "";
    return raw.map((p: { x?: number; y?: number }) => `${p.x ?? 0},${p.y ?? 0}`).join(" ");
  }, [lead?.polygon_coordinates]);

  const hasQuoteEstimates = useMemo(() => {
    if (!lead) return false;
    const fields = [
      lead.quote_repair_low,
      lead.quote_repair_high,
      lead.quote_standard_low,
      lead.quote_standard_high,
      lead.quote_premium_low,
      lead.quote_premium_high,
    ];
    return fields.some((v) => v != null && Number(v) > 0);
  }, [lead]);

  if (!lead) return <main className="customer-page container-max py-10">Loading quote...</main>;

  const satelliteSrc = String(lead.satellite_image_url ?? "").trim();

  return (
    <main className="customer-page container-max py-8">
      <div className="relative w-full max-w-[600px]">
        {satelliteSrc ? (
          <Image
            src={satelliteSrc}
            alt="Satellite"
            width={600}
            height={600}
            unoptimized
            className="w-full h-auto rounded-xl border border-border-subtle"
          />
        ) : (
          <div className="flex h-[300px] md:h-[400px] items-center justify-center rounded-xl border border-border-subtle bg-surface text-muted text-sm">
            Satellite image unavailable
          </div>
        )}
        {polygonPoints ? (
          <svg viewBox="0 0 600 600" className="absolute inset-0 w-full h-full pointer-events-none">
            <polygon
              points={polygonPoints}
              fill="rgba(245, 166, 35, 0.35)"
              stroke="rgba(245, 166, 35, 0.9)"
              strokeWidth="3"
            />
          </svg>
        ) : null}
      </div>

      <p className="mt-4 text-sm text-muted">
        Property: <strong className="text-foreground">{customerAddress || "Address not saved"}</strong>
      </p>
      <p className="mt-1 text-sm text-muted">
        Currency detected:{" "}
        <strong>
          {quoteCurrency === "GB"
            ? "GBP (£)"
            : quoteCurrency === "AU"
              ? "AUD (A$)"
              : quoteCurrency === "NZ"
                ? "NZD (NZ$)"
                : "USD ($)"}
        </strong>
        {quoteCurrency !== "US" && " — converted from USD using your admin rates"}
      </p>

      <div className="grid md:grid-cols-2 gap-3 mt-4">
        <p className="rounded-lg border border-border-subtle bg-surface p-3 text-foreground">
          Estimated roof area: <strong>{lead.roof_sqft ?? "—"} sq ft</strong>
        </p>
        <p className="rounded-lg border border-border-subtle bg-surface p-3 text-foreground">
          Estimated squares: <strong>{squares}</strong>
        </p>
        <p className="rounded-lg border border-border-subtle bg-surface p-3 text-foreground">
          Detected roof type: <strong>{lead.roof_type ?? "—"}</strong>
        </p>
        <p className="rounded-lg border border-border-subtle bg-surface p-3 text-foreground">
          Complexity: <strong>{lead.roof_complexity ?? "—"}</strong>
        </p>
      </div>

      {lead.vision_confidence != null && Number(lead.vision_confidence) < 50 && (
        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
          Your roof has complex features - your final quote may vary significantly from this estimate.
        </p>
      )}

      {!hasQuoteEstimates ? (
        <div className="mt-6 rounded-lg border border-border-subtle bg-surface p-6 text-foreground">
          <p className="text-muted">
            Cost estimates are not available yet. Analysis may still be in progress or did not complete.
          </p>
          {lead.latitude != null && lead.longitude != null && (
            <Link
              href={`/analyzing?leadId=${id}&lat=${lead.latitude}&lng=${lead.longitude}&force=true`}
              className="mt-3 inline-block text-sm text-accent underline"
            >
              Re-run roof analysis
            </Link>
          )}
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-4 mt-6">
          <div className="rounded-xl border border-border-subtle bg-surface p-4 text-foreground">
            <h3>Repair Estimate</h3>
            <p className="text-2xl mt-2 text-foreground">
              {formatQuotePriceRange(
                lead.quote_repair_low,
                lead.quote_repair_high,
                customerAddress,
                settings,
                customerCountry,
              )}
            </p>
          </div>
          <div className="rounded-xl border border-border-subtle bg-surface p-4 text-foreground">
            <h3>Full Replacement - Standard</h3>
            <p className="text-2xl mt-2 text-foreground">
              {formatQuotePriceRange(
                lead.quote_standard_low,
                lead.quote_standard_high,
                customerAddress,
                settings,
                customerCountry,
              )}
            </p>
          </div>
          <div className="rounded-xl border border-border-subtle bg-surface p-4 text-foreground">
            <h3>Full Replacement - Premium</h3>
            <p className="text-2xl mt-2 text-foreground">
              {formatQuotePriceRange(
                lead.quote_premium_low,
                lead.quote_premium_high,
                customerAddress,
                settings,
                customerCountry,
              )}
            </p>
          </div>
        </div>
      )}

      <p className="mt-3 text-sm text-muted">
        Estimate based on AI satellite analysis. Final pricing confirmed at free in-person inspection.
      </p>

      {lead.latitude != null && lead.longitude != null && (
        <Link
          href={`/analyzing?leadId=${id}&lat=${lead.latitude}&lng=${lead.longitude}&force=true`}
          className="mt-3 inline-block text-sm text-[#C8102E] underline"
        >
          Re-run roof analysis
        </Link>
      )}

      <section className="mt-8 max-w-md rounded-lg border border-border-subtle bg-surface p-6">
        <h2 className="text-lg text-foreground">Your details</h2>
        <p className="mt-1 text-sm text-muted">We&apos;ll use these to confirm your inspection booking.</p>
        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor="quote-name" className="block text-sm text-muted mb-1.5">
              Name
            </label>
            <input
              id="quote-name"
              type="text"
              required
              autoComplete="name"
              className={contactFieldClass}
              placeholder="Your full name"
              value={contact.name}
              onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="quote-email" className="block text-sm text-muted mb-1.5">
              Email
            </label>
            <input
              id="quote-email"
              type="email"
              required
              autoComplete="email"
              className={contactFieldClass}
              placeholder="your@email.com"
              value={contact.email}
              onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="quote-phone" className="block text-sm text-muted mb-1.5">
              Phone number
            </label>
            <input
              id="quote-phone"
              type="tel"
              required
              autoComplete="tel"
              className={contactFieldClass}
              placeholder="Phone number"
              value={contact.phone}
              onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))}
            />
          </div>
        </div>
      </section>

      <button
        type="button"
        onClick={continueToBooking}
        disabled={!contactReady || savingContact}
        className="mt-6 rounded-xl bg-[#C8102E] px-6 py-4 text-white disabled:opacity-50"
      >
        {savingContact
          ? "Saving…"
          : `Lock In Your Quote - Book Free Inspection (${formatDepositPrice(
              Number(settings?.deposit_amount ?? 50),
              customerAddress,
              settings,
              customerCountry,
            )} Refundable Deposit)`}
      </button>
    </main>
  );
}
