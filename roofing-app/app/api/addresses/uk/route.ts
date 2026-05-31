import { NextResponse } from "next/server";
import { formatUkAddressLine } from "@/lib/format-uk-address-line";

type PostcodesIoResponse = {
  status: number;
  result?: {
    postcode?: string;
    latitude?: number;
    longitude?: number;
  };
};

type GetAddressFindResponse = {
  latitude?: number;
  longitude?: number;
  addresses?: string[];
};

function normalizePostcodeInput(postcode: string): string {
  return postcode.replace(/\s+/g, " ").trim();
}

function encodePostcodeForUrl(postcode: string): string {
  return encodeURIComponent(postcode.replace(/\s+/g, "").toUpperCase());
}

async function validateUkPostcode(postcode: string) {
  const encoded = encodeURIComponent(normalizePostcodeInput(postcode));
  const res = await fetch(`https://api.postcodes.io/postcodes/${encoded}`, { cache: "no-store" });
  const data = (await res.json()) as PostcodesIoResponse;

  if (res.status === 404 || data.status === 404) {
    return null;
  }

  if (!res.ok || data.status !== 200 || !data.result) {
    return null;
  }

  const { latitude, longitude } = data.result;
  if (
    latitude == null ||
    longitude == null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  return {
    postcode: data.result.postcode || normalizePostcodeInput(postcode),
    latitude,
    longitude,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("postcode")?.trim();
  if (!raw) {
    return NextResponse.json({ error: "invalid_postcode" }, { status: 400 });
  }

  const validated = await validateUkPostcode(raw);
  if (!validated) {
    return NextResponse.json({ error: "invalid_postcode" }, { status: 404 });
  }

  const apiKey = process.env.GETADDRESS_API_KEY?.trim();
  if (!apiKey || apiKey.includes("paste_")) {
    console.error("[addresses/uk] GETADDRESS_API_KEY is not configured");
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }

  const findUrl = `https://api.getAddress.io/find/${encodePostcodeForUrl(raw)}?api-key=${encodeURIComponent(apiKey)}`;

  try {
    const res = await fetch(findUrl, { cache: "no-store" });
    if (res.status === 404) {
      return NextResponse.json({ error: "no_addresses" }, { status: 404 });
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[addresses/uk] getAddress.io error:", res.status, body);
      return NextResponse.json({ error: "lookup_failed" }, { status: 502 });
    }

    const data = (await res.json()) as GetAddressFindResponse;
    const rawAddresses = data.addresses ?? [];
    const formatted = rawAddresses
      .map((line) => formatUkAddressLine(line, validated.postcode))
      .filter((a) => a.length > 0);

    const unique = [...new Set(formatted)];

    if (unique.length === 0) {
      return NextResponse.json({ error: "no_addresses" }, { status: 404 });
    }

    return NextResponse.json({
      postcode: validated.postcode,
      latitude: validated.latitude,
      longitude: validated.longitude,
      addresses: unique,
    });
  } catch (err) {
    console.error("[addresses/uk] lookup request failed:", err);
    return NextResponse.json({ error: "lookup_failed" }, { status: 502 });
  }
}
