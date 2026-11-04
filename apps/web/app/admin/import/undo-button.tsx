"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { undoImportAction } from "./actions";

export function UndoButton({ batchId, count }: { batchId: string; count: number }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!asking) {
    return (
      <Button variant="ghost" className="min-h-10 text-danger" onClick={() => setAsking(true)}>
        Undo
      </Button>
    );
  }

  return (
    <div role="group" aria-label="Confirm undo" className="rounded-lg border border-danger bg-dangerbg p-2">
      <p className="mb-2 text-sm">Archive the {count} {count === 1 ? "piece" : "pieces"} this import added?</p>
      {message ? <p className="mb-2 text-sm text-danger">{message}</p> : null}
      <div className="flex gap-2">
        <Button
          variant="danger"
          className="min-h-10"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const res = await undoImportAction(batchId);
            setBusy(false);
            if (res.ok) router.refresh();
            else setMessage(res.message);
          }}
        >
          Yes, undo it
        </Button>
        <Button variant="ghost" className="min-h-10" onClick={() => setAsking(false)}>
          Keep it
        </Button>
      </div>
    </div>
  );
}
