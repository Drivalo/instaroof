"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { SettingsRow } from "@/lib/types";

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
  const [id, setId] = useState("");
  const [lead, setLead] = useState<any>(null);
  const [settings, setSettings] = useState<SettingsRow | null>(null);

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

  if (!lead) return <main className="container-max py-10">Loading quote...</main>;

  return (
    <main className="container-max py-8">
      <div className="relative w-full max-w-[600px]">
        <Image
          src={lead.satellite_image_url}
          alt="Satellite"
          width={600}
          height={600}
          unoptimized
          className="w-full h-auto rounded-xl border"
        />
        <svg viewBox="0 0 600 600" className="absolute inset-0 w-full h-full">
          <polygon
            points={(lead.polygon_coordinates || []).map((p: any) => `${p.x},${p.y}`).join(" ")}
            fill="rgba(200, 16, 46, 0.35)"
            stroke="rgba(200,16,46,0.9)"
            strokeWidth="3"
          />
        </svg>
      </div>

      <p className="mt-4 text-sm text-zinc-600">
        Property: <strong>{customerAddress || "Address not saved"}</strong>
      </p>
      <p className="mt-1 text-sm text-zinc-500">
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
        <p className="rounded-lg bg-white border p-3">Estimated roof area: <strong>{lead.roof_sqft} sq ft</strong></p>
        <p className="rounded-lg bg-white border p-3">Estimated squares: <strong>{squares}</strong></p>
        <p className="rounded-lg bg-white border p-3">Detected roof type: <strong>{lead.roof_type}</strong></p>
        <p className="rounded-lg bg-white border p-3">Complexity: <strong>{lead.roof_complexity}</strong></p>
      </div>

      {lead.vision_confidence < 50 && (
        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
          Your roof has complex features - your final quote may vary significantly from this estimate.
        </p>
      )}

      <div className="grid md:grid-cols-3 gap-4 mt-6">
        <div className="rounded-xl border bg-white p-4">
          <h3 className="font-semibold">Repair Estimate</h3>
          <p className="text-2xl font-bold mt-2">
            {(() => {
              const low = Number(lead.quote_repair_low) || 0;
              const high = Number(lead.quote_repair_high) || 0;
              const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
              if (customerAddress.endsWith("UK") || customerAddress.includes(", UK")) {
                return `£${fmt(low * 0.79)} - £${fmt(high * 0.79)}`;
              }
              return `$${fmt(low)} - $${fmt(high)}`;
            })()}
          </p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <h3 className="font-semibold">Full Replacement - Standard</h3>
          <p className="text-2xl font-bold mt-2">
            {(() => {
              const low = Number(lead.quote_standard_low) || 0;
              const high = Number(lead.quote_standard_high) || 0;
              const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
              if (customerAddress.endsWith("UK") || customerAddress.includes(", UK")) {
                return `£${fmt(low * 0.79)} - £${fmt(high * 0.79)}`;
              }
              return `$${fmt(low)} - $${fmt(high)}`;
            })()}
          </p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <h3 className="font-semibold">Full Replacement - Premium</h3>
          <p className="text-2xl font-bold mt-2">
            {(() => {
              const low = Number(lead.quote_premium_low) || 0;
              const high = Number(lead.quote_premium_high) || 0;
              const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
              if (customerAddress.endsWith("UK") || customerAddress.includes(", UK")) {
                return `£${fmt(low * 0.79)} - £${fmt(high * 0.79)}`;
              }
              return `$${fmt(low)} - $${fmt(high)}`;
            })()}
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm text-zinc-600">
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

      <Link href={`/book/${id}`} className="inline-block mt-6 rounded-xl bg-[#C8102E] px-6 py-4 text-white font-semibold">
        Lock In Your Quote - Book Free Inspection (
        {(() => {
          const usd = Number(settings?.deposit_amount ?? 50);
          const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
          if (customerAddress.endsWith("UK") || customerAddress.includes(", UK")) {
            return `£${fmt(usd * 0.79)}`;
          }
          return `$${fmt(usd)}`;
        })()}{" "}
        Refundable Deposit)
      </Link>
    </main>
  );
}
