"use client";

import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import { PlacesAutocompleteInput } from "@/components/places-autocomplete-input";
import { detectDefaultSupportedCountry } from "@/lib/detect-country";
import {
  getSupportedCountry,
  SUPPORTED_COUNTRIES,
  type SupportedCountryCode,
} from "@/lib/supported-countries";

export const ADDRESS_SELECTION_ERROR = "Please select an address from the suggestions";

export type AddressPlaceDetails = {
  address: string;
  latitude: number;
  longitude: number;
  zipCode: string;
  countryCode: string;
};

export type AddressFieldHandle = {
  getPlaceDetails: () => AddressPlaceDetails | null;
  hasValidAddress: () => boolean;
  /** Shows inline error when no Places suggestion was selected. Returns whether submit may proceed. */
  validateForSubmit: () => boolean;
};

/** @deprecated Use AddressFieldHandle */
export type PostcodeAddressFieldHandle = AddressFieldHandle;

/** @deprecated Use AddressFieldHandle */
export type AddressAutocompleteHandle = AddressFieldHandle;

function flagImageUrl(code: SupportedCountryCode) {
  return `https://flagcdn.com/w20/${code}.png`;
}

type AddressFieldWithCountryProps = {
  onAddressChange?: (address: string) => void;
  onPlaceSelected?: (details: AddressPlaceDetails | null) => void;
  /** Fired when a Places dropdown selection is confirmed or cleared (e.g. user edits the field). */
  onPlaceConfirmedChange?: (confirmed: boolean) => void;
  className?: string;
};

const fieldClass =
  "min-w-0 w-full rounded-lg border-0 bg-[#1C1C1C] px-4 py-3.5 text-[#FFFFFF] placeholder:text-[#A0A0A0]/70 focus:outline-none";

function isValidPlaceDetails(details: AddressPlaceDetails | null): details is AddressPlaceDetails {
  return (
    details != null &&
    details.address.trim().length > 0 &&
    Number.isFinite(details.latitude) &&
    Number.isFinite(details.longitude) &&
    !(details.latitude === 0 && details.longitude === 0)
  );
}

const AddressFieldWithCountry = forwardRef<AddressFieldHandle, AddressFieldWithCountryProps>(
  function AddressFieldWithCountry(
    { onAddressChange, onPlaceSelected, onPlaceConfirmedChange, className = "" },
    ref,
  ) {
    const [countryCode, setCountryCode] = useState<SupportedCountryCode>("us");
    const [ready, setReady] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [addressDetails, setAddressDetails] = useState<AddressPlaceDetails | null>(null);
    const [placeConfirmed, setPlaceConfirmed] = useState(false);
    const [inlineError, setInlineError] = useState<string | null>(null);
    const menuId = useId();
    const addressInputId = useId();
    const rootRef = useRef<HTMLDivElement>(null);

    function setConfirmed(confirmed: boolean) {
      setPlaceConfirmed(confirmed);
      onPlaceConfirmedChange?.(confirmed);
    }

    useImperativeHandle(ref, () => ({
      getPlaceDetails: () => addressDetails,
      hasValidAddress: () => placeConfirmed && isValidPlaceDetails(addressDetails),
      validateForSubmit: () => {
        if (placeConfirmed && isValidPlaceDetails(addressDetails)) {
          setInlineError(null);
          return true;
        }
        setInlineError(ADDRESS_SELECTION_ERROR);
        return false;
      },
    }));

    function notifyAddress(details: AddressPlaceDetails | null) {
      onAddressChange?.(details?.address ?? "");
      onPlaceSelected?.(details);
    }

    function clearSelection() {
      setAddressDetails(null);
      setConfirmed(false);
      notifyAddress(null);
    }

    function selectCountry(next: SupportedCountryCode) {
      setCountryCode(next);
      setMenuOpen(false);
      setInlineError(null);
      clearSelection();
    }

    function handleTextChange() {
      setInlineError(null);
      clearSelection();
    }

    function handlePlaceSelected(parsed: {
      address: string;
      latitude: number;
      longitude: number;
      zipCode: string;
      countryCode: string;
    }) {
      const details: AddressPlaceDetails = {
        address: parsed.address,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        zipCode: parsed.zipCode,
        countryCode: parsed.countryCode || countryCode.toUpperCase(),
      };
      setAddressDetails(details);
      setConfirmed(true);
      setInlineError(null);
      notifyAddress(details);
    }

    function handleEnterWithoutSelection() {
      if (placeConfirmed && isValidPlaceDetails(addressDetails)) return;
      setInlineError(ADDRESS_SELECTION_ERROR);
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

    return (
      <div ref={rootRef} className={`flex min-w-0 flex-1 flex-col gap-3 overflow-visible ${className}`.trim()}>
        <div className="overflow-visible">
          <label htmlFor={addressInputId} className="mb-1.5 block text-sm text-[#A0A0A0]">
            Enter your address
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

            {ready ? (
              <PlacesAutocompleteInput
                id={addressInputId}
                key={`address-${countryCode}`}
                countryCode={countryCode}
                placeTypes={["address"]}
                placeholder="Start typing your full address"
                autoComplete="street-address"
                className={`${fieldClass} flex-1 rounded-none sm:rounded-r-lg`}
                onTextChange={handleTextChange}
                onPlaceSelected={handlePlaceSelected}
                onEnterWithoutSelection={handleEnterWithoutSelection}
              />
            ) : (
              <input
                type="text"
                disabled
                placeholder="Loading…"
                className={`${fieldClass} flex-1 rounded-none opacity-50 sm:rounded-r-lg`}
              />
            )}
          </div>

          {inlineError ? (
            <p className="mt-1.5 text-xs text-[#A0A0A0]" role="alert">
              {inlineError}
            </p>
          ) : null}
        </div>
      </div>
    );
  },
);

export default AddressFieldWithCountry;
