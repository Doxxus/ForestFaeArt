/**
 * Upload safety for product photos: content sniffing, size reading and metadata stripping (IMG-3, IMG-7).
 * The client already re-encodes photos, but the server never trusts that: anything it stores has had location
 * and other metadata removed. JPEG keeps only its orientation tag so phone photos still display the right way up.
 */

export type ImageKind = "jpeg" | "png" | "webp";

export const IMAGE_TYPES: Record<ImageKind, { contentType: string; ext: string }> = {
  jpeg: { contentType: "image/jpeg", ext: "jpg" },
  png: { contentType: "image/png", ext: "png" },
  webp: { contentType: "image/webp", ext: "webp" },
};

export class InvalidImageError extends Error {
  constructor(message = "That doesn't look like a valid photo.") {
    super(message);
  }
}

export function detectImage(b: Uint8Array): ImageKind | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length > 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return "png";
  if (b.length > 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "webp";
  return null;
}

const ascii = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n));
const u16be = (b: Uint8Array, at: number) => ((b[at] ?? 0) << 8) | (b[at + 1] ?? 0);
const u32be = (b: Uint8Array, at: number) => (((b[at] ?? 0) * 2 ** 24) + ((b[at + 1] ?? 0) << 16) + ((b[at + 2] ?? 0) << 8) + (b[at + 3] ?? 0)) >>> 0;
const u32le = (b: Uint8Array, at: number) => (((b[at + 3] ?? 0) * 2 ** 24) + ((b[at + 2] ?? 0) << 16) + ((b[at + 1] ?? 0) << 8) + (b[at] ?? 0)) >>> 0;
const u24le = (b: Uint8Array, at: number) => (b[at] ?? 0) | ((b[at + 1] ?? 0) << 8) | ((b[at + 2] ?? 0) << 16);

// ---------------------------------------------------------------------------
// JPEG
// ---------------------------------------------------------------------------

const STANDALONE = (m: number) => m === 0x01 || (m >= 0xd0 && m <= 0xd8) || m === 0xd9;
const isSof = (m: number) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;

interface JpegSegment {
  marker: number;
  start: number;
  end: number;
}

function jpegSegments(b: Uint8Array): { segments: JpegSegment[]; scanStart: number } {
  const segments: JpegSegment[] = [];
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) throw new InvalidImageError();
    while (b[i + 1] === 0xff) i++;
    const marker = b[i + 1];
    if (marker === undefined) throw new InvalidImageError();
    if (STANDALONE(marker)) {
      i += 2;
      continue;
    }
    const length = u16be(b, i + 2);
    const end = i + 2 + length;
    if (length < 2 || end > b.length) throw new InvalidImageError();
    if (marker === 0xda) return { segments, scanStart: i };
    segments.push({ marker, start: i, end });
    i = end;
  }
  throw new InvalidImageError();
}

/** EXIF orientation 1 to 8 from an APP1 segment, or 1 when absent or unreadable. */
function exifOrientation(b: Uint8Array, seg: JpegSegment): number {
  const d = seg.start + 4;
  if (seg.end - d < 14 || ascii(b, d, 6) !== "Exif\0\0") return 1;
  const tiff = d + 6;
  const little = ascii(b, tiff, 2) === "II";
  if (!little && ascii(b, tiff, 2) !== "MM") return 1;
  const u16 = (at: number) => (little ? (b[at] ?? 0) | ((b[at + 1] ?? 0) << 8) : u16be(b, at));
  const u32 = (at: number) => (little ? u32le(b, at) : u32be(b, at));
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > seg.end) return 1;
  const count = u16(ifd);
  for (let n = 0; n < count; n++) {
    const entry = ifd + 2 + n * 12;
    if (entry + 12 > seg.end) return 1;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}

/** A minimal Exif block holding only the orientation tag. */
function orientationSegment(orientation: number): Uint8Array {
  // prettier-ignore
  return Uint8Array.from([
    0xff, 0xe1, 0x00, 0x22,
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,
    0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ]);
}

function sanitizeJpeg(b: Uint8Array): { bytes: Uint8Array; orientation: number } {
  const { segments, scanStart } = jpegSegments(b);
  const exif = segments.find((s) => s.marker === 0xe1 && ascii(b, s.start + 4, 6) === "Exif\0\0");
  const orientation = exif ? exifOrientation(b, exif) : 1;

  // APP1 (Exif, XMP), APP13 (IPTC) and comments are dropped. Everything else, including the ICC profile, stays.
  const dropped = new Set([0xe1, 0xed, 0xfe]);
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  if (orientation !== 1) parts.push(orientationSegment(orientation));
  for (const s of segments) if (!dropped.has(s.marker)) parts.push(b.subarray(s.start, s.end));
  parts.push(b.subarray(scanStart));
  return { bytes: concat(parts), orientation };
}

function jpegDimensions(b: Uint8Array): { width: number; height: number } {
  const { segments } = jpegSegments(b);
  const sof = segments.find((s) => isSof(s.marker));
  if (!sof) throw new InvalidImageError();
  return { height: u16be(b, sof.start + 5), width: u16be(b, sof.start + 7) };
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

const PNG_DROP = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);

function pngChunks(b: Uint8Array): { type: string; start: number; end: number }[] {
  const chunks: { type: string; start: number; end: number }[] = [];
  let i = 8;
  while (i < b.length) {
    const length = u32be(b, i);
    const end = i + 12 + length;
    if (end > b.length) throw new InvalidImageError();
    chunks.push({ type: ascii(b, i + 4, 4), start: i, end });
    i = end;
  }
  if (chunks[0]?.type !== "IHDR" || chunks.at(-1)?.type !== "IEND") throw new InvalidImageError();
  return chunks;
}

function sanitizePng(b: Uint8Array): Uint8Array {
  const chunks = pngChunks(b);
  return concat([b.subarray(0, 8), ...chunks.filter((c) => !PNG_DROP.has(c.type)).map((c) => b.subarray(c.start, c.end))]);
}

// ---------------------------------------------------------------------------
// WebP
// ---------------------------------------------------------------------------

function webpChunks(b: Uint8Array): { type: string; start: number; end: number; dataStart: number; size: number }[] {
  if (u32le(b, 4) + 8 > b.length) throw new InvalidImageError();
  const chunks = [];
  let i = 12;
  while (i + 8 <= b.length) {
    const size = u32le(b, i + 4);
    const end = i + 8 + size + (size % 2);
    if (end > b.length + 1) throw new InvalidImageError();
    chunks.push({ type: ascii(b, i, 4), start: i, end: Math.min(end, b.length), dataStart: i + 8, size });
    i = end;
  }
  if (!chunks.length) throw new InvalidImageError();
  return chunks;
}

function sanitizeWebp(b: Uint8Array): Uint8Array {
  const chunks = webpChunks(b);
  const kept = chunks.filter((c) => c.type !== "EXIF" && c.type !== "XMP ").map((c) => b.slice(c.start, c.end));
  const vp8x = kept.find((c) => ascii(c, 0, 4) === "VP8X");
  if (vp8x) vp8x[8] = (vp8x[8] ?? 0) & ~0x0c;
  const body = concat(kept);
  const out = new Uint8Array(12 + body.length);
  out.set(b.subarray(0, 12));
  out.set(body, 12);
  new DataView(out.buffer).setUint32(4, out.length - 8, true);
  return out;
}

function webpDimensions(b: Uint8Array): { width: number; height: number } {
  const first = webpChunks(b)[0]!;
  const d = first.dataStart;
  if (first.type === "VP8X") return { width: u24le(b, d + 4) + 1, height: u24le(b, d + 7) + 1 };
  if (first.type === "VP8L" && b[d] === 0x2f) {
    const bits = u32le(b, d + 1);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (first.type === "VP8 ") return { width: ((b[d + 6] ?? 0) | ((b[d + 7] ?? 0) << 8)) & 0x3fff, height: ((b[d + 8] ?? 0) | ((b[d + 9] ?? 0) << 8)) & 0x3fff };
  throw new InvalidImageError();
}

// ---------------------------------------------------------------------------

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export interface CleanImage {
  kind: ImageKind;
  bytes: Uint8Array;
  /** Size as displayed, so a photo taken sideways reports its upright width and height. */
  width: number;
  height: number;
}

export const MAX_IMAGE_PIXELS = 100_000_000;

/** Verifies the bytes really are a JPEG, PNG or WebP, strips metadata and reads the size. Throws InvalidImageError. */
export function cleanImage(input: Uint8Array): CleanImage {
  const kind = detectImage(input);
  if (!kind) throw new InvalidImageError("Please choose a JPEG, PNG or WebP photo.");

  let result: CleanImage;
  if (kind === "jpeg") {
    const { bytes, orientation } = sanitizeJpeg(input);
    const raw = jpegDimensions(bytes);
    const swap = orientation >= 5;
    result = { kind, bytes, width: swap ? raw.height : raw.width, height: swap ? raw.width : raw.height };
  } else if (kind === "png") {
    const bytes = sanitizePng(input);
    result = { kind, bytes, width: u32be(bytes, 16), height: u32be(bytes, 20) };
  } else {
    const bytes = sanitizeWebp(input);
    result = { kind, bytes, ...webpDimensions(bytes) };
  }
  if (!result.width || !result.height || result.width * result.height > MAX_IMAGE_PIXELS) {
    throw new InvalidImageError("That photo is too large to process.");
  }
  return result;
}
