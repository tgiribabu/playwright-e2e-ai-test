/** File validation: name, extension, real MIME type (magic bytes), size, CSV/XLSX/JSON structure. */
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import ExcelJS from 'exceljs';
import { parse } from 'csv-parse/sync';

/** Magic-byte signatures: the declared extension is never trusted on its own. */
const SIGNATURES: Array<{ mime: string; bytes: number[]; offset?: number }> = [
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] },                 // %PDF
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'application/zip', bytes: [0x50, 0x4b, 0x03, 0x04] },                 // also xlsx/docx/pptx
  { mime: 'application/gzip', bytes: [0x1f, 0x8b] },
  { mime: 'application/x-msdownload', bytes: [0x4d, 0x5a] },                    // MZ: Windows executable
];

const OOXML: Record<string, string> = {
  'xl/': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'word/': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'ppt/': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

export const EXTENSION_MIME: Record<string, string[]> = {
  '.pdf': ['application/pdf'], '.png': ['image/png'], '.jpg': ['image/jpeg'], '.jpeg': ['image/jpeg'], '.gif': ['image/gif'],
  '.zip': ['application/zip'], '.xlsx': [OOXML['xl/']!], '.docx': [OOXML['word/']!],
  '.csv': ['text/csv', 'text/plain'], '.txt': ['text/plain'], '.json': ['application/json', 'text/plain'],
};

/** Detects the real MIME type from content (magic bytes, OOXML part names, text heuristics). */
export function detectMime(buf: Buffer): string {
  for (const s of SIGNATURES) {
    if (s.bytes.every((b, i) => buf[(s.offset ?? 0) + i] === b)) {
      if (s.mime === 'application/zip') {
        const head = buf.subarray(0, Math.min(buf.length, 64 * 1024)).toString('latin1');
        for (const [part, mime] of Object.entries(OOXML)) if (head.includes(part)) return mime;
      }
      return s.mime;
    }
  }
  const sample = buf.subarray(0, 8192);
  if (sample.includes(0)) return 'application/octet-stream';                   // binary
  const text = sample.toString('utf8').replace(/^\uFEFF/, '').trim();
  if (/^[[{]/.test(text)) { try { JSON.parse(buf.toString('utf8')); return 'application/json'; } catch { /* not json */ } }
  const lines = text.split(/\r?\n/).slice(0, 5);
  if (lines.length > 1 && lines.every((l) => l.includes(',')) && new Set(lines.map((l) => l.split(',').length)).size === 1) return 'text/csv';
  return 'text/plain';
}

export interface FileRules {
  extensions?: string[];             // e.g. ['.csv']
  mimeTypes?: string[];              // e.g. ['text/csv']  (defaults to the extension's expected MIME types)
  minBytes?: number;
  maxBytes?: number;
  fileNamePattern?: RegExp;          // e.g. /^appointments-[a-z]+\.csv$/
  csv?: { requiredColumns?: string[]; minRows?: number; delimiter?: string };
  xlsx?: { sheets?: string[]; requiredColumns?: string[]; minRows?: number };
  json?: { requiredKeys?: string[] };
}

export interface FileReport {
  ok: boolean;
  problems: string[];
  file: { name: string; extension: string; bytes: number; mime: string; sha256: string };
  /** Parsed content for further assertions (CSV/XLSX rows, JSON value). */
  rows?: Array<Record<string, unknown>>;
  json?: unknown;
}

/**
 * Validates a downloaded/generated file: name, extension, real MIME type vs extension (spoofing),
 * size limits, executables, and structural content checks for CSV / XLSX / JSON.
 */
export async function validateFile(filePath: string, rules: FileRules = {}): Promise<FileReport> {
  const name = path.basename(filePath);
  const extension = path.extname(name).toLowerCase();
  const buf = fs.readFileSync(filePath);
  const mime = detectMime(buf);
  const problems: string[] = [];
  const report: FileReport = {
    ok: false, problems,
    file: { name, extension, bytes: buf.length, mime, sha256: createHash('sha256').update(buf).digest('hex') },
  };

  if (rules.fileNamePattern && !rules.fileNamePattern.test(name)) problems.push(`file name "${name}" does not match ${rules.fileNamePattern}`);
  if (rules.extensions && !rules.extensions.map((e) => e.toLowerCase()).includes(extension)) problems.push(`extension ${extension || '(none)'} not in ${rules.extensions.join(', ')}`);
  const allowedMime = rules.mimeTypes ?? EXTENSION_MIME[extension];
  if (allowedMime && !allowedMime.includes(mime)) problems.push(`content is ${mime} but ${extension} expects ${allowedMime.join(' | ')} (possible spoofed/corrupt file)`);
  if (mime === 'application/x-msdownload') problems.push('file is a Windows executable');
  if (rules.minBytes !== undefined && buf.length < rules.minBytes) problems.push(`size ${buf.length}B < min ${rules.minBytes}B`);
  if (rules.maxBytes !== undefined && buf.length > rules.maxBytes) problems.push(`size ${buf.length}B > max ${rules.maxBytes}B`);

  try {
    if (rules.csv) {
      const rows = parse(buf, { columns: true, skip_empty_lines: true, bom: true, delimiter: rules.csv.delimiter ?? ',' }) as Array<Record<string, string>>;
      report.rows = rows;
      checkColumns(rows, rules.csv.requiredColumns, rules.csv.minRows, 'CSV', problems);
    }
    if (rules.xlsx) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as unknown as ArrayBuffer);
      const names = wb.worksheets.map((w) => w.name);
      for (const s of rules.xlsx.sheets ?? []) if (!names.includes(s)) problems.push(`sheet "${s}" missing (has ${names.join(', ')})`);
      const ws = wb.worksheets[0];
      const header = ((ws?.getRow(1).values as unknown[]) ?? []).slice(1).map(String);
      const rows: Array<Record<string, unknown>> = [];
      ws?.eachRow((r, i) => { if (i > 1) rows.push(Object.fromEntries(header.map((h, c) => [h, r.getCell(c + 1).value]))); });
      report.rows = rows;
      checkColumns(rows.length ? rows : [Object.fromEntries(header.map((h) => [h, null]))], rules.xlsx.requiredColumns, rules.xlsx.minRows, 'XLSX', problems, rows.length);
    }
    if (rules.json) {
      report.json = JSON.parse(buf.toString('utf8'));
      for (const k of rules.json.requiredKeys ?? []) if (!(k in (report.json as object))) problems.push(`JSON key "${k}" missing`);
    }
  } catch (e) {
    problems.push(`could not parse content: ${(e as Error).message}`);
  }

  report.ok = problems.length === 0;
  return report;
}

function checkColumns(rows: Array<Record<string, unknown>>, required: string[] | undefined, minRows: number | undefined, kind: string, problems: string[], count = rows.length) {
  const cols = Object.keys(rows[0] ?? {});
  for (const c of required ?? []) if (!cols.includes(c)) problems.push(`${kind} column "${c}" missing (has ${cols.join(', ') || 'none'})`);
  if (minRows !== undefined && count < minRows) problems.push(`${kind} has ${count} data rows, expected ≥ ${minRows}`);
}
