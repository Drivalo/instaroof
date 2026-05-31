import { NextRequest, NextResponse } from "next/server";
import { ensureEnvLoaded } from "@/lib/env.server";
import { sendLeadNotificationEmail } from "@/lib/lead-notification";
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
    const { name, email, phone } = body;

    const updates: Record<string, string> = {};
    if (typeof name === "string" && name.trim()) updates.name = name.trim();
    if (typeof email === "string" && email.trim()) updates.email = email.trim();
    if (typeof phone === "string" && phone.trim()) updates.phone = phone.trim();

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("leads")
      .update(updates)
      .eq("id", leadId)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      console.error("[leads/PATCH] no lead updated", { leadId, updates: Object.keys(updates) });
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    void sendLeadNotificationEmail(leadId, req.nextUrl.origin, "contact_updated").catch((err) =>
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
