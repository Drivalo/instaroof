import { NextRequest, NextResponse } from "next/server";
import { isInServiceArea } from "@/lib/service-area";
import { ensureEnvLoaded } from "@/lib/env.server";
import { getGoogleMapsApiKey, satelliteProxyPath } from "@/lib/maps-static";
import { getSettings, getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { sendLeadNotificationEmail } from "@/lib/lead-notification";
import {
  LEAD_CREATE_USER_MESSAGE,
  isLikelyTransientError,
  isPostgrestError,
  logSupabaseError,
  sleep,
  supabaseErrorPayload,
} from "@/lib/supabase-errors";

const RETRY_DELAY_MS = 1000;
const MAX_ATTEMPTS = 2;

type LeadInsertPayload = Record<string, unknown>;

async function insertLeadWithRetry(payload: LeadInsertPayload) {
  let lastError: unknown = null;
  let attemptPayload = { ...payload };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("leads").insert(attemptPayload).select("*").single();

    if (!error) {
      if (attempt > 1) {
        console.info(`[leads/create] Supabase insert succeeded on attempt ${attempt}`);
      }
      return { data, error: null };
    }

    lastError = error;
    logSupabaseError("leads/create", error, attempt);

    if (
      isPostgrestError(error) &&
      error.message.includes("country_code") &&
      "country_code" in attemptPayload
    ) {
      console.warn("[leads/create] Retrying without country_code — run supabase/migrations/add_country_code.sql");
      const { country_code, ...withoutCountry } = attemptPayload;
      void country_code;
      attemptPayload = withoutCountry;
    }

    if (attempt < MAX_ATTEMPTS) {
      console.info(`[leads/create] Retrying insert in ${RETRY_DELAY_MS}ms...`);
      await sleep(RETRY_DELAY_MS);
    }
  }

  return { data: null, error: lastError };
}

async function loadSettingsWithRetry() {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const settings = await getSettings();
      return { settings, error: null };
    } catch (error) {
      lastError = error;
      logSupabaseError("leads/create settings", error, attempt);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  return { settings: null, error: lastError };
}

function buildErrorResponse(error: unknown, context: string) {
  const transient = isLikelyTransientError(error);
  const supabase = supabaseErrorPayload(error);
  const technical =
    (isPostgrestError(error) && error.message) ||
    (error instanceof Error ? error.message : null) ||
    "Failed to create lead";

  console.error(`[leads/create] ${context}:`, supabase);

  return NextResponse.json(
    {
      error: technical,
      userMessage: LEAD_CREATE_USER_MESSAGE,
      retryable: true,
      transient,
      supabase,
      attempts: MAX_ATTEMPTS,
    },
    { status: 500 },
  );
}

export async function POST(req: NextRequest) {
  ensureEnvLoaded();

  try {
    const body = await req.json();
    const {
      address,
      latitude,
      longitude,
      zip_code,
      country_code,
      email,
      phone,
      utm_source,
      utm_medium,
      utm_campaign,
    } = body;

    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        {
          error:
            "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in roofing-app/.env.local and restart the dev server.",
          userMessage: "The app is not connected to the database. Please contact support.",
          retryable: false,
        },
        { status: 500 },
      );
    }

    const { settings, error: settingsError } = await loadSettingsWithRetry();
    if (settingsError || !settings) {
      return buildErrorResponse(settingsError, "load settings failed");
    }

    const inServiceArea = isInServiceArea(settings.service_area_zip_codes, zip_code);

    if (!inServiceArea) {
      const { data, error } = await insertLeadWithRetry({
        address,
        latitude,
        longitude,
        zip_code,
        country_code: country_code || null,
        email,
        phone: phone || null,
        utm_source,
        utm_medium,
        utm_campaign,
        status: "lost",
        notes: "Waitlist lead: outside service area",
      });
      if (error) return buildErrorResponse(error, "waitlist insert failed");
      void sendLeadNotificationEmail(data.id, req.nextUrl.origin, "submitted").catch((err) =>
        console.error("[leads/create] waitlist notification failed:", err),
      );
      return NextResponse.json({ waitlist: true, lead: data });
    }

    const mapsKey = getGoogleMapsApiKey(settings.google_maps_api_key);
    if (!mapsKey) {
      return NextResponse.json(
        {
          error: "Google Maps API key is missing. Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in roofing-app/.env.local.",
          userMessage: "Maps is not configured. Please contact support.",
          retryable: false,
        },
        { status: 500 },
      );
    }

    const satelliteImageUrl = satelliteProxyPath(latitude, longitude);

    const { data: lead, error } = await insertLeadWithRetry({
      address,
      latitude,
      longitude,
      zip_code,
      country_code: country_code || null,
      satellite_image_url: satelliteImageUrl,
      utm_source,
      utm_medium,
      utm_campaign,
      status: "quoted",
      email: email || null,
      phone: phone || null,
    });

    if (error) return buildErrorResponse(error, "lead insert failed");

    // BO email is sent when contact details are saved (quote page) so the subject includes the customer name.

    return NextResponse.json({ waitlist: false, lead });
  } catch (error) {
    logSupabaseError("leads/create unexpected", error);
    return buildErrorResponse(error, "unexpected error");
  }
}
