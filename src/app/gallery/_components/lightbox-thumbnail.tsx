"use client";

import Image from "next/image";
import { useLightbox } from "./lightbox-provider";

export function LightboxThumbnail({
  src,
  alt,
  width,
  height,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
}) {
  const openLightbox = useLightbox();

  return (
    <button
      type="button"
      onClick={() => openLightbox({ src, alt })}
      className="block w-full cursor-zoom-in"
      aria-label={`View larger: ${alt}`}
    >
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        className="h-auto w-full"
        unoptimized
      />
    </button>
  );
}
