"use client";

import {
  ROOF_MAP_VIEWBOX_SIZE,
  ROOF_OUTLINE_STROKE,
  ROOF_OUTLINE_STROKE_WIDTH,
  roofOutlinePolylinePoints,
} from "@/lib/roof-outline";

type SatelliteRoofMapProps = {
  src: string;
  polygonCoordinates: unknown;
  alt?: string;
  className?: string;
  onImageReady?: () => void;
};

/**
 * Satellite imagery with an optional roof outline. Uses SVG polyline (stroke-only;
 * polylines cannot be filled per spec) so no colour wash appears over the image.
 */
export function SatelliteRoofMap({
  src,
  polygonCoordinates,
  alt = "Satellite",
  className = "",
  onImageReady,
}: SatelliteRoofMapProps) {
  const outlinePoints = roofOutlinePolylinePoints(polygonCoordinates);

  return (
    <div className={`relative w-full max-w-[600px] ${className}`.trim()}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        width={ROOF_MAP_VIEWBOX_SIZE}
        height={ROOF_MAP_VIEWBOX_SIZE}
        className="block w-full h-auto rounded-xl border border-border-subtle"
        onLoad={() => onImageReady?.()}
        onError={() => onImageReady?.()}
      />
      {outlinePoints ? (
        <svg
          viewBox={`0 0 ${ROOF_MAP_VIEWBOX_SIZE} ${ROOF_MAP_VIEWBOX_SIZE}`}
          className="absolute inset-0 h-full w-full pointer-events-none"
          fill="none"
          aria-hidden
        >
          <polyline
            points={outlinePoints}
            fill="none"
            stroke={ROOF_OUTLINE_STROKE}
            strokeWidth={ROOF_OUTLINE_STROKE_WIDTH}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </div>
  );
}
