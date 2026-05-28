"use client";

import { useEffect, useRef } from "react";

const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

/** ISO 3166-1 alpha-2 codes: Australia, UK, US, New Zealand */
const AUTOCOMPLETE_COUNTRIES = ["au", "gb", "us", "nz"] as const;

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
};

type AddressAutocompleteProps = {
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

export default function AddressAutocomplete({
  onAddressChange,
  onPlaceSelected,
  className,
  placeholder = "Enter your property address",
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onAddressChangeRef = useRef(onAddressChange);
  const onPlaceSelectedRef = useRef(onPlaceSelected);

  useEffect(() => {
    onAddressChangeRef.current = onAddressChange;
    onPlaceSelectedRef.current = onPlaceSelected;
  }, [onAddressChange, onPlaceSelected]);

  useEffect(() => {
    if (!GOOGLE_MAPS_KEY || !inputRef.current) return;

    let autocomplete: {
      addListener: (event: string, cb: () => void) => void;
      getPlace: () => {
        formatted_address?: string;
        geometry?: { location?: { lat: () => number; lng: () => number } };
        address_components?: Array<{ types: string[]; short_name: string }>;
      };
    } | null = null;
    let cancelled = false;

    loadGoogleMapsScript()
      .then(() => {
        if (cancelled || !inputRef.current || !window.google?.maps?.places) return;

        const instance = new window.google.maps.places.Autocomplete(inputRef.current, {
          fields: ["formatted_address", "geometry", "address_components"],
          types: ["address"],
          componentRestrictions: { country: [...AUTOCOMPLETE_COUNTRIES] },
        });
        autocomplete = instance;

        instance.addListener("place_changed", () => {
          const place = instance.getPlace();
          const formatted = place?.formatted_address || inputRef.current?.value || "";
          onAddressChangeRef.current(formatted);
          const zip =
            place?.address_components?.find((c: { types: string[]; short_name: string }) =>
              c.types.includes("postal_code"),
            )?.short_name || "";
          onPlaceSelectedRef.current?.({
            address: formatted,
            latitude: place?.geometry?.location?.lat() || 0,
            longitude: place?.geometry?.location?.lng() || 0,
            zipCode: zip,
          });
        });
      })
      .catch((err) => {
        console.error("Google Places autocomplete:", err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <input
      ref={inputRef}
      type="text"
      autoComplete="off"
      className={className}
      placeholder={placeholder}
      onChange={(e) => onAddressChangeRef.current(e.target.value)}
    />
  );
}

export function hasGoogleMapsKey() {
  return Boolean(GOOGLE_MAPS_KEY);
}
