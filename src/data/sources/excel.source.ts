/** Excel reader: worksheet rows as objects, ignoring blank columns and rows. */
import ExcelJS from 'exceljs';

export type Row = Record<string, string | number | boolean | null>;

function cellValue(cell: ExcelJS.Cell): string | number | boolean | null {
  const v = cell.value as unknown;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as { result?: unknown; richText?: Array<{ text: string }>; text?: string };
    if ('result' in o) return (o.result ?? null) as string | number | null;       // formula → cached result
    if (o.richText) return o.richText.map((t) => t.text).join('');
    if (o.text !== undefined) return o.text;                                    // hyperlink
  }
  return v as string | number | boolean;
}

/**
 * Reads a worksheet as objects keyed by the header row. Blank header columns are ignored
 * (the old employees.xlsx had ~90 empty trailing columns) and fully blank rows are skipped.
 */
export async function readExcel(file: string, sheet?: string): Promise<Row[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = sheet ? wb.getWorksheet(sheet) : wb.worksheets[0];
  if (!ws) throw new Error(`Worksheet "${sheet ?? '(first)'}" not found in ${file}`);

  const headers: Array<[number, string]> = [];
  ws.getRow(1).eachCell((cell, col) => {
    const h = String(cellValue(cell) ?? '').trim();
    if (h) headers.push([col, h]);
  });

  const rows: Row[] = [];
  ws.eachRow((row, idx) => {
    if (idx === 1) return;
    const rec: Row = {};
    for (const [col, h] of headers) {
      const v = cellValue(row.getCell(col));
      rec[h] = typeof v === 'string' ? v.trim() : v;
    }
    if (Object.values(rec).some((v) => v !== null && v !== '')) rows.push(rec);
  });
  return rows;
}
