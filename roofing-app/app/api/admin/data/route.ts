import { NextRequest, NextResponse } from "next/server";
import { subDays, format } from "date-fns";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getSettings, getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  const settings = await getSettings();
  const since30 = subDays(new Date(), 30).toISOString();
  const since7 = subDays(new Date(), 7).toISOString();
  const today = format(new Date(), "yyyy-MM-dd");

  const [{ data: leads }, { data: testimonials }, { data: availability }] = await Promise.all([
    supabase.from("leads").select("*").gte("created_at", since30).order("created_at", { ascending: false }),
    supabase.from("testimonials").select("*").order("id"),
    supabase.from("availability").select("*").order("day_of_week"),
  ]);

  const leadsToday = (leads ?? []).filter((l) => l.created_at.slice(0, 10) === today).length;
  const bookingsToday = (leads ?? []).filter(
    (l) => l.status === "booked" && (l.inspection_datetime?.slice(0, 10) || "") === today,
  ).length;
  const revenueToday = (leads ?? [])
    .filter((l) => l.deposit_paid && (l.created_at?.slice(0, 10) || "") === today)
    .reduce((sum, l) => sum + Number(l.stripe_payment_id ? settings.deposit_amount : 0), 0);
  const weekLeads = (leads ?? []).filter((l) => l.created_at >= since7);
  const weekBooked = weekLeads.filter((l) => l.status === "booked" || l.status === "inspected" || l.status === "won");

  return NextResponse.json({
    settings,
    testimonials: testimonials ?? [],
    availability: availability ?? [],
    leads: leads ?? [],
    metrics: {
      leadsToday,
      bookingsToday,
      revenueToday,
      conversionRateWeek: weekLeads.length ? Math.round((weekBooked.length / weekLeads.length) * 100) : 0,
    },
  });
}

export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const supabase = getSupabaseAdmin();
  const action = body.action;

  if (action === "update_settings") {
    const { error } = await supabase.from("settings").update(body.payload).eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (action === "update_lead") {
    const { error } = await supabase.from("leads").update(body.payload).eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (action === "replace_testimonials") {
    await supabase.from("testimonials").delete().neq("id", 0);
    const { error } = await supabase.from("testimonials").insert(body.payload);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (action === "replace_availability") {
    await supabase.from("availability").delete().neq("id", 0);
    const { error } = await supabase.from("availability").insert(body.payload);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
