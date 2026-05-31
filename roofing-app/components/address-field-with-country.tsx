"use client";

import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import { PlacesAutocompleteInput } from "@/components/places-autocomplete-input";
import { detectDefaultSupportedCountry } from "@/lib/detect-country";
import {
  fetchUkPostcodeAddresses,
  ukAddressLookupErrorMessage,
} from "@/lib/fetch-uk-postcode-addresses";
import { resolvePostcode } from "@/lib/resolve-postcode";
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

type PostcodeLocationState = {
  lat: number;
  lng: number;
  label: string;
  radiusMeters: number;
  strictBounds: boolean;
};

const INVALID_POSTCODE_MSG = "We couldn't find that postcode, please check and try again";
const NO_ADDRESSES_MSG = "No addresses found for this postcode";

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
    const [postcodeInput, setPostcodeInput] = useState("");
    const [postcodeLabel, setPostcodeLabel] = useState("");
    const [postcodeLocation, setPostcodeLocation] = useState<PostcodeLocationState | null>(null);
    const [postcodeError, setPostcodeError] = useState<string | null>(null);
    const [addressDetails, setAddressDetails] = useState<AddressPlaceDetails | null>(null);
    const [lookupLoading, setLookupLoading] = useState(false);
    const [ukAddressList, setUkAddressList] = useState<string[] | null>(null);
    const [ukPostcodeCentre, setUkPostcodeCentre] = useState<{ lat: number; lng: number } | null>(null);
    const menuId = useId();
    const postcodeInputId = useId();
    const addressListId = useId();
    const addressLabelId = useId();
    const rootRef = useRef<HTMLDivElement>(null);
    const addressSectionRef = useRef<HTMLDivElement>(null);
    const postcodeInputRef = useRef<HTMLInputElement>(null);

    const isUk = countryCode === "gb";
    const addressStepActive = isUk ? ukAddressList != null : postcodeLocation != null;

    useImperativeHandle(ref, () => ({
      getPlaceDetails: () => addressDetails,
      hasValidAddress: () =>
        addressDetails != null &&
        Number.isFinite(addressDetails.latitude) &&
        Number.isFinite(addressDetails.longitude),
      getPostcode: () => (postcodeLabel || postcodeInput).trim(),
      isOnAddressStep: () => addressStepActive,
      advanceToAddressStep: () => lookupPostcode(postcodeInput || postcodeLabel),
    }));

    function goToStep(step: 1 | 2) {
      onStepChange?.(step);
    }

    function notifyAddress(details: AddressPlaceDetails | null) {
      onAddressChange?.(details?.address ?? "");
      onPlaceSelected?.(details);
    }

    function selectUkAddress(address: string) {
      if (!ukPostcodeCentre || !postcodeLabel) return;
      const details: AddressPlaceDetails = {
        address,
        latitude: ukPostcodeCentre.lat,
        longitude: ukPostcodeCentre.lng,
        zipCode: postcodeLabel,
        countryCode: "GB",
      };
      setAddressDetails(details);
      notifyAddress(details);
      goToStep(2);
      console.log("[address-flow] UK address selected:", { address, postcode: postcodeLabel });
    }

    function applyNonUkPostcodeCommit(location: PostcodeLocationState) {
      setPostcodeLabel(location.label);
      setPostcodeLocation(location);
      setPostcodeError(null);
      setAddressDetails(null);
      onAddressChange?.("");
      onPlaceSelected?.(null);
      goToStep(2);
      window.setTimeout(() => {
        addressSectionRef.current?.querySelector<HTMLInputElement>("input")?.focus();
      }, 100);
    }

    async function lookupPostcode(raw: string): Promise<boolean> {
      const trimmed = raw.trim();
      if (!trimmed || lookupLoading) return false;
      if (addressStepActive && (isUk ? addressDetails != null : postcodeLocation)) {
        return isUk ? addressDetails != null : true;
      }

      setPostcodeError(null);
      setLookupLoading(true);

      try {
        if (isUk) {
          if (ukAddressList != null && postcodeLabel === trimmed) return true;

          const result = await fetchUkPostcodeAddresses(trimmed);
          if (!result.ok) {
            setPostcodeError(ukAddressLookupErrorMessage(result.error));
            setUkAddressList(null);
            setUkPostcodeCentre(null);
            goToStep(1);
            return false;
          }

          setPostcodeInput(result.postcode);
          setPostcodeLabel(result.postcode);
          onPostcodeChange?.(result.postcode);
          setUkPostcodeCentre({ lat: result.latitude, lng: result.longitude });
          setUkAddressList(result.addresses);
          setAddressDetails(null);
          notifyAddress(null);
          goToStep(2);

          console.log("[address-flow] UK postcode lookup:", {
            postcode: result.postcode,
            addressCount: result.addresses.length,
            center: { lat: result.latitude, lng: result.longitude },
          });
          return true;
        }

        if (postcodeLocation) return true;

        const resolved = await resolvePostcode(trimmed, countryCode);
        if (!resolved.ok) {
          setPostcodeError(INVALID_POSTCODE_MSG);
          return false;
        }

        const { location } = resolved;
        applyNonUkPostcodeCommit({
          lat: location.latitude,
          lng: location.longitude,
          label: location.label,
          radiusMeters: location.radiusMeters,
          strictBounds: location.strictBounds,
        });

        console.log("[address-flow] Postcode confirmed:", {
          label: location.label,
          countryCode,
          geocoderRegion: geocoderRegionBias(countryCode),
          center: { lat: location.latitude, lng: location.longitude },
          radiusMeters: location.radiusMeters,
          strictBounds: location.strictBounds,
          source: location.source,
        });
        return true;
      } finally {
        setLookupLoading(false);
      }
    }

    function resetToPostcodeStep() {
      setPostcodeInput("");
      setPostcodeLabel("");
      setPostcodeLocation(null);
      setUkAddressList(null);
      setUkPostcodeCentre(null);
      setPostcodeError(null);
      setAddressDetails(null);
      onPostcodeChange?.("");
      onAddressChange?.("");
      onPlaceSelected?.(null);
      goToStep(1);
      window.setTimeout(() => postcodeInputRef.current?.focus(), 50);
    }

    function selectCountry(next: SupportedCountryCode) {
      setCountryCode(next);
      setMenuOpen(false);
      resetToPostcodeStep();
    }

    function onPostcodeKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
      if (e.key === "Enter") {
        e.preventDefault();
        void lookupPostcode(postcodeInput);
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
    const postcodeLocked = isUk ? ukAddressList != null : postcodeLocation != null;
    const showUkAddressList = isUk && ukAddressList != null && ukAddressList.length > 0;

    return (
      <div ref={rootRef} className={`flex min-w-0 flex-1 flex-col gap-3 overflow-visible ${className}`.trim()}>
        <div className="overflow-visible">
          <label htmlFor={postcodeInputId} className="mb-1.5 block text-sm text-[#A0A0A0]">
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
                disabled={postcodeLocked && !isUk}
                onClick={() => setMenuOpen((open) => !open)}
                className="flex h-full w-full min-w-[5.5rem] cursor-pointer items-center gap-2 bg-[#2A2A2A] py-3.5 pl-3 pr-8 text-sm font-medium text-[#FFFFFF] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
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

            <div className="flex min-w-0 flex-1 items-stretch">
              {ready && !postcodeLocked ? (
                <input
                  ref={postcodeInputRef}
                  id={postcodeInputId}
                  type="text"
                  inputMode="text"
                  autoComplete="postal-code"
                  placeholder={postcodePlaceholder(countryCode)}
                  value={postcodeInput}
                  disabled={lookupLoading}
                  className={`${fieldClass} flex-1 rounded-none sm:rounded-none`}
                  onChange={(e) => {
                    setPostcodeInput(e.target.value);
                    setPostcodeError(null);
                    onPostcodeChange?.(e.target.value);
                    goToStep(1);
                  }}
                  onKeyDown={onPostcodeKeyDown}
                />
              ) : postcodeLocked ? (
                <div
                  id={postcodeInputId}
                  className="flex min-h-[52px] flex-1 items-center px-4 py-3.5 text-sm text-[#FFFFFF]"
                >
                  {postcodeLabel || postcodeInput}
                </div>
              ) : (
                <input
                  type="text"
                  disabled
                  placeholder="Loading…"
                  className={`${fieldClass} flex-1 rounded-none opacity-50`}
                />
              )}

              {!postcodeLocked && ready ? (
                <button
                  type="button"
                  aria-label="Look up addresses for this postcode"
                  disabled={!postcodeInput.trim() || lookupLoading}
                  onClick={() => void lookupPostcode(postcodeInput)}
                  className="flex shrink-0 items-center justify-center border-l border-border-subtle bg-[#2A2A2A] px-4 text-[#F5A623] transition-colors hover:bg-[#333333] disabled:cursor-not-allowed disabled:opacity-40 sm:rounded-r-lg"
                >
                  {lookupLoading ? (
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#F5A623] border-t-transparent" aria-hidden />
                  ) : (
                    <span className="text-lg leading-none" aria-hidden>
                      →
                    </span>
                  )}
                </button>
              ) : null}
            </div>
          </div>

          {postcodeError ? (
            <p className="mt-1.5 text-xs text-red-400" role="alert">
              {postcodeError}
            </p>
          ) : null}

          {postcodeLocked ? (
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

          {showUkAddressList ? (
            <div className="mt-3 overflow-visible">
              <p className="mb-1.5 text-sm text-[#A0A0A0]">Select your address</p>
              <ul
                id={addressListId}
                role="listbox"
                aria-label="Addresses at this postcode"
                className="max-h-56 overflow-y-auto rounded-lg border border-border-subtle bg-[#2A2A2A] py-1 shadow-lg"
              >
                {ukAddressList.map((address) => {
                  const selectedAddress = addressDetails?.address === address;
                  return (
                    <li key={address} role="presentation">
                      <button
                        type="button"
                        role="option"
                        aria-selected={selectedAddress}
                        onClick={() => selectUkAddress(address)}
                        className={`w-full px-4 py-3 text-left text-sm leading-snug text-[#FFFFFF] hover:bg-[#1C1C1C] ${
                          selectedAddress ? "bg-[#1C1C1C] ring-1 ring-inset ring-[#F5A623]/50" : ""
                        }`}
                      >
                        {address}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>

        {!isUk && addressStepActive && postcodeLocation ? (
          <div ref={addressSectionRef} className="overflow-visible">
            <label htmlFor={addressLabelId} className="mb-1.5 block text-sm text-[#A0A0A0]">
              Select your address
            </label>
            <div className="overflow-visible rounded-lg border border-border-subtle bg-[#1C1C1C] transition-colors focus-within:border-[#F5A623]">
              <PlacesAutocompleteInput
                id={addressLabelId}
                key={`address-${countryCode}-${postcodeLabel}-${postcodeLocation.lat}-${postcodeLocation.radiusMeters}`}
                countryCode={countryCode}
                placeTypes={["address"]}
                locationCenter={{ lat: postcodeLocation.lat, lng: postcodeLocation.lng }}
                radiusMeters={postcodeLocation.radiusMeters}
                strictBounds={postcodeLocation.strictBounds}
                placeholder="Start typing your street address"
                className={fieldClass}
                onTextChange={() => {
                  setAddressDetails(null);
                  notifyAddress(null);
                  goToStep(2);
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
