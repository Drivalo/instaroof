"use client";

import { forwardRef, useEffect, useId, useRef, useState } from "react";
import AddressAutocomplete, {
  AddressAutocompleteHandle,
  AddressPlaceDetails,
} from "@/components/address-autocomplete";
import { detectDefaultSupportedCountry } from "@/lib/detect-country";
import {
  getSupportedCountry,
  SUPPORTED_COUNTRIES,
  type SupportedCountryCode,
} from "@/lib/supported-countries";

export type { AddressAutocompleteHandle, AddressPlaceDetails };

function flagImageUrl(code: SupportedCountryCode) {
  return `https://flagcdn.com/w20/${code}.png`;
}

type AddressFieldWithCountryProps = {
  onAddressChange: (address: string) => void;
  onPlaceSelected?: (details: AddressPlaceDetails) => void;
  placeholder?: string;
  className?: string;
};

const AddressFieldWithCountry = forwardRef<AddressAutocompleteHandle, AddressFieldWithCountryProps>(
  function AddressFieldWithCountry(
    { onAddressChange, onPlaceSelected, placeholder, className = "" },
    ref,
  ) {
    const [countryCode, setCountryCode] = useState<SupportedCountryCode>("us");
    const [ready, setReady] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const menuId = useId();
    const rootRef = useRef<HTMLDivElement>(null);

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

    function selectCountry(next: SupportedCountryCode) {
      setCountryCode(next);
      onAddressChange("");
      setMenuOpen(false);
      console.log("[address-autocomplete] User selected country:", next);
    }

    return (
      <div
        ref={rootRef}
        className={`flex min-w-0 flex-1 flex-col overflow-visible rounded-lg border border-border-subtle bg-[#1C1C1C] transition-colors focus-within:border-[#F5A623] sm:flex-row ${className}`.trim()}
      >
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
          <AddressAutocomplete
            key={countryCode}
            ref={ref}
            countryCode={countryCode}
            onAddressChange={onAddressChange}
            onPlaceSelected={onPlaceSelected}
            placeholder={placeholder}
            className="min-w-0 flex-1 w-full rounded-none border-0 bg-[#1C1C1C] px-4 py-3.5 text-[#FFFFFF] placeholder:text-[#A0A0A0]/70 focus:outline-none"
          />
        ) : (
          <input
            type="text"
            disabled
            placeholder={placeholder ?? "Enter your property address"}
            className="min-w-0 flex-1 w-full rounded-none border-0 bg-[#1C1C1C] px-4 py-3.5 text-[#FFFFFF]/50 placeholder:text-[#A0A0A0]/50"
          />
        )}
      </div>
    );
  },
);

export default AddressFieldWithCountry;
