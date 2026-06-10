import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import {
  mapRowToLeadRecord,
  sendCustomerBookingConfirmedEmail,
} from "@/lib/customer-quote-email";
import { ensureEnvLoaded } from "@/lib/env.server";
import {
  formatInspectionSchedule,
  normalizeInspectionDatetime,
} from "@/lib/inspection-datetime";
import { sendLeadNotificationEmail } from "@/lib/lead-notification";
import { getSettings, getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { sendBookingSms } from "@/lib/integrations";
import { getStripeClient } from "@/lib/stripe";

async function sendBookingConfirmationEmails(
  req: NextRequest,
  confirmLeadId: number,
  lead: Record<string, unknown>,
  inspectionIsoFinal: string,
) {
  const appointment = {
    ...formatInspectionSchedule(inspectionIsoFinal),
    time: String(lead.best_time_to_contact ?? "").trim() || formatInspectionSchedule(inspectionIsoFinal).time,
    combined: `${formatInspectionSchedule(inspectionIsoFinal).date} (${String(lead.best_time_to_contact ?? "").trim() || formatInspectionSchedule(inspectionIsoFinal).time})`,
    address: String(lead.address ?? ""),
  };

  const appBaseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    req.headers.get("origin")?.trim() ||
    "http://localhost:3000";

  console.info("[bookings/confirm] ATTEMPTING sendCustomerBookingConfirmedEmail", {
    leadId: confirmLeadId,
    appBaseUrl,
    inspectionDatetimePassed: inspectionIsoFinal,
    customerEmail: lead.email ?? null,
    hasResendApiKey: Boolean(process.env.RESEND_API_KEY?.trim()),
  });

  const customerEmailResult = await sendCustomerBookingConfirmedEmail(
    confirmLeadId,
    appBaseUrl,
    {
      inspectionDatetime: inspectionIsoFinal,
      preloadedLead: mapRowToLeadRecord({
        ...lead,
        deposit_paid: false,
        inspection_datetime: inspectionIsoFinal,
      }),
    },
  );

  console.info("[bookings/confirm] customer email result", {
    leadId: confirmLeadId,
    sent: customerEmailResult.sent,
    skipped: customerEmailResult.skipped ?? false,
    reason: customerEmailResult.reason ?? null,
    messageId: customerEmailResult.messageId ?? null,
  });

  console.info("[bookings/confirm] sending BO booking notification email", {
    leadId: confirmLeadId,
    context: "booking_confirmed",
  });
  const boEmailResult = await sendLeadNotificationEmail(
    confirmLeadId,
    appBaseUrl,
    "booking_confirmed",
  );
  console.info("[bookings/confirm] BO email result", boEmailResult);

  const settings = await getSettings();
  const dateText = format(new Date(inspectionIsoFinal), "PPP");
  const timeLabel = String(lead.best_time_to_contact ?? "").trim();
  const smsWhen = timeLabel ? `${dateText} (${timeLabel})` : format(new Date(inspectionIsoFinal), "PPP 'at' p");
  console.info("[bookings/confirm] sending booking SMS", { leadId: confirmLeadId });
  try {
    await sendBookingSms(
      String(lead.phone ?? ""),
      `Hi ${lead.name}, this is ${settings.company_name}. Your roof inspection is requested for ${smsWhen}. Reply C to confirm or R to reschedule.`,
    );
  } catch (smsErr) {
    console.warn("[bookings/confirm] booking SMS failed", {
      leadId: confirmLeadId,
      error: smsErr instanceof Error ? smsErr.message : String(smsErr),
    });
  }

  return {
    appointment,
    emails: {
      customer: customerEmailResult,
      business: boEmailResult,
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    ensureEnvLoaded();

    const body = await req.json();
    const { leadId, sessionId } = body;

    console.info("[bookings/confirm] POST received", {
      leadId,
      hasSessionId: Boolean(sessionId),
    });
    if (!leadId) {
      console.warn("[bookings/confirm] missing leadId");
      return NextResponse.json({ error: "Missing leadId" }, { status: 400 });
    }

    if (!isSupabaseConfigured()) {
      console.error("[bookings/confirm] Supabase not configured — emails cannot be sent");
      return NextResponse.json(
        { error: "Booking service is not configured" },
        { status: 503 },
      );
    }

    let confirmLeadId = Number(leadId);
    if (!Number.isFinite(confirmLeadId)) {
      return NextResponse.json({ error: "Invalid leadId" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    if (!sessionId) {
      const { data: lead, error: leadError } = await supabase
        .from("leads")
        .select("*")
        .eq("id", confirmLeadId)
        .single();

      if (leadError || !lead) {
        console.error("[bookings/confirm] direct confirm — lead not found", {
          leadId: confirmLeadId,
          error: leadError?.message,
        });
        throw leadError || new Error("Lead not found");
      }

      const inspectionIsoFinal = lead.inspection_datetime?.trim() || null;
      if (!inspectionIsoFinal) {
        console.error("[bookings/confirm] direct confirm — inspection_datetime missing", {
          leadId: confirmLeadId,
        });
        return NextResponse.json(
          { error: "Appointment time was not saved. Please contact support." },
          { status: 500 },
        );
      }

      if (!lead.email?.trim()) {
        console.error("[bookings/confirm] direct confirm — lead has no email", {
          leadId: confirmLeadId,
        });
        return NextResponse.json({ error: "Lead has no email address on file." }, { status: 400 });
      }

      console.info("[bookings/confirm] direct confirm — sending booking emails", {
        leadId: confirmLeadId,
        inspection_datetime: inspectionIsoFinal,
        customerEmail: lead.email,
      });

      const result = await sendBookingConfirmationEmails(
        req,
        confirmLeadId,
        lead as Record<string, unknown>,
        inspectionIsoFinal,
      );

      return NextResponse.json({
        ok: true,
        ...result,
      });
    }

    const settings = await getSettings();
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const metadataLeadId = session.metadata?.lead_id
      ? Number(session.metadata.lead_id)
      : NaN;
    const requestLeadId = Number(leadId);

    if (Number.isFinite(metadataLeadId)) {
      if (Number.isFinite(requestLeadId) && requestLeadId !== metadataLeadId) {
        console.warn("[bookings/confirm] leadId mismatch — using Stripe metadata", {
          requestLeadId,
          metadataLeadId,
        });
      }
      confirmLeadId = metadataLeadId;
    }

    console.info("[bookings/confirm] Stripe session", {
      leadId: confirmLeadId,
      payment_status: session.payment_status,
      metadata_inspection: session.metadata?.inspection_datetime ?? null,
      metadata_lead_id: session.metadata?.lead_id ?? null,
    });

    if (session.payment_status !== "paid") throw new Error("Payment not completed");

    const metadataInspection = session.metadata?.inspection_datetime?.trim() || null;
    let inspectionIso: string | null = metadataInspection
      ? normalizeInspectionDatetime(metadataInspection)
      : null;

    const { data: existing, error: existingError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", confirmLeadId)
      .single();

    if (existingError || !existing) {
      console.error("[bookings/confirm] lead not found", {
        leadId: confirmLeadId,
        error: existingError?.message,
      });
      throw existingError || new Error("Lead not found");
    }

    console.info("[bookings/confirm] existing lead", {
      leadId: confirmLeadId,
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
        .eq("id", confirmLeadId)
        .select("*")
        .single();
      if (leadError || !data) throw leadError || new Error("Lead update failed");
      lead = data;
      console.info("[bookings/confirm] lead updated", {
        leadId: confirmLeadId,
        inspection_datetime: lead.inspection_datetime ?? null,
      });
    }

    if (!lead.inspection_datetime && inspectionIso) {
      const { data: repaired, error: repairError } = await supabase
        .from("leads")
        .update({ inspection_datetime: inspectionIso })
        .eq("id", confirmLeadId)
        .select("*")
        .single();
      if (!repairError && repaired) {
        lead = repaired;
        console.info("[bookings/confirm] inspection_datetime repaired from Stripe metadata", {
          leadId: confirmLeadId,
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
        leadId: confirmLeadId,
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
      .eq("id", confirmLeadId)
      .single();

    console.info("[bookings/confirm] PRE-CUSTOMER-EMAIL — DB snapshot", {
      leadId: confirmLeadId,
      fetchError: preEmailError?.message ?? null,
      email: preEmailLead?.email ?? null,
      inspection_datetime_db: preEmailLead?.inspection_datetime ?? null,
      inspection_datetime_confirm_route: inspectionIsoFinal,
      inspection_datetime_lead_object: lead.inspection_datetime ?? null,
      hasResendApiKey: Boolean(process.env.RESEND_API_KEY?.trim()),
      resendFrom: process.env.RESEND_FROM_EMAIL?.trim() || "(default)",
    });

    if (!lead.email?.trim()) {
      console.error("[bookings/confirm] customer email skipped — lead has no email", {
        leadId: confirmLeadId,
      });
    }

    const emailAlreadySent = session.metadata?.customer_email_sent === "true";
    let customerEmailResult;

    if (emailAlreadySent) {
      console.info("[bookings/confirm] customer email already sent (Stripe metadata)", {
        leadId: confirmLeadId,
        messageId: session.metadata?.customer_email_message_id ?? null,
      });
      customerEmailResult = {
        sent: true,
        skipped: true,
        reason: "Already sent for this checkout session",
        messageId: session.metadata?.customer_email_message_id ?? undefined,
      };
    } else {
      console.info("[bookings/confirm] ATTEMPTING sendCustomerBookingConfirmedEmail", {
        leadId: confirmLeadId,
        appBaseUrl,
        inspectionDatetimePassed: inspectionIsoFinal,
        customerEmail: lead.email ?? null,
        hasResendApiKey: Boolean(process.env.RESEND_API_KEY?.trim()),
      });

      customerEmailResult = await sendCustomerBookingConfirmedEmail(
        confirmLeadId,
        appBaseUrl,
        {
          inspectionDatetime: inspectionIsoFinal,
          preloadedLead: mapRowToLeadRecord({
            ...(lead as Record<string, unknown>),
            deposit_paid: true,
            inspection_datetime: inspectionIsoFinal,
          }),
        },
      );

      if (customerEmailResult.sent && customerEmailResult.messageId) {
        try {
          await stripe.checkout.sessions.update(sessionId, {
            metadata: {
              ...(session.metadata ?? {}),
              customer_email_sent: "true",
              customer_email_message_id: customerEmailResult.messageId,
            },
          });
          console.info("[bookings/confirm] marked customer email sent in Stripe metadata", {
            leadId: confirmLeadId,
            messageId: customerEmailResult.messageId,
          });
        } catch (metaErr) {
          console.warn("[bookings/confirm] could not update Stripe metadata after email send", {
            leadId: confirmLeadId,
            error: metaErr instanceof Error ? metaErr.message : String(metaErr),
          });
        }
      }
    }

    console.info("[bookings/confirm] customer email result", {
      leadId: confirmLeadId,
      sent: customerEmailResult.sent,
      skipped: customerEmailResult.skipped ?? false,
      reason: customerEmailResult.reason ?? null,
      messageId: customerEmailResult.messageId ?? null,
    });

    console.info("[bookings/confirm] sending BO booking notification email", {
      leadId: confirmLeadId,
      context: "booking_confirmed",
    });
    const boEmailResult = await sendLeadNotificationEmail(
      confirmLeadId,
      appBaseUrl,
      "booking_confirmed",
    );
    console.info("[bookings/confirm] BO email result", boEmailResult);

    if (!alreadyConfirmed) {
      const dateText = format(new Date(inspectionIsoFinal), "PPP 'at' p");
      console.info("[bookings/confirm] sending booking SMS", { leadId: confirmLeadId });
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
