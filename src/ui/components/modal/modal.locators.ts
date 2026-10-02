/** Locators for the Modal component (scoped to the dialog root). */
import type { LocatorMap } from '../../../core/locators';

export const ModalLocators = {
  title: { by: 'role', role: 'heading', description: 'modal title', nth: 'first' },
  error: { by: 'role', role: 'alert', description: 'modal validation error' },
  button: (name: string) => ({ by: 'role', role: 'button', name, exact: true, description: `modal button "${name}"` }),
} as const satisfies LocatorMap;
