import { NextResponse } from "next/server";
import { DEFAULT_SETTINGS } from "@/lib/defaults";
import { readEnv } from "@/lib/env";
import { ensureEnvLoaded } from "@/lib/env.server";
import { getSettings, getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export async function GET() {
  ensureEnvLoaded();

  try {
    const settings = await getSettings();

    let testimonials: unknown[] = [];
    let availability: unknown[] = [];

    if (isSupabaseConfigured()) {
      const supabase = getSupabaseAdmin();
      const [testimonialsResult, availabilityResult] = await Promise.all([
        supabase.from("testimonials").select("*").order("id", { ascending: true }).limit(20),
        supabase.from("availability").select("*").order("day_of_week", { ascending: true }),
      ]);

      if (testimonialsResult.error) {
        console.error("testimonials fetch failed:", testimonialsResult.error.message);
      } else {
        testimonials = testimonialsResult.data ?? [];
      }

      if (availabilityResult.error) {
        console.error("availability fetch failed:", availabilityResult.error.message);
      } else {
        availability = availabilityResult.data ?? [];
      }
    }

    return NextResponse.json({
      settings,
      testimonials,
      availability,
      supabaseConfigured: isSupabaseConfigured(),
    });
  } catch (error) {
    console.error("bootstrap error:", error);
    return NextResponse.json({
      settings: {
        id: 0,
        ...DEFAULT_SETTINGS,
        google_maps_api_key: readEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY") || null,
      },
      testimonials: [],
      availability: [],
      supabaseConfigured: isSupabaseConfigured(),
      warning: error instanceof Error ? error.message : "Bootstrap fallback used",
    });
  }
}
