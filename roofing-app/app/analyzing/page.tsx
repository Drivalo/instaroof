"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type CurrencyRegion,
  analyzingHeadline,
  analyzingProgressSteps,
  detectCurrencyRegion,
} from "@/lib/currency";
import { satelliteProxyPath } from "@/lib/maps-static";
import {
  VISION_ANALYSIS_TIMEOUT_MS,
  VISION_REFUSAL_MESSAGE,
  VISION_TIMEOUT_MESSAGE,
  VISION_UNABLE_MESSAGE,
} from "@/lib/vision-constants";

function AnalyzingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const leadId = searchParams.get("leadId");
  const latParam = searchParams.get("lat");
  const lngParam = searchParams.get("lng");
  const forceReanalyze = searchParams.get("force") === "true";

  const [region, setRegion] = useState<CurrencyRegion>("US");
  const [index, setIndex] = useState(0);
  const [fallbackImageUrl, setFallbackImageUrl] = useState("");
  const [imageReady, setImageReady] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(true);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const runIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const queryLat = Number(latParam);
  const queryLng = Number(lngParam);
  const hasQueryCoords = Number.isFinite(queryLat) && Number.isFinite(queryLng);

  const steps = useMemo(() => analyzingProgressSteps(region), [region]);
  const headline = useMemo(() => analyzingHeadline(region), [region]);

  const imageUrl = useMemo(() => {
    if (hasQueryCoords) {
      return satelliteProxyPath(queryLat, queryLng);
    }
    return fallbackImageUrl;
  }, [hasQueryCoords, queryLat, queryLng, fallbackImageUrl]);

  useEffect(() => {
    if (hasQueryCoords) {
      setRegion(detectCurrencyRegion(null, null, queryLat, queryLng));
    }
  }, [hasQueryCoords, queryLat, queryLng]);

  useEffect(() => {
    if (!leadId) return;

    let active = true;
    void fetch(`/api/leads/${leadId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        const lead = d.lead;
        const leadLat = lead?.latitude ?? (hasQueryCoords ? queryLat : null);
        const leadLng = lead?.longitude ?? (hasQueryCoords ? queryLng : null);

        setRegion(detectCurrencyRegion(lead?.address, lead?.country_code, leadLat, leadLng));

        if (!hasQueryCoords) {
          if (lead?.latitude != null && lead?.longitude != null) {
            setFallbackImageUrl(satelliteProxyPath(lead.latitude, lead.longitude));
          } else if (lead?.satellite_image_url) {
            setFallbackImageUrl(lead.satellite_image_url);
          }
        }
      })
      .catch((err) => console.error("lead fetch failed:", err));

    return () => {
      active = false;
    };
  }, [leadId, hasQueryCoords, queryLat, queryLng]);

  const analyzeLead = useCallback(
    async (id: string, options?: { force?: boolean }) => {
      const runId = ++runIdRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const clientTimeout = setTimeout(() => controller.abort(), VISION_ANALYSIS_TIMEOUT_MS);
      const force = options?.force === true;
      const url = force ? `/api/leads/${id}/analyze?force=true` : `/api/leads/${id}/analyze`;

      try {
        const res = await fetch(url, {
          method: "POST",
          signal: controller.signal,
        });
        const data = await res.json();

        if (runId !== runIdRef.current) return;

        if (!res.ok) {
          const message =
            data.userMessage ||
            (data.code === "VISION_REFUSAL"
              ? VISION_REFUSAL_MESSAGE
              : data.code === "VISION_UNABLE"
                ? VISION_UNABLE_MESSAGE
                : data.code === "VISION_TIMEOUT" || res.status === 504
                  ? VISION_TIMEOUT_MESSAGE
                  : data.error || "Analysis failed");
          setAnalysisError(message);
          setAnalyzing(false);
          return;
        }

        if (data.cached && data.lead?.roof_sqft != null) {
          setAnalysisId(id);
          setAwaitingConfirmation(true);
          setAnalyzing(false);
          return;
        }

        setAnalysisId(id);
        setAwaitingConfirmation(true);
        setAnalyzing(false);
      } catch (error) {
        if (runId !== runIdRef.current) return;

        if (error instanceof Error && error.name === "AbortError") {
          setAnalysisError(VISION_TIMEOUT_MESSAGE);
        } else {
          setAnalysisError(error instanceof Error ? error.message : "Analysis failed");
        }
        setAnalyzing(false);
      } finally {
        clearTimeout(clientTimeout);
      }
    },
    [router],
  );

  const handleRetry = useCallback(() => {
    if (!leadId) return;
    setAnalyzing(true);
    setAwaitingConfirmation(false);
    setAnalysisId(null);
    setAnalysisError(null);
    setIndex(0);
    setImageError(false);
    setImageReady(false);
    if (imageUrl) {
      const separator = imageUrl.includes("?") ? "&" : "?";
      setFallbackImageUrl(`${imageUrl.replace(/[&?]retry=\d+/, "")}${separator}retry=${Date.now()}`);
    }
    void analyzeLead(leadId, { force: true });
  }, [analyzeLead, imageUrl, leadId]);

  useEffect(() => {
    if (!leadId) return;

    const timer = window.setTimeout(() => {
      void analyzeLead(leadId, { force: forceReanalyze });
    }, 0);

    return () => {
      window.clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [leadId, analyzeLead, forceReanalyze]);

  useEffect(() => {
    if (!analyzing || analysisError) return;

    const timer = setInterval(() => setIndex((i) => Math.min(i + 1, steps.length - 1)), 1200);
    return () => clearInterval(timer);
  }, [analyzing, analysisError, steps.length]);

  if (!leadId) {
    return (
      <main className="customer-page container-max py-10">
        <p className="text-muted">Missing lead. Please start again from the home page.</p>
        <Link href="/" className="mt-4 inline-block text-accent underline">
          Back to home
        </Link>
      </main>
    );
  }

  return (
    <main className="customer-page container-max py-10">
      <h1 className="text-2xl mb-6">{headline}</h1>

      {analysisError ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-6 max-w-[620px] text-zinc-900">
          <p className="text-amber-900">{analysisError}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="mt-4 rounded-xl bg-[#C8102E] px-6 py-3 text-white hover:opacity-90"
          >
            Try again
          </button>
          <Link href="/" className="mt-3 inline-block text-sm text-zinc-600 underline">
            Back to home
          </Link>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-border-subtle bg-surface p-4 w-full max-w-[620px] relative">
            {imageUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={imageUrl}
                  src={imageUrl}
                  alt="Satellite view of property"
                  width={600}
                  height={600}
                  className={`w-full h-auto rounded-lg ${imageReady && !imageError ? "block" : "hidden"}`}
                  onLoad={() => {
                    setImageReady(true);
                    setImageError(false);
                  }}
                  onError={() => {
                    setImageError(true);
                    setImageReady(false);
                  }}
                />
                {(!imageReady || imageError) && (
                  <div className="h-[300px] md:h-[600px] bg-background rounded-lg flex items-center justify-center text-muted text-sm text-center px-4">
                    {imageError
                      ? "Satellite image unavailable. Enable Maps Static API for your Google Maps key."
                      : "Loading satellite imagery..."}
                  </div>
                )}
              </>
            ) : (
              <div className="h-[300px] md:h-[600px] bg-background rounded-lg flex items-center justify-center text-muted text-sm text-center px-4">
                Loading satellite imagery...
              </div>
            )}
            {awaitingConfirmation && analysisId ? (
              <div className="mt-4 rounded-xl border border-border-subtle bg-surface p-6">
                <h2 className="text-xl text-foreground">Does this look like your property?</h2>
                <p className="mt-2 text-sm text-muted leading-relaxed">
                  We&apos;ll use this satellite view to estimate your roof size.
                </p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => router.push(`/quote/${analysisId}`)}
                    className="rounded-xl bg-[#C8102E] px-6 py-3 text-white hover:opacity-90"
                  >
                    Yes, that&apos;s my property
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(`/quote/${analysisId}?addressIssue=true`)}
                    className="rounded-xl border border-border-subtle bg-background px-6 py-3 text-foreground hover:border-accent transition-colors"
                  >
                    No, wrong property
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          {!awaitingConfirmation ? (
            <ul className="mt-6 space-y-2">
              {steps.map((step, i) => (
                <li
                  key={step}
                  className={`rounded-lg p-3 ${
                    i <= index
                      ? "bg-[#C9A96E] text-[#1C1C1C]"
                      : "bg-surface text-muted border border-border-subtle"
                  }`}
                >
                  {i <= index ? "✓ " : ""}
                  {step}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </main>
  );
}

export default function AnalyzingPage() {
  return (
    <Suspense
      fallback={
        <main className="customer-page container-max py-10">
          <h1 className="text-2xl mb-6">Analyzing your roof...</h1>
          <div className="h-[300px] md:h-[600px] max-w-[620px] bg-surface rounded-lg animate-pulse border border-border-subtle" />
        </main>
      }
    >
      <AnalyzingContent />
    </Suspense>
  );
}
