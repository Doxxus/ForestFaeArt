"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Item = { id: number; name: string; state: "preparing" | "uploading" | "done" | "error"; message?: string };

const MAX_EDGE = 2400;
const RESIZE_ABOVE_BYTES = 5 * 1024 * 1024;
const DIRECT = ["image/jpeg", "image/png", "image/webp"];

const isHeic = (f: File) => /hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name);

/**
 * Gets a photo ready to send: converts HEIC to JPEG (the converter only loads when needed), turns it upright, and shrinks
 * very large photos. Re-encoding also drops location data. Photos that are already a sensible size are sent untouched, and
 * the server removes their metadata.
 */
async function prepare(file: File): Promise<Blob> {
  let blob: Blob = file;
  if (isHeic(file)) {
    const { default: heic2any } = await import("heic2any");
    const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    blob = Array.isArray(converted) ? converted[0]! : converted;
  } else if (!DIRECT.includes(file.type)) {
    throw new Error("Please choose a JPEG, PNG, WebP or HEIC photo.");
  }

  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" }).catch(() => null);
  if (!bitmap) return blob;
  const longest = Math.max(bitmap.width, bitmap.height);
  if (longest <= MAX_EDGE && blob.size <= RESIZE_ABOVE_BYTES && blob.type === file.type) {
    bitmap.close();
    return blob;
  }
  const scale = Math.min(1, MAX_EDGE / longest);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  return out ?? blob;
}

async function send(query: string, blob: Blob): Promise<void> {
  let lastError = "The upload didn't work. Please try again.";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 1000 * attempt));
    try {
      const res = await fetch(`/admin/upload?${query}`, {
        method: "POST",
        headers: { "content-type": blob.type || "application/octet-stream" },
        body: blob,
        credentials: "same-origin",
      });
      if (res.ok) return;
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      lastError = body.error ?? lastError;
      // Problems with the photo itself won't be fixed by trying again.
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) throw new Error(lastError);
    } catch (error) {
      if (error instanceof Error && error.message === lastError) throw error;
      lastError = "We couldn't reach the server. Check your connection and we'll try again.";
    }
  }
  throw new Error(lastError);
}

/**
 * `query` says what the photo belongs to, already URL-encoded: `productId=...`, `eventId=...` or `contentKey=...`.
 * Events and pages hold a single picture, so they pass `single` and a replacing label.
 */
export function PhotoUploader({ query, single = false, label }: { query: string; single?: boolean; label?: string }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const counter = useRef(0);

  const update = (id: number, patch: Partial<Item>) => setItems((all) => all.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  async function handle(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const queue = [...files].map((file) => ({ id: ++counter.current, file }));
    setItems((all) => [...all, ...queue.map((q) => ({ id: q.id, name: q.file.name, state: "preparing" as const }))]);
    for (const { id, file } of queue) {
      try {
        const blob = await prepare(file);
        update(id, { state: "uploading" });
        await send(query, blob);
        update(id, { state: "done" });
      } catch (error) {
        update(id, { state: "error", message: error instanceof Error ? error.message : "That photo couldn't be added." });
      }
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-forest px-4 py-2 font-medium text-cream hover:bg-moss">
          {label ?? (single ? "Choose a photo" : "Add photos")}
          <input type="file" accept="image/*,.heic,.heif" multiple={!single} className="sr-only" disabled={busy} onChange={(e) => { void handle(e.target.files); e.target.value = ""; }} />
        </label>
        {single ? null : (
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-forest px-4 py-2 font-medium text-forest hover:bg-parchment">
            Take a photo
            <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={busy} onChange={(e) => { void handle(e.target.files); e.target.value = ""; }} />
          </label>
        )}
      </div>
      {items.length ? (
        <ul className="mt-3 space-y-1 text-sm" aria-live="polite">
          {items.map((i) => (
            <li key={i.id} className={i.state === "error" ? "text-danger" : "text-moss"}>
              {i.name}:{" "}
              {i.state === "preparing" ? "getting ready…" : i.state === "uploading" ? "uploading…" : i.state === "done" ? "added" : i.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
