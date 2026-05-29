"use client";

import { forwardRef, useEffect, useState } from "react";
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

    const selected = getSupportedCountry(countryCode);

    return (
      <div
        className={`flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border-subtle bg-[#1C1C1C] transition-colors focus-within:border-[#F5A623] sm:flex-row ${className}`.trim()}
      >
        <label className="relative flex shrink-0 items-center border-b border-border-subtle sm:border-b-0 sm:border-r">
          <span className="pointer-events-none absolute left-3 text-base leading-none" aria-hidden>
            {selected.flag}
          </span>
          <select
            value={countryCode}
            onChange={(e) => {
              const next = e.target.value as SupportedCountryCode;
              setCountryCode(next);
              onAddressChange("");
              console.log("[address-autocomplete] User selected country:", next);
            }}
            aria-label="Country"
            className="cursor-pointer appearance-none bg-[#2A2A2A] py-3.5 pl-9 pr-9 text-sm font-medium text-[#FFFFFF] focus:outline-none focus:ring-0"
          >
            {SUPPORTED_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code} className="bg-[#2A2A2A] text-[#FFFFFF]">
                {c.displayCode}
              </option>
            ))}
          </select>
          <span
            className="pointer-events-none absolute right-2.5 text-[10px] text-[#F5A623]"
            aria-hidden
          >
            ▼
          </span>
        </label>

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
