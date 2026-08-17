"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface LightboxImage {
  src: string;
  alt: string;
}

const LightboxContext = createContext<((image: LightboxImage) => void) | null>(null);

export function useLightbox(): (image: LightboxImage) => void {
  const open = useContext(LightboxContext);
  if (!open) throw new Error("useLightbox must be used within a LightboxProvider");
  return open;
}

export function LightboxProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<LightboxImage | null>(null);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active]);

  return (
    <LightboxContext.Provider value={setActive}>
      {children}

      {active && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label={active.alt}
          onClick={() => setActive(null)}
        >
          <button
            type="button"
            onClick={() => setActive(null)}
            aria-label="Close"
            className="absolute top-4 right-4 text-3xl leading-none text-white/90 hover:text-white"
          >
            &times;
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- intrinsic size unknown at this scale; plain <img> lets it size naturally within the viewport */}
          <img
            src={active.src}
            alt={active.alt}
            className="max-h-full max-w-full cursor-zoom-out rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </LightboxContext.Provider>
  );
}
