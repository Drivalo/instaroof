const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google?: any;
    roofCaptureMapsInit?: () => void;
  }
}

function isMapsCoreReady(): boolean {
  return typeof window.google?.maps?.Map === "function";
}

function isPlacesReady(): boolean {
  return Boolean(window.google?.maps?.places);
}

export function hasGoogleMapsKey() {
  return Boolean(GOOGLE_MAPS_KEY);
}

type LoadGoogleMapsOptions = {
  /** When true, waits for the Places library (autocomplete). When false, only the core Map API. */
  requirePlaces?: boolean;
};

export function loadGoogleMapsScript(options: LoadGoogleMapsOptions = {}): Promise<void> {
  const { requirePlaces = true } = options;

  if (!GOOGLE_MAPS_KEY) {
    return Promise.reject(new Error("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set"));
  }

  if (requirePlaces ? isPlacesReady() : isMapsCoreReady()) {
    return Promise.resolve();
  }

  const existing = document.querySelector<HTMLScriptElement>('script[data-roofcapture-maps="true"]');
  if (existing) {
    return new Promise((resolve, reject) => {
      if (requirePlaces ? isPlacesReady() : isMapsCoreReady()) {
        resolve();
        return;
      }
      const onReady = () => {
        if (requirePlaces ? isPlacesReady() : isMapsCoreReady()) resolve();
        else reject(new Error("Google Maps library unavailable"));
      };
      window.roofCaptureMapsInit = onReady;
      existing.addEventListener("load", onReady, { once: true });
      existing.addEventListener("error", () => reject(new Error("Google Maps script failed to load")), {
        once: true,
      });
    });
  }

  return new Promise((resolve, reject) => {
    window.roofCaptureMapsInit = () => {
      if (requirePlaces ? isPlacesReady() : isMapsCoreReady()) resolve();
      else reject(new Error("Google Maps library unavailable"));
    };

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&libraries=places&callback=roofCaptureMapsInit`;
    script.async = true;
    script.defer = true;
    script.dataset.roofCaptureMaps = "true";
    script.onerror = () => reject(new Error("Google Maps script failed to load"));
    document.head.appendChild(script);
  });
}
