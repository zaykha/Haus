import { normalizeCsvHeader, parseCsvDocument } from "@/lib/csv";

export type ParsedTabularDocument = {
  headers: string[];
  rows: Record<string, string>[];
};

function buildRecordsFromGrid(grid: string[][]): ParsedTabularDocument {
  if (!grid.length) {
    return { headers: [], rows: [] };
  }

  const headers = (grid[0] ?? []).map((value) => normalizeCsvHeader(String(value ?? "")));
  const rows = grid
    .slice(1)
    .map((row) => {
      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        if (!header) {
          return;
        }

        record[header] = String(row[index] ?? "").trim();
      });
      return record;
    })
    .filter((record) => Object.values(record).some((value) => value.length > 0));

  return { headers, rows };
}

export async function parseTabularDocument(file: File): Promise<ParsedTabularDocument> {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith(".csv")) {
    const content = await file.text();
    return parseCsvDocument(content);
  }

  if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      return { headers: [], rows: [] };
    }

    const sheet = workbook.Sheets[firstSheetName];
    const grid = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    });

    const normalizedGrid = grid.map((row) => row.map((cell) => String(cell ?? "").trim()));
    return buildRecordsFromGrid(normalizedGrid);
  }

  throw new Error("Unsupported file format. Upload a CSV, XLSX, or XLS file.");
}
