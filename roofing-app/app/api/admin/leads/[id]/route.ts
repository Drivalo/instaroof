import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isValidAdminLeadStatus } from "@/lib/admin-lead-status";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id: idParam } = await params;
    const leadId = Number(idParam);
    if (!Number.isFinite(leadId) || leadId <= 0) {
      return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
    }

    const body = await req.json();
    const { status, notes } = body;

    const updates: Record<string, string> = {};
    if (isValidAdminLeadStatus(status)) updates.status = status;
    if (typeof notes === "string") updates.notes = notes;

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

    if (error) {
      console.error("[admin/leads/PATCH] Supabase update failed", {
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
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    return NextResponse.json({ lead: data });
  } catch (error) {
    console.error("[admin/leads/PATCH] request failed", {
      message: error instanceof Error ? error.message : String(error),
      raw: error,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update lead" },
      { status: 500 },
    );
  }
}
