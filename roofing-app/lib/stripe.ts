import Stripe from "stripe";

const DEPOSIT_AMOUNT_USD_CENTS = 5000; // $50.00

/** Strip corrupted padding (e.g. accidental paste of thousands of zeros). */
function sanitizeStripeKey(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.includes("your_key_here") || trimmed.startsWith("paste_")) {
    return undefined;
  }
  const withoutZeroPadding = trimmed.replace(/0{20,}.*$/g, "");
  return withoutZeroPadding || undefined;
}

export function getStripeSecretKey(): string | undefined {
  const key = sanitizeStripeKey(process.env.STRIPE_SECRET_KEY);
  if (!key) return undefined;
  if (key.startsWith("mk_")) {
    return undefined;
  }
  if (!key.startsWith("sk_test_") && !key.startsWith("sk_live_")) {
    return undefined;
  }
  return key;
}

export function getStripeKeySetupHint(): string | null {
  const raw = process.env.STRIPE_SECRET_KEY?.trim();
  if (raw?.startsWith("mk_")) {
    return (
      "The value starting with mk_ is not a Stripe secret key. In Stripe Dashboard → Developers → API keys, " +
      "copy the Secret key (starts with sk_test_ in test mode), not a merchant or account ID."
    );
  }
  if (!getStripeSecretKey()) {
    return (
      "Set STRIPE_SECRET_KEY=sk_test_... in roofing-app/.env.local (from Stripe Dashboard → Developers → API keys), then restart npm run dev."
    );
  }
  return null;
}

export function getStripePublishableKey(): string | undefined {
  const key = sanitizeStripeKey(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  if (!key?.startsWith("pk_test_") && !key?.startsWith("pk_live_")) {
    return undefined;
  }
  return key;
}

export function getStripeClient(): Stripe {
  const hint = getStripeKeySetupHint();
  const secretKey = getStripeSecretKey();
  if (!secretKey) {
    throw new Error(hint || "STRIPE_SECRET_KEY is invalid or missing.");
  }
  return new Stripe(secretKey);
}

export { DEPOSIT_AMOUNT_USD_CENTS };
