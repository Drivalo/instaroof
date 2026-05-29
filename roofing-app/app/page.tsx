"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AddressAutocomplete, {
  AddressAutocompleteHandle,
  AddressPlaceDetails,
  hasGoogleMapsKey,
} from "@/components/address-autocomplete";

type BootstrapData = {
  settings: {
    company_name: string;
    company_logo_url?: string | null;
    primary_color: string;
    secondary_color: string;
    google_maps_api_key: string | null;
    currency_rate_aud?: number;
    currency_rate_nzd?: number;
  };
  testimonials: Array<{ id: number; name: string; location: string; quote_text: string; rating: number }>;
};

export default function Home() {
  const router = useRouter();
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [address, setAddress] = useState("");
  const [placeDetails, setPlaceDetails] = useState<AddressPlaceDetails | null>(null);
  const [email, setEmail] = useState("");
  const [mockQuoteVisible, setMockQuoteVisible] = useState(false);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewRoofLabel, setPreviewRoofLabel] = useState<string | null>(null);
  const [previewPriceRange, setPreviewPriceRange] = useState<string | null>(null);
  const [previewMaterial, setPreviewMaterial] = useState<string | null>(null);
  const addressInputRef = useRef<AddressAutocompleteHandle>(null);
  const previewSectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    fetch("/api/public/bootstrap")
      .then((r) => r.json())
      .then((data) => {
        if (data?.settings) setBootstrap(data as BootstrapData);
      })
      .catch((err) => console.error("bootstrap load failed:", err));
  }, []);

  const brand = useMemo(
    () =>
      bootstrap?.settings ?? {
        company_name: "Acme Roofing",
        company_logo_url: null,
        primary_color: "#C8102E",
        secondary_color: "#1F2937",
      },
    [bootstrap],
  );

  useEffect(() => {
    if (!mockQuoteVisible || !previewSectionRef.current) return;
    previewSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [mockQuoteVisible]);

  async function createLead() {
    const inputValue = addressInputRef.current?.getValue() ?? "";
    const resolvedAddress = (placeDetails?.address ?? address ?? inputValue).trim();

    if (!resolvedAddress) {
      alert("Please enter your property address.");
      return;
    }

    if (resolvedAddress !== address) {
      setAddress(resolvedAddress);
    }

    const detailsFromInput = addressInputRef.current?.getPlaceDetails();
    const details = detailsFromInput ?? placeDetails;
    if (detailsFromInput && !placeDetails) {
      setPlaceDetails(detailsFromInput);
    }

    const lat = details?.latitude;
    const lng = details?.longitude;
    if (
      lat == null ||
      lng == null ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      (lat === 0 && lng === 0)
    ) {
      alert("Please select your address from the dropdown so we can estimate your roof size.");
      return;
    }

    setMockQuoteVisible(true);
    setLoadingPreview(true);
    setPreviewRoofLabel(null);
    setPreviewPriceRange(null);
    setPreviewMaterial(null);

    try {
      const res = await fetch("/api/leads/preview-estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: details?.address ?? resolvedAddress,
          latitude: lat,
          longitude: lng,
          country_code: details?.countryCode ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not estimate roof size");
      }
      setPreviewRoofLabel(data.area?.label ?? `${data.roof_sqft} sq ft`);
      setPreviewPriceRange(data.price_range ?? null);
      setPreviewMaterial(data.material ?? null);
    } catch (err) {
      console.error("[createLead] preview estimate failed:", err);
      alert(err instanceof Error ? err.message : "Could not estimate roof size. Try selecting the address again.");
      setMockQuoteVisible(false);
    } finally {
      setLoadingPreview(false);
    }
  }

  async function createRealLead() {
    if (!address || !placeDetails?.latitude || !placeDetails?.longitude) {
      alert("Please select a full address from the suggestions dropdown.");
      return;
    }
    setLoadingAnalysis(true);
    const params = new URLSearchParams(window.location.search);
    const payload = {
      address: placeDetails.address,
      latitude: placeDetails.latitude,
      longitude: placeDetails.longitude,
      zip_code: placeDetails.zipCode,
      country_code: placeDetails.countryCode,
      email: email || null,
      utm_source: params.get("utm_source"),
      utm_medium: params.get("utm_medium"),
      utm_campaign: params.get("utm_campaign"),
    };

    const maxAttempts = 2;
    const retryDelayMs = 1000;

    try {
      let lastData: {
        error?: string;
        userMessage?: string;
        supabase?: unknown;
        waitlist?: boolean;
        lead?: { id: number };
      } | null = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const res = await fetch("/api/leads/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        lastData = data;

        if (res.ok) {
          if (data.waitlist) {
            alert("We don't service your area yet — you've been added to the waitlist.");
            return;
          }
          router.push(
            `/analyzing?leadId=${data.lead.id}&lat=${placeDetails.latitude}&lng=${placeDetails.longitude}`,
          );
          return;
        }

        console.error(`[createRealLead] attempt ${attempt}/${maxAttempts} failed:`, {
          status: res.status,
          error: data.error,
          supabase: data.supabase,
          userMessage: data.userMessage,
        });

        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      }

      const message =
        lastData?.userMessage ||
        "We couldn't start your quote right now. Please wait a moment and try again.";
      alert(message);
    } catch (err) {
      console.error("[createRealLead] network or unexpected error:", err);
      alert("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoadingAnalysis(false);
    }
  }

  return (
    <main className="pb-16">
      <section className="bg-white border-b border-zinc-200">
        <div className="container-max py-12 md:py-20">
          {brand.company_logo_url ? (
            <Image
              src={brand.company_logo_url}
              alt={`${brand.company_name} logo`}
              width={220}
              height={56}
              unoptimized
              className="h-14 w-auto mb-6"
            />
          ) : null}
          <h1 className="text-4xl md:text-6xl font-bold leading-tight">
            Get Your Roof Quote in 60 Seconds - No Salesperson, No Phone Call
          </h1>
          <p className="text-lg text-zinc-700 mt-4">
            AI-powered satellite analysis gives you a real quote instantly. Book your free inspection with $50 fully-refundable deposit.
          </p>
          <div className="mt-8 grid gap-3 md:grid-cols-[1fr_auto]">
            <AddressAutocomplete
              ref={addressInputRef}
              className="w-full rounded-xl border border-zinc-300 p-4"
              placeholder="Enter your property address"
              onAddressChange={setAddress}
              onPlaceSelected={setPlaceDetails}
            />
            {!hasGoogleMapsKey() && (
              <p className="text-sm text-amber-700 md:col-span-2">
                Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to roofing-app/.env.local and restart the dev server.
              </p>
            )}
            <button
              type="button"
              onClick={createLead}
              disabled={loadingPreview}
              className="relative z-10 rounded-xl px-6 py-4 font-semibold text-white shrink-0 disabled:opacity-50"
              style={{ background: brand.primary_color }}
            >
              {loadingPreview ? "Estimating…" : "Get My Instant Quote"}
            </button>
          </div>
          <input
            className="mt-3 w-full rounded-xl border border-zinc-300 p-3 md:w-96"
            placeholder="Email (optional for quote follow-up)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div className="grid md:grid-cols-3 gap-3 mt-8 text-sm">
            <p className="rounded-lg bg-zinc-100 p-3">Used by 1,200+ homeowners</p>
            <p className="rounded-lg bg-zinc-100 p-3">Licensed & Insured</p>
            <p className="rounded-lg bg-zinc-100 p-3">$50 deposit fully refunded at inspection</p>
          </div>
        </div>
      </section>

      {mockQuoteVisible && (
        <section ref={previewSectionRef} className="container-max py-8">
          <div className="rounded-xl border bg-white p-6">
            <h2 className="text-2xl font-bold">Your Instant Quote</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <p className="rounded-lg bg-zinc-100 p-3">
                Estimated roof size:{" "}
                <strong>
                  {loadingPreview
                    ? "Calculating…"
                    : previewRoofLabel ?? "—"}
                </strong>
              </p>
              <p className="rounded-lg bg-zinc-100 p-3">
                Price range:{" "}
                <strong>{loadingPreview ? "Calculating…" : previewPriceRange ?? "—"}</strong>
              </p>
              <p className="rounded-lg bg-zinc-100 p-3">
                Recommended material:{" "}
                <strong>{loadingPreview ? "…" : previewMaterial ?? "—"}</strong>
              </p>
            </div>
            {!loadingPreview && previewRoofLabel && (
              <p className="mt-2 text-xs text-zinc-500">
                Quick estimate from your property location. Full AI satellite analysis refines this after you continue.
              </p>
            )}
            <div className="mt-4">
              <button
                type="button"
                onClick={createRealLead}
                disabled={loadingAnalysis || loadingPreview || !previewRoofLabel}
                className="rounded-lg bg-[#1F2937] px-4 py-2 text-white disabled:opacity-50"
              >
                {loadingAnalysis ? "Starting analysis..." : "Continue with full AI analysis"}
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="container-max py-12">
        <h2 className="text-2xl font-semibold mb-4">How it works</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="rounded-xl bg-white border p-4">1. Enter your address</div>
          <div className="rounded-xl bg-white border p-4">2. AI analyzes your roof from satellite</div>
          <div className="rounded-xl bg-white border p-4">3. Get instant quote + book inspection</div>
        </div>
      </section>

      <section className="container-max py-8">
        <h2 className="text-2xl font-semibold mb-4">What homeowners say</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {(bootstrap?.testimonials?.length
            ? bootstrap.testimonials
            : [
                { id: 1, name: "Sarah J.", location: "Austin, TX", quote_text: "Fast and accurate quote - booked in minutes.", rating: 5 },
                { id: 2, name: "Mike R.", location: "Dallas, TX", quote_text: "Loved seeing the estimate instantly.", rating: 5 },
                { id: 3, name: "Priya K.", location: "Houston, TX", quote_text: "Easy process and no sales pressure.", rating: 5 },
              ]
          ).map((t) => (
            <article key={t.id} className="rounded-xl bg-white border p-4">
              <p className="text-zinc-700">&quot;{t.quote_text}&quot;</p>
              <p className="font-semibold mt-3">{t.name}</p>
              <p className="text-sm text-zinc-500">{t.location}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="container-max py-6 text-sm text-zinc-600">Powered by InstaRoof Quote for {brand.company_name}</footer>
    </main>
  );
}
