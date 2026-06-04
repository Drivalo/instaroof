import { Resend } from "resend";
import { getCurrencyDisplay, formatDeposit } from "@/lib/currency";
import { normalizeLeadCountryCode } from "@/lib/normalize-country-code";
import { formatInspectionSchedule } from "@/lib/inspection-datetime";
import { ensureEnvLoaded } from "@/lib/env.server";
import {
  estimateRoofSqftFromAddress,
  estimateRoofSqftFromCoordinates,
  formatRoofAreaLabel,
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
const QUOTE_READY_FROM_EMAIL = "hello@nimly.tech";

const LEAD_EMAIL_SELECT =
  "id, name, email, address, country_code, latitude, longitude, roof_sqft, quote_standard_low, quote_standard_high, inspection_datetime, deposit_paid";

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
  if (sqft == null) return "Being calculated";
  return formatRoofAreaLabel(sqft, lead.country_code, lead.address, "Being calculated");
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
                ${
                  lead.deposit_paid
                    ? `<tr><td style="height:10px;"></td></tr>
                <tr>
                  <td style="padding:14px 16px;background-color:#1c1c1c;border:1px solid #22c55e;border-radius:8px;">
                    <p style="margin:0 0 4px;font-size:12px;color:#a0a0a0;">Deposit</p>
                    <p style="margin:0;font-size:16px;font-weight:500;color:#22c55e;">✓ ${deposit} paid — confirmation received</p>
                  </td>
                </tr>`
                    : ""
                }
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
  const roofSize = formatRoofSizeForLead(lead);
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
                Final price is confirmed at your inspection.
              </p>`
    : `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#a0a0a0;">
                A roofing specialist from ${companyName} will be in touch shortly to answer any questions.
              </p>
              <p style="margin:0 0 28px;font-size:14px;line-height:1.6;color:#a0a0a0;">
                Final price is confirmed at your free inspection.
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
              <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#f5a623;">Nimly</p>
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
      ...(lead.deposit_paid ? [`Deposit: ${deposit} paid — confirmation received`, ""] : []),
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
    `Estimated roof size: ${formatRoofSizeForLead(lead)}`,
    `Estimated price range: ${formatPriceRange(lead, settings)}`,
    "",
  );

  if (booked) {
    lines.push(
      `A roofing specialist from ${companyName} will meet you at the property at the scheduled time.`,
      "Final price is confirmed at your inspection.",
    );
  } else {
    lines.push(
      `A roofing specialist from ${companyName} will be in touch shortly.`,
      "Final price is confirmed at your free inspection.",
    );
  }

  lines.push("", `View your quote: ${quoteUrl}`);
  return lines.join("\n");
}

function resolveSubject(lead: LeadRecord): string {
  return hasInspectionBooking(lead) ? SUBJECT_BOOKED : SUBJECT_QUOTE;
}

/** Map Supabase row to email lead; country_code comes from the database. */
export function mapRowToLeadRecord(row: Record<string, unknown>): LeadRecord {
  const address = String(row.address ?? "");
  const latitude = (row.latitude as number | null) ?? null;
  const longitude = (row.longitude as number | null) ?? null;

  return {
    id: Number(row.id),
    name: (row.name as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    address,
    country_code: normalizeLeadCountryCode(row.country_code, { address, latitude, longitude }),
    latitude,
    longitude,
    roof_sqft: (row.roof_sqft as number | null) ?? null,
    quote_standard_low: (row.quote_standard_low as number | null) ?? null,
    quote_standard_high: (row.quote_standard_high as number | null) ?? null,
    inspection_datetime: (row.inspection_datetime as string | null) ?? null,
    deposit_paid: (row.deposit_paid as boolean | null) ?? null,
  };
}

async function fetchLeadForEmail(leadId: number): Promise<LeadRecord | null> {
  const supabase = getSupabaseAdmin();
  const { data: lead, error } = await supabase
    .from("leads")
    .select(LEAD_EMAIL_SELECT)
    .eq("id", leadId)
    .single();

  if (error || !lead) {
    console.error("[customer-quote-email] lead fetch failed", { leadId, error: error?.message });
    return null;
  }

  const record = mapRowToLeadRecord(lead as Record<string, unknown>);

  console.info("[customer-quote-email] lead loaded from Supabase", {
    leadId,
    inspection_datetime: record.inspection_datetime ?? null,
    deposit_paid: record.deposit_paid ?? null,
    address: record.address,
  });

  return record;
}

async function sendCustomerEmail(
  leadId: number,
  appBaseUrl: string,
  options: {
    requireInspection: boolean;
    inspectionDatetimeFromConfirm?: string | null;
    preloadedLead?: LeadRecord | null;
    /** Overrides RESEND_FROM_EMAIL when set (quote-ready email only). */
    from?: string;
  },
): Promise<CustomerQuoteEmailResult> {
  console.info("[customer-quote-email] sendCustomerEmail called", {
    leadId,
    requireInspection: options.requireInspection,
    inspectionDatetimeFromConfirm: options.inspectionDatetimeFromConfirm ?? null,
  });
  ensureEnvLoaded();

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[customer-quote-email] RESEND_API_KEY not set — skipping");
    return { sent: false, skipped: true, reason: "RESEND_API_KEY not configured" };
  }

  let record = options.preloadedLead ?? (await fetchLeadForEmail(leadId));
  if (!record) {
    console.error("[customer-quote-email] no lead for email", {
      leadId,
      hadPreloadedLead: Boolean(options.preloadedLead),
    });
    return { sent: false, skipped: true, reason: "Lead not found" };
  }

  if (options.requireInspection && options.preloadedLead) {
    console.info("[customer-quote-email] using preloaded lead from confirm route", {
      leadId,
      email: record.email ?? null,
      inspection_datetime: record.inspection_datetime ?? null,
    });
  }

  const dbInspection = record.inspection_datetime ?? null;
  const confirmInspection = options.inspectionDatetimeFromConfirm?.trim() || null;

  if (confirmInspection && !dbInspection) {
    console.warn(
      "[customer-quote-email] DB missing inspection_datetime — using value from confirm route",
      { leadId, confirmInspection },
    );
    record.inspection_datetime = confirmInspection;
  } else if (confirmInspection && dbInspection && confirmInspection !== dbInspection) {
    console.warn("[customer-quote-email] inspection_datetime mismatch confirm vs DB", {
      leadId,
      confirmInspection,
      dbInspection,
    });
  }

  console.info("[customer-quote-email] inspection_datetime check", {
    leadId,
    dbInspection: record.inspection_datetime ?? null,
    confirmInspection,
    hasInspectionBooking: hasInspectionBooking(record),
  });

  if (options.requireInspection && !hasInspectionBooking(record)) {
    console.error("[customer-quote-email] booking email BLOCKED — no inspection_datetime", {
      leadId,
      inspection_datetime_db: dbInspection,
      inspection_datetime_confirm: confirmInspection,
    });
    return {
      sent: false,
      skipped: true,
      reason: "Lead has no inspection_datetime in database",
    };
  }

  const to = record.email?.trim();
  if (!to) {
    console.error("[customer-quote-email] booking email BLOCKED — lead has no email", { leadId });
    return { sent: false, skipped: true, reason: "Lead has no email" };
  }

  const settings = await getSettings();
  const firstName = (record.name?.trim().split(/\s+/)[0] || "there").replace(/[<>]/g, "");
  const quoteUrl = `${appBaseUrl.replace(/\/$/, "")}/quote/${leadId}`;
  const from = options.from?.trim() || process.env.RESEND_FROM_EMAIL?.trim() || "hello@nimly.tech";
  const subject = options.requireInspection ? SUBJECT_BOOKED : resolveSubject(record);

  try {
    console.info("[customer-quote-email] calling Resend API", { leadId, from, to, subject });
    const resend = new Resend(apiKey);
    const { data, error: sendError } = await resend.emails.send({
      from,
      to: [to],
      subject,
      html: buildHtml(record, settings, quoteUrl, firstName),
      text: buildPlainText(record, settings, quoteUrl, firstName),
    });

    if (sendError) {
      console.error("[customer-quote-email] Resend RETURNED ERROR (booking/customer)", {
        leadId,
        to,
        subject,
        error: JSON.stringify(sendError),
        errorMessage: sendError.message,
      });
      return { sent: false, reason: sendError.message };
    }

    if (!data?.id) {
      console.error("[customer-quote-email] Resend returned no messageId", { leadId, to, data });
      return { sent: false, reason: "Resend returned no message id" };
    }

    console.info("[customer-quote-email] Resend SUCCESS (booking/customer)", {
      leadId,
      to,
      subject,
      inspection_datetime: record.inspection_datetime ?? null,
      messageId: data.id,
    });
    return { sent: true, messageId: data.id };
  } catch (err) {
    console.error("[customer-quote-email] Resend THREW (booking/customer)", {
      leadId,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return {
      sent: false,
      reason: err instanceof Error ? err.message : "Failed to send email",
    };
  }
}

export type BookingConfirmedEmailOptions = {
  /** Value verified in confirm route — used if DB re-fetch is missing it */
  inspectionDatetime?: string | null;
  /** Lead already loaded in confirm route — avoids a second failing query */
  preloadedLead?: LeadRecord | null;
};

/** After contact details are saved on the quote page — sends "Your roof quote is ready" to the customer. */
export async function sendCustomerQuoteReadyEmail(
  leadId: number,
  appBaseUrl: string,
  preloadedLead?: LeadRecord | null,
): Promise<CustomerQuoteEmailResult> {
  ensureEnvLoaded();
  console.info("[customer-quote-email] sendCustomerQuoteReadyEmail ENTRY", {
    leadId,
    email: preloadedLead?.email ?? null,
    from: QUOTE_READY_FROM_EMAIL,
    hasResendApiKey: Boolean(process.env.RESEND_API_KEY?.trim()),
  });
  return sendCustomerEmail(leadId, appBaseUrl, {
    requireInspection: false,
    preloadedLead: preloadedLead ?? null,
    from: QUOTE_READY_FROM_EMAIL,
  });
}

/** After Stripe payment — requires inspection_datetime from DB before sending. */
export async function sendCustomerBookingConfirmedEmail(
  leadId: number,
  appBaseUrl: string,
  options?: BookingConfirmedEmailOptions,
): Promise<CustomerQuoteEmailResult> {
  ensureEnvLoaded();
  console.info("[customer-quote-email] sendCustomerBookingConfirmedEmail ENTRY", {
    leadId,
    inspectionDatetimeFromConfirm: options?.inspectionDatetime ?? null,
    hasResendApiKey: Boolean(process.env.RESEND_API_KEY?.trim()),
    resendFrom: process.env.RESEND_FROM_EMAIL?.trim() || "(default hello@nimly.tech)",
  });
  return sendCustomerEmail(leadId, appBaseUrl, {
    requireInspection: true,
    inspectionDatetimeFromConfirm: options?.inspectionDatetime ?? null,
    preloadedLead: options?.preloadedLead ?? null,
  });
}

export type DirectBookingEmailInput = {
  customerName: string;
  customerEmail: string;
  address: string;
  inspectionDateIso: string;
  appBaseUrl: string;
};

/** Direct book flow (no lead record) — sends booking confirmation after Stripe payment. */
export async function sendDirectBookingConfirmationEmail(
  input: DirectBookingEmailInput,
): Promise<CustomerQuoteEmailResult> {
  ensureEnvLoaded();
  console.info("[customer-quote-email] sendDirectBookingConfirmationEmail ENTRY", {
    customerEmail: input.customerEmail,
    inspectionDateIso: input.inspectionDateIso,
    hasResendApiKey: Boolean(process.env.RESEND_API_KEY?.trim()),
    resendFrom: process.env.RESEND_FROM_EMAIL?.trim() || "(default hello@nimly.tech)",
  });

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[customer-quote-email] RESEND_API_KEY not set — skipping direct booking email");
    return { sent: false, skipped: true, reason: "RESEND_API_KEY not configured" };
  }

  const to = input.customerEmail?.trim();
  if (!to) {
    console.error("[customer-quote-email] direct booking email BLOCKED — no customer email");
    return { sent: false, skipped: true, reason: "Customer has no email" };
  }

  const settings = await getSettings();
  const firstName = (input.customerName?.trim().split(/\s+/)[0] || "there").replace(/[<>]/g, "");
  const lead: LeadRecord = {
    id: 0,
    name: input.customerName,
    email: input.customerEmail,
    address: input.address,
    inspection_datetime: input.inspectionDateIso,
    deposit_paid: true,
  };
  const quoteUrl = `${input.appBaseUrl.replace(/\/$/, "")}/`;
  const from = process.env.RESEND_FROM_EMAIL?.trim() || "hello@nimly.tech";
  const subject = SUBJECT_BOOKED;

  try {
    console.info("[customer-quote-email] calling Resend API (direct booking)", { from, to, subject });
    const resend = new Resend(apiKey);
    const { data, error: sendError } = await resend.emails.send({
      from,
      to: [to],
      subject,
      html: buildHtml(lead, settings, quoteUrl, firstName),
      text: buildPlainText(lead, settings, quoteUrl, firstName),
    });

    if (sendError) {
      console.error("[customer-quote-email] Resend RETURNED ERROR (direct booking)", {
        to,
        subject,
        errorMessage: sendError.message,
      });
      return { sent: false, reason: sendError.message };
    }

    if (!data?.id) {
      console.error("[customer-quote-email] Resend returned no messageId (direct booking)", { to, data });
      return { sent: false, reason: "Resend returned no message id" };
    }

    console.info("[customer-quote-email] Resend SUCCESS (direct booking)", {
      to,
      subject,
      messageId: data.id,
    });
    return { sent: true, messageId: data.id };
  } catch (err) {
    console.error("[customer-quote-email] Resend THREW (direct booking)", {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      sent: false,
      reason: err instanceof Error ? err.message : "Failed to send email",
    };
  }
}
