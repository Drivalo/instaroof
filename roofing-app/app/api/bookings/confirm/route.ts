import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import {
  mapRowToLeadRecord,
  sendCustomerBookingConfirmedEmail,
} from "@/lib/customer-quote-email";
import {
  formatInspectionSchedule,
  normalizeInspectionDatetime,
} from "@/lib/inspection-datetime";
import { sendLeadNotificationEmail } from "@/lib/lead-notification";
import { getSettings, getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { sendBookingSms } from "@/lib/integrations";
import { getStripeClient } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { leadId, sessionId } = body;

    console.info("[bookings/confirm] POST received", {
      leadId,
      hasSessionId: Boolean(sessionId),
    });
    if (!leadId || !sessionId) {
      console.warn("[bookings/confirm] missing leadId or sessionId");
      return NextResponse.json({ error: "Missing leadId or sessionId" }, { status: 400 });
    }

    if (!isSupabaseConfigured()) {
      console.error("[bookings/confirm] Supabase not configured — emails cannot be sent");
      return NextResponse.json(
        { error: "Booking service is not configured" },
        { status: 503 },
      );
    }

    const settings = await getSettings();
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const metadataLeadId = session.metadata?.lead_id
      ? Number(session.metadata.lead_id)
      : NaN;
    const requestLeadId = Number(leadId);
    const numericLeadId = Number.isFinite(metadataLeadId) ? metadataLeadId : requestLeadId;

    if (!Number.isFinite(numericLeadId)) {
      return NextResponse.json({ error: "Invalid leadId" }, { status: 400 });
    }

    if (Number.isFinite(requestLeadId) && requestLeadId !== numericLeadId) {
      console.warn("[bookings/confirm] leadId mismatch — using Stripe metadata", {
        requestLeadId,
        metadataLeadId: numericLeadId,
      });
    }

    console.info("[bookings/confirm] Stripe session", {
      leadId: numericLeadId,
      payment_status: session.payment_status,
      metadata_inspection: session.metadata?.inspection_datetime ?? null,
      metadata_lead_id: session.metadata?.lead_id ?? null,
    });

    if (session.payment_status !== "paid") throw new Error("Payment not completed");

    const metadataInspection = session.metadata?.inspection_datetime?.trim() || null;
    let inspectionIso: string | null = metadataInspection
      ? normalizeInspectionDatetime(metadataInspection)
      : null;

    const supabase = getSupabaseAdmin();

    const { data: existing, error: existingError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", numericLeadId)
      .single();

    if (existingError || !existing) {
      console.error("[bookings/confirm] lead not found", {
        leadId: numericLeadId,
        error: existingError?.message,
      });
      throw existingError || new Error("Lead not found");
    }

    console.info("[bookings/confirm] existing lead", {
      leadId: numericLeadId,
      deposit_paid: existing.deposit_paid,
      inspection_datetime: existing.inspection_datetime ?? null,
    });

    if (existing.inspection_datetime) {
      inspectionIso = existing.inspection_datetime;
    }

    const alreadyConfirmed = Boolean(existing.deposit_paid);

    let lead = existing;

    if (!alreadyConfirmed) {
      const updatePayload: Record<string, unknown> = {
        stripe_payment_id: session.payment_intent,
        deposit_paid: true,
        status: "booked",
      };
      if (inspectionIso && !existing.inspection_datetime) {
        updatePayload.inspection_datetime = inspectionIso;
      }

      const { data, error: leadError } = await supabase
        .from("leads")
        .update(updatePayload)
        .eq("id", numericLeadId)
        .select("*")
        .single();
      if (leadError || !data) throw leadError || new Error("Lead update failed");
      lead = data;
      console.info("[bookings/confirm] lead updated", {
        leadId: numericLeadId,
        inspection_datetime: lead.inspection_datetime ?? null,
      });
    }

    if (!lead.inspection_datetime && inspectionIso) {
      const { data: repaired, error: repairError } = await supabase
        .from("leads")
        .update({ inspection_datetime: inspectionIso })
        .eq("id", numericLeadId)
        .select("*")
        .single();
      if (!repairError && repaired) {
        lead = repaired;
        console.info("[bookings/confirm] inspection_datetime repaired from Stripe metadata", {
          leadId: numericLeadId,
          inspection_datetime: lead.inspection_datetime,
        });
      }
    }

    const inspectionIsoFinal = lead.inspection_datetime || inspectionIso;
    const appointment = inspectionIsoFinal
      ? {
          ...formatInspectionSchedule(inspectionIsoFinal),
          address: lead.address,
        }
      : null;

    if (!inspectionIsoFinal) {
      console.error("[bookings/confirm] cannot send emails — inspection_datetime missing", {
        leadId: numericLeadId,
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

    const { data: preEmailLead, error: preEmailError } = await supabase
      .from("leads")
      .select("id, email, inspection_datetime, deposit_paid")
      .eq("id", numericLeadId)
      .single();

    console.info("[bookings/confirm] PRE-CUSTOMER-EMAIL — DB snapshot", {
      leadId: numericLeadId,
      fetchError: preEmailError?.message ?? null,
      email: preEmailLead?.email ?? null,
      inspection_datetime_db: preEmailLead?.inspection_datetime ?? null,
      inspection_datetime_confirm_route: inspectionIsoFinal,
      inspection_datetime_lead_object: lead.inspection_datetime ?? null,
      hasResendApiKey: Boolean(process.env.RESEND_API_KEY?.trim()),
      resendFrom: process.env.RESEND_FROM_EMAIL?.trim() || "(default)",
    });

    console.info("[bookings/confirm] CALLING sendCustomerBookingConfirmedEmail NOW", {
      functionCalled: true,
      leadId: numericLeadId,
      appBaseUrl,
      inspectionDatetimePassed: inspectionIsoFinal,
      customerEmail: lead.email ?? null,
    });

    const customerEmailResult = await sendCustomerBookingConfirmedEmail(
      numericLeadId,
      appBaseUrl,
      {
        inspectionDatetime: inspectionIsoFinal,
        preloadedLead: mapRowToLeadRecord(lead as Record<string, unknown>),
      },
    );

    console.info("[bookings/confirm] AFTER sendCustomerBookingConfirmedEmail", {
      leadId: numericLeadId,
      sent: customerEmailResult.sent,
      skipped: customerEmailResult.skipped ?? false,
      reason: customerEmailResult.reason ?? null,
      messageId: customerEmailResult.messageId ?? null,
      fullResult: customerEmailResult,
    });

    console.info("[bookings/confirm] sending BO booking notification email", {
      leadId: numericLeadId,
      context: "booking_confirmed",
    });
    const boEmailResult = await sendLeadNotificationEmail(
      numericLeadId,
      appBaseUrl,
      "booking_confirmed",
    );
    console.info("[bookings/confirm] BO email result", boEmailResult);

    if (!alreadyConfirmed) {
      const dateText = format(new Date(inspectionIsoFinal), "PPP 'at' p");
      console.info("[bookings/confirm] sending booking SMS", { leadId: numericLeadId });
      await sendBookingSms(
        lead.phone,
        `Hi ${lead.name}, this is ${settings.company_name}. Your roof inspection is confirmed for ${dateText}. Reply C to confirm or R to reschedule.`,
      );
    }

    return NextResponse.json({
      ok: true,
      appointment,
      emails: {
        customer: customerEmailResult,
        business: boEmailResult,
      },
    });
  } catch (error) {
    console.error("[bookings/confirm] failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Confirmation failed" },
      { status: 500 },
    );
  }
}
