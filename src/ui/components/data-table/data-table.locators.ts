/** Locators for the DataTable component (scoped to the table root). */
import type { LocatorMap } from '../../../core/locators';

/** Locators INSIDE a table root. Scoped by DataTable, so they never match other tables on the page. */
export const DataTableLocators = {
  headerCells: { by: 'role', role: 'columnheader', description: 'table header cells' },
  bodyRows: { by: 'css', value: 'tbody tr', description: 'table body rows', fallbacks: [{ by: 'role', role: 'row' }] },
  rowContaining: (text: string) => ({ by: 'role', role: 'row', hasText: text, description: `row containing "${text}"` }),
} as const satisfies LocatorMap;

/** Locators INSIDE one row (bound per row by DataTable). */
export const DataTableRowLocators = {
  cells: { by: 'css', value: 'td, [role=cell], [role=gridcell]', description: 'row cells' },
} as const satisfies LocatorMap;
