import { readEnv } from "@/lib/env";
import { fallbackVisionAnalysis } from "@/lib/quote";
import { RoofComplexity, RoofType, VisionAnalysis } from "@/lib/types";
import { VISION_ANALYSIS_TIMEOUT_MS, VISION_TIMEOUT_MESSAGE } from "@/lib/vision-constants";

export { VISION_ANALYSIS_TIMEOUT_MS, VISION_TIMEOUT_MESSAGE } from "@/lib/vision-constants";

export class VisionAnalysisTimeoutError extends Error {
  constructor(message = VISION_TIMEOUT_MESSAGE) {
    super(message);
    this.name = "VisionAnalysisTimeoutError";
  }
}

const VISION_PROMPT = `You are a roofing estimator. Analyze this satellite image. Identify the main residential structure in the center. Return JSON with: roof_sqft (estimated square footage of the main roof, integer), roof_type ('asphalt_shingle' or 'metal' or 'tile' or 'flat'), complexity ('simple', 'moderate', or 'complex' based on number of facets and valleys visible), confidence (0-100), polygon_coordinates (array of x,y pixel coordinates outlining the roof on the 600x600 image).

Return only valid JSON with exactly these keys: roof_sqft, roof_type, complexity, confidence, polygon_coordinates.`;

const ROOF_TYPES: RoofType[] = ["asphalt_shingle", "metal", "tile", "flat"];
const COMPLEXITIES: RoofComplexity[] = ["simple", "moderate", "complex"];

function getOpenAiApiKey(): string | undefined {
  return readEnv("OPENAI_API_KEY");
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
  const response = await fetchWithTimeout(imageUrl, {}, timeoutMs);
  if (!response.ok) {
    throw new Error(`Failed to fetch satellite image (${response.status})`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "image/png";
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
  const roofSqft = Math.max(500, Math.round(Number(raw.roof_sqft) || 0));
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
        : fallbackVisionAnalysis().polygon_coordinates,
  };
}

async function runVisionAnalysisInner(imageUrl: string): Promise<VisionAnalysis> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    console.warn("OPENAI_API_KEY is not set — using fallback roof analysis.");
    return fallbackVisionAnalysis();
  }

  const imageDataUrl = await satelliteImageToDataUrl(imageUrl, VISION_ANALYSIS_TIMEOUT_MS);

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
    throw new Error(`OpenAI API error ${response.status}: ${errBody}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("OpenAI returned an empty vision response");
  }

  const parsed = extractJsonObject(content);
  return normalizeVisionAnalysis(parsed);
}

export async function runVisionAnalysis(imageUrl: string): Promise<VisionAnalysis> {
  const timeoutMs = VISION_ANALYSIS_TIMEOUT_MS;

  try {
    return await Promise.race([
      runVisionAnalysisInner(imageUrl),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new VisionAnalysisTimeoutError()), timeoutMs);
      }),
    ]);
  } catch (error) {
    if (error instanceof VisionAnalysisTimeoutError) {
      throw error;
    }
    console.error("GPT-4o vision analysis failed:", error);
    return fallbackVisionAnalysis();
  }
}
