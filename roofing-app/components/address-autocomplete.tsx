"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { SupportedCountryCode } from "@/lib/supported-countries";

const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google?: any;
    instaroofMapsInit?: () => void;
  }
}

export type AddressPlaceDetails = {
  address: string;
  latitude: number;
  longitude: number;
  zipCode: string;
  /** ISO 3166-1 alpha-2 from Google Places (e.g. GB, AU, NZ, US) */
  countryCode: string;
};

export type AddressAutocompleteHandle = {
  getValue: () => string;
  getPlaceDetails: () => AddressPlaceDetails | null;
};

type AddressAutocompleteProps = {
  countryCode: SupportedCountryCode;
  onAddressChange: (address: string) => void;
  onPlaceSelected?: (details: AddressPlaceDetails) => void;
  className?: string;
  placeholder?: string;
};

function loadGoogleMapsScript(): Promise<void> {
  if (!GOOGLE_MAPS_KEY) {
    return Promise.reject(new Error("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set"));
  }

  if (window.google?.maps?.places) {
    return Promise.resolve();
  }

  const existing = document.querySelector<HTMLScriptElement>('script[data-instaroof-maps="true"]');
  if (existing) {
    return new Promise((resolve, reject) => {
      if (window.google?.maps?.places) {
        resolve();
        return;
      }
      const onReady = () => {
        if (window.google?.maps?.places) resolve();
        else reject(new Error("Google Places library unavailable"));
      };
      window.instaroofMapsInit = onReady;
      existing.addEventListener("load", onReady, { once: true });
      existing.addEventListener("error", () => reject(new Error("Google Maps script failed to load")), {
        once: true,
      });
    });
  }

  return new Promise((resolve, reject) => {
    window.instaroofMapsInit = () => {
      if (window.google?.maps?.places) resolve();
      else reject(new Error("Google Places library unavailable"));
    };

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&libraries=places&callback=instaroofMapsInit`;
    script.async = true;
    script.defer = true;
    script.dataset.instaroofMaps = "true";
    script.onerror = () => reject(new Error("Google Maps script failed to load"));
    document.head.appendChild(script);
  });
}

const AddressAutocomplete = forwardRef<AddressAutocompleteHandle, AddressAutocompleteProps>(
  function AddressAutocomplete(
    { countryCode, onAddressChange, onPlaceSelected, className, placeholder = "Enter your property address" },
    ref,
  ) {
    const inputRef = useRef<HTMLInputElement>(null);
    const autocompleteRef = useRef<{
      addListener: (event: string, cb: () => void) => void;
      setComponentRestrictions: (r: { country: string }) => void;
      getPlace: () => {
        formatted_address?: string;
        geometry?: { location?: { lat: () => number; lng: () => number } };
        address_components?: Array<{ types: string[]; short_name: string }>;
      };
    } | null>(null);
    const [selectedPlace, setSelectedPlace] = useState<AddressPlaceDetails | null>(null);
    const onAddressChangeRef = useRef(onAddressChange);
    const onPlaceSelectedRef = useRef(onPlaceSelected);

    useImperativeHandle(ref, () => ({
      getValue: () => inputRef.current?.value?.trim() ?? "",
      getPlaceDetails: () => selectedPlace,
    }));

    useEffect(() => {
      onAddressChangeRef.current = onAddressChange;
      onPlaceSelectedRef.current = onPlaceSelected;
    }, [onAddressChange, onPlaceSelected]);

    useEffect(() => {
      setSelectedPlace(null);
    }, [countryCode]);

    useEffect(() => {
      if (!GOOGLE_MAPS_KEY || !inputRef.current) return;

      let cancelled = false;

      loadGoogleMapsScript()
        .then(() => {
          if (cancelled || !inputRef.current || !window.google?.maps?.places) return;

          const instance = new window.google.maps.places.Autocomplete(inputRef.current, {
            fields: ["formatted_address", "geometry", "address_components"],
            types: ["address"],
            componentRestrictions: { country: countryCode },
          });
          autocompleteRef.current = instance;

          instance.addListener("place_changed", () => {
            const place = instance.getPlace();
            const formatted = place?.formatted_address || inputRef.current?.value || "";
            onAddressChangeRef.current(formatted);
            const zip =
              place?.address_components?.find((c: { types: string[]; short_name: string }) =>
                c.types.includes("postal_code"),
              )?.short_name || "";
            const countryFromPlace =
              place?.address_components?.find((c: { types: string[]; short_name: string }) =>
                c.types.includes("country"),
              )?.short_name || "";
            const latFn = place?.geometry?.location?.lat;
            const lngFn = place?.geometry?.location?.lng;
            const latitude = typeof latFn === "function" ? latFn() : Number.NaN;
            const longitude = typeof lngFn === "function" ? lngFn() : Number.NaN;

            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
              console.warn("Google Places: missing geometry for selected address");
              onAddressChangeRef.current(formatted);
              return;
            }

            const details: AddressPlaceDetails = {
              address: formatted,
              latitude,
              longitude,
              zipCode: zip,
              countryCode: countryFromPlace,
            };
            setSelectedPlace(details);
            onPlaceSelectedRef.current?.(details);
          });
        })
        .catch((err) => {
          console.error("Google Places autocomplete:", err);
        });

      return () => {
        cancelled = true;
        autocompleteRef.current = null;
      };
    }, []);

    useEffect(() => {
      const instance = autocompleteRef.current;
      if (!instance?.setComponentRestrictions) return;
      instance.setComponentRestrictions({ country: countryCode });
      console.log("[address-autocomplete] Applying Places componentRestrictions:", { country: countryCode });
    }, [countryCode]);

    return (
      <input
        ref={inputRef}
        type="text"
        autoComplete="off"
        className={className}
        placeholder={placeholder}
        onChange={(e) => {
          const value = e.target.value;
          setSelectedPlace(null);
          onAddressChangeRef.current(value);
        }}
      />
    );
  },
);

export default AddressAutocomplete;

export function hasGoogleMapsKey() {
  return Boolean(GOOGLE_MAPS_KEY);
}
