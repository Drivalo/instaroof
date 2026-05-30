"use client";

import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import { PlacesAutocompleteInput } from "@/components/places-autocomplete-input";
import { detectDefaultSupportedCountry } from "@/lib/detect-country";
import { geocodePostcode } from "@/lib/geocode-postcode";
import type { MapBoundsLiteral } from "@/lib/parse-google-place";
import {
  geocoderRegionBias,
  getSupportedCountry,
  postcodePlaceholder,
  SUPPORTED_COUNTRIES,
  type SupportedCountryCode,
} from "@/lib/supported-countries";

export type AddressPlaceDetails = {
  address: string;
  latitude: number;
  longitude: number;
  zipCode: string;
  countryCode: string;
};

export type PostcodeAddressFieldHandle = {
  getPlaceDetails: () => AddressPlaceDetails | null;
  hasValidAddress: () => boolean;
  getPostcode: () => string;
  isOnAddressStep: () => boolean;
  advanceToAddressStep: () => Promise<boolean>;
};

/** @deprecated Use PostcodeAddressFieldHandle */
export type AddressAutocompleteHandle = PostcodeAddressFieldHandle;

function flagImageUrl(code: SupportedCountryCode) {
  return `https://flagcdn.com/w20/${code}.png`;
}

type PostcodeAddressFieldProps = {
  onPostcodeChange?: (postcode: string) => void;
  onAddressChange?: (address: string) => void;
  onPlaceSelected?: (details: AddressPlaceDetails | null) => void;
  onStepChange?: (step: 1 | 2) => void;
  className?: string;
};

const fieldClass =
  "min-w-0 w-full rounded-lg border-0 bg-[#1C1C1C] px-4 py-3.5 text-[#FFFFFF] placeholder:text-[#A0A0A0]/70 focus:outline-none";

const PostcodeAddressField = forwardRef<PostcodeAddressFieldHandle, PostcodeAddressFieldProps>(
  function PostcodeAddressField(
    { onPostcodeChange, onAddressChange, onPlaceSelected, onStepChange, className = "" },
    ref,
  ) {
    const [countryCode, setCountryCode] = useState<SupportedCountryCode>("us");
    const [ready, setReady] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [postcodeLabel, setPostcodeLabel] = useState("");
    const [postcodeBounds, setPostcodeBounds] = useState<MapBoundsLiteral | null>(null);
    const [addressDetails, setAddressDetails] = useState<AddressPlaceDetails | null>(null);
    const [geocoding, setGeocoding] = useState(false);
    const menuId = useId();
    const postcodeLabelId = useId();
    const addressLabelId = useId();
    const rootRef = useRef<HTMLDivElement>(null);
    const addressSectionRef = useRef<HTMLDivElement>(null);

    const addressStepActive = postcodeBounds != null;

    useImperativeHandle(ref, () => ({
      getPlaceDetails: () => addressDetails,
      hasValidAddress: () =>
        addressDetails != null &&
        Number.isFinite(addressDetails.latitude) &&
        Number.isFinite(addressDetails.longitude),
      getPostcode: () => postcodeLabel.trim(),
      isOnAddressStep: () => addressStepActive,
      advanceToAddressStep: () => commitPostcode(postcodeLabel),
    }));

    function goToStep(step: 1 | 2) {
      onStepChange?.(step);
    }

    function applyPostcodeCommit(label: string, bounds: MapBoundsLiteral) {
      setPostcodeLabel(label);
      setPostcodeBounds(bounds);
      setAddressDetails(null);
      onAddressChange?.("");
      onPlaceSelected?.(null);
      goToStep(2);
      window.setTimeout(() => {
        addressSectionRef.current?.querySelector<HTMLInputElement>("input")?.focus();
      }, 100);
    }

    async function commitPostcode(raw: string): Promise<boolean> {
      const trimmed = raw.trim();
      if (!trimmed || geocoding) return false;
      if (postcodeBounds) return true;

      setGeocoding(true);
      try {
        const parsed = await geocodePostcode(trimmed, countryCode);
        if (!parsed?.bounds) return false;
        const label = parsed.zipCode || trimmed;
        console.log("[address-flow] Postcode confirmed:", {
          label,
          countryCode,
          geocoderRegion: geocoderRegionBias(countryCode),
          strictBounds: parsed.bounds,
        });
        applyPostcodeCommit(label, parsed.bounds);
        return true;
      } finally {
        setGeocoding(false);
      }
    }

    useEffect(() => {
      let cancelled = false;
      detectDefaultSupportedCountry().then((code) => {
        if (!cancelled) {
          setCountryCode(code);
          setReady(true);
        }
      });
      return () => {
        cancelled = true;
      };
    }, []);

    useEffect(() => {
      if (!menuOpen) return;
      const onPointerDown = (e: MouseEvent) => {
        if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false);
      };
      const onEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape") setMenuOpen(false);
      };
      document.addEventListener("mousedown", onPointerDown);
      document.addEventListener("keydown", onEscape);
      return () => {
        document.removeEventListener("mousedown", onPointerDown);
        document.removeEventListener("keydown", onEscape);
      };
    }, [menuOpen]);

    const selected = getSupportedCountry(countryCode);

    function resetToPostcodeStep() {
      setPostcodeLabel("");
      setPostcodeBounds(null);
      setAddressDetails(null);
      onAddressChange?.("");
      onPlaceSelected?.(null);
      goToStep(1);
    }

    function selectCountry(next: SupportedCountryCode) {
      setCountryCode(next);
      setMenuOpen(false);
      resetToPostcodeStep();
      console.log("[address-flow] Country selected:", {
        countryCode: next,
        geocoderRegion: geocoderRegionBias(next),
        placesRestriction: { country: next },
      });
    }

    function notifyAddress(details: AddressPlaceDetails | null) {
      onAddressChange?.(details?.address ?? "");
      onPlaceSelected?.(details);
    }

    return (
      <div ref={rootRef} className={`flex min-w-0 flex-1 flex-col gap-3 overflow-visible ${className}`.trim()}>
        {/* Step 1 — postcode */}
        <div className="overflow-visible">
          <label htmlFor={postcodeLabelId} className="mb-1.5 block text-sm text-[#A0A0A0]">
            Enter your postcode
          </label>
          <div className="flex min-w-0 flex-col overflow-visible rounded-lg border border-border-subtle bg-[#1C1C1C] transition-colors focus-within:border-[#F5A623] sm:flex-row">
            <div className="relative shrink-0 border-b border-border-subtle sm:border-b-0 sm:border-r">
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={menuOpen}
                aria-controls={menuId}
                aria-label={`Country: ${selected.label}`}
                onClick={() => setMenuOpen((open) => !open)}
                className="flex h-full w-full min-w-[5.5rem] cursor-pointer items-center gap-2 bg-[#2A2A2A] py-3.5 pl-3 pr-8 text-sm font-medium text-[#FFFFFF] focus:outline-none"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={flagImageUrl(selected.code)}
                  alt=""
                  width={20}
                  height={15}
                  className="h-[15px] w-5 shrink-0 rounded-sm object-cover"
                />
                <span>{selected.displayCode}</span>
              </button>
              <span
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-[#F5A623]"
                aria-hidden
              >
                ▼
              </span>

              {menuOpen && (
                <ul
                  id={menuId}
                  role="listbox"
                  aria-label="Country"
                  className="absolute left-0 top-full z-[10001] mt-1 min-w-full overflow-hidden rounded-lg border border-border-subtle bg-[#2A2A2A] py-1 shadow-lg"
                >
                  {SUPPORTED_COUNTRIES.map((c) => (
                    <li key={c.code} role="option" aria-selected={c.code === countryCode}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={c.code === countryCode}
                        onClick={() => selectCountry(c.code)}
                        className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-[#FFFFFF] hover:bg-[#1C1C1C] ${
                          c.code === countryCode ? "bg-[#1C1C1C]" : ""
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={flagImageUrl(c.code)}
                          alt=""
                          width={20}
                          height={15}
                          className="h-[15px] w-5 shrink-0 rounded-sm object-cover"
                        />
                        <span>{c.displayCode}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {!addressStepActive && ready ? (
              <PlacesAutocompleteInput
                id={postcodeLabelId}
                key={`postcode-${countryCode}`}
                countryCode={countryCode}
                placeTypes={["(regions)"]}
                placeholder={postcodePlaceholder(countryCode)}
                autoComplete="postal-code"
                className={`${fieldClass} flex-1 rounded-none sm:rounded-r-lg`}
                onTextChange={(value) => {
                  setPostcodeLabel(value);
                  setPostcodeBounds(null);
                  onPostcodeChange?.(value);
                  goToStep(1);
                }}
                onPlaceSelected={(parsed) => {
                  const label = parsed.zipCode || parsed.address;
                  void commitPostcode(label);
                }}
              />
            ) : addressStepActive ? (
              <div className="flex min-h-[52px] flex-1 items-center px-4 py-3.5 text-sm text-[#FFFFFF]">
                {postcodeLabel}
              </div>
            ) : (
              <input
                type="text"
                disabled
                placeholder="Loading…"
                className={`${fieldClass} flex-1 rounded-none opacity-50 sm:rounded-r-lg`}
              />
            )}
          </div>
          {addressStepActive && postcodeLabel ? (
            <p className="mt-1.5 text-xs text-[#A0A0A0]">
              <button
                type="button"
                onClick={resetToPostcodeStep}
                className="text-[#F5A623] underline underline-offset-2"
              >
                Change postcode
              </button>
            </p>
          ) : null}
        </div>

        {/* Step 2 — address (after postcode committed) */}
        {addressStepActive && postcodeBounds ? (
          <div ref={addressSectionRef} className="overflow-visible">
            <label htmlFor={addressLabelId} className="mb-1.5 block text-sm text-[#A0A0A0]">
              Select your address
            </label>
            <div className="overflow-visible rounded-lg border border-border-subtle bg-[#1C1C1C] transition-colors focus-within:border-[#F5A623]">
              <PlacesAutocompleteInput
                id={addressLabelId}
                key={`address-${countryCode}-${postcodeLabel}-${postcodeBounds.north}`}
                countryCode={countryCode}
                placeTypes={["address"]}
                bounds={postcodeBounds}
                strictBounds
                placeholder="Start typing your street address"
                className={fieldClass}
                onTextChange={() => {
                  setAddressDetails(null);
                  notifyAddress(null);
                }}
                onPlaceSelected={(parsed) => {
                  const details: AddressPlaceDetails = {
                    address: parsed.address,
                    latitude: parsed.latitude,
                    longitude: parsed.longitude,
                    zipCode: parsed.zipCode || postcodeLabel,
                    countryCode: parsed.countryCode || countryCode.toUpperCase(),
                  };
                  setAddressDetails(details);
                  notifyAddress(details);
                }}
              />
            </div>
            <p className="mt-1.5 text-xs text-[#A0A0A0]">
              Choose an address from the list — type a few characters if suggestions do not appear.
            </p>
          </div>
        ) : null}
      </div>
    );
  },
);

export default PostcodeAddressField;
