import { NextRequest, NextResponse } from "next/server";
import { ensureEnvLoaded } from "@/lib/env.server";
import { getGoogleMapsApiKey, mapsStaticSatelliteUrl } from "@/lib/maps-static";

export async function GET(req: NextRequest) {
  ensureEnvLoaded();

  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set in roofing-app/.env.local" },
      { status: 500 },
    );
  }

  const staticUrl = mapsStaticSatelliteUrl(lat, lng, apiKey);

  try {
    const upstream = await fetch(staticUrl);
    const contentType = upstream.headers.get("content-type") || "image/png";

    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error("Google Static Maps error:", upstream.status, detail.slice(0, 500));
      return NextResponse.json(
        {
          error: "Google Static Maps API did not return an image. Enable Maps Static API for this key.",
          status: upstream.status,
        },
        { status: 502 },
      );
    }

    if (!contentType.startsWith("image/")) {
      const detail = await upstream.text();
      console.error("Google Static Maps non-image response:", detail.slice(0, 500));
      return NextResponse.json(
        { error: "Google Static Maps returned an error instead of an image." },
        { status: 502 },
      );
    }

    const image = await upstream.arrayBuffer();
    return new NextResponse(image, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error("satellite proxy fetch failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch satellite image" },
      { status: 500 },
    );
  }
}
