/** Locators for the CURA appointment and confirmation pages. */
import type { LocatorMap } from '../../../core/locators';

export const CuraAppointmentLocators = {
  facility: { by: 'label', value: 'Facility', description: 'facility select', fallbacks: [{ by: 'css', value: '#combo_facility' }] },
  facilityOptions: { by: 'css', value: '#combo_facility option', description: 'facility options' },
  program: (name: string) => ({ by: 'role', role: 'radio', name, description: `healthcare program "${name}"` }),
  visitDate: { by: 'role', role: 'textbox', name: 'Visit Date (Required)', description: 'visit date', fallbacks: [{ by: 'css', value: '#txt_visit_date' }] },
  comment: { by: 'role', role: 'textbox', name: 'Comment', description: 'comment', fallbacks: [{ by: 'css', value: '#txt_comment' }] },
  book: { by: 'role', role: 'button', name: 'Book Appointment', description: 'book button', fallbacks: [{ by: 'css', value: '#btn-book-appointment' }] },
  confirmationHeading: { by: 'role', role: 'heading', name: 'Appointment Confirmation', description: 'confirmation heading', fallbacks: [{ by: 'css', value: 'h2' }] },
  confirmedFacility: { by: 'css', value: '#facility', description: 'confirmed facility' },
  confirmedProgram: { by: 'css', value: '#program', description: 'confirmed program' },
  confirmedComment: { by: 'css', value: '#comment', description: 'confirmed comment' },
  goHome: { by: 'role', role: 'link', name: 'Go to Homepage', description: 'go to homepage link' },
} as const satisfies LocatorMap;
