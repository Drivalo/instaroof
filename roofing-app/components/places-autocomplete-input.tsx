"use client";

import { useEffect, useId, useRef } from "react";
import { loadGoogleMapsScript } from "@/lib/google-maps-script";
import { parseGooglePlace, type ParsedPlaceDetails } from "@/lib/parse-google-place";
import type { SupportedCountryCode } from "@/lib/supported-countries";

export type LocationCenter = {
  lat: number;
  lng: number;
};

type PlacesAutocompleteInputProps = {
  id?: string;
  countryCode: SupportedCountryCode;
  placeTypes: string[];
  /** Postcode centre from Postcodes.io / Geocoding API */
  locationCenter?: LocationCenter | null;
  /** Search radius in metres (e.g. 200 strict, 1000 fallback) */
  radiusMeters?: number;
  strictBounds?: boolean;
  placeholder: string;
  className?: string;
  autoComplete?: string;
  disabled?: boolean;
  onTextChange: (value: string) => void;
  onPlaceSelected: (details: ParsedPlaceDetails) => void;
};

function circleBounds(lat: number, lng: number, radiusMeters: number) {
  const center = new window.google.maps.LatLng(lat, lng);
  const circle = new window.google.maps.Circle({
    center,
    radius: radiusMeters,
  });
  return { center, bounds: circle.getBounds() };
}

export function PlacesAutocompleteInput({
  id: idProp,
  countryCode,
  placeTypes,
  locationCenter,
  radiusMeters,
  strictBounds = false,
  placeholder,
  className,
  autoComplete = "off",
  disabled = false,
  onTextChange,
  onPlaceSelected,
}: PlacesAutocompleteInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<{
    addListener: (event: string, cb: () => void) => void;
    setComponentRestrictions: (r: { country: string }) => void;
    setBounds: (b: unknown) => void;
    setOptions: (o: {
      strictBounds?: boolean;
      bounds?: unknown;
      location?: unknown;
      radius?: number;
    }) => void;
    getPlace: () => Parameters<typeof parseGooglePlace>[0];
  } | null>(null);
  const onTextChangeRef = useRef(onTextChange);
  const onPlaceSelectedRef = useRef(onPlaceSelected);
  const generatedId = useId();
  const inputId = idProp ?? generatedId;

  const hasLocation =
    locationCenter != null &&
    Number.isFinite(locationCenter.lat) &&
    Number.isFinite(locationCenter.lng) &&
    radiusMeters != null &&
    radiusMeters > 0;

  useEffect(() => {
    onTextChangeRef.current = onTextChange;
    onPlaceSelectedRef.current = onPlaceSelected;
  }, [onTextChange, onPlaceSelected]);

  useEffect(() => {
    if (disabled || !inputRef.current) return;
    if (placeTypes.includes("address") && !hasLocation) return;

    let cancelled = false;

    loadGoogleMapsScript()
      .then(() => {
        if (cancelled || !inputRef.current || !window.google?.maps?.places) return;

        const options: Record<string, unknown> = {
          fields: ["formatted_address", "geometry", "address_components"],
          types: placeTypes,
          componentRestrictions: { country: countryCode },
        };

        if (hasLocation && locationCenter && radiusMeters) {
          const { center, bounds } = circleBounds(
            locationCenter.lat,
            locationCenter.lng,
            radiusMeters,
          );
          options.location = center;
          options.radius = radiusMeters;
          options.bounds = bounds;
          options.strictBounds = strictBounds;
        }

        const instance = new window.google.maps.places.Autocomplete(inputRef.current, options);
        autocompleteRef.current = instance;

        console.log("[places-autocomplete] initialized", {
          types: placeTypes,
          componentRestrictions: { country: countryCode },
          location: hasLocation ? locationCenter : null,
          radius: radiusMeters ?? null,
          strictBounds: Boolean(hasLocation && strictBounds),
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
  }, [
    disabled,
    placeTypes.join(","),
    countryCode,
    hasLocation,
    locationCenter?.lat,
    locationCenter?.lng,
    radiusMeters,
    strictBounds,
  ]);

  useEffect(() => {
    const instance = autocompleteRef.current;
    if (!instance || !hasLocation || !locationCenter || !radiusMeters) return;

    instance.setComponentRestrictions?.({ country: countryCode });

    const { center, bounds } = circleBounds(locationCenter.lat, locationCenter.lng, radiusMeters);
    if (bounds) instance.setBounds(bounds);
    instance.setOptions({
      strictBounds: Boolean(strictBounds),
      bounds,
      location: center,
      radius: radiusMeters,
    });

    console.log("[places-autocomplete] location bias updated:", {
      componentRestrictions: { country: countryCode },
      location: { lat: locationCenter.lat, lng: locationCenter.lng },
      radius: radiusMeters,
      strictBounds,
    });
  }, [countryCode, locationCenter?.lat, locationCenter?.lng, radiusMeters, strictBounds, hasLocation]);

  return (
    <input
      id={inputId}
      ref={inputRef}
      type="text"
      autoComplete={autoComplete}
      disabled={disabled}
      className={className}
      placeholder={placeholder}
      onChange={(e) => onTextChangeRef.current(e.target.value)}
    />
  );
}
