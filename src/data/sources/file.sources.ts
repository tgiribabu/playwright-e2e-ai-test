/** JSON and CSV readers for test data files. */
import * as fs from 'fs';
import { parse } from 'csv-parse/sync';

/** JSON test data. Supports a top-level array or an object (e.g. keyed by environment). */
export function readJson<T = unknown>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

/** CSV with a header row → array of objects (values trimmed, blank lines skipped). */
export function readCsv(file: string): Array<Record<string, string>> {
  return parse(fs.readFileSync(file, 'utf8'), { columns: true, skip_empty_lines: true, trim: true, bom: true });
}
