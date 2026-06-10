import type { PostgrestError } from "@supabase/supabase-js";

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isPostgrestError(error: unknown): error is PostgrestError {
  return Boolean(error && typeof error === "object" && "message" in error && "code" in error);
}

export function logSupabaseError(context: string, error: unknown, attempt?: number) {
  const attemptLabel = attempt != null ? ` (attempt ${attempt})` : "";
  if (isPostgrestError(error)) {
    console.error(`[${context}] Supabase error${attemptLabel}:`, {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return;
  }
  console.error(`[${context}] Error${attemptLabel}:`, error);
}

export function supabaseErrorPayload(error: unknown) {
  if (isPostgrestError(error)) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    };
  }
  return {
    message: error instanceof Error ? error.message : String(error),
  };
}

/** User-facing copy for transient DB/network failures. */
export const LEAD_CREATE_USER_MESSAGE =
  "We couldn't start your estimate right now. Please wait a moment and tap \"Continue with full AI analysis\" again.";

export function isLikelyTransientError(error: unknown): boolean {
  if (!error) return false;
  const message = (isPostgrestError(error) ? error.message : String(error)).toLowerCase();
  return (
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("econnreset") ||
    message.includes("socket") ||
    message.includes("503") ||
    message.includes("502") ||
    message.includes("connection")
  );
}
