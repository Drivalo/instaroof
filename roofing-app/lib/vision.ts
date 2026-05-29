import { readEnv } from "@/lib/env";
import { ensureEnvLoaded } from "@/lib/env.server";
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

const VISION_PROMPT = `You are a roofing estimator. Analyze this satellite image. Identify the main residential structure in the center. Return JSON with: roof_sqft (estimated square footage of the main roof, integer), roof_type ('asphalt_shingle' or 'metal' or 'tile' or 'flat'), complexity ('simple', 'moderate', or 'complex' based on number of facets and valleys visible), confidence (0-100), polygon_coordinates (array of x,y pixel coordinates outlining the roof on the 600x600 image).

Return only valid JSON with exactly these keys: roof_sqft, roof_type, complexity, confidence, polygon_coordinates.`;

const ROOF_TYPES: RoofType[] = ["asphalt_shingle", "metal", "tile", "flat"];
const COMPLEXITIES: RoofComplexity[] = ["simple", "moderate", "complex"];

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

async function satelliteImageToDataUrl(imageUrl: string, timeoutMs: number): Promise<string> {
  console.info(`${LOG_PREFIX} Fetching satellite image:`, imageUrl.replace(/key=[^&]+/, "key=***"));
  const response = await fetchWithTimeout(imageUrl, {}, timeoutMs);
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "image/png";
  console.info(`${LOG_PREFIX} Satellite response:`, {
    status: response.status,
    ok: response.ok,
    contentType,
    bytes: buffer.length,
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch satellite image (${response.status}, ${buffer.length} bytes)`);
  }
  if (buffer.length < 1000) {
    console.warn(`${LOG_PREFIX} Satellite image unusually small — may be an error tile`);
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

function normalizeVisionAnalysis(raw: Record<string, unknown>): VisionAnalysis {
  const rawSqft = raw.roof_sqft;
  const parsedSqft = Number(rawSqft);
  const roofSqft = Math.max(500, Math.round(Number.isFinite(parsedSqft) ? parsedSqft : 0));

  console.info(`${LOG_PREFIX} Normalized vision result:`, {
    raw_roof_sqft: rawSqft,
    parsed_roof_sqft: parsedSqft,
    final_roof_sqft: roofSqft,
    roof_type: raw.roof_type,
    complexity: raw.complexity,
    confidence: raw.confidence,
    polygon_point_count: Array.isArray(raw.polygon_coordinates) ? raw.polygon_coordinates.length : 0,
  });

  if (!Number.isFinite(parsedSqft) || parsedSqft <= 0) {
    console.warn(`${LOG_PREFIX} Model returned invalid roof_sqft; using minimum 500 sq ft`);
  }
  const roofTypeRaw = String(raw.roof_type || "asphalt_shingle");
  const roof_type = ROOF_TYPES.includes(roofTypeRaw as RoofType)
    ? (roofTypeRaw as RoofType)
    : "asphalt_shingle";
  const complexityRaw = String(raw.complexity || "moderate");
  const complexity = COMPLEXITIES.includes(complexityRaw as RoofComplexity)
    ? (complexityRaw as RoofComplexity)
    : "moderate";
  const confidence = Math.min(100, Math.max(0, Math.round(Number(raw.confidence) || 50)));

  const polygonRaw = Array.isArray(raw.polygon_coordinates) ? raw.polygon_coordinates : [];
  const polygon_coordinates = polygonRaw
    .map((point) => {
      if (!point || typeof point !== "object") return null;
      const p = point as { x?: unknown; y?: unknown };
      const x = Math.round(Number(p.x));
      const y = Math.round(Number(p.y));
      if (Number.isNaN(x) || Number.isNaN(y)) return null;
      return { x: Math.min(600, Math.max(0, x)), y: Math.min(600, Math.max(0, y)) };
    })
    .filter((p): p is { x: number; y: number } => p !== null);

  return {
    roof_sqft: roofSqft,
    roof_type,
    complexity,
    confidence,
    polygon_coordinates:
      polygon_coordinates.length >= 3
        ? polygon_coordinates
        : (() => {
            console.warn(`${LOG_PREFIX} Polygon had <3 points — using fallback polygon only`);
            return fallbackVisionAnalysis().polygon_coordinates;
          })(),
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
  console.info(`${LOG_PREFIX} Satellite encoded for OpenAI:`, {
    dataUrlChars: imageDataUrl.length,
    approxKb: Math.round(imageDataUrl.length / 1024),
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
        temperature: 0.2,
        max_tokens: 900,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: VISION_PROMPT },
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
