"use client";

import { useEffect, useId, useRef } from "react";
import { loadGoogleMapsScript } from "@/lib/google-maps-script";
import { parseGooglePlace, type ParsedPlaceDetails } from "@/lib/parse-google-place";
import type { SupportedCountryCode } from "@/lib/supported-countries";

type PlacesAutocompleteInputProps = {
  id?: string;
  countryCode: SupportedCountryCode;
  placeTypes: string[];
  placeholder: string;
  className?: string;
  autoComplete?: string;
  disabled?: boolean;
  onTextChange: (value: string) => void;
  onPlaceSelected: (details: ParsedPlaceDetails) => void;
  onEnterWithoutSelection?: () => void;
};

export function PlacesAutocompleteInput({
  id: idProp,
  countryCode,
  placeTypes,
  placeholder,
  className,
  autoComplete = "off",
  disabled = false,
  onTextChange,
  onPlaceSelected,
  onEnterWithoutSelection,
}: PlacesAutocompleteInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const skipChangeRef = useRef(false);
  const autocompleteRef = useRef<{
    addListener: (event: string, cb: () => void) => void;
    setComponentRestrictions: (r: { country: string }) => void;
    getPlace: () => Parameters<typeof parseGooglePlace>[0];
  } | null>(null);
  const onTextChangeRef = useRef(onTextChange);
  const onPlaceSelectedRef = useRef(onPlaceSelected);
  const onEnterWithoutSelectionRef = useRef(onEnterWithoutSelection);
  const generatedId = useId();
  const inputId = idProp ?? generatedId;

  useEffect(() => {
    onTextChangeRef.current = onTextChange;
    onPlaceSelectedRef.current = onPlaceSelected;
    onEnterWithoutSelectionRef.current = onEnterWithoutSelection;
  }, [onTextChange, onPlaceSelected, onEnterWithoutSelection]);

  useEffect(() => {
    if (disabled || !inputRef.current) return;

    let cancelled = false;

    loadGoogleMapsScript()
      .then(() => {
        if (cancelled || !inputRef.current || !window.google?.maps?.places) return;

        const instance = new window.google.maps.places.Autocomplete(inputRef.current, {
          fields: ["formatted_address", "geometry", "address_components"],
          types: placeTypes,
          componentRestrictions: { country: countryCode },
        });
        autocompleteRef.current = instance;

        instance.addListener("place_changed", () => {
          const parsed = parseGooglePlace(instance.getPlace());
          if (!parsed) return;

          skipChangeRef.current = true;
          onPlaceSelectedRef.current(parsed);
          if (inputRef.current) {
            inputRef.current.value = parsed.address;
          }
          queueMicrotask(() => {
            skipChangeRef.current = false;
          });
        });
      })
      .catch((err) => {
        console.error("Google Places autocomplete:", err);
      });

    return () => {
      cancelled = true;
      autocompleteRef.current = null;
    };
  }, [disabled, placeTypes.join(","), countryCode]);

  useEffect(() => {
    autocompleteRef.current?.setComponentRestrictions?.({ country: countryCode });
  }, [countryCode]);

  return (
    <input
      id={inputId}
      ref={inputRef}
      type="text"
      autoComplete={autoComplete}
      disabled={disabled}
      className={className}
      placeholder={placeholder}
      onChange={(e) => {
        if (skipChangeRef.current) return;
        onTextChangeRef.current(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onEnterWithoutSelectionRef.current?.();
        }
      }}
    />
  );
}
