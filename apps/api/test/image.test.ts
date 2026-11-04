import { describe, expect, it } from "vitest";
import { InvalidImageError, cleanImage, detectImage } from "../src/media/image";

const bytes = (...parts: (number[] | Uint8Array | string)[]) =>
  Uint8Array.from(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : [...p])));
const u16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const u32le = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
const text = (b: Uint8Array) => String.fromCharCode(...b);

// ---- builders ----

function exifSegment(orientation: number, littleEndian: boolean) {
  const w16 = (n: number) => (littleEndian ? [n & 0xff, n >> 8] : u16(n));
  const w32 = (n: number) => (littleEndian ? u32le(n) : u32(n));
  const tiff = [
    ...(littleEndian ? [0x49, 0x49] : [0x4d, 0x4d]), ...w16(0x2a), ...w32(8),
    ...w16(2),
    ...w16(0x0112), ...w16(3), ...w32(1), ...w16(orientation), 0, 0,
    ...w16(0x8825), ...w16(4), ...w32(1), ...w32(0),
    ...w32(0),
    ...[...("GPSMARKER-52.1N-0.1W")].map((c) => c.charCodeAt(0)),
  ];
  const data = [...[..."Exif\0\0"].map((c) => c.charCodeAt(0)), ...tiff];
  return [0xff, 0xe1, ...u16(data.length + 2), ...data];
}

function jpeg(opts: { width?: number; height?: number; orientation?: number; little?: boolean; truncate?: boolean } = {}) {
  const { width = 400, height = 300, orientation, little = false } = opts;
  const xmp = [...[..."http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>XMPSECRET</x:xmpmeta>"].map((c) => c.charCodeAt(0))];
  const parts = [
    [0xff, 0xd8],
    [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00],
    orientation ? exifSegment(orientation, little) : [],
    [0xff, 0xe1, ...u16(xmp.length + 2), ...xmp],
    [0xff, 0xfe, 0x00, 0x0a, ...[..."COMMENT!!"].map((c) => c.charCodeAt(0)).slice(0, 8)],
    [0xff, 0xe2, 0x00, 0x0c, ...[..."ICC_PROFIL"].map((c) => c.charCodeAt(0))],
    [0xff, 0xc0, 0x00, 0x11, 8, ...u16(height), ...u16(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1],
    [0xff, 0xda, 0x00, 0x0c, 3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0],
    [1, 2, 3, 4, 5, 0xff, 0x00, 6, 7, 8],
    opts.truncate ? [] : [0xff, 0xd9],
  ];
  const all = bytes(...parts);
  return opts.truncate ? all.subarray(0, all.length - 30) : all;
}

function pngChunk(type: string, data: number[]) {
  return [...u32(data.length), ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
}
function png(width = 64, height = 48) {
  return bytes(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    pngChunk("IHDR", [...u32(width), ...u32(height), 8, 6, 0, 0, 0]),
    pngChunk("tEXt", [...[..."Comment\0GPSTEXT"].map((c) => c.charCodeAt(0))]),
    pngChunk("eXIf", [...[..."EXIFSECRET"].map((c) => c.charCodeAt(0))]),
    pngChunk("iCCP", [1, 2, 3]),
    pngChunk("IDAT", [9, 9, 9, 9]),
    pngChunk("IEND", []),
  );
}

function riffChunk(type: string, data: number[]) {
  return [...[...type].map((c) => c.charCodeAt(0)), ...u32le(data.length), ...data, ...(data.length % 2 ? [0] : [])];
}
function webp(width = 120, height = 90) {
  const w = width - 1;
  const h = height - 1;
  const vp8x = riffChunk("VP8X", [0x2c, 0, 0, 0, w & 0xff, (w >> 8) & 0xff, w >> 16, h & 0xff, (h >> 8) & 0xff, h >> 16]);
  const body = [
    ...[..."WEBP"].map((c) => c.charCodeAt(0)),
    ...vp8x,
    ...riffChunk("ICCP", [1, 2]),
    ...riffChunk("VP8L", [0x2f, 1, 2, 3, 4]),
    ...riffChunk("EXIF", [...[..."EXIFSECRET"].map((c) => c.charCodeAt(0))]),
    ...riffChunk("XMP ", [...[..."XMPSECRET"].map((c) => c.charCodeAt(0))]),
  ];
  return bytes([..."RIFF"].map((c) => c.charCodeAt(0)), u32le(body.length), body);
}

// ---- tests ----

describe("detectImage", () => {
  it("recognises JPEG, PNG and WebP by their bytes, ignoring any claimed type", () => {
    expect(detectImage(jpeg())).toBe("jpeg");
    expect(detectImage(png())).toBe("png");
    expect(detectImage(webp())).toBe("webp");
  });
  it("rejects everything else", () => {
    expect(detectImage(bytes("GIF89a......."))).toBeNull();
    expect(detectImage(bytes("<html><script>alert(1)</script></html>"))).toBeNull();
    expect(detectImage(bytes("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBeNull();
    expect(detectImage(new Uint8Array(0))).toBeNull();
  });
});

describe("JPEG", () => {
  it("removes Exif/GPS, XMP and comments, keeps other segments, and reads the size", () => {
    const clean = cleanImage(jpeg({ orientation: 1 }));
    const s = text(clean.bytes);
    expect(s).not.toMatch(/GPSMARKER|XMPSECRET|COMMENT|Exif/);
    expect(s).toContain("JFIF");
    expect(s).toContain("ICC_PROFIL");
    expect(clean).toMatchObject({ kind: "jpeg", width: 400, height: 300 });
    expect(detectImage(clean.bytes)).toBe("jpeg");
    // The compressed data and end marker survive untouched.
    expect([...clean.bytes.slice(-12)]).toEqual([1, 2, 3, 4, 5, 0xff, 0x00, 6, 7, 8, 0xff, 0xd9]);
  });

  it("keeps only the orientation, in either byte order, and reports upright dimensions", () => {
    for (const little of [false, true]) {
      const clean = cleanImage(jpeg({ orientation: 6, little, width: 400, height: 300 }));
      const s = text(clean.bytes);
      expect(s).not.toMatch(/GPSMARKER/);
      expect(s.match(/Exif/g)).toHaveLength(1);
      expect(clean).toMatchObject({ width: 300, height: 400 });
      // Running it again changes nothing (idempotent) and still carries the orientation.
      const again = cleanImage(clean.bytes);
      expect(again).toMatchObject({ width: 300, height: 400 });
      expect([...again.bytes]).toEqual([...clean.bytes]);
    }
  });

  it("does not add an orientation block when the photo is already upright", () => {
    expect(text(cleanImage(jpeg({ orientation: 1 })).bytes)).not.toContain("Exif");
    expect(text(cleanImage(jpeg()).bytes)).not.toContain("Exif");
  });

  it("rejects truncated and garbled files", () => {
    expect(() => cleanImage(jpeg({ truncate: true }))).toThrow(InvalidImageError);
    expect(() => cleanImage(bytes([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 1, 2]))).toThrow(InvalidImageError);
    expect(() => cleanImage(bytes([0xff, 0xd8, 0xff]))).toThrow(InvalidImageError);
  });

  it("rejects absurdly large dimensions", () => {
    expect(() => cleanImage(jpeg({ width: 65535, height: 65535 }))).toThrow(/too large/);
  });
});

describe("PNG", () => {
  it("drops text and Exif chunks, keeps the rest and reads the size", () => {
    const clean = cleanImage(png(64, 48));
    const s = text(clean.bytes);
    expect(s).not.toMatch(/GPSTEXT|EXIFSECRET|tEXt|eXIf/);
    expect(s).toContain("iCCP");
    expect(s).toContain("IDAT");
    expect(clean).toMatchObject({ kind: "png", width: 64, height: 48 });
  });
  it("rejects a PNG with no end chunk or a bad length", () => {
    expect(() => cleanImage(png().subarray(0, 60))).toThrow(InvalidImageError);
  });
});

describe("WebP", () => {
  it("drops EXIF and XMP chunks, clears their flags and keeps the RIFF size right", () => {
    const clean = cleanImage(webp(120, 90));
    const s = text(clean.bytes);
    expect(s).not.toMatch(/EXIFSECRET|XMPSECRET|EXIF|XMP /);
    expect(s).toContain("ICCP");
    expect(s).toContain("VP8L");
    expect(clean).toMatchObject({ kind: "webp", width: 120, height: 90 });
    expect(new DataView(clean.bytes.buffer, clean.bytes.byteOffset).getUint32(4, true)).toBe(clean.bytes.length - 8);
    expect(clean.bytes[20]! & 0x0c).toBe(0);
  });
  it("rejects a truncated WebP", () => {
    expect(() => cleanImage(webp().subarray(0, 30))).toThrow(InvalidImageError);
  });
});

describe("other files", () => {
  it("rejects non-images with a friendly message", () => {
    expect(() => cleanImage(bytes("hello world, definitely not a photo"))).toThrow(/JPEG, PNG or WebP/);
  });
});
