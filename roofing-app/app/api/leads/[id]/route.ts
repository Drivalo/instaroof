import { NextRequest, NextResponse } from "next/server";
import { satelliteImageSrcForLead } from "@/lib/maps-static";
import { getSupabaseAdmin } from "@/lib/supabase";

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
