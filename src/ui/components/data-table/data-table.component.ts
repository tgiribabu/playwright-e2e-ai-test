/** Reusable DataTable component: rows as objects, find/expect rows by column values. */
import { Locator, expect } from '@playwright/test';
import { bindLocators } from '../../../core/locators';
import { DataTableLocators, DataTableRowLocators } from './data-table.locators';

export type TableRow = Record<string, string>;

/**
 * Reusable data table. Works with any <table> (or ARIA grid) whose header row names the columns.
 * Pages pass the table's root locator; rows are read as objects keyed by header text.
 */
export class DataTable {
  private readonly el;

  constructor(readonly root: Locator) {
    this.el = bindLocators(root, DataTableLocators);
  }

  async headers(): Promise<string[]> {
    return (await this.el.headerCells.locator.allInnerTexts()).map((h) => h.trim());
  }

  async rows(): Promise<TableRow[]> {
    const headers = await this.headers();
    const rows = this.el.bodyRows.primary;
    const out: TableRow[] = [];
    for (let i = 0; i < (await rows.count()); i++) {
      const cells = (await bindLocators(rows.nth(i), DataTableRowLocators).cells.locator.allInnerTexts()).map((c) => c.trim());
      out.push(Object.fromEntries(headers.map((h, c) => [h, cells[c] ?? ''])));
    }
    return out;
  }

  async rowCount(): Promise<number> { return this.el.bodyRows.primary.count(); }

  /** First row whose cells match every given column value (string = exact, RegExp = pattern). */
  async findRow(match: Record<string, string | RegExp>): Promise<TableRow | undefined> {
    return (await this.rows()).find((r) => Object.entries(match).every(([col, want]) =>
      typeof want === 'string' ? r[col] === want : want.test(r[col] ?? '')));
  }

  /** Waits (auto-retrying) until a matching row is present, then returns it. */
  async expectRow(match: Record<string, string | RegExp>, timeout = 15_000): Promise<TableRow> {
    let found: TableRow | undefined;
    await expect.poll(async () => (found = await this.findRow(match)) !== undefined, {
      message: `table row matching ${JSON.stringify(match, (_k, v) => (v instanceof RegExp ? v.source : v))}`, timeout,
    }).toBe(true);
    return found!;
  }

  /** Row element (for row-level actions) located by any text it contains. */
  row(text: string): Locator { return this.el.rowContaining(text).locator; }
}
