import { NextRequest, NextResponse } from "next/server";
import { ensureEnvLoaded } from "@/lib/env.server";
import { sendLeadNotificationEmail, LeadNotificationContext } from "@/lib/lead-notification";

const VALID_CONTEXTS: LeadNotificationContext[] = ["submitted", "analysis_complete", "contact_updated"];

export async function POST(req: NextRequest) {
  ensureEnvLoaded();

  try {
    const body = await req.json();
    const leadId = Number(body.leadId ?? body.lead_id);
    const context = (body.context as LeadNotificationContext) || "submitted";

    if (!Number.isFinite(leadId) || leadId <= 0) {
      return NextResponse.json({ error: "leadId is required" }, { status: 400 });
    }

    if (!VALID_CONTEXTS.includes(context)) {
      return NextResponse.json({ error: "Invalid context" }, { status: 400 });
    }

    const result = await sendLeadNotificationEmail(leadId, req.nextUrl.origin, context);

    if (!result.sent && !result.skipped) {
      return NextResponse.json({ error: result.reason || "Failed to send notification" }, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Notification failed" },
      { status: 500 },
    );
  }
}
