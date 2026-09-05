"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardPaste,
  Image as ImageIcon,
  LoaderCircle,
  RefreshCw,
  ScanText,
  UploadCloud,
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import { localTargetScreenshotOcr } from "@/lib/target-screenshot/localOcrAdapter";
import { parseCpcbTargetScreenshot, recalculateScreenshotExtraction } from "@/lib/target-screenshot/parser";
import type {
  ExtractedTarget,
  OcrProgress,
  ScreenshotTargetExtraction,
  TargetCategory,
  TargetCreditType,
} from "@/lib/target-screenshot/types";
import type { TargetEntry } from "./FinancialYearSupport";

type SavedScreenshot = {
  _id: string;
  documentName: string;
  documentKind?: string;
  financialYear?: string;
  mimeType?: string;
};

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const CATEGORIES: TargetCategory[] = [1, 2, 3, 4];
const TYPES: TargetCreditType[] = ["RECYCLING", "EOL"];

function key(category: number | string, type: string) {
  return `${category}|${type}`;
}

function numberLabel(value: number | null | undefined) {
  return value === null || value === undefined ? "Not detected" : value.toLocaleString("en-IN");
}

function targetAt(extraction: ScreenshotTargetExtraction, category: TargetCategory, type: TargetCreditType) {
  return extraction.targets.find((target) => target.category === category && target.type === type);
}

export default function TargetScreenshotImporter({
  open,
  clientId,
  financialYear,
  existingTargets,
  onClose,
  onConfirm,
}: {
  open: boolean;
  clientId: string;
  financialYear: string;
  existingTargets: TargetEntry[];
  onClose: () => void;
  onConfirm: (targets: TargetEntry[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const analysisVersionRef = useRef(0);
  const [phase, setPhase] = useState<"choose" | "processing" | "review" | "error">("choose");
  const [file, setFile] = useState<File | null>(null);
  const [originalPreview, setOriginalPreview] = useState("");
  const [showProcessed, setShowProcessed] = useState(false);
  const [extraction, setExtraction] = useState<ScreenshotTargetExtraction | null>(null);
  const [progress, setProgress] = useState<OcrProgress>({ status: "Waiting for screenshot", progress: 0 });
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [savedScreenshot, setSavedScreenshot] = useState<SavedScreenshot | null>(null);
  const [loadingSavedScreenshot, setLoadingSavedScreenshot] = useState(false);

  const existingMap = useMemo(() => new Map(
    existingTargets.map((target) => [key(target.categoryId, target.type), Number(target.value || 0)])
  ), [existingTargets]);

  useEffect(() => {
    if (!open) return;
    analysisVersionRef.current += 1;
    setPhase("choose");
    setFile(null);
    setOriginalPreview("");
    setShowProcessed(false);
    setExtraction(null);
    setProgress({ status: "Waiting for screenshot", progress: 0 });
    setError("");
    setReviewConfirmed(false);
    setSavedScreenshot(null);

    if (!clientId || !financialYear) return;
    const controller = new AbortController();
    setLoadingSavedScreenshot(true);
    fetch(`/api/documents?clientId=${encodeURIComponent(clientId)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => response.ok ? response.json() as Promise<SavedScreenshot[]> : [])
      .then((documents) => {
        setSavedScreenshot(documents.find((document) => (
          document.documentKind === "target-screenshot" && document.financialYear === financialYear
        )) || null);
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setSavedScreenshot(null);
      })
      .finally(() => setLoadingSavedScreenshot(false));
    return () => controller.abort();
  }, [clientId, financialYear, open]);

  useEffect(() => () => {
    if (originalPreview) URL.revokeObjectURL(originalPreview);
  }, [originalPreview]);

  const processFile = async (nextFile: File) => {
    if (!nextFile.type.startsWith("image/")) {
      setError("Choose a PNG, JPG or another image file.");
      setPhase("error");
      return;
    }
    if (nextFile.size > MAX_FILE_SIZE) {
      setError("The screenshot must be 25 MB or smaller.");
      setPhase("error");
      return;
    }

    const analysisVersion = ++analysisVersionRef.current;
    if (originalPreview) URL.revokeObjectURL(originalPreview);
    setFile(nextFile);
    setOriginalPreview(URL.createObjectURL(nextFile));
    setExtraction(null);
    setReviewConfirmed(false);
    setShowProcessed(false);
    setError("");
    setProgress({ status: "Preparing screenshot", progress: 0 });
    setPhase("processing");

    try {
      const ocr = await localTargetScreenshotOcr.analyze(nextFile, (nextProgress) => {
        if (analysisVersionRef.current === analysisVersion) setProgress(nextProgress);
      });
      if (analysisVersionRef.current !== analysisVersion) return;
      setExtraction(parseCpcbTargetScreenshot(ocr));
      setPhase("review");
    } catch (analysisError) {
      if (analysisVersionRef.current !== analysisVersion) return;
      console.error("Local target screenshot OCR failed:", analysisError);
      setError(analysisError instanceof Error ? analysisError.message : "The screenshot could not be read locally.");
      setPhase("error");
    }
  };

  const readSavedScreenshot = async () => {
    if (!savedScreenshot) return;
    setLoadingSavedScreenshot(true);
    setError("");
    try {
      const response = await fetch(`/api/documents/${savedScreenshot._id}/preview?fresh=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("The saved target screenshot could not be opened.");
      const blob = await response.blob();
      await processFile(new File([blob], savedScreenshot.documentName || `Target ${financialYear}.png`, {
        type: blob.type || savedScreenshot.mimeType || "image/png",
      }));
    } catch (savedError) {
      setError(savedError instanceof Error ? savedError.message : "The saved screenshot could not be read.");
      setPhase("error");
    } finally {
      setLoadingSavedScreenshot(false);
    }
  };

  const clipboardFile = (event: React.ClipboardEvent) => {
    const image = Array.from(event.clipboardData.items)
      .find((item) => item.type.startsWith("image/"))
      ?.getAsFile();
    if (!image) {
      setError("The clipboard does not contain an image.");
      return;
    }
    event.preventDefault();
    void processFile(image);
  };

  const updateValue = (category: TargetCategory, type: TargetCreditType, rawValue: string) => {
    if (!extraction) return;
    const parsed = rawValue === "" ? null : Number(rawValue);
    const value = parsed === null || !Number.isFinite(parsed) || parsed < 0 ? null : parsed;
    setReviewConfirmed(false);
    setExtraction((current) => current ? recalculateScreenshotExtraction({
      ...current,
      targets: current.targets.map((target) => (
        target.category === category && target.type === type
          ? { ...target, value }
          : target
      )),
    }) : current);
  };

  const invalidTargets = extraction?.targets.some((target) => (
    target.value === null || !Number.isFinite(target.value) || target.value < 0
  )) ?? true;
  const fyMismatch = Boolean(
    extraction?.detectedFinancialYear && extraction.detectedFinancialYear !== financialYear
  );

  const confirm = () => {
    if (!extraction || invalidTargets || !reviewConfirmed) return;
    onConfirm(extraction.targets.map((target) => ({
      categoryId: String(target.category),
      type: target.type,
      value: target.value || 0,
    })));
  };

  const reset = () => {
    analysisVersionRef.current += 1;
    if (originalPreview) URL.revokeObjectURL(originalPreview);
    setFile(null);
    setOriginalPreview("");
    setExtraction(null);
    setError("");
    setReviewConfirmed(false);
    setPhase("choose");
  };

  return (
    <Modal
      open={open}
      onClose={phase === "processing" ? () => undefined : onClose}
      title="Import Targets from Screenshot"
      subtitle={`FY ${financialYear} · Local OCR · Nothing is saved automatically`}
      size="2xl"
    >
      {phase === "choose" && (
        <div className="space-y-4">
          <div
            tabIndex={0}
            onPaste={clipboardFile}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const dropped = Array.from(event.dataTransfer.files).find((entry) => entry.type.startsWith("image/"));
              if (dropped) void processFile(dropped);
              else setError("Drop a screenshot image here.");
            }}
            className={`rounded-2xl border-2 border-dashed p-8 text-center outline-none transition-colors ${
              dragging
                ? "border-brand-500 bg-brand-50 dark:bg-brand-900/20"
                : "border-[var(--color-border)] bg-[var(--color-card)] focus:border-brand-400"
            }`}
          >
            <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
              <ScanText className="h-5 w-5" />
            </span>
            <p className="text-sm font-semibold text-default">Drop or paste the CPCB target screenshot</p>
            <p className="mt-1 text-xs text-faint">The image is processed in this browser and is never sent to an OCR service.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" className="btn-primary" onClick={() => fileInputRef.current?.click()}>
                <UploadCloud className="h-4 w-4" /> Choose Screenshot
              </button>
              <button type="button" className="btn-secondary" onClick={(event) => event.currentTarget.parentElement?.parentElement?.focus()}>
                <ClipboardPaste className="h-4 w-4" /> Press Ctrl+V
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                const selected = event.target.files?.[0];
                if (selected) void processFile(selected);
                event.target.value = "";
              }}
            />
          </div>

          {(loadingSavedScreenshot || savedScreenshot) && (
            <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                  <ImageIcon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-default">Saved target screenshot · FY {financialYear}</p>
                  <p className="truncate text-[11px] text-faint">{savedScreenshot?.documentName || "Checking saved documents…"}</p>
                </div>
              </div>
              <button type="button" className="btn-secondary flex-shrink-0" disabled={!savedScreenshot || loadingSavedScreenshot} onClick={() => void readSavedScreenshot()}>
                {loadingSavedScreenshot ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />}
                Use Saved Screenshot
              </button>
            </div>
          )}

          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          </div>
        </div>
      )}

      {phase === "processing" && (
        <div className="py-12 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
            <LoaderCircle className="h-6 w-6 animate-spin" />
          </span>
          <p className="mt-4 text-sm font-semibold text-default">{progress.status}</p>
          <p className="mt-1 text-xs text-faint">Local analysis can take a few seconds the first time.</p>
          <div className="mx-auto mt-5 h-2 max-w-md overflow-hidden rounded-full bg-[var(--color-border-soft)]">
            <div className="h-full rounded-full bg-brand-500 transition-[width] duration-300" style={{ width: `${progress.progress}%` }} />
          </div>
          <p className="mt-2 text-xs font-mono text-faint">{progress.progress}%</p>
        </div>
      )}

      {phase === "error" && (
        <div className="py-8 text-center">
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <p className="mt-3 text-sm font-semibold text-default">Screenshot could not be analyzed</p>
          <p className="mx-auto mt-1 max-w-lg text-xs text-faint">{error}</p>
          <div className="mt-4 flex justify-center gap-2">
            <button type="button" className="btn-primary" onClick={reset}><RefreshCw className="h-4 w-4" /> Try Another</button>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          </div>
        </div>
      )}

      {phase === "review" && extraction && (
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div>
                <p className="font-semibold">Mandatory verification</p>
                <p className="mt-0.5">Compare every value with the screenshot. OCR output remains temporary until you explicitly confirm it, and the database changes only after Save Record.</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="space-y-3">
              <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]">
                <div className="flex items-center justify-between border-b border-[var(--color-border-soft)] px-3 py-2">
                  <div>
                    <p className="text-xs font-semibold text-default">Source screenshot</p>
                    <p className="max-w-[260px] truncate text-[10px] text-faint">{file?.name}</p>
                  </div>
                  <button type="button" className="text-[10px] font-semibold text-brand-600" onClick={() => setShowProcessed((current) => !current)}>
                    {showProcessed ? "Show original" : "Show processed"}
                  </button>
                </div>
                <div className="grid min-h-[260px] place-items-center bg-white p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={showProcessed ? extraction.processedImageUrl : originalPreview}
                    alt="Target screenshot for verification"
                    className="max-h-[420px] w-full object-contain"
                  />
                </div>
              </div>

              <div className={`rounded-xl border p-3 ${fyMismatch ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20" : "border-[var(--color-border)] bg-[var(--color-surface)]"}`}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-faint">Financial year check</p>
                <div className="mt-1 flex items-center justify-between gap-3 text-xs">
                  <span className="text-muted">Detected: <strong className="text-default">{extraction.detectedFinancialYear ? `FY ${extraction.detectedFinancialYear}` : "Not detected"}</strong></span>
                  <span className="text-muted">Open page: <strong className="text-default">FY {financialYear}</strong></span>
                </div>
                {fyMismatch && <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">The detected FY does not match. Values will not switch to another FY.</p>}
              </div>
            </div>

            <div className="space-y-3">
              <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]">
                <div className="grid grid-cols-[80px_1fr_1fr] gap-2 border-b border-[var(--color-border-soft)] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-faint">
                  <span>Category</span><span>Recycling</span><span>EOL</span>
                </div>
                <div className="divide-y divide-[var(--color-border-soft)]">
                  {CATEGORIES.map((category) => (
                    <div key={category} className="grid grid-cols-[80px_1fr_1fr] items-start gap-2 px-3 py-2.5">
                      <span className="pt-2 text-xs font-semibold text-default">CAT-{["", "I", "II", "III", "IV"][category]}</span>
                      {TYPES.map((type) => {
                        const target = targetAt(extraction, category, type) as ExtractedTarget;
                        const existing = existingMap.get(key(category, type)) || 0;
                        const differs = target.value !== null && target.value !== existing;
                        const lowConfidence = target.confidence !== undefined && target.confidence < 65;
                        const flagged = target.value === null || differs || lowConfidence;
                        return (
                          <label key={type} className="min-w-0">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={target.value ?? ""}
                              placeholder="Review"
                              aria-label={`CAT ${category} ${type === "RECYCLING" ? "Recycling" : "EOL"} extracted target`}
                              onChange={(event) => updateValue(category, type, event.target.value)}
                              className={`input-field !py-1.5 !text-xs !font-mono ${flagged ? "!border-amber-300 dark:!border-amber-700" : ""}`}
                            />
                            <span className={`mt-1 block truncate text-[9px] ${differs ? "text-amber-600 dark:text-amber-400" : "text-faint"}`}>
                              Existing {numberLabel(existing)}{target.confidence !== undefined ? ` · ${Math.round(target.confidence)}% OCR` : ""}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  ["Recycling", extraction.totalRecycling],
                  ["EOL", extraction.totalEOL],
                  ["Total Target", extraction.totalTarget],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl bg-[var(--color-surface)] p-3 text-center">
                    <p className="text-[10px] text-faint">{label}</p>
                    <p className="mt-1 text-sm font-bold text-default">{Number(value).toLocaleString("en-IN")}</p>
                  </div>
                ))}
              </div>

              {(extraction.warnings.length > 0 || fyMismatch) && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-800 dark:bg-amber-900/10">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">Review flags</p>
                  <ul className="mt-1.5 space-y-1 text-xs text-amber-800 dark:text-amber-300">
                    {fyMismatch && <li>• Detected FY {extraction.detectedFinancialYear} differs from FY {financialYear}.</li>}
                    {extraction.warnings.map((warning) => <li key={warning}>• {warning}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <input type="checkbox" className="mt-0.5" checked={reviewConfirmed} onChange={(event) => setReviewConfirmed(event.target.checked)} />
            <span className="text-xs text-muted">I compared all eight values with the screenshot and corrected any OCR mistakes.</span>
          </label>

          {invalidTargets && (
            <p className="text-xs text-amber-600 dark:text-amber-400">Enter a value for every field. Use 0 when the screenshot has no target for that category and type.</p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <button type="button" className="btn-secondary" onClick={reset}><RefreshCw className="h-4 w-4" /> Use Another Screenshot</button>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
              <button type="button" className="btn-primary" disabled={invalidTargets || !reviewConfirmed} onClick={confirm}>
                <CheckCircle2 className="h-4 w-4" /> Confirm &amp; Add to FY Targets
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
