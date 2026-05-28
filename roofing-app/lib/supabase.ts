import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_SETTINGS } from "@/lib/defaults";
import { readEnv } from "@/lib/env";
import { ensureEnvLoaded } from "@/lib/env.server";
import { SettingsRow } from "@/lib/types";

export function getSupabaseEnv() {
  ensureEnvLoaded();
  return {
    url: readEnv("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRole: readEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

export function isSupabaseConfigured() {
  const { url, serviceRole } = getSupabaseEnv();
  return Boolean(url && serviceRole);
}

export function isSupabaseAnonConfigured() {
  const { url, anonKey } = getSupabaseEnv();
  return Boolean(url && anonKey);
}

export function getSupabaseAdmin(): SupabaseClient {
  const { url, serviceRole } = getSupabaseEnv();
  if (!url || !serviceRole) {
    throw new Error(
      "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to roofing-app/.env.local, then restart npm run dev.",
    );
  }
  return createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function getSupabaseAnon(): SupabaseClient {
  const { url, anonKey } = getSupabaseEnv();
  if (!url || !anonKey) {
    throw new Error(
      "Supabase anon client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in roofing-app/.env.local.",
    );
  }
  return createClient(url, anonKey);
}

function defaultSettingsFromEnv(): SettingsRow {
  return {
    id: 0,
    ...DEFAULT_SETTINGS,
    google_maps_api_key: readEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY") || null,
    stripe_publishable_key: readEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY") || null,
    stripe_secret_key: readEnv("STRIPE_SECRET_KEY") || null,
  };
}

export async function getSettings(): Promise<SettingsRow> {
  if (!isSupabaseConfigured()) {
    return defaultSettingsFromEnv();
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("settings").select("*").limit(1).maybeSingle();

  if (error) {
    console.error("settings fetch failed:", error.message);
    return defaultSettingsFromEnv();
  }

  if (data) {
    const row = data as SettingsRow;
    const legacyZips = ["90210", "90211", "90001"];
    const isLegacyList =
      row.service_area_zip_codes?.length === legacyZips.length &&
      legacyZips.every((zip) => row.service_area_zip_codes.includes(zip));

    if (isLegacyList) {
      const { error: clearError } = await supabase
        .from("settings")
        .update({ service_area_zip_codes: [] })
        .eq("id", row.id);
      if (!clearError) row.service_area_zip_codes = [];
      else console.error("clear legacy service area failed:", clearError.message);
    }

    return {
      ...row,
      google_maps_api_key: row.google_maps_api_key || readEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY") || null,
    };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("settings")
    .insert({
      ...DEFAULT_SETTINGS,
      google_maps_api_key: readEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY") || null,
    })
    .select("*")
    .single();

  if (insertError || !inserted) {
    console.error("settings insert failed:", insertError?.message);
    return defaultSettingsFromEnv();
  }

  return inserted as SettingsRow;
}
