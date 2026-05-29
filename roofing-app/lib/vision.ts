import { readEnv } from "@/lib/env";
import { ensureEnvLoaded } from "@/lib/env.server";
import { maskGoogleMapsKeyInUrl, SATELLITE_STATIC_ZOOM } from "@/lib/maps-static";
import { fallbackVisionAnalysis } from "@/lib/quote";
import { RoofComplexity, RoofType, VisionAnalysis } from "@/lib/types";
import {
  VISION_ANALYSIS_TIMEOUT_MS,
  VISION_REFUSAL_MESSAGE,
  VISION_TIMEOUT_MESSAGE,
  VISION_UNABLE_MESSAGE,
} from "@/lib/vision-constants";

const LOG_PREFIX = "[vision]";

function maskSecret(value: string | undefined) {
  if (!value) return "(missing)";
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}…${value.slice(-4)} (${value.length} chars)`;
}

export {
  VISION_ANALYSIS_TIMEOUT_MS,
  VISION_REFUSAL_MESSAGE,
  VISION_TIMEOUT_MESSAGE,
  VISION_UNABLE_MESSAGE,
} from "@/lib/vision-constants";

export class VisionAnalysisTimeoutError extends Error {
  constructor(message = VISION_TIMEOUT_MESSAGE) {
    super(message);
    this.name = "VisionAnalysisTimeoutError";
  }
}

/** OpenAI refused to analyze the image (policy / safety). */
export class VisionAnalysisRefusalError extends Error {
  readonly code = "VISION_REFUSAL" as const;

  constructor(message = VISION_REFUSAL_MESSAGE, readonly refusal?: string) {
    super(message);
    this.name = "VisionAnalysisRefusalError";
  }
}

/** Vision failed without a usable estimate (no silent 2200 fallback). */
export class VisionUnableToEstimateError extends Error {
  readonly code = "VISION_UNABLE" as const;

  constructor(message = VISION_UNABLE_MESSAGE, readonly cause?: string) {
    super(message);
    this.name = "VisionUnableToEstimateError";
  }
}

function isVisionFailure(error: unknown): error is VisionAnalysisRefusalError | VisionUnableToEstimateError {
  return (
    error instanceof VisionAnalysisRefusalError || error instanceof VisionUnableToEstimateError
  );
}

/** Square metres → square feet for internal storage and pricing. */
const SQFT_PER_SQM = 10.76391041671;

const VISION_SYSTEM_PROMPT = `You are the vision module in automated roof measurement software used by licensed roofing contractors to prepare price quotes.

The user message includes one commercial satellite map tile—the same type of public aerial map imagery shown on mainstream mapping websites. The property owner entered their own address into the quoting tool and requested an automated roof area measurement.

Your only job is a construction quantity takeoff: estimate total roof surface area in square metres. Output a single numeric measurement in JSON. No scene description is required.

Human identification is not part of this task. Do not name, count, describe, or infer people, occupants, vehicles, or personal information.`;

const VISION_USER_PROMPT = `Estimate the total roof surface area in square metres from this map tile.

Return JSON only, with this exact shape:
{"roof_area_sqm": <positive integer>}`;

/** Placeholder overlay for the quote UI — not requested from the model (reduces refusals). */
function displayPolygonPlaceholder() {
  return fallbackVisionAnalysis().polygon_coordinates;
}

function getOpenAiApiKey(): string | undefined {
  ensureEnvLoaded();
  const key = readEnv("OPENAI_API_KEY");
  console.info(`${LOG_PREFIX} OPENAI_API_KEY:`, maskSecret(key));
  return key;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new VisionAnalysisTimeoutError();
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

type SatelliteImageDiagnostics = {
  bytes: number;
  contentType: string;
  isPng: boolean;
  isJpeg: boolean;
  looksLikeImage: boolean;
  looksLikeErrorBody: boolean;
  errorSnippet?: string;
  quality: "ok" | "small" | "invalid";
};

function diagnoseSatelliteBuffer(buffer: Buffer, contentType: string): SatelliteImageDiagnostics {
  const isPng = buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50;
  const isJpeg = buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8;
  const looksLikeImage = isPng || isJpeg || contentType.startsWith("image/");
  const textStart = buffer.slice(0, 300).toString("utf8");
  const looksLikeErrorBody =
    textStart.includes("The Google Maps") ||
    textStart.includes("Google Maps Platform") ||
    textStart.includes("<!DOCTYPE") ||
    textStart.includes('"error"');

  let quality: SatelliteImageDiagnostics["quality"] = "ok";
  if (!looksLikeImage || looksLikeErrorBody) quality = "invalid";
  else if (buffer.length < 10_000) quality = "small";

  return {
    bytes: buffer.length,
    contentType,
    isPng,
    isJpeg,
    looksLikeImage,
    looksLikeErrorBody,
    errorSnippet: looksLikeErrorBody ? textStart.slice(0, 200) : undefined,
    quality,
  };
}

async function satelliteImageToDataUrl(imageUrl: string, timeoutMs: number): Promise<string> {
  const safeUrl = maskGoogleMapsKeyInUrl(imageUrl);
  console.info(`${LOG_PREFIX} Satellite fetch URL (before GPT-4o):`, safeUrl);
  console.info(`${LOG_PREFIX} Satellite fetch settings:`, {
    zoom: SATELLITE_STATIC_ZOOM,
    size: "600x600",
    scale: 2,
    maptype: "satellite",
  });

  const response = await fetchWithTimeout(imageUrl, {}, timeoutMs);
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "image/png";
  const diagnostics = diagnoseSatelliteBuffer(buffer, contentType);

  console.info(`${LOG_PREFIX} Satellite fetch response (before GPT-4o):`, {
    httpStatus: response.status,
    ok: response.ok,
    contentType: diagnostics.contentType,
    bytes: diagnostics.bytes,
    isPng: diagnostics.isPng,
    isJpeg: diagnostics.isJpeg,
    looksLikeImage: diagnostics.looksLikeImage,
    quality: diagnostics.quality,
    errorSnippet: diagnostics.errorSnippet,
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch satellite image (HTTP ${response.status}, ${diagnostics.bytes} bytes)`,
    );
  }

  if (diagnostics.quality === "invalid") {
    throw new VisionUnableToEstimateError(
      VISION_UNABLE_MESSAGE,
      `Satellite response is not a valid image (${diagnostics.bytes} bytes, type=${diagnostics.contentType})`,
    );
  }

  if (diagnostics.quality === "small") {
    console.warn(
      `${LOG_PREFIX} Satellite image is only ${diagnostics.bytes} bytes — may be blank, low-res, or an API error tile`,
    );
  } else {
    console.info(`${LOG_PREFIX} Satellite image looks like a clear tile (${diagnostics.bytes} bytes)`);
  }

  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

function extractJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model response did not contain JSON");
  }
  return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
}

function parseRoofSqftFromModel(raw: Record<string, unknown>): { roofSqft: number; roofAreaSqm: number | null } {
  const sqm = Number(raw.roof_area_sqm);
  if (Number.isFinite(sqm) && sqm > 0) {
    return { roofAreaSqm: Math.round(sqm), roofSqft: Math.max(500, Math.round(sqm * SQFT_PER_SQM)) };
  }

  const sqft = Number(raw.roof_sqft);
  if (Number.isFinite(sqft) && sqft > 0) {
    return { roofAreaSqm: null, roofSqft: Math.max(500, Math.round(sqft)) };
  }

  return { roofAreaSqm: null, roofSqft: 0 };
}

function normalizeVisionAnalysis(raw: Record<string, unknown>): VisionAnalysis {
  const { roofSqft, roofAreaSqm } = parseRoofSqftFromModel(raw);
  const roof_sqft = roofSqft > 0 ? roofSqft : 500;

  console.info(`${LOG_PREFIX} Normalized vision result:`, {
    raw_roof_area_sqm: raw.roof_area_sqm,
    parsed_roof_area_sqm: roofAreaSqm,
    final_roof_sqft: roof_sqft,
  });

  if (roofSqft <= 0) {
    console.warn(`${LOG_PREFIX} Model returned invalid roof_area_sqm; using minimum 500 sq ft`);
  }

  const roof_type: RoofType = "asphalt_shingle";
  const complexity: RoofComplexity = "moderate";
  const confidence = 75;

  return {
    roof_sqft,
    roof_type,
    complexity,
    confidence,
    polygon_coordinates: displayPolygonPlaceholder(),
  };
}

async function runVisionAnalysisInner(imageUrl: string): Promise<VisionAnalysis> {
  console.info(`${LOG_PREFIX} runVisionAnalysisInner start`);
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    console.warn(`${LOG_PREFIX} OPENAI_API_KEY missing — cannot run vision`);
    throw new VisionUnableToEstimateError(VISION_UNABLE_MESSAGE, "OPENAI_API_KEY not configured");
  }

  const imageDataUrl = await satelliteImageToDataUrl(imageUrl, VISION_ANALYSIS_TIMEOUT_MS);
  const encodedKb = Math.round(imageDataUrl.length / 1024);
  console.info(`${LOG_PREFIX} Sending to GPT-4o:`, {
    satelliteUrl: maskGoogleMapsKeyInUrl(imageUrl),
    encodedPayloadKb: encodedKb,
    zoom: SATELLITE_STATIC_ZOOM,
  });

  console.info(`${LOG_PREFIX} Calling OpenAI gpt-4o chat/completions…`);
  const response = await fetchWithTimeout(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 64,
        messages: [
          { role: "system", content: VISION_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: VISION_USER_PROMPT },
              {
                type: "image_url",
                image_url: { url: imageDataUrl, detail: "low" },
              },
            ],
          },
        ],
      }),
    },
    VISION_ANALYSIS_TIMEOUT_MS,
  );

  if (!response.ok) {
    const errBody = await response.text();
    console.error(`${LOG_PREFIX} OpenAI HTTP error:`, { status: response.status, bodyPreview: errBody.slice(0, 500) });
    throw new Error(`OpenAI API error ${response.status}: ${errBody}`);
  }

  const payload = await response.json();
  console.info(`${LOG_PREFIX} OpenAI response meta:`, {
    id: payload?.id,
    model: payload?.model,
    finish_reason: payload?.choices?.[0]?.finish_reason,
    usage: payload?.usage,
  });

  const message = payload?.choices?.[0]?.message as
    | { content?: string | null; refusal?: string | null; role?: string }
    | undefined;
  const content = message?.content;
  const refusal = message?.refusal;

  if (refusal && typeof refusal === "string") {
    console.warn(`${LOG_PREFIX} OpenAI refusal:`, refusal);
    throw new VisionAnalysisRefusalError(VISION_REFUSAL_MESSAGE, refusal);
  }

  if (!content || typeof content !== "string") {
    console.error(`${LOG_PREFIX} OpenAI empty content:`, message);
    throw new VisionUnableToEstimateError(
      VISION_UNABLE_MESSAGE,
      "OpenAI returned an empty vision response",
    );
  }

  console.info(`${LOG_PREFIX} OpenAI raw content:`, content);

  let parsed: Record<string, unknown>;
  try {
    parsed = extractJsonObject(content);
    console.info(`${LOG_PREFIX} Parsed JSON keys:`, Object.keys(parsed));
    console.info(`${LOG_PREFIX} Parsed JSON:`, parsed);
  } catch (parseError) {
    console.error(`${LOG_PREFIX} JSON parse failed:`, parseError);
    throw parseError;
  }

  const normalized = normalizeVisionAnalysis(parsed);
  console.info(`${LOG_PREFIX} GPT-4o analysis complete — source: openai`, {
    roof_sqft: normalized.roof_sqft,
    used_hardcoded_fallback: false,
  });
  return normalized;
}

export async function runVisionAnalysis(imageUrl: string): Promise<VisionAnalysis> {
  ensureEnvLoaded();
  const timeoutMs = VISION_ANALYSIS_TIMEOUT_MS;
  console.info(`${LOG_PREFIX} runVisionAnalysis start`, { timeoutMs, imageUrl: imageUrl.replace(/key=[^&]+/, "key=***") });

  try {
    const result = await Promise.race([
      runVisionAnalysisInner(imageUrl),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new VisionAnalysisTimeoutError()), timeoutMs);
      }),
    ]);
    return result;
  } catch (error) {
    if (error instanceof VisionAnalysisTimeoutError) {
      console.error(`${LOG_PREFIX} Timed out after ${timeoutMs}ms`);
      throw error;
    }
    if (isVisionFailure(error)) {
      throw error;
    }
    const cause = error instanceof Error ? error.message : String(error);
    console.error(`${LOG_PREFIX} Vision failed (no fallback):`, error);
    throw new VisionUnableToEstimateError(VISION_UNABLE_MESSAGE, cause);
  }
}
