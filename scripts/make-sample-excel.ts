/** Generates data/excel/appointment-cases.xlsx from code (reviewable sample test data). */
/**
 * Generates data/excel/appointment-cases.xlsx (the Excel source used by the showcase test).
 * Kept as code so the workbook is reviewable in git diffs and never accumulates stray columns or credentials.
 */
import ExcelJS from 'exceljs';
import * as path from 'path';

async function main() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Cases');
  ws.addRow(['TC_ID', 'Facility_Code', 'Insurance_Code', 'Visit_In_Days', 'Comment', 'Expected_Status']);
  ws.addRow(['TC-APPT-001', 'FAC-TKY', 'MEDICARE', 14, 'Annual check-up', 'SCHEDULED']);
  ws.addRow(['TC-APPT-002', 'FAC-HKG', 'MEDICAID', 30, 'Follow-up, bring prior results', 'SCHEDULED']);
  ws.addRow(['TC-APPT-003', 'FAC-SEL', 'MEDICARE', 7, '', 'SCHEDULED']);
  ws.getRow(1).font = { bold: true };
  ws.columns.forEach((c) => { c.width = 22; });
  const out = path.resolve(__dirname, '../data/excel/appointment-cases.xlsx');
  await wb.xlsx.writeFile(out);
  console.log(`wrote ${out}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
