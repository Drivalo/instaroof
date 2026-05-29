"use client";

const MAP_SIZE = 600;

type SatelliteRoofMapProps = {
  src: string;
  alt?: string;
  className?: string;
  onImageReady?: () => void;
};

/** Satellite imagery only — no overlays on the image. */
export function SatelliteRoofMap({
  src,
  alt = "Satellite",
  className = "",
  onImageReady,
}: SatelliteRoofMapProps) {
  return (
    <div className={`w-full max-w-[600px] ${className}`.trim()}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        width={MAP_SIZE}
        height={MAP_SIZE}
        className="block w-full h-auto rounded-xl border border-border-subtle"
        onLoad={() => onImageReady?.()}
        onError={() => onImageReady?.()}
      />
    </div>
  );
}
