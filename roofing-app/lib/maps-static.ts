import { readEnv } from "@/lib/env";

export function getGoogleMapsApiKey(override?: string | null): string | undefined {
  const fromOverride = override?.trim();
  if (fromOverride && !fromOverride.includes("paste_")) return fromOverride;
  return readEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY");
}

/** Zoom for Static Maps — 21 often returns blank grey tiles where aerial imagery is unavailable. */
export const SATELLITE_STATIC_ZOOM = 19;

export function maskGoogleMapsKeyInUrl(url: string) {
  return url.replace(/key=[^&]+/, "key=***");
}

/** Google Static Maps satellite image URL (server-side fetch / vision). */
export function mapsStaticSatelliteUrl(lat: number, lng: number, googleMapsApiKey?: string | null) {
  const apiKey = getGoogleMapsApiKey(googleMapsApiKey);
  const params = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: String(SATELLITE_STATIC_ZOOM),
    size: "600x600",
    scale: "2",
    maptype: "satellite",
  });
  if (apiKey) params.set("key", apiKey);
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

/** Same-origin proxy path for browser display (keeps key on server). */
export function satelliteProxyPath(lat: number, lng: number) {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
  });
  return `/api/maps/satellite?${params.toString()}`;
}

export function satelliteImageSrcForLead(lead: {
  latitude?: number | null;
  longitude?: number | null;
  satellite_image_url?: string | null;
}) {
  if (lead.latitude != null && lead.longitude != null) {
    return satelliteProxyPath(lead.latitude, lead.longitude);
  }
  const stored = lead.satellite_image_url?.trim();
  if (stored?.startsWith("/api/maps/satellite")) return stored;
  return stored || "";
}
