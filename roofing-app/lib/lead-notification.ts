import { Resend } from "resend";
import { getCurrencyDisplay } from "@/lib/currency";
import { formatInspectionSchedule } from "@/lib/inspection-datetime";
import { ensureEnvLoaded } from "@/lib/env.server";
import {
  estimateRoofSqftFromAddress,
  estimateRoofSqftFromCoordinates,
  formatRoofAreaDisplay,
  previewPriceRangeFromEstimate,
} from "@/lib/roof-estimate";
import { gutteringInspectionRequestedLine } from "@/lib/guttering-inspection";
import { isEmergencyJobType, jobTypeLabel } from "@/lib/job-type";
import { roofMaterialLabel } from "@/lib/roof-material";
import { getSettings, getSupabaseAdmin } from "@/lib/supabase";
import { SettingsRow } from "@/lib/types";

export type LeadNotificationContext =
  | "submitted"
  | "analysis_complete"
  | "contact_updated"
  | "booking_confirmed";

export type LeadNotificationResult = {
  sent: boolean;
  skipped?: boolean;
  reason?: string;
  messageId?: string;
};

type LeadRecord = {
  id: number;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  job_type?: string | null;
  roof_material?: string | null;
  guttering?: boolean | null;
  address: string;
  country_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  roof_sqft?: number | null;
  quote_standard_low?: number | null;
  quote_standard_high?: number | null;
  status?: string | null;
  inspection_datetime?: string | null;
};

function displayValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed || "—";
}

function hasLeadContactForNotification(lead: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}): boolean {
  return Boolean(lead.name?.trim() && lead.email?.trim() && lead.phone?.trim());
}

function resolveRoofSqft(lead: LeadRecord): number | null {
  if (lead.roof_sqft != null && Number.isFinite(Number(lead.roof_sqft))) {
    return Number(lead.roof_sqft);
  }

  const lat = lead.latitude;
  const lng = lead.longitude;
  if (
    lat != null &&
    lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0)
  ) {
    return estimateRoofSqftFromCoordinates(lat, lng);
  }

  if (lead.address?.trim()) {
    return estimateRoofSqftFromAddress(lead.address);
  }

  return null;
}

function formatRoofSizeForLead(lead: LeadRecord): string {
  const sqft = resolveRoofSqft(lead);
  if (sqft == null) return "Pending analysis";
  return formatRoofAreaDisplay(sqft, lead.address, lead.country_code).label;
}

function formatEstimatedPriceRange(lead: LeadRecord, settings: SettingsRow): string {
  const low = lead.quote_standard_low;
  const high = lead.quote_standard_high;

  if (low != null || high != null) {
    const display = getCurrencyDisplay(
      lead.address,
      settings,
      lead.country_code,
      lead.latitude,
      lead.longitude,
    );
    return display.formatRange(low ?? 0, high ?? 0);
  }

  const sqft = resolveRoofSqft(lead);
  if (sqft != null) {
    return `${previewPriceRangeFromEstimate(sqft, lead.address, settings, lead.country_code)} (estimate)`;
  }

  return "Pending analysis";
}

function formatAppointment(lead: LeadRecord): { date: string; time: string } | null {
  if (!lead.inspection_datetime?.trim()) return null;
  const schedule = formatInspectionSchedule(lead.inspection_datetime);
  return { date: schedule.date, time: schedule.time };
}

function subjectForContext(lead: LeadRecord, context: LeadNotificationContext): string {
  const customerName = lead.name?.trim();
  if (customerName) {
    return `New roof inquiry — ${customerName}`;
  }
  const address = lead.address?.trim();
  if (address) {
    const short = address.length > 48 ? `${address.slice(0, 48)}…` : address;
    return `New roof inquiry — ${short}`;
  }
  console.warn("[lead-notification] subject fallback — no name or address on lead", {
    leadId: lead.id,
    context,
  });
  return "New roof inquiry";
}

function buildEmailHtml(lead: LeadRecord, settings: SettingsRow, adminUrl: string, context: LeadNotificationContext) {
  const roofSize = formatRoofSizeForLead(lead);
  const priceRange = formatEstimatedPriceRange(lead, settings);
  const appointment = formatAppointment(lead);

  const contextNote =
    context === "booking_confirmed"
      ? "<p style=\"color:#6b6b6b;font-size:14px;\">The customer paid their deposit and booked a roof inspection.</p>"
      : context === "analysis_complete"
        ? "<p style=\"color:#6b6b6b;font-size:14px;\">Satellite analysis has finished and quote ranges are updated.</p>"
        : context === "contact_updated"
          ? "<p style=\"color:#6b6b6b;font-size:14px;\">The customer added or updated their contact details on the quote page.</p>"
          : "<p style=\"color:#6b6b6b;font-size:14px;\">A new property was submitted through Nimly.</p>";

  const appointmentRows = appointment
    ? `<tr><td style="padding:8px 12px;border:1px solid #e8e8e6;background:#f8f8f6;"><strong>Inspection date</strong></td><td style="padding:8px 12px;border:1px solid #e8e8e6;">${appointment.date}</td></tr>
    <tr><td style="padding:8px 12px;border:1px solid #e8e8e6;background:#f8f8f6;"><strong>Inspection time</strong></td><td style="padding:8px 12px;border:1px solid #e8e8e6;">${appointment.time}</td></tr>`
    : "";

  const urgentBanner = isEmergencyJobType(lead.job_type)
    ? `<div style="background:#fef3c7;border:2px solid #f59e0b;padding:14px 16px;border-radius:8px;margin:0 0 16px;font-size:15px;font-weight:600;color:#92400e;">⚠️ URGENT — customer has an active leak.</div>`
    : "";

  const jobTypeRow = lead.job_type
    ? `<tr><td style="padding:8px 12px;border:1px solid #e8e8e6;background:#f8f8f6;"><strong>Situation</strong></td><td style="padding:8px 12px;border:1px solid #e8e8e6;">${jobTypeLabel(lead.job_type)}</td></tr>`
    : "";

  const roofMaterialRow = lead.roof_material
    ? `<tr><td style="padding:8px 12px;border:1px solid #e8e8e6;background:#f8f8f6;"><strong>Roof material</strong></td><td style="padding:8px 12px;border:1px solid #e8e8e6;">${roofMaterialLabel(lead.roof_material, lead.country_code, lead.address)}</td></tr>`
    : "";

  const gutteringRow =
    lead.guttering === true
      ? `<tr><td colspan="2" style="padding:8px 12px;border:1px solid #e8e8e6;"><strong>${gutteringInspectionRequestedLine(lead.country_code)}</strong></td></tr>`
      : "";

  return `
<!DOCTYPE html>
<html>
<body style="font-family:system-ui,sans-serif;color:#1c1c1c;line-height:1.5;margin:0;padding:24px;">
  <h1 style="font-size:20px;margin:0 0 16px;">New lead notification</h1>
  ${urgentBanner}
  ${contextNote}
  <table style="border-collapse:collapse;width:100%;max-width:560px;margin-top:16px;">
    <tr><td style="padding:8px 12px;border:1px solid #e8e8e6;background:#f8f8f6;width:140px;"><strong>Name</strong></td><td style="padding:8px 12px;border:1px solid #e8e8e6;">${displayValue(lead.name)}</td></tr>
    <tr><td style="padding:8px 12px;border:1px solid #e8e8e6;background:#f8f8f6;"><strong>Email</strong></td><td style="padding:8px 12px;border:1px solid #e8e8e6;">${displayValue(lead.email)}</td></tr>
    <tr><td style="padding:8px 12px;border:1px solid #e8e8e6;background:#f8f8f6;"><strong>Phone</strong></td><td style="padding:8px 12px;border:1px solid #e8e8e6;">${displayValue(lead.phone)}</td></tr>
    ${jobTypeRow}
    ${roofMaterialRow}
    ${gutteringRow}
    <tr><td style="padding:8px 12px;border:1px solid #e8e8e6;background:#f8f8f6;"><strong>Address</strong></td><td style="padding:8px 12px;border:1px solid #e8e8e6;">${lead.address}</td></tr>
    ${appointmentRows}
    <tr><td style="padding:8px 12px;border:1px solid #e8e8e6;background:#f8f8f6;"><strong>Roof size</strong></td><td style="padding:8px 12px;border:1px solid #e8e8e6;">${roofSize}</td></tr>
    <tr><td style="padding:8px 12px;border:1px solid #e8e8e6;background:#f8f8f6;"><strong>Price range</strong></td><td style="padding:8px 12px;border:1px solid #e8e8e6;">${priceRange}</td></tr>
    <tr><td style="padding:8px 12px;border:1px solid #e8e8e6;background:#f8f8f6;"><strong>Status</strong></td><td style="padding:8px 12px;border:1px solid #e8e8e6;">${displayValue(lead.status)}</td></tr>
  </table>
  <p style="margin-top:24px;">
    <a href="${adminUrl}" style="display:inline-block;background:#f5a623;color:#1c1c1c;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">Open admin dashboard</a>
  </p>
  <p style="margin-top:16px;font-size:13px;color:#6b6b6b;">Lead ID: ${lead.id}</p>
</body>
</html>`;
}

function buildPlainText(lead: LeadRecord, settings: SettingsRow, adminUrl: string) {
  const appointment = formatAppointment(lead);
  const urgentLine = isEmergencyJobType(lead.job_type)
    ? ["⚠️ URGENT — customer has an active leak.", ""]
    : [];
  const jobTypeLine = lead.job_type ? [`Situation: ${jobTypeLabel(lead.job_type)}`] : [];
  const roofMaterialLine = lead.roof_material
    ? [`Roof material: ${roofMaterialLabel(lead.roof_material, lead.country_code, lead.address)}`]
    : [];
  const gutteringLine =
    lead.guttering === true ? [gutteringInspectionRequestedLine(lead.country_code)] : [];
  return [
    "New lead notification",
    "",
    ...urgentLine,
    `Name: ${displayValue(lead.name)}`,
    `Email: ${displayValue(lead.email)}`,
    `Phone: ${displayValue(lead.phone)}`,
    ...jobTypeLine,
    ...roofMaterialLine,
    ...gutteringLine,
    `Address: ${lead.address}`,
    ...(appointment
      ? [`Inspection date: ${appointment.date}`, `Inspection time: ${appointment.time}`]
      : []),
    `Roof size: ${formatRoofSizeForLead(lead)}`,
    `Price range: ${formatEstimatedPriceRange(lead, settings)}`,
    `Status: ${displayValue(lead.status)}`,
    "",
    `Admin dashboard: ${adminUrl}`,
    `Lead ID: ${lead.id}`,
  ].join("\n");
}

export async function sendLeadNotificationEmail(
  leadId: number,
  adminBaseUrl: string,
  context: LeadNotificationContext = "submitted",
): Promise<LeadNotificationResult> {
  console.info("[lead-notification] sendLeadNotificationEmail called", { leadId, context });
  ensureEnvLoaded();

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[lead-notification] RESEND_API_KEY not set — skipping email");
    return { sent: false, skipped: true, reason: "RESEND_API_KEY not configured" };
  }

  const from = "hello@nimly.tech";
  const to = "cherineywong@gmail.com";
  console.info("[lead-notification] Resend config", { from, to, hasApiKey: true });

  const supabase = getSupabaseAdmin();
  const { data: lead, error } = await supabase.from("leads").select("*").eq("id", leadId).single();

  if (error || !lead) {
    console.error("[lead-notification] lead fetch failed", { leadId, error: error?.message });
    return { sent: false, skipped: true, reason: "Lead not found" };
  }

  if (!hasLeadContactForNotification(lead)) {
    console.info("[lead-notification] skipped — lead missing name, email, or phone", {
      leadId,
      context,
      hasName: Boolean(lead.name?.trim()),
      hasEmail: Boolean(lead.email?.trim()),
      hasPhone: Boolean(lead.phone?.trim()),
    });
    return { sent: false, skipped: true, reason: "Lead contact details incomplete" };
  }

  console.info("[lead-notification] lead loaded from Supabase", {
    leadId,
    context,
    customerName: lead.name ?? null,
    inspection_datetime: lead.inspection_datetime ?? null,
    status: lead.status ?? null,
    subject: subjectForContext(lead as LeadRecord, context),
  });

  const settings = await getSettings();
  const adminUrl = `${adminBaseUrl.replace(/\/$/, "")}/admin`;
  const subject = subjectForContext(lead as LeadRecord, context);

  try {
    console.info("[lead-notification] calling Resend API", { leadId, context, subject, to });
    const resend = new Resend(apiKey);
    const { data, error: sendError } = await resend.emails.send({
      from,
      to: [to],
      subject,
      html: buildEmailHtml(lead as LeadRecord, settings, adminUrl, context),
      text: buildPlainText(lead as LeadRecord, settings, adminUrl),
    });

    if (sendError) {
      console.error("[lead-notification] Resend error:", JSON.stringify(sendError));
      return { sent: false, reason: sendError.message };
    }

    console.info("[lead-notification] sent", { leadId, to, messageId: data?.id, context });
    return { sent: true, messageId: data?.id };
  } catch (err) {
    console.error("[lead-notification] failed:", err);
    return {
      sent: false,
      reason: err instanceof Error ? err.message : "Failed to send notification",
    };
  }
}
