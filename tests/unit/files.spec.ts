/** Self-tests: FileValidator and SecureFileSystem. */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';
import { validateFile, detectMime } from '../../src/files/FileValidator';
import { SecureFileSystem } from '../../src/files/SecureFileSystem';

test.describe('FileValidator @unit', () => {
  let dir: string;
  test.beforeEach(({}, info) => { dir = info.outputPath('f'); fs.mkdirSync(dir, { recursive: true }); });
  const put = (name: string, data: string | Buffer) => { const p = path.join(dir, name); fs.writeFileSync(p, data); return p; };

  test('valid CSV passes with columns, rows and name pattern', async () => {
    const r = await validateFile(put('appointments-acme.csv', 'Reference,Status\nAPT-1,SCHEDULED\n'), {
      extensions: ['.csv'], fileNamePattern: /^appointments-\w+\.csv$/, csv: { requiredColumns: ['Reference', 'Status'], minRows: 1 },
    });
    expect(r.problems).toEqual([]);
    expect(r.file.mime).toBe('text/csv');
    expect(r.rows).toEqual([{ Reference: 'APT-1', Status: 'SCHEDULED' }]);
  });

  test('spoofed file: PNG bytes with a .csv extension is rejected', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    const r = await validateFile(put('report.csv', png), { extensions: ['.csv'] });
    expect(r.ok).toBe(false);
    expect(r.problems.join()).toMatch(/content is image\/png but \.csv expects/);
  });

  test('executable disguised as PDF is rejected', async () => {
    const r = await validateFile(put('invoice.pdf', Buffer.from('MZ\x90\x00 fake exe')));
    expect(r.problems.join()).toMatch(/Windows executable/);
  });

  test('XLSX is detected from content and its sheet/columns are checked', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Appointments').addRows([['Reference', 'Status'], ['APT-9', 'SCHEDULED']]);
    const p = put('export.xlsx', Buffer.from(await wb.xlsx.writeBuffer()));
    const r = await validateFile(p, { xlsx: { sheets: ['Appointments'], requiredColumns: ['Reference'], minRows: 1 } });
    expect(r.problems).toEqual([]);
    expect(detectMime(fs.readFileSync(p))).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });

  test('size limits and missing columns are reported together', async () => {
    const r = await validateFile(put('big.csv', 'A,B\n1,2\n'), { maxBytes: 3, csv: { requiredColumns: ['Reference'] } });
    expect(r.problems).toHaveLength(2);
  });
});

test.describe('SecureFileSystem @unit', () => {
  let fsx: SecureFileSystem;
  test.beforeEach(({}, info) => { fsx = new SecureFileSystem(info.outputPath('sandbox'), { quotaBytes: 1_000 }); });

  test('writes and reads inside the sandbox', () => {
    fsx.write('reports/a.json', '{"ok":true}');
    expect(fsx.readText('reports/a.json')).toBe('{"ok":true}');
    expect(fsx.list()).toEqual([path.join('reports', 'a.json')]);
  });

  test('blocks traversal, absolute paths and symlink escapes', () => {
    expect(() => fsx.write('../escape.txt', 'x')).toThrow(/escapes the sandbox/);
    expect(() => fsx.read('/etc/passwd')).toThrow(/absolute paths/);
    fs.symlinkSync('/tmp', path.join(fsx.root, 'link'));
    expect(() => fsx.write('link/evil.txt', 'x')).toThrow(/symlink/);
  });

  test('enforces extension allowlist and quota', () => {
    expect(() => fsx.write('run.sh', 'rm -rf /')).toThrow(/extension \.sh not allowed/);
    expect(() => fsx.write('big.txt', 'x'.repeat(2_000))).toThrow(/quota/);
  });

  test('sanitizes untrusted download names', () => {
    expect(SecureFileSystem.sanitizeName('../../etc/evil.csv')).toBe('evil.csv');
    expect(SecureFileSystem.sanitizeName('a:b?c*.csv')).toBe('a_b_c_.csv');
    expect(() => SecureFileSystem.sanitizeName('../')).toThrow();
  });
});
