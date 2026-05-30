import { NextRequest, NextResponse } from "next/server";
import { DEPOSIT_AMOUNT_USD_CENTS, getStripeClient } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { address, name, email, date } = body as {
      address?: string;
      name?: string;
      email?: string;
      date?: string;
    };

    if (!address || !name || !email || !date) {
      return NextResponse.json({ error: "Missing required booking fields" }, { status: 400 });
    }

    const stripe = getStripeClient();
    const origin = req.nextUrl.origin;

    const cancelParams = new URLSearchParams({ address, email });
    const cancelUrl = `${origin}/book-direct?${cancelParams.toString()}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email,
      success_url: `${origin}/book-direct/confirmed?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      metadata: {
        address,
        email,
        customer_name: name,
        inspection_date: date,
        booking_type: "direct",
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: DEPOSIT_AMOUNT_USD_CENTS,
            product_data: {
              name: "Roof inspection deposit",
              description: "$50 fully-refundable deposit to secure your inspection",
            },
          },
        },
      ],
    });

    if (!session.url) {
      return NextResponse.json({ error: "Stripe did not return a checkout URL" }, { status: 500 });
    }

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error("checkout error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create checkout session" },
      { status: 500 },
    );
  }
}
