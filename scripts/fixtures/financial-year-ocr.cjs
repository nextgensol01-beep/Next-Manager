/* Deterministic OCR transport only. The production screenshot parser and review UI run unchanged. */
exports.localTargetScreenshotOcr = {
  analyze: async (file, onProgress) => {
    onProgress({ status: "Reading fixture screenshot locally", progress: 40 });
    await new Promise((resolve) =>
      setTimeout(resolve, file.name.includes("slow") ? 1100 : 90),
    );
    const rows = [],
      values = [300.25, 40.125, 20.5, 0, 10, 0, 0, 0],
      roman = ["I", "II", "III", "IV"];
    for (let i = 0; i < 8; i++) {
      if (file.name.includes("incomplete") && i === 7) continue;
      const text = `CAT-${roman[Math.floor(i / 2)]} ${i % 2 ? "EOL" : "Recycling"}`,
        y = 100 + i * 50;
      rows.push({
        text: `${text} ${values[i]}`,
        confidence: 96,
        bbox: { x0: 0, x1: 850, y0: y, y1: y + 20 },
        words: [
          { text, confidence: 96, bbox: { x0: 0, x1: 300, y0: y, y1: y + 20 } },
          {
            text: String(values[i]),
            confidence: 96,
            bbox: { x0: 800, x1: 850, y0: y, y1: y + 20 },
          },
        ],
      });
    }
    return {
      text: `Next year Targets (${file.name.includes("mismatch") ? "2024-25" : "2025-26"})\n${rows.map((row) => row.text).join("\n")}`,
      confidence: 96,
      lines: rows,
      processedImageUrl: "",
    };
  },
};
