const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google?: any;
    instaroofMapsInit?: () => void;
  }
}

export function hasGoogleMapsKey() {
  return Boolean(GOOGLE_MAPS_KEY);
}

export function loadGoogleMapsScript(): Promise<void> {
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
