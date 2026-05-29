import { Resend } from "resend";
import { getCurrencyDisplay, formatDeposit } from "@/lib/currency";
import { formatInspectionSchedule } from "@/lib/inspection-datetime";
import { ensureEnvLoaded } from "@/lib/env.server";
import {
  estimateRoofSqftFromAddress,
  estimateRoofSqftFromCoordinates,
  previewPriceRangeFromEstimate,
} from "@/lib/roof-estimate";
import { getSettings, getSupabaseAdmin } from "@/lib/supabase";
import { SettingsRow } from "@/lib/types";

export type CustomerQuoteEmailResult = {
  sent: boolean;
  skipped?: boolean;
  reason?: string;
  messageId?: string;
};

type LeadRecord = {
  id: number;
  name?: string | null;
  email?: string | null;
  address: string;
  country_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  roof_sqft?: number | null;
  quote_standard_low?: number | null;
  quote_standard_high?: number | null;
  inspection_datetime?: string | null;
  deposit_paid?: boolean | null;
};

const SUBJECT_QUOTE = "Your roof quote is ready";
const SUBJECT_BOOKED = "Your inspection is confirmed";

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

function formatRoofSizeSqm(lead: LeadRecord): string {
  const sqft = resolveRoofSqft(lead);
  if (sqft == null) return "Being calculated";
  const sqm = Math.round(sqft * 0.092903);
  return `${sqm.toLocaleString("en-US")} m²`;
}

function formatPriceRange(lead: LeadRecord, settings: SettingsRow): string {
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
    return previewPriceRangeFromEstimate(sqft, lead.address, settings, lead.country_code);
  }

  return "Available on your quote page";
}

function hasInspectionBooking(lead: LeadRecord): boolean {
  const raw = lead.inspection_datetime;
  return raw != null && String(raw).trim().length > 0;
}

function formatDepositAmount(lead: LeadRecord, settings: SettingsRow): string {
  const usd = settings.deposit_amount > 0 ? Number(settings.deposit_amount) : 50;
  return formatDeposit(
    usd,
    lead.address,
    settings,
    lead.country_code,
    lead.latitude,
    lead.longitude,
  );
}

function appointmentHtml(lead: LeadRecord, settings: SettingsRow): string {
  if (!lead.inspection_datetime) return "";
  const schedule = formatInspectionSchedule(lead.inspection_datetime);
  const deposit = formatDepositAmount(lead, settings);
  const phone = settings.company_phone?.trim() || "";
  const email = settings.company_email?.trim() || "";
  const contactLines: string[] = [];
  if (phone) contactLines.push(`<strong style="color:#ffffff;">${phone}</strong>`);
  if (email) {
    contactLines.push(
      `<a href="mailto:${email}" style="color:#f5a623;text-decoration:none;">${email}</a>`,
    );
  }
  const contactHtml =
    contactLines.length > 0
      ? contactLines.join(" &nbsp;·&nbsp; ")
      : "Reply to this email and we will help you.";

  return `
              <p style="margin:0 0 12px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#f5a623;">Your inspection</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
                <tr>
                  <td style="padding:14px 16px;background-color:#1c1c1c;border:1px solid #3a3a3a;border-radius:8px;">
                    <p style="margin:0 0 4px;font-size:12px;color:#a0a0a0;">Date</p>
                    <p style="margin:0;font-size:16px;font-weight:500;color:#ffffff;">${schedule.date}</p>
                  </td>
                </tr>
                <tr><td style="height:10px;"></td></tr>
                <tr>
                  <td style="padding:14px 16px;background-color:#1c1c1c;border:1px solid #3a3a3a;border-radius:8px;">
                    <p style="margin:0 0 4px;font-size:12px;color:#a0a0a0;">Time</p>
                    <p style="margin:0;font-size:16px;font-weight:500;color:#ffffff;">${schedule.time}</p>
                  </td>
                </tr>
                <tr><td style="height:10px;"></td></tr>
                <tr>
                  <td style="padding:14px 16px;background-color:#1c1c1c;border:1px solid #3a3a3a;border-radius:8px;">
                    <p style="margin:0 0 4px;font-size:12px;color:#a0a0a0;">Address</p>
                    <p style="margin:0;font-size:16px;font-weight:500;color:#ffffff;line-height:1.4;">${lead.address}</p>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#a0a0a0;">
                Your ${deposit} deposit is fully refundable if you cancel before the inspection or choose not to proceed after the visit.
              </p>
              <p style="margin:0 0 28px;font-size:14px;line-height:1.6;color:#a0a0a0;">
                Need to reschedule? Contact us at ${contactHtml}.
              </p>`;
}

function buildHtml(
  lead: LeadRecord,
  settings: SettingsRow,
  quoteUrl: string,
  firstName: string,
) {
  const roofSize = formatRoofSizeSqm(lead);
  const priceRange = formatPriceRange(lead, settings);
  const companyName = settings.company_name || "your roofing company";
  const booked = hasInspectionBooking(lead);
  const headline = booked ? "Your inspection is confirmed" : "Your roof quote is ready";
  const intro = booked
    ? `Hi ${firstName}, thank you for booking with ${companyName}. Your free roof inspection is scheduled. Here is a summary of your estimate and appointment details.`
    : `Hi ${firstName}, thank you for using our instant quote service. Here is a summary of your estimate for <span style="color:#ffffff;">${lead.address}</span>.`;
  const followUp = booked
    ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#a0a0a0;">
                A roofing specialist from ${companyName} will meet you at the property at the scheduled time.
              </p>
              <p style="margin:0 0 28px;font-size:14px;line-height:1.6;color:#a0a0a0;">
                Final price is confirmed at your inspection. There is no obligation to proceed.
              </p>`
    : `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#a0a0a0;">
                A roofing specialist from ${companyName} will be in touch shortly to answer any questions.
              </p>
              <p style="margin:0 0 28px;font-size:14px;line-height:1.6;color:#a0a0a0;">
                Final price is confirmed at your free inspection. Book with no obligation when you are ready.
              </p>`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background-color:#1c1c1c;font-family:'DM Sans',system-ui,-apple-system,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#1c1c1c;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background-color:#2a2a2a;border:1px solid #3a3a3a;border-radius:12px;">
          <tr>
            <td style="padding:32px 28px;">
              <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#f5a623;">InstaRoof Quote</p>
              <h1 style="margin:0 0 20px;font-size:22px;font-weight:500;color:#ffffff;line-height:1.3;">${headline}</h1>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#a0a0a0;">
                ${intro}
              </p>
              ${appointmentHtml(lead, settings)}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
                <tr>
                  <td style="padding:14px 16px;background-color:#1c1c1c;border:1px solid #3a3a3a;border-radius:8px;">
                    <p style="margin:0 0 4px;font-size:12px;color:#a0a0a0;">Estimated roof size</p>
                    <p style="margin:0;font-size:20px;font-weight:500;color:#ffffff;">${roofSize}</p>
                  </td>
                </tr>
                <tr><td style="height:10px;"></td></tr>
                <tr>
                  <td style="padding:14px 16px;background-color:#1c1c1c;border:1px solid #3a3a3a;border-radius:8px;">
                    <p style="margin:0 0 4px;font-size:12px;color:#a0a0a0;">Estimated price range</p>
                    <p style="margin:0;font-size:20px;font-weight:500;color:#ffffff;">${priceRange}</p>
                  </td>
                </tr>
              </table>
              ${followUp}
              <a href="${quoteUrl}" style="display:inline-block;background-color:#f5a623;color:#1c1c1c;text-decoration:none;font-size:14px;font-weight:500;padding:14px 24px;border-radius:8px;">View your quote</a>
            </td>
          </tr>
        </table>
        <p style="margin:20px 0 0;font-size:12px;color:#6b6b6b;line-height:1.5;max-width:520px;text-align:center;">
          This is an automated estimate based on satellite imagery. Final pricing may vary after inspection.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildPlainText(lead: LeadRecord, settings: SettingsRow, quoteUrl: string, firstName: string) {
  const companyName = settings.company_name || "your roofing company";
  const booked = hasInspectionBooking(lead);
  const lines: string[] = [
    booked ? "Your inspection is confirmed" : "Your roof quote is ready",
    "",
    `Hi ${firstName},`,
    "",
  ];

  if (booked && lead.inspection_datetime) {
    const schedule = formatInspectionSchedule(lead.inspection_datetime);
    const deposit = formatDepositAmount(lead, settings);
    lines.push(
      `Your free roof inspection with ${companyName} is scheduled.`,
      "",
      "Your inspection",
      `Date: ${schedule.date}`,
      `Time: ${schedule.time}`,
      `Address: ${lead.address}`,
      "",
      `Your ${deposit} deposit is fully refundable if you cancel before the inspection or choose not to proceed after the visit.`,
      "",
    );
    const phone = settings.company_phone?.trim();
    const email = settings.company_email?.trim();
    if (phone || email) {
      lines.push(
        "Need to reschedule?",
        phone ? `Phone: ${phone}` : "",
        email ? `Email: ${email}` : "",
        "",
      );
    } else {
      lines.push("Need to reschedule? Reply to this email and we will help you.", "");
    }
  } else {
    lines.push(
      "Thank you for using our instant quote service.",
      "",
      `Property: ${lead.address}`,
    );
  }

  lines.push(
    `Estimated roof size: ${formatRoofSizeSqm(lead)}`,
    `Estimated price range: ${formatPriceRange(lead, settings)}`,
    "",
  );

  if (booked) {
    lines.push(
      `A roofing specialist from ${companyName} will meet you at the property at the scheduled time.`,
      "Final price is confirmed at your inspection. There is no obligation to proceed.",
    );
  } else {
    lines.push(
      `A roofing specialist from ${companyName} will be in touch shortly.`,
      "Final price is confirmed at your free inspection. Book with no obligation when you are ready.",
    );
  }

  lines.push("", `View your quote: ${quoteUrl}`);
  return lines.join("\n");
}

function resolveSubject(lead: LeadRecord): string {
  return hasInspectionBooking(lead) ? SUBJECT_BOOKED : SUBJECT_QUOTE;
}

export async function sendCustomerQuoteReadyEmail(
  leadId: number,
  appBaseUrl: string,
): Promise<CustomerQuoteEmailResult> {
  ensureEnvLoaded();

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[customer-quote-email] RESEND_API_KEY not set — skipping");
    return { sent: false, skipped: true, reason: "RESEND_API_KEY not configured" };
  }

  const supabase = getSupabaseAdmin();
  const { data: lead, error } = await supabase.from("leads").select("*").eq("id", leadId).single();

  if (error || !lead) {
    return { sent: false, skipped: true, reason: "Lead not found" };
  }

  const to = lead.email?.trim();
  if (!to) {
    return { sent: false, skipped: true, reason: "Lead has no email" };
  }

  const settings = await getSettings();
  const record = lead as LeadRecord;
  const firstName = (record.name?.trim().split(/\s+/)[0] || "there").replace(/[<>]/g, "");
  const quoteUrl = `${appBaseUrl.replace(/\/$/, "")}/quote/${leadId}`;
  const from = process.env.RESEND_FROM_EMAIL?.trim() || "onboarding@resend.dev";
  const subject = resolveSubject(record);

  try {
    const resend = new Resend(apiKey);
    const { data, error: sendError } = await resend.emails.send({
      from,
      to: [to],
      subject,
      html: buildHtml(record, settings, quoteUrl, firstName),
      text: buildPlainText(record, settings, quoteUrl, firstName),
    });

    if (sendError) {
      console.error("[customer-quote-email] Resend error:", sendError);
      return { sent: false, reason: sendError.message };
    }

    console.info("[customer-quote-email] sent", { leadId, to, subject, messageId: data?.id });
    return { sent: true, messageId: data?.id };
  } catch (err) {
    console.error("[customer-quote-email] failed:", err);
    return {
      sent: false,
      reason: err instanceof Error ? err.message : "Failed to send email",
    };
  }
}
