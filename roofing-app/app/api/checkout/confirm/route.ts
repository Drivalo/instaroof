import { NextRequest, NextResponse } from "next/server";
import { sendDirectBookingConfirmationEmail } from "@/lib/customer-quote-email";
import { ensureEnvLoaded } from "@/lib/env.server";
import { normalizeInspectionDatetime } from "@/lib/inspection-datetime";
import { getStripeClient } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  try {
    ensureEnvLoaded();

    const body = await req.json();
    const sessionId = body?.sessionId?.trim?.() || body?.session_id?.trim?.();

    console.info("[checkout/confirm] POST received", { hasSessionId: Boolean(sessionId) });

    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    console.info("[checkout/confirm] Stripe session", {
      payment_status: session.payment_status,
      booking_type: session.metadata?.booking_type ?? null,
      customer_email: session.customer_email ?? session.metadata?.email ?? null,
    });

    if (session.payment_status !== "paid") {
      return NextResponse.json({ error: "Payment not completed", paid: false }, { status: 402 });
    }

    const customerEmail = session.customer_email || session.metadata?.email || "";
    const customerName = session.metadata?.customer_name || "";
    const address = session.metadata?.address || "";
    const inspectionDateRaw = session.metadata?.inspection_date || "";

    if (!customerEmail.trim()) {
      console.error("[checkout/confirm] no customer email on session");
      return NextResponse.json({ error: "Customer email missing from checkout session" }, { status: 400 });
    }

    if (!inspectionDateRaw.trim()) {
      console.error("[checkout/confirm] no inspection date on session");
      return NextResponse.json({ error: "Inspection date missing from checkout session" }, { status: 400 });
    }

    const inspectionDateIso = normalizeInspectionDatetime(inspectionDateRaw);

    const appBaseUrl =
      process.env.NEXT_PUBLIC_APP_URL?.trim() ||
      req.headers.get("origin")?.trim() ||
      "http://localhost:3000";

    const emailAlreadySent = session.metadata?.customer_email_sent === "true";
    let customerEmailResult;

    if (emailAlreadySent) {
      console.info("[checkout/confirm] customer email already sent (Stripe metadata)", {
        messageId: session.metadata?.customer_email_message_id ?? null,
      });
      customerEmailResult = {
        sent: true,
        skipped: true,
        reason: "Already sent for this checkout session",
        messageId: session.metadata?.customer_email_message_id ?? undefined,
      };
    } else {
      console.info("[checkout/confirm] ATTEMPTING sendDirectBookingConfirmationEmail", {
        customerEmail,
        inspectionDateIso,
        hasResendApiKey: Boolean(process.env.RESEND_API_KEY?.trim()),
      });

      customerEmailResult = await sendDirectBookingConfirmationEmail({
        customerName,
        customerEmail,
        address,
        inspectionDateIso,
        appBaseUrl,
      });

      if (customerEmailResult.sent && customerEmailResult.messageId) {
        try {
          await stripe.checkout.sessions.update(sessionId, {
            metadata: {
              ...(session.metadata ?? {}),
              customer_email_sent: "true",
              customer_email_message_id: customerEmailResult.messageId,
            },
          });
          console.info("[checkout/confirm] marked customer email sent in Stripe metadata", {
            messageId: customerEmailResult.messageId,
          });
        } catch (metaErr) {
          console.warn("[checkout/confirm] could not update Stripe metadata after email send", {
            error: metaErr instanceof Error ? metaErr.message : String(metaErr),
          });
        }
      }
    }

    console.info("[checkout/confirm] customer email result", {
      sent: customerEmailResult.sent,
      skipped: customerEmailResult.skipped ?? false,
      reason: customerEmailResult.reason ?? null,
      messageId: customerEmailResult.messageId ?? null,
    });

    return NextResponse.json({
      ok: true,
      paid: true,
      customerEmail,
      customerName,
      address,
      inspectionDate: inspectionDateRaw,
      email: customerEmailResult,
    });
  } catch (error) {
    console.error("[checkout/confirm] failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Confirmation failed" },
      { status: 500 },
    );
  }
}
