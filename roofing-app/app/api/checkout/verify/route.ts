import { NextRequest, NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe";

export async function GET(req: NextRequest) {
  try {
    const sessionId = req.nextUrl.searchParams.get("session_id");
    if (!sessionId) {
      return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
    }

    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return NextResponse.json({ error: "Payment not completed", paid: false }, { status: 402 });
    }

    return NextResponse.json({
      paid: true,
      customerEmail: session.customer_email || session.metadata?.email || "",
      customerName: session.metadata?.customer_name || "",
      address: session.metadata?.address || "",
      inspectionDate: session.metadata?.inspection_date || "",
      amountTotal: session.amount_total,
      currency: session.currency,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to verify payment" },
      { status: 500 },
    );
  }
}
