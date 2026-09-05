import type {
  ExtractedTarget,
  LocalOcrResult,
  OcrLine,
  OcrWord,
  ScreenshotTargetExtraction,
  TargetCategory,
  TargetCreditType,
} from "./types";

const CATEGORIES: TargetCategory[] = [1, 2, 3, 4];
const TYPES: TargetCreditType[] = ["RECYCLING", "EOL"];

function normalizedText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedForMatching(value: string) {
  return normalizedText(value)
    .toUpperCase()
    .replace(/0F/g, "OF")
    .replace(/RECYC1/g, "RECYCLI")
    .replace(/\bCATE?G?O?R?Y?\b/g, "CAT");
}

function toFinancialYear(value: string | undefined) {
  if (!value) return undefined;
  const match = value.match(/(20\d{2})\s*-\s*(\d{2,4})/);
  if (!match) return undefined;
  return `${match[1]}-${match[2].slice(-2)}`;
}

function detectFinancialYear(text: string) {
  const normalized = normalizedForMatching(text);
  const nextYear = normalized.match(/NEXT\s*YEAR\s*TARGETS?[\s():-]*(20\d{2}\s*-\s*\d{2,4})/);
  if (nextYear) return toFinancialYear(nextYear[1]);
  const targetYear = normalized.match(/TARGETS?[\s():-]*(20\d{2}\s*-\s*\d{2,4})/);
  if (targetYear) return toFinancialYear(targetYear[1]);
  return toFinancialYear(normalized.match(/(20\d{2}\s*-\s*\d{2,4})/)?.[1]);
}

function romanCategory(value: string): TargetCategory | null {
  const token = value.includes("&") ? "4" : value.replace(/[^IV1-4]/g, "");
  const mapped: Record<string, TargetCategory> = {
    "1": 1,
    I: 1,
    "2": 2,
    II: 2,
    "3": 3,
    III: 3,
    "4": 4,
    IV: 4,
  };
  return mapped[token] ?? null;
}

function detectCategory(text: string) {
  const normalized = normalizedForMatching(text);
  const match = normalized.match(/\bCAT\s*[-:]?\s*(IV|III|II|I|[1-4]|&)(?:\b|\s|-)/)
    || normalized.match(/\bCATEGORY\s*[-:]?\s*(IV|III|II|I|[1-4]|&)(?:\b|\s|-)/);
  return romanCategory(match?.[1] || "");
}

function detectType(text: string): TargetCreditType | null {
  const normalized = normalizedForMatching(text);
  if (/END\s*(?:OF)?\s*L(?:I|1)?FE|END.{0,8}LIFE|\bE\s*O\s*L\b/.test(normalized)) return "EOL";
  // Small JPEG text commonly turns RECYCLING into RECYELING, RECYC1ING,
  // RECYUNG, etc. In CPCB target rows a REC-prefixed word is unambiguous.
  if (/RECYCL(?:ING|1NG)|RECYCLABLE|\bREC[A-Z0-9]{3,12}\b/.test(normalized)) return "RECYCLING";
  return null;
}

function isMandatedUse(text: string) {
  const normalized = normalizedForMatching(text);
  return /MANDATED.*RECYCLED|USE\s+OF\s+RECYCLED/.test(normalized);
}

function centerX(word: Pick<OcrWord, "bbox">) {
  return (word.bbox.x0 + word.bbox.x1) / 2;
}

function centerY(word: Pick<OcrWord, "bbox">) {
  return (word.bbox.y0 + word.bbox.y1) / 2;
}

function numericValue(value: string) {
  const token = value.trim();
  // A selected/highlighted "1" is commonly recognized as I, l or |.
  if (/^[Iil|!]$/.test(token)) return 1;
  const cleaned = token
    .replace(/,/g, "")
    .replace(/[Oo](?=\d|$)/g, "0")
    .replace(/[Iil|](?=\d|$)/g, "1")
    .replace(/[^\d.-]/g, "");
  if (!cleaned || cleaned === "." || cleaned === "-") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function numberWords(lines: OcrLine[]) {
  return lines.flatMap((line) => line.words).filter((word) => numericValue(word.text) !== null);
}

function findTargetColumnX(lines: OcrLine[]) {
  // The section title contains "Next year Targets (FY)" on the left, while
  // CPCB's actual numeric column has the singular header "Target" on the far
  // right. Using the FY/title position makes CAT 1/2/3/4 look like values.
  const targetHeaders = lines
    .flatMap((line) => line.words)
    .filter((word) => normalizedForMatching(word.text).replace(/[^A-Z]/g, "") === "TARGET")
    .sort((left, right) => centerX(right) - centerX(left));
  return targetHeaders[0] ? centerX(targetHeaders[0]) : undefined;
}

function extractValue(lines: OcrLine[], allLines: OcrLine[], targetColumnX?: number) {
  const words = lines.flatMap((line) => line.words);
  const labelRightEdge = words
    .filter((word) => numericValue(word.text) === null && /[A-Za-z]/.test(word.text))
    .reduce((rightEdge, word) => Math.max(rightEdge, word.bbox.x1), Number.NEGATIVE_INFINITY);
  const numericCandidates = numberWords(lines).filter((word) => {
    const text = normalizedForMatching(word.text);
    return !/^20\d{2}-\d{2,4}$/.test(text);
  });

  if (targetColumnX !== undefined) {
    const rowTop = Math.min(...lines.map((line) => line.bbox.y0));
    const rowBottom = Math.max(...lines.map((line) => line.bbox.y1));
    const rowCenter = (rowTop + rowBottom) / 2;
    const rowHeight = Math.max(1, rowBottom - rowTop);
    const imageWidth = Math.max(...allLines.map((line) => line.bbox.x1), targetColumnX);
    const xTolerance = Math.max(55, imageWidth * 0.07);
    const yTolerance = Math.max(10, rowHeight * 1.6);
    const targetCellCandidates = numberWords(allLines)
      .filter((word) => {
        const text = normalizedForMatching(word.text);
        return !/^20\d{2}-\d{2,4}$/.test(text)
          && Math.abs(centerX(word) - targetColumnX) <= xTolerance
          && Math.abs(centerY(word) - rowCenter) <= yTolerance;
      })
      .sort((left, right) => {
        const leftScore = Math.abs(centerY(left) - rowCenter) * 5 + Math.abs(centerX(left) - targetColumnX);
        const rightScore = Math.abs(centerY(right) - rowCenter) * 5 + Math.abs(centerX(right) - targetColumnX);
        return leftScore - rightScore;
      });
    if (targetCellCandidates[0]) {
      return {
        value: numericValue(targetCellCandidates[0].text),
        confidence: targetCellCandidates[0].confidence,
      };
    }
  }

  // CPCB rows often contain an Arabic category marker (CAT 1, CAT 2, ...).
  // It is not a target value: actual table values sit to the right of the row label.
  // Prefer that value region before applying the detected FY-column position.
  const valuesRightOfLabel = Number.isFinite(labelRightEdge)
    ? numericCandidates.filter((word) => centerX(word) > labelRightEdge)
    : [];
  // When a label edge is available, never fall back to its CAT index. A missing
  // target cell is safer as "Review" than a confident but incorrect category.
  const candidates = Number.isFinite(labelRightEdge) ? valuesRightOfLabel : numericCandidates;
  if (!candidates.length) return { value: null, confidence: undefined };

  const selected = targetColumnX === undefined
    ? candidates[candidates.length - 1]
    : [...candidates].sort((left, right) => Math.abs(centerX(left) - targetColumnX) - Math.abs(centerX(right) - targetColumnX))[0];
  return { value: numericValue(selected.text), confidence: selected.confidence };
}

function targetKey(category: TargetCategory, type: TargetCreditType) {
  return `${category}|${type}`;
}

function tableRowIndex(category: TargetCategory, type: TargetCreditType) {
  return (type === "RECYCLING" ? 0 : 4) + category - 1;
}

function totals(targets: ExtractedTarget[]) {
  const totalRecycling = targets
    .filter((target) => target.type === "RECYCLING")
    .reduce((sum, target) => sum + (target.value ?? 0), 0);
  const totalEOL = targets
    .filter((target) => target.type === "EOL")
    .reduce((sum, target) => sum + (target.value ?? 0), 0);
  return { totalRecycling, totalEOL, totalTarget: totalRecycling + totalEOL };
}

export function recalculateScreenshotExtraction(extraction: ScreenshotTargetExtraction) {
  return { ...extraction, ...totals(extraction.targets) };
}

export function parseCpcbTargetScreenshot(ocr: LocalOcrResult): ScreenshotTargetExtraction {
  const detectedFinancialYear = detectFinancialYear(ocr.text);
  const targetColumnX = findTargetColumnX(ocr.lines);
  const found = new Map<string, ExtractedTarget>();
  const rowCenters = new Map<string, number>();
  const duplicateKeys = new Set<string>();
  const inferredKeys = new Set<string>();

  for (let index = 0; index < ocr.lines.length; index += 1) {
    const window = ocr.lines.slice(index, index + 3);
    const firstLineText = window[0]?.text || "";
    // Do not let a section title/header borrow the next row from its lookahead
    // window. A real row starts with at least its CAT or credit-type label.
    if (!detectCategory(firstLineText) && !detectType(firstLineText)) continue;
    let matchedLines: OcrLine[] | null = null;
    let category: TargetCategory | null = null;
    let type: TargetCreditType | null = null;

    for (let length = 1; length <= window.length; length += 1) {
      const candidateLines = window.slice(0, length);
      if (candidateLines.length > 1) {
        const previous = candidateLines[candidateLines.length - 2];
        const current = candidateLines[candidateLines.length - 1];
        if (detectCategory(current.text)) break;
        const previousHeight = Math.max(1, previous.bbox.y1 - previous.bbox.y0);
        // Wrapped text stays tightly stacked. A larger vertical gap means the
        // lookahead crossed into the next CPCB table row and must not be joined.
        if (current.bbox.y0 - previous.bbox.y1 > Math.max(8, previousHeight * 0.8)) break;
      }
      const candidateText = candidateLines.map((line) => line.text).join(" ");
      if (isMandatedUse(candidateText)) break;
      category = detectCategory(candidateText);
      type = detectType(candidateText);
      if (category && type) {
        matchedLines = candidateLines;
        break;
      }
    }

    if (!matchedLines || !category || !type) continue;
    const key = targetKey(category, type);
    const extracted = extractValue(matchedLines, ocr.lines, targetColumnX);
    const rowConfidence = matchedLines.reduce((sum, line) => sum + line.confidence, 0) / matchedLines.length;
    const target: ExtractedTarget = {
      category,
      type,
      value: extracted.value,
      confidence: extracted.confidence === undefined ? rowConfidence : (rowConfidence + extracted.confidence) / 2,
    };

    if (found.has(key)) {
      duplicateKeys.add(key);
      if ((target.confidence ?? 0) <= (found.get(key)?.confidence ?? 0)) continue;
    }
    found.set(key, target);
    rowCenters.set(key, matchedLines.reduce(
      (sum, line) => sum + (line.bbox.y0 + line.bbox.y1) / 2,
      0
    ) / matchedLines.length);
  }

  // Blue browser text selection can make Tesseract omit an entire row label,
  // even though its value is still visible in the Target column. CPCB's eight
  // supported rows are evenly spaced and ordered, so recover only a missing
  // value whose position is strongly supported by the surrounding rows.
  if (targetColumnX !== undefined && rowCenters.size >= 4) {
    const anchors = [...rowCenters.entries()].map(([key, y]) => {
      const [categoryToken, typeToken] = key.split("|");
      const category = Number(categoryToken) as TargetCategory;
      return { index: tableRowIndex(category, typeToken as TargetCreditType), y };
    });
    const meanIndex = anchors.reduce((sum, anchor) => sum + anchor.index, 0) / anchors.length;
    const meanY = anchors.reduce((sum, anchor) => sum + anchor.y, 0) / anchors.length;
    const denominator = anchors.reduce((sum, anchor) => sum + (anchor.index - meanIndex) ** 2, 0);
    const slope = denominator > 0
      ? anchors.reduce((sum, anchor) => sum + (anchor.index - meanIndex) * (anchor.y - meanY), 0) / denominator
      : 0;
    const intercept = meanY - slope * meanIndex;
    const imageWidth = Math.max(...ocr.lines.map((line) => line.bbox.x1), targetColumnX);
    const xTolerance = Math.max(55, imageWidth * 0.07);
    const yTolerance = Math.max(10, Math.abs(slope) * 0.42);

    if (slope > 5 && slope < 200) {
      for (const category of CATEGORIES) {
        for (const type of TYPES) {
          const key = targetKey(category, type);
          if (found.has(key)) continue;
          const expectedY = intercept + slope * tableRowIndex(category, type);
          const positionalCandidate = numberWords(ocr.lines)
            .filter((word) => (
              Math.abs(centerX(word) - targetColumnX) <= xTolerance
              && Math.abs(centerY(word) - expectedY) <= yTolerance
            ))
            .sort((left, right) => (
              Math.abs(centerY(left) - expectedY) - Math.abs(centerY(right) - expectedY)
            ))[0];
          if (!positionalCandidate) continue;
          found.set(key, {
            category,
            type,
            value: numericValue(positionalCandidate.text),
            confidence: Math.min(60, positionalCandidate.confidence * 0.7),
          });
          inferredKeys.add(key);
        }
      }
    }
  }

  const targets = CATEGORIES.flatMap((category) => TYPES.map((type) => (
    found.get(targetKey(category, type)) || { category, type, value: null }
  )));
  const warnings: string[] = [];
  const missing = targets.filter((target) => target.value === null);
  if (!detectedFinancialYear) warnings.push("The financial year could not be read from the screenshot.");
  if (missing.length) warnings.push(`${missing.length} target field${missing.length === 1 ? " was" : "s were"} not detected. Review and enter zero where appropriate.`);
  if (inferredKeys.size) warnings.push(`${inferredKeys.size} obscured target row${inferredKeys.size === 1 ? " was" : "s were"} recovered from ${inferredKeys.size === 1 ? "its" : "their"} table position. Verify ${inferredKeys.size === 1 ? "it" : "them"} carefully.`);
  if (duplicateKeys.size) warnings.push("Duplicate target rows were detected. The clearest reading is shown for review.");
  if (targets.some((target) => target.value !== null && (target.confidence ?? 100) < 65)) {
    warnings.push("Some values have low OCR confidence and need careful verification.");
  }
  if (!found.size) warnings.push("No supported CPCB target rows were recognized. Try a clearer or more tightly cropped screenshot.");

  return {
    detectedFinancialYear,
    targets,
    ...totals(targets),
    warnings,
    status: "REVIEW_REQUIRED",
    ocrText: ocr.text,
    processedImageUrl: ocr.processedImageUrl,
  };
}
