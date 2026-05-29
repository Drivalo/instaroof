"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type AppointmentDetails = {
  date: string;
  time: string;
  combined: string;
  address: string;
};

function ConfirmationContent({ leadId }: { leadId: string }) {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    sessionId ? "loading" : "error",
  );
  const [appointment, setAppointment] = useState<AppointmentDetails | null>(null);
  const [error, setError] = useState(
    sessionId ? "" : "Missing payment session. Please contact us if you were charged.",
  );

  useEffect(() => {
    if (!sessionId || !leadId) return;

    fetch("/api/bookings/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId, sessionId }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || "Could not confirm your booking");
        }
        if (data.appointment) setAppointment(data.appointment);
        setStatus("success");
      })
      .catch((err) => {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Confirmation failed");
      });
  }, [sessionId, leadId]);

  return (
    <main className="customer-page min-h-screen bg-background text-foreground">
      <section className="container-max py-12 md:py-16">
        <div className="mx-auto max-w-2xl rounded-lg border border-border-subtle bg-surface p-8 md:p-10 text-center">
          {status === "loading" && (
            <>
              <p className="text-muted">Confirming your booking…</p>
            </>
          )}

          {status === "success" && (
            <>
              <p className="text-4xl mb-4" aria-hidden>
                ✓
              </p>
              <h1 className="text-2xl md:text-3xl text-foreground">Booking confirmed</h1>
              <p className="mt-4 text-muted leading-relaxed">
                Your refundable deposit has been received. A confirmation email is on its way with
                your appointment details.
              </p>
              {appointment && (
                <div className="mt-8 rounded-lg border border-border-subtle bg-background p-6 text-left text-sm space-y-3">
                  <p className="text-foreground">
                    <span className="text-muted">Date: </span>
                    {appointment.date}
                  </p>
                  <p className="text-foreground">
                    <span className="text-muted">Time: </span>
                    {appointment.time}
                  </p>
                  <p className="text-foreground">
                    <span className="text-muted">Address: </span>
                    {appointment.address}
                  </p>
                </div>
              )}
            </>
          )}

          {status === "error" && (
            <>
              <h1 className="text-2xl md:text-3xl text-foreground">Something went wrong</h1>
              <p className="mt-4 text-red-400/90">{error}</p>
            </>
          )}

          <Link
            href="/"
            className="mt-8 inline-block btn-accent rounded-lg px-8 py-3.5 text-sm tracking-wide"
          >
            Back to home
          </Link>
        </div>
      </section>
    </main>
  );
}

function ConfirmationWithParams({ params }: { params: Promise<{ id: string }> }) {
  const [leadId, setLeadId] = useState("");

  useEffect(() => {
    params.then((p) => setLeadId(p.id));
  }, [params]);

  if (!leadId) {
    return (
      <main className="customer-page min-h-screen bg-background text-foreground">
        <section className="container-max py-12">
          <p className="text-muted">Loading…</p>
        </section>
      </main>
    );
  }

  return <ConfirmationContent leadId={leadId} />;
}

export default function ConfirmationPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense
      fallback={
        <main className="customer-page min-h-screen bg-background text-foreground">
          <section className="container-max py-12">
            <p className="text-muted">Confirming your booking…</p>
          </section>
        </main>
      }
    >
      <ConfirmationWithParams params={params} />
    </Suspense>
  );
}
