"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Check,
  File,
  FolderOpen,
  LoaderCircle,
  RotateCcw,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import type { Document, DocumentCategory } from "./ClientProfileSupport";

type UploadItem = {
  id: string;
  file: File;
  relativePath: string;
  category: DocumentCategory;
  progress: number;
  status: "ready" | "uploading" | "complete" | "failed";
  error?: string;
};

const CATEGORY_OPTIONS: Array<{ value: DocumentCategory; label: string }> = [
  { value: "compliance", label: "Compliance" },
  { value: "financial", label: "Financial" },
  { value: "invoices", label: "Invoices" },
  { value: "certificates", label: "Certificates" },
  { value: "other", label: "Other" },
];

const MAX_FILES = 100;
const MAX_SIZE = 25 * 1024 * 1024;

function itemId(file: File, path: string) {
  return `${path}:${file.size}:${file.lastModified}`;
}

function displaySize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function filesFromEntry(entry: FileSystemEntry, prefix = ""): Promise<Array<{ file: File; path: string }>> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    return [{ file, path: `${prefix}${file.name}` }];
  }
  const directory = entry as FileSystemDirectoryEntry;
  const reader = directory.createReader();
  const children: FileSystemEntry[] = [];
  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    children.push(...batch);
  }
  const nested = await Promise.all(children.map((child) => filesFromEntry(child, `${prefix}${entry.name}/`)));
  return nested.flat();
}

function sendItem(
  item: UploadItem,
  clientId: string,
  documentKind: "general" | "target-screenshot",
  financialYear: string | undefined,
  onProgress: (progress: number) => void
): Promise<Document> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/documents/upload");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 92));
    };
    xhr.onerror = () => reject(new Error("Network error while uploading."));
    xhr.onload = () => {
      let payload: Document | { error?: string };
      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        reject(new Error("The server returned an invalid response."));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(payload as Document);
      else reject(new Error(("error" in payload && payload.error) || "Upload failed."));
    };
    const form = new FormData();
    form.append("file", item.file);
    form.append("clientId", clientId);
    form.append("category", item.category);
    form.append("relativePath", item.relativePath);
    form.append("documentKind", documentKind);
    if (financialYear) form.append("financialYear", financialYear);
    xhr.send(form);
  });
}

export default function DocumentUploadModal({
  open,
  clientId,
  onClose,
  onUploaded,
  purpose = "general",
  financialYear,
}: {
  open: boolean;
  clientId: string;
  onClose: () => void;
  onUploaded: (documents: Document[]) => void;
  purpose?: "general" | "target-screenshot";
  financialYear?: string;
}) {
  const reduceMotion = useReducedMotion();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [batchCategory, setBatchCategory] = useState<DocumentCategory>("compliance");
  const [uploadPurpose, setUploadPurpose] = useState<"general" | "target-screenshot">(purpose);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState("");
  const targetScreenshot = uploadPurpose === "target-screenshot";
  const purposeLocked = purpose === "target-screenshot";
  const uploading = items.some((item) => item.status === "uploading");
  const completed = items.filter((item) => item.status === "complete").length;
  const failed = items.filter((item) => item.status === "failed").length;
  const allComplete = items.length > 0 && completed === items.length;
  const overallProgress = useMemo(() => {
    if (!items.length) return 0;
    return Math.round(items.reduce((sum, item) => sum + item.progress, 0) / items.length);
  }, [items]);

  useEffect(() => {
    if (!open) return;
    setItems([]);
    setMessage("");
    setBatchCategory("compliance");
    setUploadPurpose(purpose);
  }, [financialYear, open, purpose]);

  const changeUploadPurpose = (nextPurpose: "general" | "target-screenshot") => {
    setUploadPurpose(nextPurpose);
    setMessage("");
    if (nextPurpose !== "target-screenshot") return;

    setBatchCategory("compliance");
    setItems((current) => {
      const images = current.filter((item) => item.file.type.startsWith("image/")).slice(0, 1);
      if (images.length !== current.length) {
        setMessage("Target screenshot mode keeps one image only. Other selected files were removed.");
      }
      return images.map((item) => ({ ...item, category: "compliance" }));
    });
  };

  const addFiles = (entries: Array<{ file: File; path: string }>) => {
    setMessage("");
    setItems((current) => {
      const known = new Set(current.map((item) => item.id));
      const valid = entries
        .filter(({ file }) => file.size <= MAX_SIZE && (!targetScreenshot || file.type.startsWith("image/")))
        .map(({ file, path }) => ({
          id: itemId(file, path),
          file,
          relativePath: path,
          category: batchCategory,
          progress: 0,
          status: "ready" as const,
        }))
        .filter((item) => !known.has(item.id));
      const maxItems = targetScreenshot ? 1 : MAX_FILES;
      const next = [...current, ...valid].slice(0, maxItems);
      if (targetScreenshot && entries.some(({ file }) => !file.type.startsWith("image/"))) {
        setMessage("The target screenshot must be an image file.");
      }
      if (entries.some(({ file }) => file.size > MAX_SIZE)) setMessage("Files larger than 25 MB were skipped.");
      else if (current.length + valid.length > maxItems) setMessage(targetScreenshot ? "Only one target screenshot is allowed per financial year." : "Only the first 100 files were added.");
      return next;
    });
  };

  const readInput = (files: FileList | null) => {
    if (!files) return;
    addFiles(Array.from(files).map((file) => ({
      file,
      path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
    })));
  };

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const transferItems = Array.from(event.dataTransfer.items);
    const entries = transferItems
      .map((item) => (item as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry | null }).webkitGetAsEntry?.())
      .filter((entry): entry is FileSystemEntry => Boolean(entry));
    if (entries.length) {
      const nested = await Promise.all(entries.map((entry) => filesFromEntry(entry)));
      addFiles(nested.flat());
    } else {
      addFiles(Array.from(event.dataTransfer.files).map((file) => ({ file, path: file.name })));
    }
  };

  const patchItem = (id: string, patch: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const uploadOne = async (item: UploadItem) => {
    patchItem(item.id, { status: "uploading", error: undefined, progress: 2 });
    try {
      const document = await sendItem(item, clientId, uploadPurpose, financialYear, (progress) => patchItem(item.id, { progress }));
      patchItem(item.id, { status: "complete", progress: 100 });
      onUploaded([document]);
      return true;
    } catch (error) {
      patchItem(item.id, {
        status: "failed",
        error: error instanceof Error ? error.message : "Upload failed.",
        progress: 0,
      });
      return false;
    }
  };

  const uploadAll = async () => {
    const pending = items.filter((item) => item.status === "ready" || item.status === "failed");
    for (let index = 0; index < pending.length; index += 3) {
      await Promise.all(pending.slice(index, index + 3).map(uploadOne));
    }
  };

  const close = () => {
    if (uploading) return;
    setItems([]);
    setMessage("");
    setDragging(false);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={purposeLocked ? `Upload target screenshot · FY ${financialYear}` : "Upload documents"}
      subtitle={targetScreenshot ? "This image will be identified as the target screenshot for the selected financial year." : "Files are stored in the client's Google Drive folder."}
      size="lg"
    >
      <div className="document-uploader">
        {!purposeLocked && financialYear && (
          <div className="document-upload-purpose">
            <label>
              <span>Identify this upload as</span>
              <select
                value={uploadPurpose}
                disabled={uploading || completed > 0}
                onChange={(event) => changeUploadPurpose(event.target.value as "general" | "target-screenshot")}
              >
                <option value="general">Regular document</option>
                <option value="target-screenshot">Target screenshot · FY {financialYear}</option>
              </select>
            </label>
            <p>
              {targetScreenshot
                ? `The requirement card for FY ${financialYear} will be updated after upload.`
                : "Choose target screenshot here when uploading it from the main Upload button."}
            </p>
          </div>
        )}
        <motion.div
          className="document-upload-dropzone"
          data-active={dragging}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
          }}
          onDrop={(event) => void handleDrop(event)}
          animate={reduceMotion ? undefined : { scale: dragging ? 1.012 : 1 }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
        >
          <motion.span
            className="document-upload-cloud"
            animate={reduceMotion ? undefined : { y: dragging ? -5 : 0, rotate: dragging ? -3 : 0 }}
          >
            <UploadCloud className="h-7 w-7" />
          </motion.span>
          <strong>{dragging ? "Drop files here" : targetScreenshot ? "Drag the target screenshot to upload" : "Drag files or folders to upload"}</strong>
          <p>{targetScreenshot ? "One image, up to 25 MB" : "Up to 100 files per batch, 25 MB per file"}</p>
          <div className="document-upload-picker-actions">
            <button type="button" className="client-profile-primary-button" onClick={() => fileInputRef.current?.click()}>
              <File className="h-4 w-4" /> Choose files
            </button>
            {!targetScreenshot && (
              <button type="button" className="client-profile-secondary-button" onClick={() => folderInputRef.current?.click()}>
                <FolderOpen className="h-4 w-4" /> Choose folder
              </button>
            )}
          </div>
          <input ref={fileInputRef} className="sr-only" type="file" accept={targetScreenshot ? "image/*" : undefined} multiple={!targetScreenshot} onChange={(event) => readInput(event.target.files)} />
          <input
            ref={folderInputRef}
            className="sr-only"
            type="file"
            multiple
            {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
            onChange={(event) => readInput(event.target.files)}
          />
        </motion.div>

        <div className="document-upload-toolbar">
          {targetScreenshot ? (
            <strong>Target screenshot · FY {financialYear}</strong>
          ) : (
          <label>
            <span>Default category</span>
            <select
              value={batchCategory}
              disabled={uploading}
              onChange={(event) => {
                const category = event.target.value as DocumentCategory;
                setBatchCategory(category);
                setItems((current) => current.map((item) => item.status === "ready" ? { ...item, category } : item));
              }}
            >
              {CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          )}
          <span>{items.length} selected · {displaySize(items.reduce((sum, item) => sum + item.file.size, 0))}</span>
        </div>

        {message && <p className="document-upload-message" role="status">{message}</p>}

        <AnimatePresence initial={false}>
          {items.length > 0 && (
            <motion.div
              className="document-upload-queue"
              initial={reduceMotion ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
            >
              <AnimatePresence initial={false}>
                {items.map((item, index) => (
                  <motion.div
                    key={item.id}
                    className="document-upload-row"
                    data-status={item.status}
                    initial={reduceMotion ? false : { opacity: 0, x: -14 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={reduceMotion ? undefined : { opacity: 0, x: 18, height: 0 }}
                    transition={{ delay: reduceMotion ? 0 : Math.min(index * 0.025, 0.2) }}
                    layout={!reduceMotion}
                  >
                    <span className="document-upload-file-icon">
                      {item.status === "complete" ? <Check className="h-4 w-4" /> : item.status === "uploading" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <File className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="document-upload-file-head">
                        <strong title={item.relativePath}>{item.file.name}</strong>
                        <span>{displaySize(item.file.size)}</span>
                      </div>
                      {item.relativePath !== item.file.name && <p title={item.relativePath}>{item.relativePath}</p>}
                      {item.error && <p className="document-upload-error">{item.error}</p>}
                      {item.status === "uploading" && (
                        <div className="document-upload-progress"><motion.span animate={{ width: `${item.progress}%` }} /></div>
                      )}
                    </div>
                    {targetScreenshot ? (
                      <span className="document-upload-kind-badge">Target · FY {financialYear}</span>
                    ) : (
                      <select
                        aria-label={`Category for ${item.file.name}`}
                        value={item.category}
                        disabled={item.status === "uploading" || item.status === "complete"}
                        onChange={(event) => patchItem(item.id, { category: event.target.value as DocumentCategory })}
                      >
                        {CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    )}
                    {item.status === "failed" ? (
                      <button type="button" className="client-profile-icon-button" onClick={() => void uploadOne(item)} aria-label={`Retry ${item.file.name}`}>
                        <RotateCcw className="h-4 w-4" />
                      </button>
                    ) : item.status !== "uploading" && item.status !== "complete" ? (
                      <button type="button" className="client-profile-icon-button" onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))} aria-label={`Remove ${item.file.name}`}>
                        <X className="h-4 w-4" />
                      </button>
                    ) : <span className="w-9" />}
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {items.length > 0 && (
          <AnimatePresence mode="wait" initial={false}>
            {allComplete ? (
              <motion.div
                key="success"
                className="document-upload-success"
                role="status"
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <motion.span
                  initial={reduceMotion ? false : { scale: 0.5, rotate: -18 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 420, damping: 22 }}
                >
                  <Check className="h-5 w-5" />
                </motion.span>
                <div className="min-w-0 flex-1">
                  <strong>Upload complete</strong>
                  <p>{completed} file{completed === 1 ? "" : "s"} saved to Google Drive.</p>
                </div>
                <motion.button
                  type="button"
                  className="document-upload-done"
                  onClick={close}
                  whileHover={reduceMotion ? undefined : { y: -1, scale: 1.015 }}
                  whileTap={reduceMotion ? undefined : { y: 0, scale: 0.965 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                >
                  <span><Check className="h-3.5 w-3.5" /></span>
                  Done
                </motion.button>
              </motion.div>
            ) : (
              <motion.div
                key="progress"
                className="document-upload-footer"
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -5 }}
              >
                <div className="min-w-0 flex-1">
                  <div>
                    <span>{uploading ? `${completed} of ${items.length} uploaded` : failed ? `${failed} failed · retry available` : targetScreenshot ? `Ready as target screenshot · FY ${financialYear}` : "Ready to upload"}</span>
                    <strong>{overallProgress}%</strong>
                  </div>
                  <div className="document-upload-overall"><motion.span animate={{ width: `${overallProgress}%` }} /></div>
                </div>
                <motion.button
                  type="button"
                  className="document-upload-clear"
                  disabled={uploading || completed === 0}
                  onClick={() => setItems((current) => current.filter((item) => item.status !== "complete"))}
                  whileHover={reduceMotion || uploading ? undefined : { y: -1 }}
                  whileTap={reduceMotion || uploading ? undefined : { scale: 0.97 }}
                >
                  <span><Trash2 className="h-3.5 w-3.5" /></span> Clear completed
                </motion.button>
                <motion.button
                  type="button"
                  className="document-upload-action"
                  disabled={uploading}
                  onClick={() => void uploadAll()}
                  whileHover={reduceMotion || uploading ? undefined : { y: -1, scale: 1.01 }}
                  whileTap={reduceMotion || uploading ? undefined : { scale: 0.97 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                >
                  <span>
                    {uploading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : failed ? <RotateCcw className="h-3.5 w-3.5" /> : <UploadCloud className="h-3.5 w-3.5" />}
                  </span>
                  {uploading ? "Uploading..." : failed ? "Retry failed" : "Upload to Drive"}
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </Modal>
  );
}
