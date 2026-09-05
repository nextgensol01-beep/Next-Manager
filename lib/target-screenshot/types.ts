export type TargetCategory = 1 | 2 | 3 | 4;
export type TargetCreditType = "RECYCLING" | "EOL";

export type OcrBox = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type OcrWord = {
  text: string;
  confidence: number;
  bbox: OcrBox;
};

export type OcrLine = {
  text: string;
  confidence: number;
  bbox: OcrBox;
  words: OcrWord[];
};

export type LocalOcrResult = {
  text: string;
  confidence: number;
  lines: OcrLine[];
  processedImageUrl: string;
};

export type ExtractedTarget = {
  category: TargetCategory;
  type: TargetCreditType;
  value: number | null;
  confidence?: number;
};

export type ScreenshotTargetExtraction = {
  detectedFinancialYear?: string;
  targets: ExtractedTarget[];
  totalRecycling: number;
  totalEOL: number;
  totalTarget: number;
  warnings: string[];
  status: "REVIEW_REQUIRED";
  ocrText: string;
  processedImageUrl: string;
};

export type OcrProgress = {
  status: string;
  progress: number;
};

export interface TargetScreenshotOcrAdapter {
  analyze(file: File, onProgress: (progress: OcrProgress) => void): Promise<LocalOcrResult>;
}
