import { NextRequest, NextResponse } from "next/server";

/** Read ISO 3166-1 alpha-2 country from common CDN / platform geo headers. */
function countryFromRequestHeaders(req: NextRequest): string | null {
  const candidates = [
    req.headers.get("x-vercel-ip-country"),
    req.headers.get("cf-ipcountry"),
    req.headers.get("x-country-code"),
    req.headers.get("cloudfront-viewer-country"),
  ];

  for (const raw of candidates) {
    const code = raw?.trim().toUpperCase();
    if (!code || code.length !== 2 || code === "XX" || code === "T1") continue;
    return code.toLowerCase();
  }

  return null;
}

export async function GET(req: NextRequest) {
  const country = countryFromRequestHeaders(req);
  return NextResponse.json({ country });
}
