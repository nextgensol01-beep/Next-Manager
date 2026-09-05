import ExcelJS from "exceljs";

type ColourGroup = "identity" | "target" | "quotation" | "achieved" | "positive" | "attention" | "danger";

const COLOURS: Record<ColourGroup, { header: string; tint: string; text: string }> = {
  identity: { header: "FF263B5E", tint: "FFF8FAFC", text: "FF172033" },
  target: { header: "FF2F6FBD", tint: "FFF3F8FF", text: "FF1F4F87" },
  quotation: { header: "FF7357A6", tint: "FFF8F5FC", text: "FF594080" },
  achieved: { header: "FF087E8B", tint: "FFF1FAFB", text: "FF08636D" },
  positive: { header: "FF2E8B68", tint: "FFF2FAF6", text: "FF21684E" },
  attention: { header: "FFB66A12", tint: "FFFFF7E8", text: "FF8B4F0D" },
  danger: { header: "FFC2413A", tint: "FFFFF1F0", text: "FF9E332D" },
};

const LINE = "FFE4E7EC";

function textOf(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "richText" in value) {
    return value.richText.map((part) => part.text).join("");
  }
  return String(value);
}

function classifyHeader(value: ExcelJS.CellValue): ColourGroup {
  const label = textOf(value).toLowerCase();
  if (/warning|error|failed|rejected|overdue/.test(label)) return "danger";
  if (/remaining|pending|balance|outstanding|payment/.test(label)) return "attention";
  if (/cat-(?:iv|iii|ii|i)\s+total/.test(label)) return "positive";
  if (/accepted|received|paid|completed|mapped/.test(label)) return "positive";
  if (/achieved|generated|sold|upload/.test(label)) return "achieved";
  if (/quotation|quoted|quote|rate|item value/.test(label)) return "quotation";
  if (/target|goal|planned/.test(label)) return "target";
  return "identity";
}

function statusGroup(value: ExcelJS.CellValue): ColourGroup | null {
  if (typeof value !== "string") return null;
  const label = value.trim().toLowerCase();
  if (!label) return null;
  if (/rejected|failed|overdue|error/.test(label)) return "danger";
  if (/half payment|pending|partial|unpaid|outstanding/.test(label)) return "attention";
  if (/accepted|paid|payment|received|completed|approved|yes/.test(label)) return "positive";
  if (/sent|issued|submitted/.test(label)) return "target";
  return null;
}

function applySolidFill(cell: ExcelJS.Cell, argb: string) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function customColour(hex: string) {
  const normalized = hex.replace(/^#/, "").toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(normalized)) return null;
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const tint = [red, green, blue].map((channel) => Math.round(channel + (255 - channel) * 0.92).toString(16).padStart(2, "0")).join("").toUpperCase();
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return { header: `FF${normalized}`, tint: `FF${tint}`, text: luminance > 0.64 ? "FF172033" : "FFFFFFFF" };
}

export function finaliseReadableReportSheet(
  sheet: ExcelJS.Worksheet,
  options: { freezeColumns?: number; autoFilter?: boolean; columnColors?: Record<number, string> } = {},
) {
  if (sheet.columnCount === 0 || sheet.rowCount === 0) return;

  const freezeColumns = Math.min(options.freezeColumns ?? 1, Math.max(sheet.columnCount - 1, 0));
  sheet.views = [{
    state: "frozen",
    xSplit: freezeColumns,
    ySplit: 1,
    topLeftCell: `${sheet.getColumn(freezeColumns + 1).letter}2`,
    activeCell: `${sheet.getColumn(freezeColumns + 1).letter}2`,
  }];
  sheet.properties.defaultRowHeight = 20;
  sheet.pageSetup = {
    orientation: sheet.columnCount > 8 ? "landscape" : "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  };

  if (options.autoFilter !== false && sheet.rowCount > 1) {
    sheet.autoFilter = { from: "A1", to: sheet.getRow(1).getCell(sheet.columnCount).address };
  }

  const header = sheet.getRow(1);
  header.height = 36;
  const groups: ColourGroup[] = [];
  const columnStyles: Array<{ header: string; tint: string; text: string }> = [];
  for (let columnIndex = 1; columnIndex <= sheet.columnCount; columnIndex += 1) {
    const cell = header.getCell(columnIndex);
    const group = classifyHeader(cell.value);
    const style = customColour(options.columnColors?.[columnIndex] || "") || COLOURS[group];
    groups.push(group);
    columnStyles.push(style);
    applySolidFill(cell, style.header);
    cell.font = { name: "Aptos Display", size: 10, bold: true, color: { argb: style.text } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      right: { style: "thin", color: { argb: "55FFFFFF" } },
      bottom: { style: "medium", color: { argb: style.header } },
    };
  }

  for (let rowIndex = 2; rowIndex <= sheet.rowCount; rowIndex += 1) {
    const row = sheet.getRow(rowIndex);
    const isGrandTotal = textOf(row.getCell(1).value).trim().toUpperCase() === "GRAND TOTAL";
    row.height = 20;
    for (let columnIndex = 1; columnIndex <= sheet.columnCount; columnIndex += 1) {
      const cell = row.getCell(columnIndex);
      const group = groups[columnIndex - 1] || "identity";
      const status = statusGroup(cell.value);
      const style = status ? COLOURS[status] : (columnStyles[columnIndex - 1] || COLOURS[group]);
      applySolidFill(cell, style.tint);
      cell.font = {
        name: "Aptos",
        size: 10,
        bold: Boolean(status),
        color: { argb: status ? style.text : "FF172033" },
      };
      cell.alignment = {
        vertical: "middle",
        horizontal: typeof cell.value === "number" ? "right" : "left",
        wrapText: false,
      };
      cell.border = {
        bottom: { style: "thin", color: { argb: LINE } },
        right: groups[columnIndex] !== group
          ? { style: "thin", color: { argb: "FFCFD4DC" } }
          : undefined,
      };
      if (typeof cell.value === "number" && (!cell.numFmt || cell.numFmt === "General")) {
        cell.numFmt = "#,##0.##;[Red]-#,##0.##;–";
      }
      if (isGrandTotal) {
        applySolidFill(cell, "FF234F7D");
        cell.font = { name: "Aptos", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      }
    }
  }
}
