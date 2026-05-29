import Link from "next/link";

export default function ConfirmationPage() {
  return (
    <main className="customer-page min-h-[70vh] bg-zinc-50 py-14">
      <section className="container-max">
        <div className="mx-auto max-w-2xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h1 className="text-3xl text-zinc-900">Booking Confirmed!</h1>
          <p className="mt-3 text-zinc-700">
            We&apos;ll be in touch shortly to confirm your inspection date.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-xl bg-[#C8102E] px-6 py-3 text-white"
          >
            Back to Home
          </Link>
        </div>
      </section>
    </main>
  );
}