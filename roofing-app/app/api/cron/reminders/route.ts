import { NextResponse } from "next/server";
import { sendInspectionReminderNotifications } from "@/lib/integrations";

export async function POST() {
  await sendInspectionReminderNotifications();
  return NextResponse.json({ ok: true });
}
