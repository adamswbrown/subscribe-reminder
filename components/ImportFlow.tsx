"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { detectRecurring, parseCsv } from "@/lib/importDetect";
import { extractFromText } from "@/lib/ocrExtract";
import type { ImportSuggestion } from "@/lib/importTypes";
import { findService } from "@/lib/catalog";
import { ServiceLogo } from "./ServiceLogo";

export function ImportFlow({
  addBulk,
}: {
  addBulk: (rows: ImportSuggestion[]) => Promise<void>;
}) {
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<ImportSuggestion[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shotInput = useRef<HTMLInputElement>(null);
  const csvInput = useRef<HTMLInputElement>(null);

  function showSuggestions(list: ImportSuggestion[]) {
    setSuggestions(list);
    // Pre-tick everything that looks live; expired entries stay unticked.
    setSelected(
      new Set(
        list
          .map((s, i) => (s.next_renewal_date || s.price != null ? i : -1))
          .filter((i) => i >= 0)
      )
    );
    setError(
      list.length === 0
        ? "Nothing recognisable found — try a clearer screenshot or a different file."
        : null
    );
  }

  // Safari decodes HEIC natively; route it through a canvas to get a PNG
  // tesseract can read. (Chrome/Firefox can't decode HEIC at all.)
  async function decodeToPng(file: File): Promise<Blob> {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("decode failed"));
        img.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      const blob = await new Promise<Blob | null>((r) =>
        canvas.toBlob(r, "image/png")
      );
      if (!blob) throw new Error("decode failed");
      return blob;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function handleScreenshots(files: FileList) {
    setBusy(true);
    setError(null);
    setProgress("Loading OCR engine…");
    try {
      // OCR runs entirely in the browser (WASM) — screenshots never upload.
      // All engine assets are served from our own origin: third-party CDNs
      // get blocked by content blockers and filtered networks.
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng", 1, {
        workerPath: "/tesseract/worker.min.js",
        corePath: "/tesseract",
        langPath: "/tesseract/lang",
      });
      try {
        const all: ImportSuggestion[] = [];
        const list = [...files].slice(0, 6);
        for (let i = 0; i < list.length; i++) {
          setProgress(`Reading image ${i + 1} of ${list.length}…`);
          const file = list[i];
          const isHeic =
            /heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
          const input = isHeic
            ? await decodeToPng(file).catch(() => {
                throw new Error(
                  `${file.name} is HEIC and this browser can't decode it — open the site in Safari, or convert it to JPEG`
                );
              })
            : file;
          const { data } = await worker.recognize(input);
          all.push(...extractFromText(data.text));
        }
        // Dedupe across images by service + price (same service at two
        // prices = two real subscriptions, e.g. two NOW memberships)
        const seen = new Map<string, ImportSuggestion>();
        for (const s of all) {
          const key = `${s.catalog_id ?? s.name.toLowerCase()}|${s.price ?? ""}`;
          if (!seen.has(key)) seen.set(key, s);
        }
        showSuggestions([...seen.values()]);
      } finally {
        await worker.terminate();
      }
    } catch (err) {
      const detail =
        err instanceof Error ? err.message : typeof err === "string" ? err : "";
      setError(
        `Couldn't read those images${detail ? ` (${detail})` : ""} — try sharper screenshots, cropped to the list.`
      );
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function handleCsv(file: File) {
    setBusy(true);
    setError(null);
    try {
      const text = await file.text();
      showSuggestions(detectRecurring(parseCsv(text)));
    } catch {
      setError("Couldn't read that CSV.");
    } finally {
      setBusy(false);
    }
  }

  async function addSelected() {
    if (!suggestions) return;
    const rows = suggestions.filter((_, i) => selected.has(i));
    if (rows.length === 0) return;
    setBusy(true);
    try {
      await addBulk(rows);
      router.push("/dashboard");
    } catch {
      setError("Couldn't save those subscriptions — try again.");
      setBusy(false);
    }
  }

  if (suggestions) {
    return (
      <>
        <button
          className="btn-small"
          onClick={() => {
            setSuggestions(null);
            setError(null);
          }}
        >
          ← start over
        </button>
        <h1 style={{ fontSize: "1.3rem" }}>
          Found {suggestions.length} subscription
          {suggestions.length === 1 ? "" : "s"}
        </h1>
        {error && <p className="muted">{error}</p>}
        <div className="sub-list">
          {suggestions.map((s, i) => {
            const service = s.catalog_id ? findService(s.catalog_id) : undefined;
            return (
              <label className="sub-row" key={i} style={{ cursor: "pointer" }}>
                <input
                  type="checkbox"
                  style={{ width: "auto" }}
                  checked={selected.has(i)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(i);
                    else next.delete(i);
                    setSelected(next);
                  }}
                />
                <ServiceLogo
                  name={s.name}
                  domain={service?.domain}
                  size={26}
                />
                <div>
                  <div className="name">
                    {s.name}
                    {s.plan_label && (
                      <span className="meta"> · {s.plan_label}</span>
                    )}
                  </div>
                  <div className="meta">
                    {s.price != null ? `£${s.price.toFixed(2)}` : "price unknown"}
                    {s.cycle ? ` / ${s.cycle}` : ""}
                    {s.next_renewal_date
                      ? ` · next ${s.next_renewal_date}`
                      : s.last_charged
                        ? ` · last charged ${s.last_charged}`
                        : ""}
                  </div>
                </div>
                <span className="spacer" />
                {service && <span className="badge">{service.name}</span>}
              </label>
            );
          })}
        </div>
        {suggestions.length > 0 && (
          <button
            className="btn-primary"
            style={{ marginTop: "1rem" }}
            disabled={busy || selected.size === 0}
            onClick={addSelected}
          >
            {busy ? "Adding…" : `Add ${selected.size} selected`}
          </button>
        )}
        <p className="muted">
          Everything lands as &quot;review&quot; intent with approximate dates —
          fine-tune from the dashboard.
        </p>
      </>
    );
  }

  return (
    <>
      <h1 style={{ fontSize: "1.3rem" }}>Import your subscriptions</h1>
      <p className="muted" style={{ maxWidth: "40rem", lineHeight: 1.6 }}>
        Don&apos;t know what you&apos;re subscribed to? The lists already exist —
        we&apos;ll read them for you.
      </p>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>📸 Screenshots</h2>
        <p className="muted" style={{ lineHeight: 1.6 }}>
          Screenshot the places your subscriptions are listed (up to 6 at
          once): iPhone <b>Settings → your name → Subscriptions</b>, Google
          Play <b>Payments &amp; subscriptions</b>, your bank app&apos;s{" "}
          <b>Direct Debits</b>, or PayPal <b>Automatic payments</b>. Reading
          happens on your device — the images never leave your browser.
        </p>
        <input
          ref={shotInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => e.target.files?.length && handleScreenshots(e.target.files)}
        />
        <button
          className="btn-primary"
          disabled={busy}
          onClick={() => shotInput.current?.click()}
        >
          {busy ? (progress ?? "Reading…") : "Choose screenshots"}
        </button>
      </div>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>🏦 Bank statement CSV</h2>
        <p className="muted" style={{ lineHeight: 1.6 }}>
          Export a CSV from your bank (3+ months works best) and we&apos;ll
          detect the recurring payments. The file is analysed in your browser
          and never uploaded.
        </p>
        <input
          ref={csvInput}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => e.target.files?.[0] && handleCsv(e.target.files[0])}
        />
        <button
          disabled={busy}
          onClick={() => csvInput.current?.click()}
        >
          {busy ? "Analysing…" : "Choose CSV"}
        </button>
      </div>

      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
    </>
  );
}
