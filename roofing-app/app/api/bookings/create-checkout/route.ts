import { NextRequest, NextResponse } from "next/server";
import { createStripeCheckoutSession } from "@/lib/integrations";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { leadId, name, phone, email, bestTimeToContact, inspectionDateTime } = body;
    const supabase = getSupabaseAdmin();

    await supabase
      .from("leads")
      .update({
        name,
        phone,
        email,
        best_time_to_contact: bestTimeToContact,
        inspection_datetime: inspectionDateTime,
      })
      .eq("id", leadId);

    const successUrl = `${req.nextUrl.origin}/confirmation/${leadId}?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${req.nextUrl.origin}/book/${leadId}`;
    const session = await createStripeCheckoutSession({
      leadId,
      customerEmail: email,
      customerName: name,
      inspectionDateIso: inspectionDateTime,
      successUrl,
      cancelUrl,
    });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create checkout" },
      { status: 500 },
    );
  }
}
