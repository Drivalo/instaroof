import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import {
  mapRowToLeadRecord,
  sendCustomerBookingConfirmedEmail,
} from "@/lib/customer-quote-email";
import { ensureEnvLoaded } from "@/lib/env.server";
import {
  buildPreferredInspectionIso,
  formatInspectionSchedule,
  inspectionHourLabel,
  isInspectionHourSlot,
} from "@/lib/inspection-datetime";
import { sendLeadNotificationEmail } from "@/lib/lead-notification";
import { sendBookingSms } from "@/lib/integrations";
import { getSettings, getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    ensureEnvLoaded();

    const body = await req.json();
    const leadId = Number(body?.leadId);
    const preferredDate = String(body?.preferredDate ?? "").trim();
    const preferredTime = String(body?.preferredTime ?? "").trim();
    const notes = String(body?.notes ?? "").trim();

    console.info("[bookings/create] POST received", {
      leadId,
      preferredDate,
      preferredTime,
      hasNotes: notes.length > 0,
    });

    if (!Number.isFinite(leadId)) {
      return NextResponse.json({ error: "Invalid leadId" }, { status: 400 });
    }

    if (!preferredDate) {
      return NextResponse.json({ error: "Please select a preferred date" }, { status: 400 });
    }

    if (!isInspectionHourSlot(preferredTime)) {
      return NextResponse.json({ error: "Please select a preferred time" }, { status: 400 });
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: "Booking service is not configured" }, { status: 503 });
    }

    const inspectionIso = buildPreferredInspectionIso(preferredDate, preferredTime);
    const timeLabel = inspectionHourLabel(preferredTime);
    const supabase = getSupabaseAdmin();

    const { data: existing, error: existingError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single();

    if (existingError || !existing) {
      throw existingError || new Error("Lead not found");
    }

    if (!existing.name?.trim() || !existing.email?.trim() || !existing.phone?.trim()) {
      return NextResponse.json(
        { error: "Please complete your contact details on the quote page first." },
        { status: 400 },
      );
    }

    const { data: lead, error: updateError } = await supabase
      .from("leads")
      .update({
        best_time_to_contact: timeLabel,
        inspection_datetime: inspectionIso,
        notes: notes || null,
        status: "booked",
      })
      .eq("id", leadId)
      .select("*")
      .single();

    if (updateError || !lead) {
      throw updateError || new Error("Failed to save booking");
    }

    console.info("[bookings/create] booking saved", {
      leadId,
      inspection_datetime: lead.inspection_datetime,
      best_time_to_contact: lead.best_time_to_contact,
    });

    const appointment = {
      ...formatInspectionSchedule(inspectionIso),
      time: timeLabel,
      combined: `${formatInspectionSchedule(inspectionIso).date} (${timeLabel})`,
      address: lead.address,
    };

    const appBaseUrl =
      process.env.NEXT_PUBLIC_APP_URL?.trim() ||
      req.headers.get("origin")?.trim() ||
      "http://localhost:3000";

    const customerEmailResult = await sendCustomerBookingConfirmedEmail(leadId, appBaseUrl, {
      inspectionDatetime: inspectionIso,
      preloadedLead: mapRowToLeadRecord({
        ...(lead as Record<string, unknown>),
        deposit_paid: false,
        inspection_datetime: inspectionIso,
        best_time_to_contact: timeLabel,
      }),
    });

    console.info("[bookings/create] customer email result", customerEmailResult);

    const boEmailResult = await sendLeadNotificationEmail(
      leadId,
      appBaseUrl,
      "booking_confirmed",
    );
    console.info("[bookings/create] BO email result", boEmailResult);

    const settings = await getSettings();
    const dateText = format(new Date(inspectionIso), "PPP");
    await sendBookingSms(
      lead.phone,
      `Hi ${lead.name}, this is ${settings.company_name}. Your roof inspection is requested for ${dateText} (${timeLabel}). Reply C to confirm or R to reschedule.`,
    );

    return NextResponse.json({
      ok: true,
      appointment,
      emails: {
        customer: customerEmailResult,
        business: boEmailResult,
      },
    });
  } catch (error) {
    console.error("[bookings/create] failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Booking failed" },
      { status: 500 },
    );
  }
}
