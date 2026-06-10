import { NextRequest, NextResponse } from "next/server";
import { isInServiceArea } from "@/lib/service-area";
import { ensureEnvLoaded } from "@/lib/env.server";
import { normalizeLeadCountryCode } from "@/lib/normalize-country-code";
import { getGoogleMapsApiKey, satelliteProxyPath } from "@/lib/maps-static";
import { getSettings, getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
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
      property_type,
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
    const normalizedCountryCode = normalizeLeadCountryCode(country_code, {
      address,
      latitude,
      longitude,
    });
    const normalizedPropertyType =
      typeof property_type === "string" && property_type.trim() ? property_type.trim() : null;

    if (!inServiceArea) {
      const { data, error } = await insertLeadWithRetry({
        address,
        latitude,
        longitude,
        zip_code,
        country_code: normalizedCountryCode,
        email,
        phone: phone || null,
        utm_source,
        utm_medium,
        utm_campaign,
        status: "lost",
        notes: "Waitlist lead: outside service area",
      });
      if (error) return buildErrorResponse(error, "waitlist insert failed");
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
      country_code: normalizedCountryCode,
      satellite_image_url: satelliteImageUrl,
      utm_source,
      utm_medium,
      utm_campaign,
      status: "quoted",
      email: email || null,
      phone: phone || null,
      ...(normalizedPropertyType ? { property_type: normalizedPropertyType } : {}),
    });

    if (error) return buildErrorResponse(error, "lead insert failed");

    // BO email is sent when contact details are saved (quote page) so the subject includes the customer name.

    return NextResponse.json({ waitlist: false, lead });
  } catch (error) {
    logSupabaseError("leads/create unexpected", error);
    return buildErrorResponse(error, "unexpected error");
  }
}
