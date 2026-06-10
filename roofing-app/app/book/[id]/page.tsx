"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import Link from "next/link";
import { addDays, format } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { INSPECTION_HOUR_OPTIONS } from "@/lib/inspection-datetime";

const contactFieldClass =
  "w-full rounded-lg border border-border-subtle bg-background px-4 py-3 text-foreground placeholder:text-muted/70 focus:outline-none focus:border-accent transition-colors";

const timeChoiceBase =
  "text-left w-full rounded-lg border border-border-subtle bg-background px-4 py-3 text-foreground transition-colors hover:border-accent";
const timeChoiceSelected = "border-accent bg-[#F5A623] text-[#1C1C1C] hover:border-accent";

export default function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState("");
  const [lead, setLead] = useState<any>(null);
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/leads/${id}`)
      .then((r) => r.json())
      .then((d) => setLead(d.lead));
  }, [id]);

  const minDate = useMemo(() => format(addDays(new Date(), 1), "yyyy-MM-dd"), []);
  const maxDate = useMemo(() => format(addDays(new Date(), 60), "yyyy-MM-dd"), []);

  const contactComplete = Boolean(
    lead?.name?.trim() && lead?.email?.trim() && lead?.phone?.trim(),
  );

  async function submitBooking() {
    if (!preferredDate) {
      alert("Please select a preferred date.");
      return;
    }
    if (!preferredTime) {
      alert("Please select a preferred time.");
      return;
    }
    if (!contactComplete) {
      alert("Please complete your name, email, and phone on the quote page first.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/bookings/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: id,
          preferredDate,
          preferredTime,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Could not submit your booking");
      }

      if (typeof window !== "undefined" && data.appointment) {
        sessionStorage.setItem(`booking-confirmed:${id}`, JSON.stringify(data.appointment));
      }

      window.location.href = `/confirmation/${id}`;
    } catch (err) {
      alert(err instanceof Error ? err.message : "Booking failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
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
          Choose your preferred date and time. We will confirm your appointment by email.
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <section className="rounded-lg border border-border-subtle bg-surface p-6 md:p-8">
            <h2 className="text-lg text-foreground">Inspection preferences</h2>

            <div className="mt-4 space-y-2">
              <label htmlFor="preferred-date" className="text-sm text-muted">
                Preferred date
              </label>
              <input
                id="preferred-date"
                type="date"
                min={minDate}
                max={maxDate}
                value={preferredDate}
                onChange={(e) => setPreferredDate(e.target.value)}
                className={contactFieldClass}
              />
            </div>

            <div className="mt-6 space-y-2">
              <p className="text-sm text-muted">Preferred time</p>
              <div className="grid grid-cols-2 gap-2 max-h-[280px] overflow-auto pr-1 sm:grid-cols-3">
                {INSPECTION_HOUR_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPreferredTime(option.value)}
                    className={
                      preferredTime === option.value ? timeChoiceSelected : timeChoiceBase
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 space-y-2">
              <label htmlFor="booking-notes" className="text-sm text-muted">
                Additional notes for your roofer (optional)
              </label>
              <textarea
                id="booking-notes"
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Access instructions, parking, pets, or anything else we should know."
                className={`${contactFieldClass} resize-y min-h-[120px]`}
              />
            </div>
          </section>

          <section className="rounded-lg border border-border-subtle bg-surface p-6 md:p-8 flex flex-col">
            <h2 className="text-lg text-foreground">Your details</h2>
            <div className="mt-4 space-y-3 text-sm">
              <p className="text-foreground">
                <span className="text-muted">Name: </span>
                {lead.name || "Not provided"}
              </p>
              <p className="text-foreground">
                <span className="text-muted">Email: </span>
                {lead.email || "Not provided"}
              </p>
              <p className="text-foreground">
                <span className="text-muted">Phone: </span>
                {lead.phone || "Not provided"}
              </p>
              <p className="text-foreground">
                <span className="text-muted">Property: </span>
                {lead.address || "Not provided"}
              </p>
            </div>

            {!contactComplete && (
              <p className="mt-4 text-sm text-amber-200/90 leading-relaxed">
                Go back to your{" "}
                <Link href={`/quote/${id}`} className="text-accent underline">
                  quote page
                </Link>{" "}
                to enter your contact details before booking.
              </p>
            )}

            <button
              type="button"
              onClick={() => void submitBooking()}
              disabled={!preferredDate || !preferredTime || !contactComplete || submitting}
              className="mt-6 w-full btn-accent rounded-lg px-6 py-3.5 text-sm tracking-wide disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Confirm my inspection"}
            </button>
          </section>
        </div>
      </div>
    </main>
  );
}
