import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import { getSettings, getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { sendBookingSms, sendEmail } from "@/lib/integrations";
import { getStripeClient } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { leadId, sessionId } = body;
    const settings = await getSettings();
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") throw new Error("Payment not completed");

    let lead: {
      email: string;
      phone: string;
      name: string;
      inspection_datetime: string;
    } | null = null;

    if (isSupabaseConfigured()) {
      const supabase = getSupabaseAdmin();
      const { data, error: leadError } = await supabase
        .from("leads")
        .update({
          stripe_payment_id: session.payment_intent,
          deposit_paid: true,
          status: "booked",
        })
        .eq("id", leadId)
        .select("*")
        .single();
      if (leadError || !data) throw leadError || new Error("Lead update failed");
      lead = data;
    }

    if (!lead) {
      return NextResponse.json({ ok: true, paid: true });
    }

    const dateText = lead.inspection_datetime
      ? format(new Date(lead.inspection_datetime), "PPP 'at' p")
      : "your selected time";
    await sendEmail(
      lead.email,
      `Inspection confirmed for ${dateText}`,
      settings.email_template_booking_confirmed
        .replace("{{inspection_date}}", dateText)
        .replace("{{inspection_time}}", dateText),
    );
    await sendBookingSms(
      lead.phone,
      `Hi ${lead.name}, this is ${settings.company_name}. Your roof inspection is confirmed for ${dateText}. Reply C to confirm or R to reschedule.`,
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Confirmation failed" },
      { status: 500 },
    );
  }
}
