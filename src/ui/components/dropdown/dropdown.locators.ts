/** Locators for the Dropdown component. */
import type { LocatorMap } from '../../../core/locators';

/** ARIA combobox + listbox (custom dropdowns). Native <select> uses SmartLocator.selectOption instead. */
export const DropdownLocators = {
  trigger: (label: string) => ({ by: 'role', role: 'combobox', name: label, description: `dropdown "${label}"` }),
  options: { by: 'role', role: 'option', description: 'dropdown options' },
  option: (text: string) => ({ by: 'role', role: 'option', name: text, exact: true, description: `option "${text}"` }),
} as const satisfies LocatorMap;
