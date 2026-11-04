"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, Card, Field, Select } from "@/components/ui";
import { bluetoothAvailable, connectB1, disconnectB1, printCanvases, type B1Connection, type B1Direction } from "@/lib/niimbot";

const SIZES = [
  { id: "40x30", label: "40 x 30 mm (the default label)", w: 320, h: 240 },
  { id: "50x30", label: "50 x 30 mm", w: 400, h: 240 },
  { id: "30x15", label: "30 x 15 mm", w: 240, h: 120 },
] as const;

/** A test card that makes rotation, clipping and edge problems obvious: border, corner mark, an arrow and the size. */
function drawTestCard(canvas: HTMLCanvasElement, w: number, h: number, caption: string) {
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#000";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);
  ctx.fillRect(0, 0, 28, 28);
  ctx.beginPath();
  ctx.moveTo(w / 2 - 50, h / 2);
  ctx.lineTo(w / 2 + 50, h / 2);
  ctx.lineTo(w / 2 + 30, h / 2 - 16);
  ctx.moveTo(w / 2 + 50, h / 2);
  ctx.lineTo(w / 2 + 30, h / 2 + 16);
  ctx.stroke();
  ctx.font = "bold 30px sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText("B1 TEST", 40, 12);
  ctx.font = "20px sans-serif";
  ctx.fillText(caption, 40, h - 34);
}

export function PrinterTest() {
  const [supported, setSupported] = useState(true);
  const [conn, setConn] = useState<B1Connection | null>(null);
  const [busy, setBusy] = useState(false);
  const [size, setSize] = useState<(typeof SIZES)[number]["id"]>("40x30");
  const [direction, setDirection] = useState<B1Direction>("top");
  const [density, setDensity] = useState(3);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const preview = useRef<HTMLCanvasElement>(null);
  const current = SIZES.find((s) => s.id === size)!;

  useEffect(() => setSupported(bluetoothAvailable()), []);
  useEffect(() => {
    if (preview.current) drawTestCard(preview.current, current.w, current.h, `${current.w} x ${current.h} px`);
  }, [current]);

  const add = (line: string) => setLog((l) => [...l.slice(-60), line]);

  async function run(work: () => Promise<void>, doing: string) {
    setBusy(true);
    setError("");
    setStatus(doing);
    try {
      await work();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      add(`error: ${message}`);
    } finally {
      setBusy(false);
      setStatus("");
    }
  }

  const connect = () =>
    run(async () => {
      const c = await connectB1(add);
      setConn(c);
      add(`connected: ${c.model}, head ${c.heads ?? "?"} px`);
    }, "Choose your printer in the box that appears...");

  const print = () =>
    run(async () => {
      if (!conn || !preview.current) return;
      await printCanvases(conn, [{ canvas: preview.current, copies: 1 }], { direction, density, onProgress: setStatus });
      add("print finished");
    }, "Sending the label...");

  const disconnect = async () => {
    await disconnectB1(conn);
    setConn(null);
    add("disconnected");
  };

  return (
    <div className="space-y-5">
      {!supported ? (
        <Alert>
          This browser can&apos;t use Bluetooth printing. Use Chrome on an Android phone (Bluetooth on, location on), or download PNG labels and print them with the NIIMBOT app.
        </Alert>
      ) : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      <Card title="1. Connect">
        <p className="mb-3 text-moss">Switch the B1 on, close the NIIMBOT app (it holds the connection), then press Connect and choose the printer.</p>
        {conn ? (
          <p className="mb-3 font-medium text-forest">
            Connected: {conn.model}
            {conn.heads ? `, ${conn.heads} px print head` : ""}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button onClick={connect} disabled={!supported || busy || conn !== null}>
            Connect to the B1
          </Button>
          <Button variant="secondary" onClick={disconnect} disabled={!conn || busy}>
            Disconnect
          </Button>
        </div>
      </Card>

      <Card title="2. Print a test card">
        <div className="grid gap-x-4 sm:grid-cols-3">
          <Field label="Label size" htmlFor="size">
            <Select id="size" value={size} onChange={(e) => setSize(e.target.value as typeof size)}>
              {SIZES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Direction" htmlFor="dir" hint="Change only if the card prints sideways.">
            <Select id="dir" value={direction} onChange={(e) => setDirection(e.target.value as B1Direction)}>
              <option value="top">Top (the B1 default)</option>
              <option value="left">Left (turned a quarter)</option>
            </Select>
          </Field>
          <Field label="Darkness" htmlFor="density" hint="1 is light, 5 is dark.">
            <Select id="density" value={density} onChange={(e) => setDensity(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <canvas ref={preview} className="mb-4 max-w-full border border-stone bg-white" aria-label="Preview of the test card" />
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={print} disabled={!conn || busy}>
            Print test card
          </Button>
          {status ? (
            <span role="status" className="text-moss">
              {status}
            </span>
          ) : null}
        </div>
      </Card>

      <Card title="Connection log">
        <p className="mb-2 text-moss">If something fails, copy this and send it over.</p>
        <pre className="max-h-64 overflow-auto rounded-lg bg-parchment p-3 text-xs">{log.length ? log.join("\n") : "Nothing yet."}</pre>
      </Card>
    </div>
  );
}
