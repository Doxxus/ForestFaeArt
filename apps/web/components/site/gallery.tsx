"use client";

import { useRef, useState } from "react";

export interface GalleryImage {
  /** A mid-size version for the page. */
  src: string;
  srcSet: string;
  /** The largest version, for the zoom view. */
  large: string;
  thumb: string;
  alt: string;
  width: number | null;
  height: number | null;
}

/**
 * Swipeable photos (native scroll-snap, so it works by touch, trackpad and keyboard), thumbnails,
 * and a zoom view. Without JavaScript the photos still scroll sideways.
 */
export function Gallery({ images, title }: { images: GalleryImage[]; title: string }) {
  const track = useRef<HTMLUListElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(0);

  const goTo = (i: number) => {
    const el = track.current;
    if (!el) return;
    const next = (i + images.length) % images.length;
    el.scrollTo({ left: next * el.clientWidth, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    setIndex(next);
  };
  const openZoom = (i: number) => {
    setZoom(i);
    dialog.current?.showModal();
  };
  const stepZoom = (d: number) => setZoom((z) => (z + d + images.length) % images.length);
  const many = images.length > 1;

  return (
    <div>
      <ul
        ref={track}
        aria-label={`Photos of ${title}`}
        onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-xl border border-stone bg-parchment [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((img, i) => (
          <li key={img.src} className="aspect-[4/5] min-w-full snap-center">
            <button type="button" onClick={() => openZoom(i)} className="block size-full cursor-zoom-in" aria-label={`Zoom in on photo ${i + 1} of ${images.length}`}>
              <img src={img.src} srcSet={img.srcSet} sizes="(min-width: 1024px) 50vw, 100vw" alt={img.alt} width={img.width ?? 960} height={img.height ?? 1200} loading={i === 0 ? "eager" : "lazy"} decoding="async" className="size-full object-contain" />
            </button>
          </li>
        ))}
      </ul>

      {many ? (
        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={() => goTo(index - 1)} aria-label="Previous photo" className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-forest text-forest hover:bg-parchment">
            ‹
          </button>
          <ul className="flex flex-1 gap-2 overflow-x-auto py-1">
            {images.map((img, i) => (
              <li key={img.thumb} className="shrink-0">
                <button type="button" onClick={() => goTo(i)} aria-label={`Show photo ${i + 1} of ${images.length}`} aria-current={i === index ? "true" : undefined} className={`block size-16 overflow-hidden rounded-md border-2 ${i === index ? "border-copperdeep" : "border-transparent opacity-80 hover:opacity-100"}`}>
                  <img src={img.thumb} alt="" width={64} height={64} loading="lazy" decoding="async" className="size-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => goTo(index + 1)} aria-label="Next photo" className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-forest text-forest hover:bg-parchment">
            ›
          </button>
        </div>
      ) : null}

      <dialog
        ref={dialog}
        aria-label={`Large photo of ${title}`}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") stepZoom(1);
          if (e.key === "ArrowLeft") stepZoom(-1);
        }}
        className="m-auto max-h-[96vh] w-[min(96vw,1100px)] rounded-xl bg-cream p-3 backdrop:bg-ink/80"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-moss" aria-live="polite">
            Photo {zoom + 1} of {images.length}
          </p>
          <div className="flex gap-2">
            {many ? (
              <>
                <button type="button" onClick={() => stepZoom(-1)} className="min-h-11 rounded-lg border border-forest px-4 text-forest hover:bg-parchment">
                  Previous
                </button>
                <button type="button" onClick={() => stepZoom(1)} className="min-h-11 rounded-lg border border-forest px-4 text-forest hover:bg-parchment">
                  Next
                </button>
              </>
            ) : null}
            <button type="button" onClick={() => dialog.current?.close()} className="min-h-11 rounded-lg bg-forest px-4 text-cream hover:bg-moss">
              Close
            </button>
          </div>
        </div>
        <div className="max-h-[80vh] overflow-auto">
          <img src={images[zoom]?.large} alt={images[zoom]?.alt} className="mx-auto max-h-[78vh] w-auto max-w-full object-contain" />
        </div>
      </dialog>
    </div>
  );
}
