import { NextRequest, NextResponse } from "next/server";
import { ensureEnvLoaded } from "@/lib/env.server";
import { mapRowToLeadRecord, sendCustomerQuoteReadyEmail } from "@/lib/customer-quote-email";
import { sendLeadNotificationEmail } from "@/lib/lead-notification";
import { isValidJobType } from "@/lib/job-type";
import { satelliteImageSrcForLead } from "@/lib/maps-static";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureEnvLoaded();

  try {
    const { id: idParam } = await params;
    const leadId = Number(idParam);
    if (!Number.isFinite(leadId) || leadId <= 0) {
      return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        {
          error:
            "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in roofing-app/.env.local.",
        },
        { status: 500 },
      );
    }

    const body = await req.json();
    const { name, email, phone, job_type, guttering } = body;

    const updates: Record<string, string | boolean> = {};
    if (typeof name === "string" && name.trim()) updates.name = name.trim();
    if (typeof email === "string" && email.trim()) updates.email = email.trim();
    if (typeof phone === "string" && phone.trim()) updates.phone = phone.trim();
    if (isValidJobType(job_type)) updates.job_type = job_type;
    if (typeof guttering === "boolean") updates.guttering = guttering;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const savingContact = Boolean(updates.name && updates.email && updates.phone);
    if (savingContact && !updates.job_type) {
      return NextResponse.json({ error: "Please select what best describes your situation" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("leads")
      .update(updates)
      .eq("id", leadId)
      .select("*")
      .maybeSingle();

    if (error) {
      console.error("[leads/PATCH] Supabase update failed", {
        leadId,
        updateKeys: Object.keys(updates),
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        raw: error,
      });
      throw error;
    }
    if (!data) {
      console.error("[leads/PATCH] no lead updated", { leadId, updates: Object.keys(updates) });
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const leadRecord = mapRowToLeadRecord(data as Record<string, unknown>);
    const savedEmail = leadRecord.email?.trim() ?? "";

    let boEmailResult: Awaited<ReturnType<typeof sendLeadNotificationEmail>> = {
      sent: false,
      skipped: true,
      reason: "Contact details not saved in this request",
    };
    if (savingContact) {
      boEmailResult = await sendLeadNotificationEmail(
        leadId,
        req.nextUrl.origin,
        "contact_updated",
      );
      console.info("[leads/PATCH] company notification result", {
        leadId,
        sent: boEmailResult.sent,
        skipped: boEmailResult.skipped ?? false,
        reason: boEmailResult.reason ?? null,
      });
    }

    let customerEmailResult: Awaited<ReturnType<typeof sendCustomerQuoteReadyEmail>> | null = null;
    if (savedEmail) {
      customerEmailResult = await sendCustomerQuoteReadyEmail(
        leadId,
        req.nextUrl.origin,
        leadRecord,
      );
      console.info("[leads/PATCH] customer quote email result", {
        leadId,
        to: savedEmail,
        sent: customerEmailResult.sent,
        skipped: customerEmailResult.skipped ?? false,
        reason: customerEmailResult.reason ?? null,
        messageId: customerEmailResult.messageId ?? null,
      });
    } else {
      console.warn("[leads/PATCH] customer quote email skipped — lead has no email after update", {
        leadId,
      });
    }

    return NextResponse.json({
      lead: data,
      emails: {
        companyNotification: boEmailResult,
        customerQuote: customerEmailResult,
      },
    });
  } catch (error) {
    const supabaseError =
      error && typeof error === "object" && "code" in error
        ? {
            message: (error as { message?: string }).message,
            details: (error as { details?: string }).details,
            hint: (error as { hint?: string }).hint,
            code: (error as { code?: string }).code,
          }
        : null;
    console.error("[leads/PATCH] request failed", {
      message: error instanceof Error ? error.message : String(error),
      supabase: supabaseError,
      stack: error instanceof Error ? error.stack : undefined,
      raw: error,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update lead" },
      { status: 500 },
    );
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("leads").select("*").eq("id", id).single();
    if (error) throw error;
    const lead = data
      ? {
          ...data,
          satellite_image_url: satelliteImageSrcForLead(data),
        }
      : data;
    return NextResponse.json({ lead });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lead not found" },
      { status: 404 },
    );
  }
}
