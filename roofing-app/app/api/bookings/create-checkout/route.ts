import { NextRequest, NextResponse } from "next/server";
import { createStripeCheckoutSession } from "@/lib/integrations";
import { normalizeInspectionDatetime } from "@/lib/inspection-datetime";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { leadId, name, phone, email, bestTimeToContact, inspectionDateTime } = body;

    if (!inspectionDateTime?.trim()) {
      return NextResponse.json({ error: "Please select an inspection time" }, { status: 400 });
    }

    const inspectionIso = normalizeInspectionDatetime(inspectionDateTime);
    const supabase = getSupabaseAdmin();

    const { data: updatedLead, error: updateError } = await supabase
      .from("leads")
      .update({
        name,
        phone,
        email,
        best_time_to_contact: bestTimeToContact,
        inspection_datetime: inspectionIso,
      })
      .eq("id", leadId)
      .select("id, inspection_datetime, address")
      .single();

    if (updateError || !updatedLead) {
      throw updateError || new Error("Failed to save inspection appointment");
    }
    if (!updatedLead.inspection_datetime) {
      throw new Error("Inspection appointment was not saved to the lead");
    }

    const successUrl = `${req.nextUrl.origin}/confirmation/${leadId}?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${req.nextUrl.origin}/book/${leadId}`;
    const session = await createStripeCheckoutSession({
      leadId: Number(leadId),
      customerEmail: email,
      customerName: name,
      inspectionDateIso: inspectionIso,
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
