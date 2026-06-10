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
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [appointment, setAppointment] = useState<AppointmentDetails | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!leadId) return;

    const storageKey = `booking-confirmed:${leadId}`;
    const emailStorageKey = `booking-email-done:${leadId}`;
    const cached = typeof window !== "undefined" ? sessionStorage.getItem(storageKey) : null;
    const emailPreviouslyDone =
      typeof window !== "undefined" && sessionStorage.getItem(emailStorageKey) === "done";

    console.log("[confirmation-page] useEffect start", {
      leadId,
      sessionId,
      hasCachedAppointment: Boolean(cached),
      emailPreviouslyDone,
    });

    let cachedAppointment: AppointmentDetails | null = null;
    if (cached) {
      try {
        cachedAppointment = JSON.parse(cached) as AppointmentDetails;
        setAppointment(cachedAppointment);
      } catch {
        cachedAppointment = null;
      }
    }

    if (sessionId) {
      const stripeStorageKey = `booking-confirm:${leadId}:${sessionId}`;
      const previouslyDone =
        typeof window !== "undefined" && sessionStorage.getItem(stripeStorageKey) === "done";

      if (previouslyDone) {
        setStatus("success");
        const stripeCached = sessionStorage.getItem(`${stripeStorageKey}:appointment`);
        if (stripeCached) {
          try {
            setAppointment(JSON.parse(stripeCached) as AppointmentDetails);
          } catch {
            /* ignore invalid cache */
          }
        }
      }

      console.log("[confirmation-page] about to POST /api/bookings/confirm (stripe)", {
        leadId,
        sessionId,
        previouslyDone,
      });

      fetch("/api/bookings/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, sessionId }),
      })
        .then(async (res) => {
          const data = await res.json();
          console.log("[confirmation-page] POST /api/bookings/confirm response (stripe)", {
            ok: res.ok,
            status: res.status,
            data,
          });
          if (!res.ok || !data.ok) {
            throw new Error(data.error || "Could not confirm your booking");
          }
          if (data.appointment) setAppointment(data.appointment);
          if (typeof window !== "undefined") {
            sessionStorage.setItem(stripeStorageKey, "done");
            if (data.appointment) {
              sessionStorage.setItem(`${stripeStorageKey}:appointment`, JSON.stringify(data.appointment));
            }
          }
          setStatus("success");

          if (data.emails?.customer?.sent) {
            console.info("[confirmation-page] customer confirmation email sent", data.emails.customer);
          } else if (data.emails?.customer) {
            console.error("[confirmation-page] customer confirmation email not sent", data.emails.customer);
          }
        })
        .catch((err) => {
          if (!previouslyDone) {
            setStatus("error");
            setError(err instanceof Error ? err.message : "Confirmation failed");
          } else {
            console.warn(
              "[confirmation-page] re-confirm failed but booking was already confirmed",
              err instanceof Error ? err.message : err,
            );
          }
        });
      return;
    }

    if (!cachedAppointment) {
      console.log("[confirmation-page] skipped POST /api/bookings/confirm — no cached appointment in sessionStorage", {
        leadId,
        storageKey,
      });
      setStatus("error");
      setError("No booking found. Please complete the booking form first.");
      return;
    }

    if (emailPreviouslyDone) {
      console.log("[confirmation-page] skipped POST /api/bookings/confirm — booking-email-done already set", {
        leadId,
        emailStorageKey,
      });
      setStatus("success");
      return;
    }

    console.log("[confirmation-page] about to POST /api/bookings/confirm (direct booking)", {
      leadId,
      body: { leadId },
    });

    fetch("/api/bookings/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId }),
    })
      .then(async (res) => {
        const data = await res.json();
        console.log("[confirmation-page] POST /api/bookings/confirm response (direct booking)", {
          ok: res.ok,
          status: res.status,
          data,
        });
        if (!res.ok || !data.ok) {
          throw new Error(data.error || "Could not confirm your booking");
        }
        if (data.appointment) setAppointment(data.appointment);
        if (typeof window !== "undefined") {
          sessionStorage.setItem(emailStorageKey, "done");
          if (data.appointment) {
            sessionStorage.setItem(storageKey, JSON.stringify(data.appointment));
          }
        }
        setStatus("success");

        if (data.emails?.customer?.sent) {
          console.info("[confirmation-page] customer confirmation email sent", data.emails.customer);
        } else if (data.emails?.customer) {
          console.error("[confirmation-page] customer confirmation email not sent", data.emails.customer);
        }
      })
      .catch((err) => {
        if (!emailPreviouslyDone) {
          setStatus("error");
          setError(err instanceof Error ? err.message : "Confirmation failed");
        } else {
          console.warn(
            "[confirmation-page] direct re-confirm failed but booking was already confirmed",
            err instanceof Error ? err.message : err,
          );
        }
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
                Your free inspection request has been received. A confirmation email is on its way with
                your appointment details.
              </p>
              <div
                role="note"
                className="mt-4 flex items-start gap-3 rounded-lg border border-amber-300/80 bg-amber-50 px-4 py-3 text-left"
              >
                <svg
                  className="mt-0.5 h-5 w-5 shrink-0 text-amber-700"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M4 6h16v12H4V6Z" />
                  <path d="m4 7 8 6 8-6" />
                </svg>
                <p className="text-sm leading-relaxed text-amber-950">
                  Can&apos;t find your confirmation email? Please check your spam or junk folder and
                  mark it as &apos;not spam&apos; to ensure you receive future updates.
                </p>
              </div>
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
