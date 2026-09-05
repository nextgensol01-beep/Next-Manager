import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const sourcePath = "C:/Users/User/Desktop/Targetssss.xlsx";
const outputDir = "C:/Users/User/Desktop/CodeX/align/outputs/reports-excel-colour-redesign";
const outputPath = `${outputDir}/Targetssss-readable-redesign.xlsx`;
const previewDir = "C:/Users/User/Desktop/CodeX/align/tmp/reports-excel-design/redesign-preview";

const palette = {
  ink: "#172033",
  navy: "#263B5E",
  slate: "#475467",
  line: "#E4E7EC",
  recyclingTarget: "#2F6FBD",
  recyclingTargetTint: "#F3F8FF",
  eolTarget: "#7357A6",
  eolTargetTint: "#F8F5FC",
  recyclingAchieved: "#087E8B",
  recyclingAchievedTint: "#F1FAFB",
  eolAchieved: "#2E8B68",
  eolAchievedTint: "#F2FAF6",
  sent: "#2563EB",
  sentTint: "#EAF2FF",
  accepted: "#1F7A4F",
  acceptedTint: "#E9F8EF",
  payment: "#A86412",
  paymentTint: "#FFF4DD",
  white: "#FFFFFF",
};

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });

const input = await FileBlob.load(sourcePath);
const workbook = await SpreadsheetFile.importXlsx(input);
const sheet = workbook.worksheets.getItem("Sheet1");

sheet.showGridLines = false;
sheet.freezePanes.unfreeze();
sheet.freezePanes.freezeRows(1);
sheet.freezePanes.freezeColumns(1);

// The source table included the totals and summary rows. Restrict the table to
// actual client records so filtering and the summary area remain predictable.
for (const table of [...sheet.tables.items]) table.delete();
const reportTable = sheet.tables.add("A1:V69", true, "TargetsReportTable");
reportTable.style = "TableStyleLight1";
reportTable.showFilterButton = true;

const body = sheet.getRange("A2:V69");
body.format = {
  font: { name: "Aptos", size: 10, color: palette.ink },
  verticalAlignment: "center",
  borders: {
    insideHorizontal: { style: "thin", color: palette.line },
    bottom: { style: "thin", color: palette.line },
  },
};
body.format.rowHeight = 20;

sheet.getRange("A2:A69").format.fill = palette.white;
sheet.getRange("B2:E69").format.fill = palette.recyclingTargetTint;
sheet.getRange("F2:I69").format.fill = palette.eolTargetTint;
sheet.getRange("J2:M69").format.fill = palette.recyclingAchievedTint;
sheet.getRange("N2:Q69").format.fill = palette.eolAchievedTint;
sheet.getRange("R2:S69").format.fill = "#F8FAFC";
sheet.getRange("T2:V69").format.fill = palette.white;

const headers = [
  ["A1:A1", palette.navy],
  ["B1:E1", palette.recyclingTarget],
  ["F1:I1", palette.eolTarget],
  ["J1:M1", palette.recyclingAchieved],
  ["N1:Q1", palette.eolAchieved],
  ["R1:S1", palette.slate],
  ["T1:T1", palette.sent],
  ["U1:U1", palette.accepted],
  ["V1:V1", palette.payment],
];

for (const [address, fill] of headers) {
  sheet.getRange(address).format = {
    fill,
    font: { name: "Aptos Display", size: 10, bold: true, color: palette.white },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
    borders: {
      right: { style: "thin", color: "#FFFFFF" },
      bottom: { style: "medium", color: fill },
    },
  };
}
sheet.getRange("A1:V1").format.rowHeight = 48;

// Gentle group separators replace the dense boxed grid from the source file.
for (const col of ["A", "E", "I", "M", "Q", "S", "T", "U", "V"]) {
  sheet.getRange(`${col}2:${col}70`).format.borders = {
    right: { style: "thin", color: "#CFD4DC" },
  };
}

sheet.getRange("A2:A70").format.horizontalAlignment = "center";
sheet.getRange("B2:Q70").format.horizontalAlignment = "right";
sheet.getRange("R2:R70").format.horizontalAlignment = "center";
sheet.getRange("S2:S70").format.horizontalAlignment = "left";
sheet.getRange("T2:V70").format.horizontalAlignment = "center";
sheet.getRange("B2:Q70").setNumberFormat("#,##0;[Red]-#,##0;–");

sheet.getRange("A:A").format.columnWidth = 13;
sheet.getRange("B:Q").format.columnWidth = 14;
sheet.getRange("R:R").format.columnWidth = 9;
sheet.getRange("S:S").format.columnWidth = 36;
sheet.getRange("T:V").format.columnWidth = 13;

// Replace structured references that produced #REF! in the supplied workbook.
for (let col = 1; col <= 16; col += 1) {
  const letter = String.fromCharCode(65 + col);
  sheet.getRange(`${letter}70`).formulas = [[`=SUBTOTAL(109,${letter}2:${letter}69)`]];
}
sheet.getRange("T70").formulas = [["=SUBTOTAL(103,T2:T69)"]];
sheet.getRange("U70").formulas = [["=SUBTOTAL(103,U2:U69)"]];
sheet.getRange("V70").formulas = [["=SUBTOTAL(103,V2:V69)"]];

sheet.getRange("A70:V70").format = {
  fill: palette.navy,
  font: { name: "Aptos", size: 10, bold: true, color: palette.white },
  verticalAlignment: "center",
  borders: {
    top: { style: "double", color: palette.navy },
    bottom: { style: "medium", color: palette.navy },
  },
};
sheet.getRange("A70").values = [["VISIBLE TOTAL"]];
sheet.getRange("A70:V70").format.rowHeight = 24;
sheet.getRange("B70:Q70").setNumberFormat("#,##0;[Red]-#,##0;–");

// Compact filter-aware summary below the main table.
sheet.getRange("C72:F72").merge();
sheet.getRange("C72").values = [["FILTER-AWARE SUMMARY"]];
sheet.getRange("C72:F72").format = {
  fill: palette.navy,
  font: { name: "Aptos Display", size: 11, bold: true, color: palette.white },
  horizontalAlignment: "left",
  verticalAlignment: "center",
  borders: { preset: "outside", style: "thin", color: palette.navy },
};
sheet.getRange("C72:F72").format.rowHeight = 26;
sheet.getRange("C73:F73").values = [["Measure", "Category", "Visible qty", "Combined"]];
sheet.getRange("C73:F73").format = {
  fill: "#E9EEF5",
  font: { name: "Aptos", size: 9, bold: true, color: palette.ink },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  borders: { preset: "all", style: "thin", color: "#D0D5DD" },
};
sheet.getRange("C74:F77").values = [
  ["Targets", "Recycling", null, null],
  [null, "End of Life", null, null],
  ["Achieved", "Recycling", null, null],
  [null, "End of Life", null, null],
];
sheet.getRange("E74").formulas = [["=SUBTOTAL(109,B2:B69)+SUBTOTAL(109,C2:C69)+SUBTOTAL(109,D2:D69)+SUBTOTAL(109,E2:E69)"]];
sheet.getRange("E75").formulas = [["=SUBTOTAL(109,F2:F69)+SUBTOTAL(109,G2:G69)+SUBTOTAL(109,H2:H69)+SUBTOTAL(109,I2:I69)"]];
sheet.getRange("F74").formulas = [["=E74+E75"]];
sheet.getRange("E76").formulas = [["=SUBTOTAL(109,J2:J69)+SUBTOTAL(109,K2:K69)+SUBTOTAL(109,L2:L69)+SUBTOTAL(109,M2:M69)"]];
sheet.getRange("E77").formulas = [["=SUBTOTAL(109,N2:N69)+SUBTOTAL(109,O2:O69)+SUBTOTAL(109,P2:P69)+SUBTOTAL(109,Q2:Q69)"]];
sheet.getRange("F76").formulas = [["=E76+E77"]];
sheet.getRange("C74:F77").format = {
  font: { name: "Aptos", size: 10, color: palette.ink },
  verticalAlignment: "center",
  borders: { preset: "all", style: "thin", color: "#D0D5DD" },
};
sheet.getRange("C74:F75").format.fill = palette.recyclingTargetTint;
sheet.getRange("C76:F77").format.fill = palette.recyclingAchievedTint;
sheet.getRange("C74:C77").format.font = { name: "Aptos", size: 10, bold: true, color: palette.ink };
sheet.getRange("E74:F77").format.horizontalAlignment = "right";
sheet.getRange("E74:F77").setNumberFormat("#,##0;[Red]-#,##0;–");
sheet.getRange("C:C").format.columnWidth = 15;
sheet.getRange("D:D").format.columnWidth = 16;
sheet.getRange("E:F").format.columnWidth = 15;

// Status colours make the workflow state understandable at a glance.
sheet.getRange("T2:T69").conditionalFormats.deleteAll();
sheet.getRange("U2:U69").conditionalFormats.deleteAll();
sheet.getRange("V2:V69").conditionalFormats.deleteAll();
sheet.getRange("T2:T69").conditionalFormats.add("containsText", {
  text: "sent",
  format: { fill: palette.sentTint, font: { bold: true, color: palette.sent } },
});
sheet.getRange("U2:U69").conditionalFormats.add("containsText", {
  text: "accepted",
  format: { fill: palette.acceptedTint, font: { bold: true, color: palette.accepted } },
});
sheet.getRange("V2:V69").conditionalFormats.add("containsText", {
  text: "half payment",
  format: { fill: palette.paymentTint, font: { bold: true, color: palette.payment } },
});
sheet.getRange("V2:V69").conditionalFormats.add("containsText", {
  text: "payment",
  format: { fill: palette.acceptedTint, font: { bold: true, color: palette.accepted } },
});

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

const formulaErrors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});
console.log(formulaErrors.ndjson);

const preview = await workbook.render({
  sheetName: "Sheet1",
  range: "A1:V77",
  scale: 1,
  format: "png",
});
await fs.writeFile(`${previewDir}/Sheet1.png`, new Uint8Array(await preview.arrayBuffer()));
console.log(outputPath);
