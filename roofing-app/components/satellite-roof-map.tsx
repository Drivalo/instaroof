"use client";

import { useEffect, useRef, useState } from "react";
import { hasGoogleMapsKey, loadGoogleMapsScript } from "@/lib/google-maps-script";

const MAP_SIZE = 600;
const DEFAULT_ZOOM = 20;
const CONTAINER_CLASS =
  "relative w-full max-w-[600px] h-[300px] md:h-[400px] min-h-[300px] overflow-hidden rounded-xl border border-border-subtle bg-[#2A2A2A]";

type SatelliteRoofMapProps = {
  latitude: number;
  longitude: number;
  /** Same-origin static satellite proxy fallback */
  fallbackSrc?: string;
  alt?: string;
  className?: string;
  onImageReady?: () => void;
};

function isValidCenter(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
}

/** Interactive Google Maps satellite view with static image fallback. */
export function SatelliteRoofMap({
  latitude,
  longitude,
  fallbackSrc,
  alt = "Satellite view of property",
  className = "",
  onImageReady,
}: SatelliteRoofMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ setCenter: (c: { lat: number; lng: number }) => void; setMapTypeId: (id: string) => void } | null>(
    null,
  );
  const readyNotifiedRef = useRef(false);
  const [mode, setMode] = useState<"loading" | "map" | "static" | "error">("loading");
  const [staticFailed, setStaticFailed] = useState(false);

  function notifyReady() {
    if (readyNotifiedRef.current) return;
    readyNotifiedRef.current = true;
    onImageReady?.();
  }

  useEffect(() => {
    readyNotifiedRef.current = false;
    setMode("loading");
    setStaticFailed(false);
    mapRef.current = null;

    if (!isValidCenter(latitude, longitude)) {
      setMode(fallbackSrc ? "static" : "error");
      if (!fallbackSrc) notifyReady();
      return;
    }

    if (!hasGoogleMapsKey()) {
      console.warn(
        "[SatelliteRoofMap] NEXT_PUBLIC_GOOGLE_MAPS_API_KEY missing — using static fallback. Enable Maps JavaScript API and Maps Static API in Google Cloud Console.",
      );
      setMode(fallbackSrc ? "static" : "error");
      if (!fallbackSrc) notifyReady();
      return;
    }

    let cancelled = false;

    const initMap = async () => {
      try {
        await loadGoogleMapsScript({ requirePlaces: false });
      } catch (err) {
        console.error("[SatelliteRoofMap] Google Maps script failed:", err);
        if (!cancelled) {
          setMode(fallbackSrc ? "static" : "error");
          if (!fallbackSrc) notifyReady();
        }
        return;
      }

      if (cancelled) return;

      // Wait for layout so the container has explicit height before Map init.
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });

      const el = mapContainerRef.current;
      if (cancelled || !el) return;

      const rect = el.getBoundingClientRect();
      if (rect.height < 1 || rect.width < 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
      }

      if (cancelled || !mapContainerRef.current || !window.google?.maps?.Map) {
        console.error("[SatelliteRoofMap] Map container or google.maps.Map unavailable");
        setMode(fallbackSrc ? "static" : "error");
        if (!fallbackSrc) notifyReady();
        return;
      }

      try {
        const center = { lat: latitude, lng: longitude };
        const map = new window.google.maps.Map(mapContainerRef.current, {
          center,
          zoom: DEFAULT_ZOOM,
          mapTypeId: "satellite",
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: true,
          gestureHandling: "cooperative",
          keyboardShortcuts: false,
        });

        mapRef.current = map;
        map.setMapTypeId("satellite");

        const finish = () => {
          if (cancelled) return;
          setMode("map");
          notifyReady();
        };

        const tilesListener = window.google.maps.event.addListenerOnce(map, "tilesloaded", finish);
        const idleListener = window.google.maps.event.addListenerOnce(map, "idle", finish);

        window.google.maps.event.trigger(map, "resize");
        map.setCenter(center);

        window.setTimeout(() => {
          if (!cancelled && !readyNotifiedRef.current) {
            window.google.maps.event.removeListener(tilesListener);
            window.google.maps.event.removeListener(idleListener);
            finish();
          }
        }, 4000);
      } catch (err) {
        console.error("[SatelliteRoofMap] Map init failed:", err);
        setMode(fallbackSrc ? "static" : "error");
        if (!fallbackSrc) notifyReady();
      }
    };

    void initMap();

    return () => {
      cancelled = true;
      mapRef.current = null;
    };
  }, [latitude, longitude, fallbackSrc]);

  useEffect(() => {
    if (mode !== "map" || !mapRef.current) return;
    const center = { lat: latitude, lng: longitude };
    mapRef.current.setCenter(center);
    mapRef.current.setMapTypeId("satellite");
    window.google?.maps?.event?.trigger(mapRef.current, "resize");
  }, [latitude, longitude, mode]);

  const showMap = mode === "map" || mode === "loading";
  const showStatic = (mode === "static" || (mode === "error" && fallbackSrc)) && fallbackSrc && !staticFailed;

  return (
    <div className={`${CONTAINER_CLASS} ${className}`.trim()}>
      <div
        ref={mapContainerRef}
        className={`absolute inset-0 h-full w-full ${showMap ? "visible" : "invisible pointer-events-none"}`}
        aria-hidden={!showMap}
      />

      {showStatic ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={fallbackSrc}
          alt={alt}
          width={MAP_SIZE}
          height={MAP_SIZE}
          className="absolute inset-0 h-full w-full object-cover"
          onLoad={() => {
            setMode("static");
            notifyReady();
          }}
          onError={() => {
            console.error(
              "[SatelliteRoofMap] Static satellite image failed. Enable Maps Static API and check billing/API restrictions for your key.",
              fallbackSrc,
            );
            setStaticFailed(true);
            setMode("error");
            notifyReady();
          }}
        />
      ) : null}

      {mode === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-[#A0A0A0]">
          Loading satellite imagery…
        </div>
      )}

      {mode === "error" && (
        <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-[#A0A0A0]">
          Satellite imagery unavailable. Check that Maps JavaScript API and Maps Static API are enabled for your Google
          Maps key, billing is active, and key restrictions allow this site.
        </div>
      )}
    </div>
  );
}
