import { NextRequest, NextResponse } from "next/server";
import { sendLeadNotificationEmail } from "@/lib/lead-notification";
import { satelliteImageSrcForLead } from "@/lib/maps-static";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, email, phone } = body;

    const updates: Record<string, string> = {};
    if (typeof name === "string" && name.trim()) updates.name = name.trim();
    if (typeof email === "string" && email.trim()) updates.email = email.trim();
    if (typeof phone === "string" && phone.trim()) updates.phone = phone.trim();

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("leads").update(updates).eq("id", id).select("*").single();
    if (error) throw error;

    void sendLeadNotificationEmail(Number(id), req.nextUrl.origin, "submitted").catch((err) =>
      console.error("[leads/PATCH] company notification failed:", err),
    );

    return NextResponse.json({ lead: data });
  } catch (error) {
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
