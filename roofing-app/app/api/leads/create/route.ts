import { NextRequest, NextResponse } from "next/server";
import { isInServiceArea } from "@/lib/service-area";
import { ensureEnvLoaded } from "@/lib/env.server";
import { getGoogleMapsApiKey, satelliteProxyPath } from "@/lib/maps-static";
import { getSettings, getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  ensureEnvLoaded();
  try {
    const body = await req.json();
    const { address, latitude, longitude, zip_code, email, utm_source, utm_medium, utm_campaign } = body;
    const settings = await getSettings();

    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        {
          error:
            "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in roofing-app/.env.local and restart the dev server.",
        },
        { status: 500 },
      );
    }

    const supabase = getSupabaseAdmin();

    const inServiceArea = isInServiceArea(settings.service_area_zip_codes, zip_code);

    if (!inServiceArea) {
      const { data, error } = await supabase
        .from("leads")
        .insert({
          address,
          latitude,
          longitude,
          zip_code,
          email,
          utm_source,
          utm_medium,
          utm_campaign,
          status: "lost",
          notes: "Waitlist lead: outside service area",
        })
        .select("*")
        .single();
      if (error) throw error;
      return NextResponse.json({ waitlist: true, lead: data });
    }

    const mapsKey = getGoogleMapsApiKey(settings.google_maps_api_key);
    if (!mapsKey) {
      return NextResponse.json(
        { error: "Google Maps API key is missing. Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in roofing-app/.env.local." },
        { status: 500 },
      );
    }

    const satelliteImageUrl = satelliteProxyPath(latitude, longitude);

    const { data: lead, error } = await supabase
      .from("leads")
      .insert({
        address,
        latitude,
        longitude,
        zip_code,
        satellite_image_url: satelliteImageUrl,
        utm_source,
        utm_medium,
        utm_campaign,
        status: "quoted",
        email: email || null,
      })
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({ waitlist: false, lead });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create lead" },
      { status: 500 },
    );
  }
}
