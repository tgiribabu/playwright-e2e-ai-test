/** Locators for the Toast component. */
import type { LocatorMap } from '../../../core/locators';

export const ToastLocators = {
  message: { by: 'role', role: 'status', description: 'toast notification', nth: 'last', fallbacks: [{ by: 'css', value: '.toast' }] },
} as const satisfies LocatorMap;
