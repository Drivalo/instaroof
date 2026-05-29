"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { addDays, format } from "date-fns";
import { useEffect, useMemo, useState } from "react";

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

  if (!lead) return <main className="customer-page container-max py-8">Loading booking...</main>;

  return (
    <main className="customer-page container-max py-8 grid md:grid-cols-2 gap-6">
      <section className="rounded-xl bg-white border p-4 text-zinc-900">
        <h2 className="text-xl mb-3">Pick your inspection slot</h2>
        <div className="grid gap-2 max-h-[460px] overflow-auto">
          {next14DaysSlots.map((s) => (
            <button
              key={s}
              onClick={() => setSlot(s)}
              className={`text-left rounded-lg border p-3 ${slot === s ? "bg-[#C8102E] text-white" : "bg-white text-zinc-900"}`}
            >
              {format(new Date(s), "EEE, MMM d - h:mm a")}
            </button>
          ))}
        </div>
      </section>
      <section className="rounded-xl bg-white border p-4 text-zinc-900">
        <h2 className="text-xl mb-3">Deposit checkout</h2>
        <div className="space-y-2 text-sm text-zinc-700">
          <p>
            <span className="text-zinc-500">Name:</span> {lead.name || "—"}
          </p>
          <p>
            <span className="text-zinc-500">Email:</span> {lead.email || "—"}
          </p>
          <p>
            <span className="text-zinc-500">Phone:</span> {lead.phone || "—"}
          </p>
        </div>
        {!contactComplete && (
          <p className="mt-3 text-sm text-amber-800">
            Go back to your quote page to enter your contact details before checkout.
          </p>
        )}
        <p className="mt-3 text-sm text-zinc-600">Deposit due today: ${settings?.deposit_amount ?? 50}</p>
        <button
          onClick={checkout}
          disabled={!slot || !contactComplete}
          className="mt-4 w-full rounded-xl bg-[#C8102E] p-3 text-white disabled:opacity-50"
        >
          Continue to Stripe Checkout
        </button>
      </section>
    </main>
  );
}
