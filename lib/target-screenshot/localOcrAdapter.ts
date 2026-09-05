"use client";

import type { LocalOcrResult, OcrLine, OcrProgress, TargetScreenshotOcrAdapter } from "./types";

const MAX_RENDER_WIDTH = 3200;
const MAX_RENDER_HEIGHT = 2600;
const MIN_RENDER_WIDTH = 2400;

function stageProgress(status: string, progress: number, onProgress: (progress: OcrProgress) => void) {
  onProgress({ status, progress: Math.max(0, Math.min(100, Math.round(progress))) });
}

async function imageCanvas(file: File, minimumWidth = MIN_RENDER_WIDTH) {
  const image = await createImageBitmap(file);
  try {
    const upscale = image.width < minimumWidth ? minimumWidth / image.width : 1;
    const constrained = Math.min(
      upscale,
      MAX_RENDER_WIDTH / image.width,
      MAX_RENDER_HEIGHT / image.height
    );
    const scale = Math.max(0.5, constrained);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("The browser could not prepare the screenshot.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    image.close();
  }
}

type TargetColumnCanvas = {
  canvas: HTMLCanvasElement;
  baseCanvas: HTMLCanvasElement;
  cropLeft: number;
  cropTop: number;
  cropScale: number;
};

async function focusedTargetColumnCanvas(file: File): Promise<TargetColumnCanvas> {
  // A higher-resolution base is important here: on compressed JPEGs, resizing
  // the full page first preserves adjacent digits such as "112" much better
  // than enlarging an already-processed narrow crop.
  const baseCanvas = await imageCanvas(file, 2800);
  await preprocessWithOpenCv(baseCanvas);
  const cropLeft = Math.round(baseCanvas.width * 0.87);
  const cropTop = Math.round(baseCanvas.height * 0.16);
  const cropWidth = Math.max(1, Math.min(Math.round(baseCanvas.width * 0.11), baseCanvas.width - cropLeft));
  const cropHeight = Math.max(1, Math.min(Math.round(baseCanvas.height * 0.54), baseCanvas.height - cropTop));
  const cropScale = 6;
  const canvas = document.createElement("canvas");
  canvas.width = cropWidth * cropScale;
  canvas.height = cropHeight * cropScale;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("The browser could not prepare the Target column.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    baseCanvas,
    cropLeft,
    cropTop,
    cropWidth,
    cropHeight,
    0,
    0,
    canvas.width,
    canvas.height
  );
  return { canvas, baseCanvas, cropLeft, cropTop, cropScale };
}

function canvasContrastFallback(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const contrast = 1.35;
  for (let index = 0; index < pixels.data.length; index += 4) {
    const gray = 0.299 * pixels.data[index] + 0.587 * pixels.data[index + 1] + 0.114 * pixels.data[index + 2];
    const enhanced = Math.max(0, Math.min(255, (gray - 128) * contrast + 138));
    pixels.data[index] = enhanced;
    pixels.data[index + 1] = enhanced;
    pixels.data[index + 2] = enhanced;
  }
  context.putImageData(pixels, 0, 0);
}

async function preprocessWithOpenCv(canvas: HTMLCanvasElement) {
  try {
    const imported = await import("@techstark/opencv-js");
    // The package is CommonJS and its browser shape differs between webpack
    // development and production builds. Support both the default wrapper and
    // the module-as-namespace shape instead of falling back unnecessarily.
    const cvModule = (imported.default ?? imported) as typeof imported.default;
    const resolved = typeof (cvModule as { then?: unknown })?.then === "function"
      ? await cvModule
      : cvModule;
    const cv = resolved.Mat
      ? resolved
      : await new Promise<typeof resolved>((resolve) => {
          resolved.onRuntimeInitialized = () => resolve(resolved);
        });
    const source = cv.imread(canvas);
    const grayscale = new cv.Mat();
    const enhanced = new cv.Mat();
    try {
      cv.cvtColor(source, grayscale, cv.COLOR_RGBA2GRAY);
      // A restrained contrast lift works better for CPCB's thin table text than
      // global histogram equalization, which can erase pale zeroes and headers.
      grayscale.convertTo(enhanced, -1, 1.35, -35);
      cv.imshow(canvas, enhanced);
    } finally {
      source.delete();
      grayscale.delete();
      enhanced.delete();
    }
  } catch (error) {
    console.warn("OpenCV preprocessing was unavailable; using the browser fallback.", error);
    canvasContrastFallback(canvas);
  }
}

function flattenLines(
  blocks: import("tesseract.js").Block[] | null,
  mapBox: (box: { x0: number; y0: number; x1: number; y1: number }) => { x0: number; y0: number; x1: number; y1: number } = (box) => ({ ...box })
): OcrLine[] {
  if (!blocks) return [];
  return blocks.flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines.map((line) => ({
    text: line.text.trim(),
    confidence: line.confidence,
    bbox: mapBox(line.bbox),
    words: line.words.map((word) => ({
      text: word.text,
      confidence: word.confidence,
      bbox: mapBox(word.bbox),
    })),
  })))).filter((line) => line.text);
}

function mergeFocusedTargetValues(fullLines: OcrLine[], focusedLines: OcrLine[], pageWidth: number) {
  if (!focusedLines.length) return fullLines;
  const focusedRows = focusedLines.map((line) => (line.bbox.y0 + line.bbox.y1) / 2);
  const cleanedFullLines = fullLines.map((line) => ({
    ...line,
    words: line.words.filter((word) => {
      const wordCenterX = (word.bbox.x0 + word.bbox.x1) / 2;
      const wordCenterY = (word.bbox.y0 + word.bbox.y1) / 2;
      return wordCenterX <= pageWidth * 0.8
        || !focusedRows.some((rowCenter) => Math.abs(rowCenter - wordCenterY) <= 12);
    }),
  }));
  return [...cleanedFullLines, ...focusedLines];
}

export const localTargetScreenshotOcr: TargetScreenshotOcrAdapter = {
  async analyze(file, onProgress): Promise<LocalOcrResult> {
    stageProgress("Preparing screenshot", 4, onProgress);
    const canvas = await imageCanvas(file);
    stageProgress("Improving text contrast locally", 12, onProgress);
    await preprocessWithOpenCv(canvas);
    const processedImageUrl = canvas.toDataURL("image/png");
    stageProgress("Preparing Target column", 16, onProgress);
    const focusedColumn = await focusedTargetColumnCanvas(file);

    stageProgress("Starting local text reader", 18, onProgress);
    const { createWorker, PSM } = await import("tesseract.js");
    let ocrPass: "page" | "column" = "page";
    const worker = await createWorker("eng", 1, {
      logger: (message) => {
        if (message.status === "recognizing text") {
          if (ocrPass === "page") {
            stageProgress("Reading target rows locally", 25 + message.progress * 55, onProgress);
          } else {
            stageProgress("Reading Target column locally", 82 + message.progress * 14, onProgress);
          }
        } else if (message.status) {
          stageProgress(message.status.replace(/^./, (letter) => letter.toUpperCase()), 20, onProgress);
        }
      },
    });

    try {
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        preserve_interword_spaces: "1",
        user_defined_dpi: "300",
      });
      const result = await worker.recognize(canvas, {}, { text: true, blocks: true });
      ocrPass = "column";
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        tessedit_char_whitelist: "0123456789.,",
        preserve_interword_spaces: "1",
      });
      const columnResult = await worker.recognize(focusedColumn.canvas, {}, { text: true, blocks: true });
      const pageScaleX = canvas.width / focusedColumn.baseCanvas.width;
      const pageScaleY = canvas.height / focusedColumn.baseCanvas.height;
      const focusedLines = flattenLines(columnResult.data.blocks, (box) => ({
        x0: (focusedColumn.cropLeft + box.x0 / focusedColumn.cropScale) * pageScaleX,
        y0: (focusedColumn.cropTop + box.y0 / focusedColumn.cropScale) * pageScaleY,
        x1: (focusedColumn.cropLeft + box.x1 / focusedColumn.cropScale) * pageScaleX,
        y1: (focusedColumn.cropTop + box.y1 / focusedColumn.cropScale) * pageScaleY,
      }));
      const lines = mergeFocusedTargetValues(flattenLines(result.data.blocks), focusedLines, canvas.width);
      stageProgress("Building the target review", 98, onProgress);
      return {
        text: result.data.text,
        confidence: result.data.confidence,
        lines,
        processedImageUrl,
      };
    } finally {
      await worker.terminate();
      stageProgress("Review required", 100, onProgress);
    }
  },
};
