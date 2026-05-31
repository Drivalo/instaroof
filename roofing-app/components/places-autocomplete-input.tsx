"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { loadGoogleMapsScript } from "@/lib/google-maps-script";
import { parseGooglePlace, type ParsedPlaceDetails } from "@/lib/parse-google-place";
import type { SupportedCountryCode } from "@/lib/supported-countries";

type PlacePrediction = {
  description: string;
  place_id: string;
};

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
  /** Address line (first line). With `postcode`, enables combined Places search. */
  value?: string;
  /** Postcode/zip combined with address line for Places queries. */
  postcode?: string;
};

function buildCombinedSearchQuery(addressLine: string, postcode: string): string {
  return [addressLine.trim(), postcode.trim()].filter(Boolean).join(", ");
}

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
  value,
  postcode,
}: PlacesAutocompleteInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const skipChangeRef = useRef(false);
  const autocompleteRef = useRef<{
    addListener: (event: string, cb: () => void) => void;
    setComponentRestrictions: (r: { country: string }) => void;
    getPlace: () => Parameters<typeof parseGooglePlace>[0];
  } | null>(null);
  const autocompleteServiceRef = useRef<{
    getPlacePredictions: (
      request: Record<string, unknown>,
      callback: (results: PlacePrediction[] | null, status: string) => void,
    ) => void;
  } | null>(null);
  const placesServiceRef = useRef<{
    getDetails: (
      request: Record<string, unknown>,
      callback: (place: Parameters<typeof parseGooglePlace>[0] | null, status: string) => void,
    ) => void;
  } | null>(null);
  const sessionTokenRef = useRef<unknown>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTextChangeRef = useRef(onTextChange);
  const onPlaceSelectedRef = useRef(onPlaceSelected);
  const onEnterWithoutSelectionRef = useRef(onEnterWithoutSelection);
  const generatedId = useId();
  const inputId = idProp ?? generatedId;

  const useCombinedSearch = postcode !== undefined;
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    onTextChangeRef.current = onTextChange;
    onPlaceSelectedRef.current = onPlaceSelected;
    onEnterWithoutSelectionRef.current = onEnterWithoutSelection;
  }, [onTextChange, onPlaceSelected, onEnterWithoutSelection]);

  const refreshSessionToken = useCallback(() => {
    if (!window.google?.maps?.places?.AutocompleteSessionToken) return;
    sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
  }, []);

  const selectPrediction = useCallback(
    (prediction: PlacePrediction) => {
      const service = placesServiceRef.current;
      if (!service) return;

      service.getDetails(
        {
          placeId: prediction.place_id,
          fields: ["formatted_address", "geometry", "address_components"],
          sessionToken: sessionTokenRef.current,
        },
        (place, status) => {
          if (status !== "OK" || !place) return;
          const parsed = parseGooglePlace(place);
          if (!parsed) return;

          skipChangeRef.current = true;
          onPlaceSelectedRef.current(parsed);
          if (inputRef.current) {
            inputRef.current.value = parsed.address;
          }
          setPredictions([]);
          setMenuOpen(false);
          setActiveIndex(-1);
          refreshSessionToken();
          queueMicrotask(() => {
            skipChangeRef.current = false;
          });
        },
      );
    },
    [refreshSessionToken],
  );

  const fetchPredictions = useCallback(
    (addressLine: string, postcodeValue: string) => {
      const service = autocompleteServiceRef.current;
      if (!service) return;

      const line = addressLine.trim();
      const pc = postcodeValue.trim();
      if (!line || !pc) {
        setPredictions([]);
        setMenuOpen(false);
        setActiveIndex(-1);
        return;
      }

      const input = buildCombinedSearchQuery(line, pc);
      service.getPlacePredictions(
        {
          input,
          componentRestrictions: { country: countryCode },
          types: placeTypes,
          sessionToken: sessionTokenRef.current,
        },
        (results, status) => {
          if (status !== "OK" || !results?.length) {
            setPredictions([]);
            setMenuOpen(false);
            setActiveIndex(-1);
            return;
          }
          setPredictions(
            results.map((r) => ({
              description: r.description,
              place_id: r.place_id,
            })),
          );
          setMenuOpen(true);
          setActiveIndex(-1);
        },
      );
    },
    [countryCode, placeTypes],
  );

  useEffect(() => {
    if (disabled || !inputRef.current) return;

    let cancelled = false;

    loadGoogleMapsScript()
      .then(() => {
        if (cancelled || !inputRef.current || !window.google?.maps?.places) return;

        if (useCombinedSearch) {
          const attribution = document.createElement("div");
          autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
          placesServiceRef.current = new window.google.maps.places.PlacesService(attribution);
          refreshSessionToken();
          return;
        }

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
      autocompleteServiceRef.current = null;
      placesServiceRef.current = null;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [disabled, placeTypes.join(","), countryCode, useCombinedSearch, refreshSessionToken]);

  useEffect(() => {
    autocompleteRef.current?.setComponentRestrictions?.({ country: countryCode });
  }, [countryCode]);

  useEffect(() => {
    if (!useCombinedSearch) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchPredictions(value ?? inputRef.current?.value ?? "", postcode ?? "");
    }, 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [useCombinedSearch, value, postcode, fetchPredictions]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [menuOpen]);

  const inputElement = (
    <input
      id={inputId}
      ref={inputRef}
      type="text"
      autoComplete={autoComplete}
      disabled={disabled}
      className={className}
      placeholder={placeholder}
      value={useCombinedSearch ? value : undefined}
      onChange={(e) => {
        if (skipChangeRef.current) return;
        onTextChangeRef.current(e.target.value);
        if (useCombinedSearch) {
          setMenuOpen(false);
          setActiveIndex(-1);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (useCombinedSearch && menuOpen && activeIndex >= 0 && predictions[activeIndex]) {
            selectPrediction(predictions[activeIndex]);
            return;
          }
          onEnterWithoutSelectionRef.current?.();
        }
        if (!useCombinedSearch || !menuOpen || !predictions.length) return;
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setActiveIndex((i) => Math.min(i + 1, predictions.length - 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setActiveIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === "Escape") {
          setMenuOpen(false);
          setActiveIndex(-1);
        }
      }}
    />
  );

  if (!useCombinedSearch) {
    return inputElement;
  }

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      {inputElement}
      {menuOpen && predictions.length > 0 ? (
        <ul
          role="listbox"
          aria-label="Address suggestions"
          className="absolute left-0 right-0 top-full z-[10001] mt-1 overflow-hidden rounded-lg border border-border-subtle bg-surface shadow-lg"
        >
          {predictions.map((prediction, index) => (
            <li key={prediction.place_id} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={`pac-item w-full border-t border-border-subtle text-left first:border-t-0 ${
                  index === activeIndex ? "bg-background" : ""
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectPrediction(prediction)}
              >
                <span className="pac-item-query">{prediction.description}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
