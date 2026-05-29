"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import Link from "next/link";
import { addDays, format } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { formatDeposit } from "@/lib/currency";

const slotButtonBase =
  "text-left w-full rounded-lg border border-border-subtle bg-background px-4 py-3 text-foreground transition-colors hover:border-accent";
const slotButtonSelected = "border-accent bg-[#F5A623] text-[#1C1C1C] hover:border-accent";

export default function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState("");
  const [lead, setLead] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [availability, setAvailability] = useState<any[]>([]);
  const [slot, setSlot] = useState("");

  useEffect(() => {
    params.then((p) => setId(p.id));
    fetch("/api/public/bootstrap")
      .then((r) => r.json())
      .then((d) => {
        setSettings(d.settings);
        setAvailability(d.availability || []);
      });
  }, [params]);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/leads/${id}`)
      .then((r) => r.json())
      .then((d) => setLead(d.lead));
  }, [id]);

  const next14DaysSlots = useMemo(() => {
    const values: string[] = [];
    const byDay = new Map<number, any>(
      availability.map((row) => [Number(row.day_of_week), row]),
    );
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

  const contactComplete = Boolean(
    lead?.name?.trim() && lead?.email?.trim() && lead?.phone?.trim(),
  );

  const depositLabel = useMemo(() => {
    if (!settings) return "—";
    const usd = Number(settings.deposit_amount ?? 50);
    if (!lead) return `$${usd}`;
    return formatDeposit(
      usd,
      lead.address,
      settings,
      lead.country_code,
      lead.latitude,
      lead.longitude,
    );
  }, [lead, settings]);

  async function checkout() {
    if (!contactComplete) {
      alert("Please complete your name, email, and phone on the quote page first.");
      return;
    }
    window.fbq?.("track", "InitiateCheckout");
    window.gtag?.("event", "begin_checkout");
    const res = await fetch("/api/bookings/create-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId: id,
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        bestTimeToContact: null,
        inspectionDateTime: slot,
      }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
  }

  if (!lead) {
    return (
      <main className="customer-page min-h-screen bg-background text-foreground">
        <div className="container-max py-10">
          <p className="text-muted">Loading booking…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="customer-page min-h-screen bg-background text-foreground pb-16">
      <div className="container-max py-8 md:py-12">
        <h1 className="text-2xl md:text-3xl">Book your free inspection</h1>
        <p className="mt-2 text-muted max-w-xl">
          Choose a time slot and pay your refundable deposit to lock in your quote.
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <section className="rounded-lg border border-border-subtle bg-surface p-6 md:p-8">
            <h2 className="text-lg text-foreground">Pick your inspection slot</h2>
            <div className="mt-4 grid gap-2 max-h-[460px] overflow-auto pr-1">
              {next14DaysSlots.length === 0 ? (
                <p className="text-sm text-muted">No slots available in the next 14 days.</p>
              ) : (
                next14DaysSlots.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSlot(s)}
                    className={slot === s ? slotButtonSelected : slotButtonBase}
                  >
                    {format(new Date(s), "EEE, MMM d — h:mm a")}
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="rounded-lg border border-border-subtle bg-surface p-6 md:p-8 flex flex-col">
            <h2 className="text-lg text-foreground">Deposit checkout</h2>
            <div className="mt-4 space-y-3 text-sm">
              <p className="text-foreground">
                <span className="text-muted">Name: </span>
                {lead.name || "—"}
              </p>
              <p className="text-foreground">
                <span className="text-muted">Email: </span>
                {lead.email || "—"}
              </p>
              <p className="text-foreground">
                <span className="text-muted">Phone: </span>
                {lead.phone || "—"}
              </p>
            </div>

            {!contactComplete && (
              <p className="mt-4 text-sm text-amber-200/90 leading-relaxed">
                Go back to your{" "}
                <Link href={`/quote/${id}`} className="text-accent underline">
                  quote page
                </Link>{" "}
                to enter your contact details before checkout.
              </p>
            )}

            <p className="mt-4 text-sm text-muted">
              Refundable deposit due today: <span className="text-foreground">{depositLabel}</span>
            </p>

            <button
              type="button"
              onClick={checkout}
              disabled={!slot || !contactComplete}
              className="mt-6 w-full btn-accent rounded-lg px-6 py-3.5 text-sm tracking-wide disabled:opacity-50"
            >
              Continue to Stripe Checkout
            </button>
          </section>
        </div>
      </div>
    </main>
  );
}
