/** Locators for the demo /appointments page and its new-appointment dialog. */
import type { LocatorMap } from '../../../core/locators';

/** Page-level elements of /appointments. */
export const AppointmentsLocators = {
  heading: { by: 'role', role: 'heading', name: 'Appointments', description: 'page heading' },
  tenantName: { by: 'testId', value: 'tenant-name', description: 'current tenant name' },
  newAppointment: { by: 'role', role: 'button', name: 'New appointment', description: 'new appointment button', fallbacks: [{ by: 'css', value: '#new-appt' }] },
  table: { by: 'role', role: 'table', name: 'Appointments', description: 'appointments table', fallbacks: [{ by: 'css', value: 'table' }] },
  exportCsv: { by: 'role', role: 'link', name: 'Export CSV', description: 'CSV export link', fallbacks: [{ by: 'testId', value: 'export-csv' }] },
  exportExcel: { by: 'role', role: 'link', name: 'Export Excel', description: 'Excel export link', fallbacks: [{ by: 'testId', value: 'export-xlsx' }] },
  newAppointmentDialog: { by: 'role', role: 'dialog', name: 'New appointment', description: 'new appointment dialog' },
} as const satisfies LocatorMap;

/**
 * Fields INSIDE the new-appointment dialog (bound to the dialog root, not the page).
 * `save` keeps the dev team's agreed test id as primary; the role fallback is what heals
 * when that id changes (try `DEMO_DRIFT=1 npm run demo:up`).
 */
export const NewAppointmentFormLocators = {
  patientMrn: { by: 'label', value: 'Patient MRN', description: 'patient MRN input', fallbacks: [{ by: 'css', value: '#mrn' }] },
  visitDate: { by: 'label', value: 'Visit date', description: 'visit date input', fallbacks: [{ by: 'css', value: 'input[type=date]' }] },
  comment: { by: 'label', value: 'Comment', description: 'comment textarea', fallbacks: [{ by: 'css', value: 'textarea' }] },
  save: { by: 'testId', value: 'appointment-save', description: 'save appointment button', fallbacks: [{ by: 'role', role: 'button', name: 'Save', exact: true }] },
} as const satisfies LocatorMap;
