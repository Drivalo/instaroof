"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function BookDirectContent() {
  const searchParams = useSearchParams();
  const addressFromQuery = searchParams.get("address") || "";
  const emailFromQuery = searchParams.get("email") || "";

  const [name, setName] = useState("");
  const [email, setEmail] = useState(emailFromQuery);
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleBooking() {
    if (!name || !email || !date) {
      setError("Please fill in all fields.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: addressFromQuery,
          name,
          email,
          date,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError("Stripe checkout URL was not returned. Check STRIPE_SECRET_KEY in .env.local.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-[70vh] bg-zinc-50 py-14">
      <section className="container-max">
        <div className="mx-auto max-w-2xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-bold text-zinc-900">Book Your Inspection</h1>
          <p className="mt-2 text-zinc-600">$50 fully-refundable deposit to secure your slot.</p>

          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700">Property Address</label>
              <p className="mt-1 rounded-lg bg-zinc-100 p-3 text-zinc-800">{addressFromQuery}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700">Your Name</label>
              <input
                className="mt-1 w-full rounded-lg border border-zinc-300 p-3"
                placeholder="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700">Email</label>
              <input
                className="mt-1 w-full rounded-lg border border-zinc-300 p-3"
                placeholder="your@email.com"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700">Preferred Inspection Date</label>
              <input
                className="mt-1 w-full rounded-lg border border-zinc-300 p-3"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <button
              onClick={handleBooking}
              disabled={loading}
              className="w-full rounded-xl bg-[#C8102E] px-6 py-4 font-semibold text-white disabled:opacity-50"
            >
              {loading ? "Redirecting to Stripe..." : "Book Inspection & Pay $50 Deposit"}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function BookDirectPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-[70vh] bg-zinc-50 py-14">
          <section className="container-max">
            <div className="mx-auto max-w-2xl rounded-2xl border bg-white p-8">
              <h1 className="text-3xl font-bold">Book Your Inspection</h1>
              <p className="mt-2 text-zinc-600">Loading...</p>
            </div>
          </section>
        </main>
      }
    >
      <BookDirectContent />
    </Suspense>
  );
}
