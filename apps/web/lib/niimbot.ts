/**
 * Direct Bluetooth printing to a NIIMBOT B1 from Chrome on Android (LBL-9, ADR 013).
 * Browser only. The protocol library is unofficial, MIT licensed and loaded on demand, so nothing here
 * costs anything until someone presses "Connect". Printing always has the PNG export as a fallback.
 */
import type { NiimbotBluetoothClient, PrintDirection } from "@mmote/niimbluelib";

export type B1Client = NiimbotBluetoothClient;
export type B1Direction = PrintDirection;

/** Web Bluetooth needs Chrome or Edge, a secure page and a Bluetooth radio. Safari and Firefox do not have it. */
export const bluetoothAvailable = () => typeof navigator !== "undefined" && "bluetooth" in navigator;

export interface B1Connection {
  client: B1Client;
  model: string;
  heads: number | null;
}

/** Must be called from a click: the browser asks the person to pick the printer. */
export async function connectB1(onLog?: (line: string) => void): Promise<B1Connection> {
  const lib = await import("@mmote/niimbluelib");
  const client = lib.instantiateClient("bluetooth") as B1Client;
  if (onLog) {
    client.on("packetsent", (e) => onLog(`> ${lib.Utils.bufToHex(e.packet.toBytes())} (${lib.RequestCommandId[e.packet.command]})`));
    client.on("packetreceived", (e) => onLog(`< ${lib.Utils.bufToHex(e.packet.toBytes())} (${lib.ResponseCommandId[e.packet.command]})`));
  }
  await client.connect();
  const meta = client.getModelMetadata();
  return { client, model: meta?.model ?? "unknown model", heads: meta?.printheadPixels ?? null };
}

export interface B1PrintOptions {
  /** 1 (light) to 5 (dark) on the B1. */
  density?: number;
  direction?: B1Direction;
  onProgress?: (text: string) => void;
}

export interface B1Job {
  canvas: HTMLCanvasElement;
  copies: number;
}

/**
 * 50 mm labels are 400 dots wide but the B1 head prints 384, the middle 48 mm. The few dots trimmed from each side are the
 * label's blank margin. If anything black would be cut off, the label is refused rather than printed wrong.
 */
export function fitToHead(canvas: HTMLCanvasElement, heads: number | null): HTMLCanvasElement {
  const limit = heads ?? 384;
  if (canvas.width <= limit) return canvas;
  const cut = canvas.width - limit;
  const left = Math.floor(cut / 2);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const edges = [ctx.getImageData(0, 0, left, canvas.height), ctx.getImageData(canvas.width - (cut - left), 0, cut - left, canvas.height)];
  if (edges.some((e) => e.data.some((v, i) => i % 4 !== 3 && v < 255))) {
    throw new Error(`This label is wider than the printer can print (${limit} dots). Increase the margin or use a narrower label.`);
  }
  const out = document.createElement("canvas");
  out.width = limit;
  out.height = canvas.height;
  out.getContext("2d")!.drawImage(canvas, left, 0, limit, canvas.height, 0, 0, limit, canvas.height);
  return out;
}

/**
 * Prints each label as its own job, in order, with its own number of copies. The canvases must already be pure
 * black and white at the printer's resolution (203 dpi), exactly what the label engine makes.
 */
export async function printCanvases(conn: B1Connection, jobs: B1Job[], opts: B1PrintOptions = {}): Promise<void> {
  const lib = await import("@mmote/niimbluelib");
  const { client } = conn;
  const direction = opts.direction ?? client.getModelMetadata()?.printDirection ?? "top";
  const total = jobs.reduce((n, j) => n + j.copies, 0);
  let done = 0;
  for (const job of jobs) {
    const canvas = fitToHead(job.canvas, conn.heads);
    const task = client.protocol.newPrintTask(client.getPrintTaskType() ?? "B1", {
      totalPages: job.copies,
      statusPollIntervalMs: 100,
      statusTimeoutMs: 8_000,
      pageColor: lib.PageColorType.SingleColor,
      density: opts.density ?? 3,
    });
    try {
      await task.printInit();
      await task.printPage(lib.ImageEncoder.encodeCanvas(canvas, lib.PageColorType.SingleColor, direction), job.copies);
      await task.waitForFinished();
    } finally {
      await task.printEnd().catch(() => undefined);
    }
    done += job.copies;
    opts.onProgress?.(`${done} of ${total} labels printed`);
  }
}

export async function disconnectB1(conn: B1Connection | null): Promise<void> {
  if (conn) await conn.client.disconnect().catch(() => undefined);
}
