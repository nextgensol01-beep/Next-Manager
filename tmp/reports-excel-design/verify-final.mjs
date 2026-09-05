import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbookPath = "C:/Users/User/Desktop/CodeX/align/outputs/reports-excel-colour-redesign/Targetssss-readable-redesign.xlsx";
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));

const keyRanges = await workbook.inspect({
  kind: "table",
  range: "Sheet1!A1:V77",
  include: "values,formulas",
  tableMaxRows: 80,
  tableMaxCols: 22,
  maxChars: 30000,
});
await fs.writeFile("final-values.ndjson", keyRanges.ndjson, "utf8");

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "saved workbook formula error scan",
});
console.log(errors.ndjson);

const preview = await workbook.render({ sheetName: "Sheet1", range: "A1:F16", scale: 1.5, format: "png" });
await fs.writeFile("redesign-preview/Sheet1-saved-detail.png", new Uint8Array(await preview.arrayBuffer()));
