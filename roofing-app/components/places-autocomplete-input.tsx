"use client";

import { useEffect, useId, useRef } from "react";
import { loadGoogleMapsScript } from "@/lib/google-maps-script";
import { parseGooglePlace, type MapBoundsLiteral, type ParsedPlaceDetails } from "@/lib/parse-google-place";
import type { SupportedCountryCode } from "@/lib/supported-countries";

type PlacesAutocompleteInputProps = {
  id?: string;
  countryCode: SupportedCountryCode;
  placeTypes: string[];
  bounds?: MapBoundsLiteral;
  /** When true, only results inside bounds (often too strict for postcodes). Default: bias only. */
  strictBounds?: boolean;
  placeholder: string;
  className?: string;
  disabled?: boolean;
  onTextChange: (value: string) => void;
  onPlaceSelected: (details: ParsedPlaceDetails) => void;
};

function toLatLngBounds(bounds: MapBoundsLiteral) {
  const sw = new window.google.maps.LatLng(bounds.south, bounds.west);
  const ne = new window.google.maps.LatLng(bounds.north, bounds.east);
  return new window.google.maps.LatLngBounds(sw, ne);
}

export function PlacesAutocompleteInput({
  id: idProp,
  countryCode,
  placeTypes,
  bounds,
  strictBounds = false,
  placeholder,
  className,
  disabled = false,
  onTextChange,
  onPlaceSelected,
}: PlacesAutocompleteInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<{
    addListener: (event: string, cb: () => void) => void;
    setComponentRestrictions: (r: { country: string }) => void;
    setBounds: (b: unknown) => void;
    setOptions: (o: { strictBounds?: boolean }) => void;
    getPlace: () => Parameters<typeof parseGooglePlace>[0];
  } | null>(null);
  const onTextChangeRef = useRef(onTextChange);
  const onPlaceSelectedRef = useRef(onPlaceSelected);
  const generatedId = useId();
  const inputId = idProp ?? generatedId;

  useEffect(() => {
    onTextChangeRef.current = onTextChange;
    onPlaceSelectedRef.current = onPlaceSelected;
  }, [onTextChange, onPlaceSelected]);

  useEffect(() => {
    if (disabled || !inputRef.current) return;

    let cancelled = false;
    const boundsKey = bounds
      ? `${bounds.north},${bounds.south},${bounds.east},${bounds.west}`
      : "none";

    loadGoogleMapsScript()
      .then(() => {
        if (cancelled || !inputRef.current || !window.google?.maps?.places) return;

        const options: Record<string, unknown> = {
          fields: ["formatted_address", "geometry", "address_components"],
          types: placeTypes,
          componentRestrictions: { country: countryCode },
        };

        if (bounds) {
          options.bounds = toLatLngBounds(bounds);
          options.strictBounds = strictBounds;
        }

        const instance = new window.google.maps.places.Autocomplete(inputRef.current, options);
        autocompleteRef.current = instance;

        console.log("[places-autocomplete] initialized", {
          types: placeTypes,
          country: countryCode,
          bounds: bounds ?? null,
          strictBounds: Boolean(bounds && strictBounds),
        });

        instance.addListener("place_changed", () => {
          const parsed = parseGooglePlace(instance.getPlace());
          if (!parsed) return;
          if (inputRef.current) inputRef.current.value = parsed.address;
          onPlaceSelectedRef.current(parsed);
        });
      })
      .catch((err) => {
        console.error("Google Places autocomplete:", err);
      });

    return () => {
      cancelled = true;
      autocompleteRef.current = null;
    };
  }, [disabled, placeTypes.join(","), countryCode, boundsKey, strictBounds]);

  useEffect(() => {
    const instance = autocompleteRef.current;
    if (!instance) return;
    instance.setComponentRestrictions?.({ country: countryCode });
    if (bounds && instance.setBounds) {
      instance.setBounds(toLatLngBounds(bounds));
      instance.setOptions?.({ strictBounds });
    }
  }, [countryCode, bounds, strictBounds]);

  return (
    <input
      id={inputId}
      ref={inputRef}
      type="text"
      autoComplete="off"
      disabled={disabled}
      className={className}
      placeholder={placeholder}
      onChange={(e) => onTextChangeRef.current(e.target.value)}
    />
  );
}
