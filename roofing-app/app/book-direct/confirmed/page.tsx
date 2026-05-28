"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type VerifiedBooking = {
  paid: boolean;
  customerEmail?: string;
  customerName?: string;
  address?: string;
  inspectionDate?: string;
};

function DirectBookingConfirmedContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    sessionId ? "loading" : "error",
  );
  const [booking, setBooking] = useState<VerifiedBooking | null>(null);
  const [error, setError] = useState(
    sessionId ? "" : "Missing payment session. Please try booking again.",
  );

  useEffect(() => {
    if (!sessionId) return;

    fetch(`/api/checkout/verify?session_id=${encodeURIComponent(sessionId)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.paid) {
          throw new Error(data.error || "Payment could not be verified");
        }
        setBooking(data);
        setStatus("success");
      })
      .catch((err) => {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Verification failed");
      });
  }, [sessionId]);

  return (
    <main className="min-h-[70vh] bg-zinc-50 py-14">
      <section className="container-max">
        <div className="mx-auto max-w-2xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm text-center">
          {status === "loading" && (
            <>
              <h1 className="text-3xl font-bold text-zinc-900">Confirming payment...</h1>
              <p className="mt-3 text-zinc-600">Please wait while we verify your $50 deposit.</p>
            </>
          )}

          {status === "success" && (
            <>
              <div className="text-5xl mb-4">✓</div>
              <h1 className="text-3xl font-bold text-zinc-900">Payment confirmed!</h1>
              <p className="mt-3 text-zinc-700">
                Your $50 inspection deposit has been received. We&apos;ll email confirmation to{" "}
                <strong>{booking?.customerEmail}</strong>.
              </p>
              {booking?.address && (
                <p className="mt-2 text-sm text-zinc-600">
                  Property: {booking.address}
                  {booking.inspectionDate ? ` · Inspection date: ${booking.inspectionDate}` : ""}
                </p>
              )}
            </>
          )}

          {status === "error" && (
            <>
              <h1 className="text-3xl font-bold text-zinc-900">Payment not confirmed</h1>
              <p className="mt-3 text-red-600">{error}</p>
            </>
          )}

          <Link
            href="/"
            className="mt-8 inline-block rounded-xl bg-[#C8102E] px-6 py-3 font-semibold text-white"
          >
            Back to Home
          </Link>
        </div>
      </section>
    </main>
  );
}

export default function DirectBookingConfirmedPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-[70vh] bg-zinc-50 py-14">
          <section className="container-max">
            <div className="mx-auto max-w-2xl rounded-2xl border bg-white p-8 text-center">
              <h1 className="text-3xl font-bold">Confirming payment...</h1>
            </div>
          </section>
        </main>
      }
    >
      <DirectBookingConfirmedContent />
    </Suspense>
  );
}
