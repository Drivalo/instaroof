"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import Link from "next/link";
import { addDays, format } from "date-fns";
import { SatelliteRoofMap } from "@/components/satellite-roof-map";
import {
  RoofMaterialComparisonTable,
  RoofMaterialSelector,
  RoofMaterialSingleEstimate,
} from "@/components/roof-material-panel";
import { useCallback, useEffect, useMemo, useState } from "react";
import { gutteringInspectionQuestion } from "@/lib/guttering-inspection";
import { JOB_TYPE_OPTIONS, isValidJobType, type JobType } from "@/lib/job-type";
import { isRoofMaterialNotSure } from "@/lib/roof-material";
import { formatRoofAreaLabel, formatRoofSquares, usesImperialRoofDisplay } from "@/lib/roof-estimate";
import { SettingsRow } from "@/lib/types";

const contactFieldClass =
  "w-full rounded-lg border border-border-subtle bg-background px-4 py-3 text-foreground placeholder:text-muted/70 focus:outline-none focus:border-accent transition-colors";

const slotButtonBase =
  "text-left w-full rounded-lg border border-border-subtle bg-background px-4 py-3 text-foreground transition-colors hover:border-accent";
const slotButtonSelected = "border-accent bg-[#F5A623] text-[#1C1C1C] hover:border-accent";

function isValidEmail(value: string) {
  const trimmed = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

function isValidPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

type QuoteCurrency = "GB" | "AU" | "NZ" | "US" | "CA";

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

  if (addr.includes("canada") || code === "ca") {
    return "CA";
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
  const rateCad = Number(
    (settings as { currency_rate_cad?: number } | null)?.currency_rate_cad ?? 1.36,
  );

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
    case "CA": {
      const lowLocal = low * rateCad;
      const highLocal = high * rateCad;
      return `C$${fmt(lowLocal)} - C$${fmt(highLocal)}`;
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
  const rateCad = Number(
    (settings as { currency_rate_cad?: number } | null)?.currency_rate_cad ?? 1.36,
  );
  const fmt = (amount: number) => Math.round(amount).toLocaleString("en-US");

  switch (currency) {
    case "GB":
      return `£${fmt(usdDeposit * rateGbp)}`;
    case "AU":
      return `A$${fmt(usdDeposit * rateAud)}`;
    case "NZ":
      return `NZ$${fmt(usdDeposit * rateNzd)}`;
    case "CA":
      return `C$${fmt(usdDeposit * rateCad)}`;
    default:
      return `$${fmt(usdDeposit)}`;
  }
}

/** Placeholder only; real quote amounts are not shown before contact unlock. */
function placeholderQuoteRangeLabel(address: string, countryCode?: string | null): string {
  const currency = detectQuoteCurrency(address, countryCode);
  switch (currency) {
    case "GB":
      return "£XX,XXX - £XX,XXX";
    case "AU":
      return "A$XX,XXX - A$XX,XXX";
    case "NZ":
      return "NZ$XX,XXX - NZ$XX,XXX";
    case "CA":
      return "C$XX,XXX - C$XX,XXX";
    default:
      return "$XX,XXX - $XX,XXX";
  }
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export default function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState("");
  const [lead, setLead] = useState<any>(null);
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [contact, setContact] = useState({ name: "", email: "", phone: "" });
  const [savingContact, setSavingContact] = useState(false);
  const [satelliteReady, setSatelliteReady] = useState(false);
  const [detailsUnlocked, setDetailsUnlocked] = useState(false);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [availability, setAvailability] = useState<any[]>([]);
  const [inspectionSlot, setInspectionSlot] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [jobType, setJobType] = useState<JobType | "">("");
  const [gutteringChoice, setGutteringChoice] = useState<"yes" | "no" | null>(null);
  const [savingGuttering, setSavingGuttering] = useState(false);
  const [savingMaterial, setSavingMaterial] = useState(false);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);

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
        if (bootstrapData.availability) setAvailability(bootstrapData.availability);
      })
      .catch((err) => console.error("quote page load failed:", err));
  }, [id]);

  const customerAddress = String(lead?.address ?? "");
  const customerCountry = lead?.country_code != null ? String(lead.country_code) : null;

  const imperialRoofMeasurements = useMemo(
    () => usesImperialRoofDisplay(customerCountry, customerAddress),
    [customerCountry, customerAddress],
  );

  const roofAreaDisplay = useMemo(() => {
    const sqft = lead?.roof_sqft;
    return {
      area: formatRoofAreaLabel(sqft, customerCountry, customerAddress, "—"),
      squares: formatRoofSquares(sqft, customerCountry, customerAddress),
    };
  }, [lead?.roof_sqft, customerCountry, customerAddress]);

  useEffect(() => {
    if (!lead) return;
    console.log("[quote] lead.address:", lead.address, "| typeof:", typeof lead.address);
    console.log("[quote] lead.country_code:", lead.country_code);
    console.log("[quote] isUkRegion:", isUkRegion(customerAddress, customerCountry));
    console.log("[quote] currency detected:", detectQuoteCurrency(customerAddress, customerCountry));
  }, [lead, customerAddress, customerCountry]);

  useEffect(() => {
    if (!lead) return;
    const name = String(lead.name ?? "");
    const email = String(lead.email ?? "");
    const phone = String(lead.phone ?? "");
    const savedJobType = lead.job_type;
    setContact({ name, email, phone });
    if (isValidJobType(savedJobType)) setJobType(savedJobType);
    if (lead.guttering === true) setGutteringChoice("yes");
    const savedMaterial = lead.roof_material ? String(lead.roof_material) : null;
    if (savedMaterial) setSelectedMaterialId(savedMaterial);
    if (
      name.trim() &&
      isValidEmail(email) &&
      isValidPhone(phone) &&
      isValidJobType(savedJobType) &&
      savedMaterial
    ) {
      setDetailsUnlocked(true);
    }
  }, [lead]);

  const materialComplete = Boolean(lead?.roof_material);
  const materialNotSure = isRoofMaterialNotSure(lead?.roof_material);
  const roofSqftNumeric = Number(lead?.roof_sqft);
  const hasRoofSqft = Number.isFinite(roofSqftNumeric) && roofSqftNumeric > 0;

  const formatStandardRange = useCallback(
    (low: number, high: number) =>
      formatQuotePriceRange(low, high, customerAddress, settings, customerCountry),
    [customerAddress, settings, customerCountry],
  );

  const saveRoofMaterial = useCallback(
    async (materialId: string) => {
      if (!id) return;
      setSelectedMaterialId(materialId);
      setSavingMaterial(true);
      try {
        const res = await fetch(`/api/leads/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roof_material: materialId }),
        });
        const data = await res.json();
        if (!res.ok) {
          console.error("[quote] saveRoofMaterial failed", { leadId: id, error: data.error });
          alert(data.error || "Could not save your roof type. Please try again.");
          return;
        }
        if (data.lead) setLead(data.lead);
      } catch (err) {
        console.error("[quote] saveRoofMaterial failed", err);
        alert("Could not save your roof type. Please try again.");
      } finally {
        setSavingMaterial(false);
      }
    },
    [id],
  );

  const saveGuttering = useCallback(
    async (value: boolean, choice: "yes" | "no") => {
      if (!id) return;
      setGutteringChoice(choice);
      setSavingGuttering(true);
      try {
        const res = await fetch(`/api/leads/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ guttering: value }),
        });
        const data = await res.json();
        if (!res.ok) {
          console.error("[quote] saveGuttering failed", { leadId: id, error: data.error });
          return;
        }
        if (data.lead) setLead(data.lead);
      } catch (err) {
        console.error("[quote] saveGuttering failed", err);
      } finally {
        setSavingGuttering(false);
      }
    },
    [id],
  );

  const contactReady =
    materialComplete &&
    contact.name.trim().length > 0 &&
    isValidEmail(contact.email) &&
    isValidPhone(contact.phone) &&
    isValidJobType(jobType) &&
    privacyConsent;

  async function saveContactDetails(): Promise<boolean> {
    const name = contact.name.trim();
    const email = contact.email.trim();
    const phone = contact.phone.trim();

    if (!name) {
      alert("Please enter your first name.");
      return false;
    }
    if (!isValidEmail(email)) {
      alert("Please enter a valid email address.");
      return false;
    }
    if (!phone) {
      alert("Please enter your phone number.");
      return false;
    }
    if (!isValidPhone(phone)) {
      alert("Please enter a valid phone number.");
      return false;
    }
    if (!privacyConsent) {
      alert("Please agree to the privacy policy before continuing.");
      return false;
    }
    if (!isValidJobType(jobType)) {
      alert("Please select what best describes your situation.");
      return false;
    }

    if (!id) {
      console.error("[quote] saveContactDetails blocked — lead id not loaded yet");
      alert("Quote is still loading. Please wait a moment and try again.");
      return false;
    }

    setSavingContact(true);
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          job_type: jobType,
          guttering: gutteringChoice === "yes",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error("[quote] saveContactDetails failed:", { status: res.status, error: data.error, leadId: id });
        throw new Error(data.error || "Could not save your details");
      }
      if (!data.lead) {
        console.error("[quote] saveContactDetails — OK response but no lead returned", { leadId: id });
        throw new Error("Could not save your details");
      }
      setLead(data.lead);
      setDetailsUnlocked(true);
      console.info("[quote] saveContactDetails success — lead updated in Supabase", {
        leadId: id,
        email: data.lead.email ?? null,
      });
      return true;
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not save your details. Please try again.");
      return false;
    } finally {
      setSavingContact(false);
    }
  }

  const openBookingModal = useCallback(() => {
    setBookingModalOpen(true);
    console.info("[quote] showBookingModal set to true", { source: "button" });
  }, []);

  async function handleRevealQuote() {
    const saved = await saveContactDetails();
    if (saved) {
      console.info("[quote] contact saved — quote revealed");
    } else {
      console.warn("[quote] reveal quote submit failed");
    }
  }

  const next14DaysSlots = useMemo(() => {
    const values: string[] = [];
    const byDay = new Map<number, any>(availability.map((row) => [Number(row.day_of_week), row]));
    for (let i = 1; i <= 14; i += 1) {
      const d = addDays(new Date(), i);
      const row = byDay.get(d.getDay());
      if (!row || !Array.isArray(row.time_slots) || !row.time_slots.length) continue;
      const dayIso = format(d, "yyyy-MM-dd");
      const blackout = (row.blackout_dates || []).map((x: string) => String(x).slice(0, 10));
      if (blackout.includes(dayIso)) continue;
      for (const t of row.time_slots) values.push(`${dayIso}T${t}:00`);
    }
    return values;
  }, [availability]);

  async function startInspectionCheckout() {
    if (!inspectionSlot) {
      alert("Please select an inspection time.");
      return;
    }
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/bookings/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: id,
          name: contact.name.trim(),
          phone: contact.phone.trim(),
          email: contact.email.trim(),
          bestTimeToContact: null,
          inspectionDateTime: new Date(inspectionSlot).toISOString(),
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error(data.error || "Could not start checkout");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Checkout failed. Please try again.");
    } finally {
      setCheckoutLoading(false);
    }
  }

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

  const satelliteSrc = lead ? String(lead.satellite_image_url ?? "").trim() : "";

  useEffect(() => {
    if (!satelliteSrc) setSatelliteReady(true);
  }, [satelliteSrc]);

  const showBookingModal = bookingModalOpen && detailsUnlocked && hasQuoteEstimates;
  const showBookInspectionCta = detailsUnlocked && hasQuoteEstimates && !showBookingModal;
  const showGatedFlow = hasQuoteEstimates && satelliteReady && !detailsUnlocked;
  const placeholderRange = placeholderQuoteRangeLabel(customerAddress, customerCountry);

  useEffect(() => {
    if (!showBookingModal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showBookingModal]);

  if (!lead) return <main className="customer-page container-max py-10">Loading quote...</main>;

  const depositLabel = formatDepositPrice(
    Number(settings?.deposit_amount ?? 50),
    customerAddress,
    settings,
    customerCountry,
  );

  return (
    <main className="customer-page container-max py-8 relative">
      {showBookingModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="quote-booking-modal-title"
        >
          <div className="w-full max-w-lg rounded-xl border border-border-subtle bg-surface p-6 md:p-8 shadow-2xl my-4 pointer-events-auto">
            <h2 id="quote-booking-modal-title" className="text-xl md:text-2xl text-foreground">
              Book your free inspection
            </h2>
            <p className="mt-2 text-sm text-muted leading-relaxed">
              Choose a time slot and pay your refundable deposit to lock in your quote.
            </p>
            <p className="mt-4 text-sm text-muted">
              Refundable deposit: <span className="text-foreground">{depositLabel}</span>
            </p>
            <div className="mt-4 grid gap-2 max-h-[280px] overflow-auto pr-1">
              {next14DaysSlots.length === 0 ? (
                <p className="text-sm text-muted">No slots available in the next 14 days.</p>
              ) : (
                next14DaysSlots.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setInspectionSlot(s)}
                    className={inspectionSlot === s ? slotButtonSelected : slotButtonBase}
                  >
                    {format(new Date(s), "EEE, MMM d — h:mm a")}
                  </button>
                ))
              )}
            </div>
            <button
              type="button"
              onClick={() => void startInspectionCheckout()}
              disabled={!inspectionSlot || checkoutLoading}
              className="mt-6 w-full rounded-lg bg-[#F5A623] px-6 py-3.5 text-sm font-medium text-[#1C1C1C] tracking-wide transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {checkoutLoading ? "Redirecting…" : "Continue to Stripe Checkout"}
            </button>
          </div>
        </div>
      )}

      {hasQuoteEstimates ? (
        <h1 className="text-2xl md:text-3xl text-foreground mt-6 max-w-[600px]">
          {detailsUnlocked ? "Your quote" : "Your roof has been analysed"}
        </h1>
      ) : null}

      {lead?.latitude != null && lead?.longitude != null ? (
        <SatelliteRoofMap
          latitude={Number(lead.latitude)}
          longitude={Number(lead.longitude)}
          fallbackSrc={satelliteSrc || undefined}
          onImageReady={() => setSatelliteReady(true)}
        />
      ) : satelliteSrc ? (
        <div className="relative w-full max-w-[600px] h-[300px] md:h-[400px] min-h-[300px] overflow-hidden rounded-xl border border-border-subtle bg-[#2A2A2A] mt-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={satelliteSrc}
            alt="Satellite view of property"
            width={600}
            height={600}
            className="h-full w-full object-cover"
            onLoad={() => setSatelliteReady(true)}
            onError={() => setSatelliteReady(true)}
          />
        </div>
      ) : (
        <div className="flex h-[300px] md:h-[400px] max-w-[600px] items-center justify-center rounded-xl border border-border-subtle bg-surface text-muted text-sm mt-6">
          Satellite image unavailable
        </div>
      )}

      <p className="mt-4 text-sm text-muted max-w-[600px]">
        Property: <strong className="text-foreground">{customerAddress || "Address not saved"}</strong>
      </p>

      {hasQuoteEstimates && hasRoofSqft ? (
        <div className="mt-4 grid md:grid-cols-2 gap-3 max-w-[600px]">
          <p
            className={`rounded-lg border border-border-subtle bg-surface p-3 text-foreground ${
              !imperialRoofMeasurements ? "md:col-span-2" : ""
            }`}
          >
            Estimated roof size: <strong>{roofAreaDisplay.area}</strong>
          </p>
          {imperialRoofMeasurements ? (
            <p className="rounded-lg border border-border-subtle bg-surface p-3 text-foreground">
              Estimated squares: <strong>{roofAreaDisplay.squares ?? "—"}</strong>
            </p>
          ) : null}
        </div>
      ) : null}

      {lead?.vision_roof_visible === false ? (
        <p className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 max-w-[600px] leading-relaxed">
          {lead.vision_fallback_reason?.trim()
            ? lead.vision_fallback_reason
            : "We could not clearly identify a roof in the satellite image for this property."}
        </p>
      ) : null}

      {showGatedFlow && lead?.vision_roof_visible !== false ? (
        <section className="mt-6 max-w-[600px] w-full" aria-labelledby="quote-teaser-title">
          <h2 id="quote-teaser-title" className="sr-only">
            Quote preview
          </h2>
          <div className="relative rounded-xl border border-border-subtle bg-surface p-6 overflow-hidden">
            <p className="text-sm text-muted">Your estimated price range</p>
            <div className="relative mt-3 min-h-[4.5rem] flex items-center justify-center">
              <p
                className="text-2xl text-foreground blur-[14px] select-none pointer-events-none"
                aria-hidden
              >
                {placeholderRange}
              </p>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted">
                <LockIcon className="text-foreground/70" />
              </div>
            </div>
            <p className="mt-4 text-sm text-center text-muted leading-relaxed">
              Enter your details to reveal your full quote
            </p>
          </div>
        </section>
      ) : null}

      {showGatedFlow ? (
        <section
          className="mt-8 max-w-[600px] w-full rounded-xl border border-border-subtle bg-surface p-6 md:p-8"
          aria-labelledby="quote-contact-title"
        >
          <h2 id="quote-contact-title" className="text-xl text-foreground">
            Your details
          </h2>
          <p className="mt-2 text-sm text-muted leading-relaxed">
            Tell us about your roof and how to reach you. We will show your full quote right after.
          </p>
          <div className="mt-6 space-y-3">
            <p id="roof-material-label" className="text-sm text-muted">
              What type of roof do you have?
            </p>
            <RoofMaterialSelector
              countryCode={customerCountry}
              address={customerAddress}
              selectedId={selectedMaterialId}
              disabled={savingMaterial}
              onSelect={(materialId) => void saveRoofMaterial(materialId)}
            />
          </div>
          {materialComplete ? (
            <>
              <div className="mt-6 space-y-3">
                <p className="text-sm text-muted leading-relaxed">
                  {gutteringInspectionQuestion(customerCountry)}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={savingGuttering}
                    onClick={() => void saveGuttering(true, "yes")}
                    className={gutteringChoice === "yes" ? slotButtonSelected : slotButtonBase}
                  >
                    Yes please
                  </button>
                  <button
                    type="button"
                    disabled={savingGuttering}
                    onClick={() => void saveGuttering(false, "no")}
                    className={gutteringChoice === "no" ? slotButtonSelected : slotButtonBase}
                  >
                    No thanks
                  </button>
                </div>
              </div>
              <div className="mt-6 space-y-3">
                <p id="job-type-label" className="text-sm text-muted">
                  What best describes your situation?
                </p>
                <div className="space-y-2" role="radiogroup" aria-labelledby="job-type-label">
                  {JOB_TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={jobType === opt.value}
                      onClick={() => setJobType(opt.value)}
                      className={jobType === opt.value ? slotButtonSelected : slotButtonBase}
                    >
                      {opt.emoji} {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-6 space-y-4">
                <div>
                  <label htmlFor="quote-name" className="block text-sm text-muted mb-1.5">
                    First name
                  </label>
                  <input
                    id="quote-name"
                    type="text"
                    required
                    autoComplete="given-name"
                    className={contactFieldClass}
                    placeholder="First name"
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
                    placeholder="Email"
                    value={contact.email}
                    onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
                  />
                </div>
                <div>
                  <label htmlFor="quote-phone" className="block text-sm text-muted mb-1.5">
                    Phone
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
              <label className="mt-4 flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={privacyConsent}
                  onChange={(e) => setPrivacyConsent(e.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 rounded border-border-subtle bg-background accent-[#F5A623]"
                />
                <span className="text-sm text-muted leading-relaxed">
                  I agree to my personal data being processed to generate and deliver my roof quote.{" "}
                  <Link href="/privacy" className="text-accent underline-offset-2 hover:underline">
                    View our Privacy Policy
                  </Link>
                  .
                </span>
              </label>
              <button
                type="button"
                onClick={() => void handleRevealQuote()}
                disabled={!contactReady || savingContact}
                className="mt-6 w-full rounded-lg bg-[#F5A623] px-6 py-3.5 text-sm font-medium text-[#1C1C1C] tracking-wide transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {savingContact ? "Saving…" : "Reveal my quote"}
              </button>
            </>
          ) : (
            <p className="mt-4 text-sm text-muted">Select your roof type above to continue.</p>
          )}
        </section>
      ) : null}

      {lead.vision_confidence != null && Number(lead.vision_confidence) < 50 && (
        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 max-w-[600px]">
          Your roof has complex features - your final quote may vary significantly from this estimate.
        </p>
      )}

      {!hasQuoteEstimates ? (
        <div className="mt-6 rounded-lg border border-border-subtle bg-surface p-6 text-foreground max-w-[600px]">
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
      ) : null}

      {detailsUnlocked && lead?.vision_roof_visible !== false && settings && hasRoofSqft ? (
        <section className="mt-6 max-w-[600px] w-full" aria-labelledby="quote-revealed-title">
          <h2 id="quote-revealed-title" className="text-lg text-foreground">
            Your full quote
          </h2>
          {materialNotSure ? (
            <div className="mt-4">
              <p className="text-sm text-muted mb-3">Compare materials (full replacement)</p>
              <RoofMaterialComparisonTable
                countryCode={customerCountry}
                address={customerAddress}
                roofSqft={roofSqftNumeric}
                settings={settings}
                formatRange={formatStandardRange}
              />
            </div>
          ) : materialComplete ? (
            <div className="mt-4">
              <RoofMaterialSingleEstimate
                low={Number(lead.quote_standard_low) || 0}
                high={Number(lead.quote_standard_high) || 0}
                formatRange={formatStandardRange}
              />
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted">Select your roof type above to see your personalised estimate.</p>
          )}
        </section>
      ) : null}

      {showBookInspectionCta && (
        <section className="mt-6 w-full max-w-[600px]">
          <button
            type="button"
            onClick={openBookingModal}
            className="w-full rounded-xl bg-[#F5A623] px-8 py-4 text-lg font-medium text-[#1C1C1C] tracking-wide transition-opacity hover:opacity-90"
          >
            Book your free inspection
          </button>
          <p className="mt-3 text-center text-sm text-muted">
            Final price confirmed on site. No obligation.
          </p>
        </section>
      )}

      {hasQuoteEstimates ? (
        <p className="mt-3 text-sm text-muted max-w-[600px]">
          Estimate based on AI satellite analysis.
        </p>
      ) : null}

      {lead.latitude != null && lead.longitude != null && (
        <Link
          href={`/analyzing?leadId=${id}&lat=${lead.latitude}&lng=${lead.longitude}&force=true`}
          className="mt-3 inline-block text-sm text-[#C8102E] underline"
        >
          Re-run roof analysis
        </Link>
      )}

    </main>
  );
}
