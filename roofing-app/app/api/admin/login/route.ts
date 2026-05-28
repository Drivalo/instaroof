import { NextRequest, NextResponse } from "next/server";
import { clearAdminCookie, setAdminCookie } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  if (!process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "ADMIN_PASSWORD is not configured" }, { status: 500 });
  }
  if (password !== process.env.ADMIN_PASSWORD) {
    await clearAdminCookie();
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  await setAdminCookie(password);
  return NextResponse.json({ ok: true });
}
