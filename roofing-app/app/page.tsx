"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AddressFieldWithCountry, {
  AddressAutocompleteHandle,
  AddressPlaceDetails,
} from "@/components/address-field-with-country";
import { hasGoogleMapsKey } from "@/components/address-autocomplete";

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

  const companyName = bootstrap?.settings?.company_name ?? "Nimly";
  const companyLogo = bootstrap?.settings?.company_logo_url;

  useEffect(() => {
    if (!mockQuoteVisible || !previewSectionRef.current) return;
    previewSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [mockQuoteVisible]);

  function resolvePlaceOnSubmit() {
    const fromRef = addressInputRef.current?.getPlaceDetails();
    const details = fromRef ?? placeDetails;
    if (fromRef) setPlaceDetails(fromRef);
    return details;
  }

  function hasValidCoords(lat?: number, lng?: number) {
    return (
      lat != null &&
      lng != null &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      !(lat === 0 && lng === 0)
    );
  }

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

    const details = resolvePlaceOnSubmit();
    const lat = details?.latitude;
    const lng = details?.longitude;
    const useCoords = hasValidCoords(lat, lng);

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
          ...(useCoords ? { latitude: lat, longitude: lng } : {}),
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
      alert(err instanceof Error ? err.message : "Could not estimate roof size. Please try again.");
      setMockQuoteVisible(false);
    } finally {
      setLoadingPreview(false);
    }
  }

  async function createRealLead() {
    const inputValue = addressInputRef.current?.getValue() ?? "";
    const resolvedAddress = (placeDetails?.address ?? address ?? inputValue).trim();
    const details = resolvePlaceOnSubmit();

    if (!resolvedAddress || !details || !hasValidCoords(details.latitude, details.longitude)) {
      alert("Please select a full address from the suggestions dropdown.");
      return;
    }

    setLoadingAnalysis(true);
    const params = new URLSearchParams(window.location.search);
    const payload = {
      address: details.address,
      latitude: details.latitude,
      longitude: details.longitude,
      zip_code: details.zipCode,
      country_code: details.countryCode,
      email: null,
      phone: null,
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
            `/analyzing?leadId=${data.lead.id}&lat=${details.latitude}&lng=${details.longitude}`,
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

  const defaultTestimonials = useMemo(
    () => [
      { id: 1, name: "Sarah J.", location: "Austin, TX", quote_text: "Fast and accurate quote — booked in minutes.", rating: 5 },
      { id: 2, name: "Mike R.", location: "Dallas, TX", quote_text: "Loved seeing the estimate instantly.", rating: 5 },
      { id: 3, name: "Priya K.", location: "Houston, TX", quote_text: "Simple, clear, and straightforward.", rating: 5 },
    ],
    [],
  );

  const testimonials = bootstrap?.testimonials?.length ? bootstrap.testimonials : defaultTestimonials;

  return (
    <main className="min-h-screen bg-background text-foreground font-sans font-normal pb-24">
      {/* Hero */}
      <section className="pt-14 md:pt-20 pb-16 md:pb-24">
        <div className="container-max">
          {companyLogo ? (
            <Image
              src={companyLogo}
              alt={`${companyName} logo`}
              width={200}
              height={48}
              unoptimized
              className="h-10 w-auto mb-10 md:mb-14"
            />
          ) : null}

          <h1 className="hero-headline">
            Get your roof quote in 60 seconds with Nimly
          </h1>
          <p className="mt-5 text-lg md:text-xl text-muted max-w-xl leading-relaxed">
            See your price. Decide when you&apos;re ready.
          </p>

          <div className="mt-10 md:mt-12 max-w-2xl">
            <div className="flex flex-col sm:flex-row gap-3">
              <AddressFieldWithCountry
                ref={addressInputRef}
                className="flex-1 w-full"
                placeholder="Enter your property address"
                onAddressChange={(value) => {
                  setAddress(value);
                  setPlaceDetails(null);
                }}
                onPlaceSelected={setPlaceDetails}
              />
              <button
                type="button"
                onClick={createLead}
                disabled={loadingPreview}
                className="relative z-10 btn-accent shrink-0 rounded-lg px-8 py-3.5 text-sm tracking-wide"
              >
                {loadingPreview ? "Estimating…" : "Get My Instant Quote"}
              </button>
            </div>

            {!hasGoogleMapsKey() && (
              <p className="mt-3 text-sm text-muted">
                Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to roofing-app/.env.local and restart the dev server.
              </p>
            )}

          </div>
        </div>
      </section>

      {/* Preview quote */}
      {mockQuoteVisible && (
        <section ref={previewSectionRef} className="pb-16 md:pb-20">
          <div className="container-max">
            <div className="rounded-lg border border-border-subtle bg-surface p-8 md:p-10">
              <p className="text-xs uppercase tracking-[0.2em] text-accent">Your estimate</p>
              <h2 className="text-2xl md:text-3xl mt-2">Your Instant Quote</h2>

              <div className="mt-8 grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-border-subtle bg-background px-5 py-4">
                  <p className="text-sm text-muted">Estimated roof size</p>
                  <p className="mt-1 text-lg text-foreground">
                    {loadingPreview ? "Calculating…" : previewRoofLabel ?? "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-border-subtle bg-background px-5 py-4">
                  <p className="text-sm text-muted">Price range</p>
                  <p className="mt-1 text-lg text-foreground">
                    {loadingPreview ? "Calculating…" : previewPriceRange ?? "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-border-subtle bg-background px-5 py-4">
                  <p className="text-sm text-muted">Recommended material</p>
                  <p className="mt-1 text-lg text-foreground">
                    {loadingPreview ? "…" : previewMaterial ?? "—"}
                  </p>
                </div>
              </div>

              {!loadingPreview && previewRoofLabel && (
                <p className="mt-6 text-sm text-muted leading-relaxed">
                  A quick estimate from your property location. Full satellite analysis refines your quote when you continue.
                </p>
              )}

              <button
                type="button"
                onClick={createRealLead}
                disabled={loadingAnalysis || loadingPreview || !previewRoofLabel}
                className="mt-8 btn-accent rounded-lg px-6 py-3 text-sm tracking-wide disabled:opacity-50"
              >
                {loadingAnalysis ? "Starting analysis…" : "Continue with full AI analysis"}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* How it works */}
      <section className="py-16 md:py-20 border-t border-border-subtle">
        <div className="container-max">
          <h2 className="text-2xl md:text-3xl">How it works</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              { step: "01", text: "Enter your address" },
              { step: "02", text: "We analyse your roof from satellite imagery" },
              { step: "03", text: "Receive your quote instantly" },
            ].map((item) => (
              <div
                key={item.step}
                className="rounded-lg border border-border-subtle bg-surface px-6 py-8"
              >
                <span className="text-sm text-accent tracking-widest">{item.step}</span>
                <p className="mt-4 text-foreground leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-16 md:py-20">
        <div className="container-max">
          <h2 className="text-2xl md:text-3xl">What homeowners say</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {testimonials.map((t) => (
              <article
                key={t.id}
                className="rounded-lg border border-border-subtle bg-surface px-6 py-8 flex flex-col"
              >
                <p className="text-foreground leading-relaxed flex-1">&ldquo;{t.quote_text}&rdquo;</p>
                <div className="mt-6 pt-6 border-t border-border-subtle">
                  <p className="text-foreground">{t.name}</p>
                  <p className="text-sm text-muted mt-0.5">{t.location}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="container-max py-8 text-sm text-muted border-t border-border-subtle">
        Nimly © 2026
      </footer>
    </main>
  );
}
