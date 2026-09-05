import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const sourcePath = "C:/Users/User/Desktop/Targetssss.xlsx";
const outputDir = "C:/Users/User/Desktop/CodeX/align/tmp/reports-excel-design/analysis";
await fs.mkdir(outputDir, { recursive: true });

const input = await FileBlob.load(sourcePath);
const workbook = await SpreadsheetFile.importXlsx(input);
const summary = await workbook.inspect({
  kind: "workbook,sheet,table",
  maxChars: 12000,
  tableMaxRows: 8,
  tableMaxCols: 16,
  tableMaxCellChars: 100,
});
await fs.writeFile(`${outputDir}/summary.ndjson`, summary.ndjson, "utf8");
console.log(summary.ndjson);

const sheets = await workbook.inspect({ kind: "sheet", include: "id,name", maxChars: 8000 });
await fs.writeFile(`${outputDir}/sheets.ndjson`, sheets.ndjson, "utf8");
console.log("SHEETS");
console.log(sheets.ndjson);

const styles = await workbook.inspect({
  kind: "computedStyle",
  sheetId: "Sheet1",
  range: "A1:V10",
  maxChars: 10000,
});
await fs.writeFile(`${outputDir}/styles.ndjson`, styles.ndjson, "utf8");
console.log("STYLES");
console.log(styles.ndjson);

const formulas = await workbook.inspect({
  kind: "formula",
  sheetId: "Sheet1",
  range: "A1:V77",
  maxChars: 10000,
  options: { maxResults: 200 },
});
await fs.writeFile(`${outputDir}/formulas.ndjson`, formulas.ndjson, "utf8");
console.log("FORMULAS");
console.log(formulas.ndjson);

const preview = await workbook.render({ sheetName: "Sheet1", autoCrop: "all", scale: 1, format: "png" });
await fs.writeFile(`${outputDir}/Sheet1.png`, new Uint8Array(await preview.arrayBuffer()));
console.log(`Rendered ${outputDir}/Sheet1.png`);
