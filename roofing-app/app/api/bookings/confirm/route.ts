import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import { sendCustomerBookingConfirmedEmail } from "@/lib/customer-quote-email";
import {
  formatInspectionSchedule,
  normalizeInspectionDatetime,
} from "@/lib/inspection-datetime";
import { getSettings, getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { sendBookingSms } from "@/lib/integrations";
import { getStripeClient } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { leadId, sessionId } = body;

    if (!leadId || !sessionId) {
      return NextResponse.json({ error: "Missing leadId or sessionId" }, { status: 400 });
    }

    const settings = await getSettings();
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") throw new Error("Payment not completed");

    const metadataInspection = session.metadata?.inspection_datetime?.trim() || null;
    let inspectionIso: string | null = metadataInspection
      ? normalizeInspectionDatetime(metadataInspection)
      : null;

    if (isSupabaseConfigured()) {
      const supabase = getSupabaseAdmin();

      const { data: existing } = await supabase
        .from("leads")
        .select("*")
        .eq("id", leadId)
        .single();

      if (existing?.inspection_datetime) {
        inspectionIso = existing.inspection_datetime;
      }

      const alreadyConfirmed = Boolean(existing?.deposit_paid);

      const updatePayload: Record<string, unknown> = {
        stripe_payment_id: session.payment_intent,
        deposit_paid: true,
        status: "booked",
      };
      if (inspectionIso && !existing?.inspection_datetime) {
        updatePayload.inspection_datetime = inspectionIso;
      }

      const { data, error: leadError } = await supabase
        .from("leads")
        .update(updatePayload)
        .eq("id", leadId)
        .select("*")
        .single();
      if (leadError || !data) throw leadError || new Error("Lead update failed");

      let lead = data;

      if (!lead.inspection_datetime && inspectionIso) {
        const { data: repaired, error: repairError } = await supabase
          .from("leads")
          .update({ inspection_datetime: inspectionIso })
          .eq("id", leadId)
          .select("*")
          .single();
        if (!repairError && repaired) lead = repaired;
      }

      const inspectionIsoFinal = lead.inspection_datetime || inspectionIso;
      const appointment = inspectionIsoFinal
        ? {
            ...formatInspectionSchedule(inspectionIsoFinal),
            address: lead.address,
          }
        : null;

      if (alreadyConfirmed) {
        return NextResponse.json({ ok: true, appointment });
      }

      if (!inspectionIsoFinal) {
        console.error("[bookings/confirm] cannot send email — inspection_datetime missing after DB read", {
          leadId,
          dbValue: lead.inspection_datetime,
          stripeMetadata: metadataInspection,
        });
        return NextResponse.json(
          { error: "Appointment time was not saved. Please contact support." },
          { status: 500 },
        );
      }

      const appBaseUrl =
        process.env.NEXT_PUBLIC_APP_URL?.trim() ||
        req.headers.get("origin")?.trim() ||
        "http://localhost:3000";
      const emailResult = await sendCustomerBookingConfirmedEmail(Number(leadId), appBaseUrl);
      if (!emailResult.sent) {
        console.error("[bookings/confirm] booking confirmation email failed", emailResult);
      }

      const dateText = inspectionIsoFinal
        ? format(new Date(inspectionIsoFinal), "PPP 'at' p")
        : "your selected time";
      await sendBookingSms(
        lead.phone,
        `Hi ${lead.name}, this is ${settings.company_name}. Your roof inspection is confirmed for ${dateText}. Reply C to confirm or R to reschedule.`,
      );

      return NextResponse.json({ ok: true, appointment });
    }

    return NextResponse.json({ ok: true, paid: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Confirmation failed" },
      { status: 500 },
    );
  }
}
