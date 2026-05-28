import twilio from "twilio";
import { format } from "date-fns";
import { getSettings, getSupabaseAdmin } from "@/lib/supabase";
import { DEPOSIT_AMOUNT_USD_CENTS, getStripeClient } from "@/lib/stripe";
export { runVisionAnalysis } from "@/lib/vision";
export {
  getGoogleMapsApiKey,
  mapsStaticSatelliteUrl,
  satelliteImageSrcForLead,
  satelliteProxyPath,
} from "@/lib/maps-static";

export async function sendEmail(to: string, subject: string, body: string) {
  console.log("EMAIL:", { to, subject, body });
}

export async function sendBookingSms(to: string, message: string) {
  const settings = await getSettings();
  if (!settings.twilio_account_sid || !settings.twilio_auth_token || !settings.twilio_from_number) {
    console.log("SMS (mock):", { to, message });
    return;
  }
  const client = twilio(settings.twilio_account_sid, settings.twilio_auth_token);
  await client.messages.create({ to, from: settings.twilio_from_number, body: message });
}

export async function createStripeCheckoutSession(args: {
  leadId: number;
  customerEmail: string;
  customerName: string;
  inspectionDateIso: string;
  successUrl: string;
  cancelUrl: string;
}) {
  const settings = await getSettings();
  const stripe = getStripeClient();
  const depositCents =
    settings.deposit_amount > 0
      ? Math.round(Number(settings.deposit_amount) * 100)
      : DEPOSIT_AMOUNT_USD_CENTS;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
    customer_email: args.customerEmail,
    metadata: {
      lead_id: String(args.leadId),
      inspection_datetime: args.inspectionDateIso,
      customer_name: args.customerName,
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          product_data: { name: "Roof inspection deposit" },
          unit_amount: depositCents,
        },
      },
    ],
  });
  return session;
}

export async function sendInspectionReminderNotifications() {
  const supabase = getSupabaseAdmin();
  const now = new Date();
  const in24hStart = new Date(now.getTime() + 23 * 60 * 60 * 1000).toISOString();
  const in24hEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString();
  const in2hStart = new Date(now.getTime() + 90 * 60 * 1000).toISOString();
  const in2hEnd = new Date(now.getTime() + 150 * 60 * 1000).toISOString();

  const { data: soonLeads } = await supabase
    .from("leads")
    .select("*")
    .gte("inspection_datetime", in24hStart)
    .lte("inspection_datetime", in24hEnd)
    .eq("status", "booked");

  for (const lead of soonLeads ?? []) {
    if (lead.email) {
      await sendEmail(
        lead.email,
        "Inspection reminder",
        `Reminder: your inspection is scheduled for ${format(new Date(lead.inspection_datetime), "PPP p")}.`,
      );
    }
  }

  const { data: nearLeads } = await supabase
    .from("leads")
    .select("*")
    .gte("inspection_datetime", in2hStart)
    .lte("inspection_datetime", in2hEnd)
    .eq("status", "booked");

  const settings = await getSettings();
  for (const lead of nearLeads ?? []) {
    if (lead.phone) {
      await sendBookingSms(
        lead.phone,
        `${settings.owner_name} is on the way for your inspection. See you soon!`,
      );
    }
  }
}
