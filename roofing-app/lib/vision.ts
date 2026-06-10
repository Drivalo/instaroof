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

type VisionCountry = "GB" | "AU" | "NZ" | "US_CA" | "DEFAULT";

function normalizeVisionCountry(countryCode: string | null | undefined): VisionCountry {
  const code = String(countryCode ?? "")
    .trim()
    .toUpperCase();
  if (code === "UK" || code === "GB") return "GB";
  if (code === "AU" || code === "AUS") return "AU";
  if (code === "NZ" || code === "NZL") return "NZ";
  if (code === "US" || code === "CA") return "US_CA";
  return "DEFAULT";
}

function countryRoofSizeGuidance(countryCode: string | null | undefined): string {
  const code = String(countryCode ?? "")
    .trim()
    .toUpperCase();
  if (code === "UK" || code === "GB") {
    return "UK terraced houses typically have roofs of 50-80 sqm. Semi-detached houses are typically 70-110 sqm. Detached houses are typically 100-200 sqm. Measure the actual roof visible in the image — do not estimate from the midpoint of these ranges.";
  }
  if (code === "AU" || code === "AUS") {
    return "Australian homes vary significantly. A small cottage may be 80-120 sqm. A typical suburban home is 130-180 sqm. A large home is 200-300 sqm. Measure the actual roof visible in the image — do not estimate from the midpoint of these ranges.";
  }
  if (code === "NZ" || code === "NZL") {
    return "New Zealand homes typically have roofs of 80-180 sqm. Measure the actual roof visible in the image — do not estimate from the midpoint of these ranges.";
  }
  if (code === "US") {
    return "US single-family homes typically have roofs of 140-280 sqm. Measure the actual roof visible in the image — do not estimate from the midpoint of these ranges.";
  }
  if (code === "CA") {
    return "Canadian single-family homes typically have roofs of 120-250 sqm. Measure the actual roof visible in the image — do not estimate from the midpoint of these ranges.";
  }
  return "A typical residential property has a roof area of 80-250 sqm.";
}

/** Suspicious-AI cap fallback only (not Stage 1 medians). Country medians: lib/roof-estimate STAGE1_SUPPORTED_COUNTRY_MEDIAN_ROOF_SQM. */
function suspiciousRoofAreaFallbackSqm(country: VisionCountry): number {
  switch (country) {
    case "GB":
      return 100;
    case "AU":
    case "NZ":
      return 150;
    case "US_CA":
      return 180;
    default:
      return 120;
  }
}

function defaultRoofTypeForCountry(country: VisionCountry): RoofType {
  switch (country) {
    case "GB":
      return "tile";
    case "AU":
    case "NZ":
      return "metal";
    case "US_CA":
      return "asphalt_shingle";
    default:
      return "tile";
  }
}

const ROOF_AREA_SQM_SUSPICIOUS_CAP = 500;

const VISION_SYSTEM_PROMPT = `You are the vision module in automated roof measurement software used by licensed roofing contractors to prepare price quotes.

The user message includes one commercial satellite map tile—the same type of public aerial map imagery shown on mainstream mapping websites. The property owner entered their own address into the quoting tool and requested an automated roof area measurement.

Your only job is a construction quantity takeoff: estimate total roof surface area in square metres for ONE house only. Output JSON measurements. No scene description is required.

Measure ONLY the roof of the single residential property at the centre of the image. Ignore neighbouring properties, gardens, roads, driveways, and any other structures.

Human identification is not part of this task. Do not name, count, describe, or infer people, occupants, vehicles, or personal information.`;

function buildVisionUserPrompt(
  countryCode: string | null | undefined,
  tileSpanMetres?: number,
): string {
  const scaleReference =
    tileSpanMetres != null
      ? `\n\nThe satellite tile covers approximately ${tileSpanMetres} metres across — use this as a scale reference when estimating roof area.`
      : "";
  return `Estimate the total roof surface area in square metres from this map tile.

CRITICAL: Measure ONLY the roof of the single residential property at the centre of the image. Do not include neighbouring roofs, the full building footprint on multiple lots, gardens, roads, or the entire satellite tile.

If your estimate exceeds 400 sqm for a single residential property, you are likely measuring too large an area. Remeasure focusing only on the central property's roof.

Also infer the visible roof material type and your confidence (0-100) in that inference.

Additionally, return a roof_visible boolean. Set it to true ONLY if you can clearly identify a residential or commercial roof structure at the centre of the image. If you see terrain, trees, fields, water, or cannot identify a clear roof, set roof_visible to false and provide a brief fallback_reason string explaining what you see instead.

Return JSON only, with this exact shape:
{"roof_area_sqm": <positive integer>, "roof_type": "<material id>", "confidence": <integer 0-100>, "roof_visible": <boolean>, "fallback_reason": <string or null>}
Use one of these roof_type values: asphalt_shingle, concrete_tile, colorbond, metal, tile, flat, slate.${scaleReference}`;
}

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

const METRIC_DISPLAY_SQFT_TO_SQM = 0.092903;

function logRoofAreaConversionTrace(args: {
  sourceField: string;
  rawAiPayload: Record<string, unknown>;
  aiRoofAreaSqm: number | null;
  aiRoofSqftField: number | null;
  storedRoofSqft: number;
  interpretationNote: string;
}) {
  const displaySqmFromStored = Math.round(args.storedRoofSqft * METRIC_DISPLAY_SQFT_TO_SQM);
  console.info(`${LOG_PREFIX} Roof area calculation trace`, {
    measurement_target: "roof_surface_area (prompt asks AI for sqm, not whole plot)",
    source_field_used: args.sourceField,
    raw_ai_json: args.rawAiPayload,
    ai_roof_area_sqm: args.aiRoofAreaSqm,
    ai_roof_sqft_field: args.aiRoofSqftField,
    interpretation: args.interpretationNote,
    sqft_per_sqm_multiplier: SQFT_PER_SQM,
    stored_roof_sqft_internal: args.storedRoofSqft,
    customer_display_if_metric_market: `${displaySqmFromStored} m² (roof_sqft * ${METRIC_DISPLAY_SQFT_TO_SQM})`,
    customer_display_if_imperial_market: `${args.storedRoofSqft} sq ft (stored value as-is)`,
    unit_mismatch_hint:
      args.aiRoofAreaSqm != null && args.aiRoofAreaSqm > 400
        ? "AI sqm is high for a typical home; model may be measuring building footprint, full map tile, or returning sq ft in roof_area_sqm"
        : null,
  });
}

function parseRoofSqftFromModel(
  raw: Record<string, unknown>,
  countryCode: string | null | undefined,
): { roofSqft: number; roofAreaSqm: number | null; areaCappedAsSuspicious: boolean } {
  const country = normalizeVisionCountry(countryCode);
  const rawSqm = raw.roof_area_sqm;
  const rawSqft = raw.roof_sqft;
  console.info(`${LOG_PREFIX} parseRoofSqftFromModel raw AI fields`, {
    roof_area_sqm: rawSqm,
    roof_sqft: rawSqft,
    json_keys: Object.keys(raw),
    country,
  });

  const sqm = Number(rawSqm);
  if (Number.isFinite(sqm) && sqm > 0) {
    let roofAreaSqm = Math.round(sqm);
    let areaCappedAsSuspicious = false;
    if (roofAreaSqm > ROOF_AREA_SQM_SUSPICIOUS_CAP) {
      const fallbackSqm = suspiciousRoofAreaFallbackSqm(country);
      console.warn(`${LOG_PREFIX} roof_area_sqm exceeds ${ROOF_AREA_SQM_SUSPICIOUS_CAP} — suspicious, using country fallback`, {
        ai_roof_area_sqm: roofAreaSqm,
        fallback_sqm: fallbackSqm,
        country,
      });
      roofAreaSqm = fallbackSqm;
      areaCappedAsSuspicious = true;
    }
    const roofSqft = Math.max(500, Math.round(roofAreaSqm * SQFT_PER_SQM));
    logRoofAreaConversionTrace({
      sourceField: areaCappedAsSuspicious ? "roof_area_sqm (capped fallback)" : "roof_area_sqm",
      rawAiPayload: raw,
      aiRoofAreaSqm: roofAreaSqm,
      aiRoofSqftField: Number.isFinite(Number(rawSqft)) ? Number(rawSqft) : null,
      storedRoofSqft: roofSqft,
      interpretationNote: areaCappedAsSuspicious
        ? `AI sqm exceeded ${ROOF_AREA_SQM_SUSPICIOUS_CAP}; replaced with country fallback ${roofAreaSqm} sqm then converted to sqft`
        : `Treated roof_area_sqm as square metres; converted to internal sqft via sqm * ${SQFT_PER_SQM}`,
    });
    return { roofAreaSqm, roofSqft, areaCappedAsSuspicious };
  }

  const sqft = Number(rawSqft);
  if (Number.isFinite(sqft) && sqft > 0) {
    const roofSqft = Math.max(500, Math.round(sqft));
    logRoofAreaConversionTrace({
      sourceField: "roof_sqft",
      rawAiPayload: raw,
      aiRoofAreaSqm: null,
      aiRoofSqftField: roofSqft,
      storedRoofSqft: roofSqft,
      interpretationNote: "Used legacy roof_sqft field as square feet with no sqm conversion",
    });
    return { roofAreaSqm: null, roofSqft, areaCappedAsSuspicious: false };
  }

  console.warn(`${LOG_PREFIX} parseRoofSqftFromModel no valid area in AI JSON`, { raw });
  return { roofAreaSqm: null, roofSqft: 0, areaCappedAsSuspicious: false };
}

function mapModelRoofTypeToRoofType(value: unknown): RoofType | null {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (!normalized) return null;
  if (["asphalt_shingle", "asphalt_shingles", "shingle", "shingles"].includes(normalized)) {
    return "asphalt_shingle";
  }
  if (["colorbond", "zincalume", "metal", "steel"].includes(normalized)) return "metal";
  if (
    [
      "concrete_tile",
      "concrete_tiles",
      "tile",
      "tiles",
      "terracotta",
      "terracotta_tiles",
      "clay",
      "clay_terracotta",
      "slate",
    ].includes(normalized)
  ) {
    return "tile";
  }
  if (["flat", "felt_flat", "felt"].includes(normalized)) return "flat";
  return null;
}

function resolveRoofType(
  raw: Record<string, unknown>,
  countryCode: string | null | undefined,
): { roof_type: RoofType; confidence: number } {
  const country = normalizeVisionCountry(countryCode);
  const defaultType = defaultRoofTypeForCountry(country);
  const rawConfidence = Number(raw.confidence);
  const confidence = Number.isFinite(rawConfidence)
    ? Math.min(100, Math.max(0, Math.round(rawConfidence)))
    : 0;
  const parsedType = mapModelRoofTypeToRoofType(raw.roof_type);

  if (confidence < 80) {
    console.info(`${LOG_PREFIX} roof_type confidence below 80 — using country default`, {
      confidence,
      parsedType,
      defaultType,
      country,
    });
    return { roof_type: defaultType, confidence: confidence > 0 ? confidence : 75 };
  }

  if (parsedType) {
    return { roof_type: parsedType, confidence };
  }

  console.info(`${LOG_PREFIX} roof_type not recognized in AI JSON — using country default`, {
    raw_roof_type: raw.roof_type,
    defaultType,
    country,
  });
  return { roof_type: defaultType, confidence: confidence > 0 ? confidence : 75 };
}

function normalizeVisionAnalysis(
  raw: Record<string, unknown>,
  countryCode: string | null | undefined,
): VisionAnalysis {
  const { roofSqft, roofAreaSqm, areaCappedAsSuspicious } = parseRoofSqftFromModel(raw, countryCode);
  const roof_sqft = roofSqft > 0 ? roofSqft : 500;
  const { roof_type, confidence } = resolveRoofType(raw, countryCode);
  const complexity: RoofComplexity = "moderate";

  console.info(`${LOG_PREFIX} Normalized vision result:`, {
    raw_roof_area_sqm: raw.roof_area_sqm,
    parsed_roof_area_sqm: roofAreaSqm,
    area_capped_as_suspicious: areaCappedAsSuspicious,
    final_roof_sqft: roof_sqft,
    roof_type,
    confidence,
  });

  if (roofSqft <= 0) {
    console.warn(`${LOG_PREFIX} Model returned invalid roof_area_sqm; using minimum 500 sq ft`);
  }

  return {
    roof_sqft,
    roof_area_sqm: roofAreaSqm,
    roof_type,
    complexity,
    confidence,
    roof_visible: raw.roof_visible === false ? false : true,
    fallback_reason: typeof raw.fallback_reason === "string" ? raw.fallback_reason : null,
    polygon_coordinates: displayPolygonPlaceholder(),
  };
}

async function runVisionAnalysisInner(
  imageUrl: string,
  countryCode: string | null | undefined,
  latitude?: number | null,
): Promise<VisionAnalysis> {
  console.info(`${LOG_PREFIX} runVisionAnalysisInner start`);
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    console.warn(`${LOG_PREFIX} OPENAI_API_KEY missing — cannot run vision`);
    throw new VisionUnableToEstimateError(VISION_UNABLE_MESSAGE, "OPENAI_API_KEY not configured");
  }

  const imageDataUrl = await satelliteImageToDataUrl(imageUrl, VISION_ANALYSIS_TIMEOUT_MS);
  const encodedKb = Math.round(imageDataUrl.length / 1024);
  const tileSpanMetres =
    latitude != null
      ? Math.round(
          (156543.03392 * Math.cos(((latitude ?? 0) * Math.PI) / 180) / Math.pow(2, SATELLITE_STATIC_ZOOM)) *
            600,
        )
      : undefined;
  console.info(`${LOG_PREFIX} Sending to GPT-4o:`, {
    satelliteUrl: maskGoogleMapsKeyInUrl(imageUrl),
    encodedPayloadKb: encodedKb,
    zoom: SATELLITE_STATIC_ZOOM,
    satellite_tile_pixels: "600x600 at scale 2 (1200px effective)",
    satellite_tile_note:
      "At zoom 19 the image can cover a few hundred metres across; AI may over-estimate if it measures the full tile or footprint instead of roof surface only",
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
        max_tokens: 128,
        messages: [
          { role: "system", content: VISION_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: buildVisionUserPrompt(countryCode, tileSpanMetres),
              },
              {
                type: "image_url",
                image_url: { url: imageDataUrl, detail: "high" },
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

  const normalized = normalizeVisionAnalysis(parsed, countryCode);
  console.info(`${LOG_PREFIX} GPT-4o analysis complete — source: openai`, {
    roof_sqft: normalized.roof_sqft,
    roof_type: normalized.roof_type,
    confidence: normalized.confidence,
    country_code: countryCode,
    used_hardcoded_fallback: false,
  });
  return normalized;
}

export async function runVisionAnalysis(
  imageUrl: string,
  countryCode?: string | null,
  latitude?: number | null,
): Promise<VisionAnalysis> {
  ensureEnvLoaded();
  const timeoutMs = VISION_ANALYSIS_TIMEOUT_MS;
  console.info(`${LOG_PREFIX} runVisionAnalysis start`, {
    timeoutMs,
    country_code: countryCode,
    imageUrl: imageUrl.replace(/key=[^&]+/, "key=***"),
  });

  try {
    const result = await Promise.race([
      runVisionAnalysisInner(imageUrl, countryCode, latitude),
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
