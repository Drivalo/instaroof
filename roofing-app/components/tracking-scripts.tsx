"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
  }
}

export default function TrackingScripts() {
  useEffect(() => {
    fetch("/api/public/bootstrap")
      .then((r) => r.json())
      .then(({ settings }) => {
        if (settings?.facebook_pixel_id) {
          const s = document.createElement("script");
          s.innerHTML = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window, document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init', '${settings.facebook_pixel_id}');fbq('track', 'PageView');`;
          document.body.appendChild(s);
        }
        if (settings?.google_ads_tag) {
          const g = document.createElement("script");
          g.async = true;
          g.src = `https://www.googletagmanager.com/gtag/js?id=${settings.google_ads_tag}`;
          document.body.appendChild(g);
          const i = document.createElement("script");
          i.innerHTML = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js', new Date());gtag('config', '${settings.google_ads_tag}');`;
          document.body.appendChild(i);
        }
      });
  }, []);

  return null;
}
