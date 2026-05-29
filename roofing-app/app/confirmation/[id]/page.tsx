import Link from "next/link";

export default function ConfirmationPage() {
  return (
    <main className="customer-page min-h-screen bg-background text-foreground">
      <section className="container-max py-12 md:py-16">
        <div className="mx-auto max-w-2xl rounded-lg border border-border-subtle bg-surface p-8 md:p-10 text-center">
          <p className="text-4xl mb-4" aria-hidden>
            ✓
          </p>
          <h1 className="text-2xl md:text-3xl text-foreground">Booking confirmed</h1>
          <p className="mt-4 text-muted leading-relaxed">
            We&apos;ll be in touch shortly to confirm your inspection date. Your refundable deposit
            has been received.
          </p>
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
