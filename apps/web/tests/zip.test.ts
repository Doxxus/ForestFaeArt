import { crc32 as nodeCrc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { crc32, zip } from "../lib/zip";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("zip", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(bytes("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
    const data = Uint8Array.from({ length: 5000 }, (_, i) => (i * 31) % 251);
    expect(crc32(data)).toBe(nodeCrc32(data));
  });

  it("writes entries that a reader can find again, byte for byte", () => {
    const entries = [
      { name: "FFA-000001.png", bytes: bytes("first picture") },
      { name: "FFA-000002 (1 of 2).png", bytes: Uint8Array.from([0, 1, 2, 3, 255]) },
      { name: "café.png", bytes: new Uint8Array() },
    ];
    const out = zip(entries);
    const view = new DataView(out.buffer);
    const end = out.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(3);
    let at = view.getUint32(end + 16, true);
    const found: { name: string; crc: number; size: number; data: Uint8Array }[] = [];
    for (let i = 0; i < 3; i++) {
      expect(view.getUint32(at, true)).toBe(0x02014b50);
      const crc = view.getUint32(at + 16, true);
      const size = view.getUint32(at + 24, true);
      const nameLen = view.getUint16(at + 28, true);
      const offset = view.getUint32(at + 42, true);
      const name = new TextDecoder().decode(out.slice(at + 46, at + 46 + nameLen));
      expect(view.getUint32(offset, true)).toBe(0x04034b50);
      const localNameLen = view.getUint16(offset + 26, true);
      const start = offset + 30 + localNameLen;
      found.push({ name, crc, size, data: out.slice(start, start + size) });
      at += 46 + nameLen;
    }
    expect(found.map((f) => f.name)).toEqual(entries.map((e) => e.name));
    for (const [i, f] of found.entries()) {
      expect([...f.data]).toEqual([...entries[i]!.bytes]);
      expect(f.crc).toBe(crc32(entries[i]!.bytes));
    }
  });

  it("gives the same bytes for the same input", () => {
    const a = zip([{ name: "a.txt", bytes: bytes("x") }]);
    const b = zip([{ name: "a.txt", bytes: bytes("x") }]);
    expect([...a]).toEqual([...b]);
  });
});
