/** Locators for the demo login page (Example A). */
import type { LocatorMap } from '../../../core/locators';

/**
 * EXAMPLE A: a locator file. Pure data: no Playwright calls, no logic.
 * Primary strategy = what users perceive (label/role); fallbacks = stable technical hooks.
 */
export const LoginLocators = {
  heading: { by: 'role', role: 'heading', name: 'Sign in', description: 'login heading' },
  username: { by: 'label', value: 'Username', exact: true, description: 'username input', fallbacks: [{ by: 'css', value: '#username' }] },
  password: { by: 'label', value: 'Password', exact: true, description: 'password input', fallbacks: [{ by: 'css', value: 'input[type=password]' }] },
  organization: { by: 'label', value: 'Organization', description: 'tenant selector', fallbacks: [{ by: 'css', value: 'select[name=tenant]' }] },
  submit: { by: 'role', role: 'button', name: 'Log in', description: 'login button', fallbacks: [{ by: 'testId', value: 'login-submit' }] },
  error: { by: 'role', role: 'alert', description: 'login error message' },
} as const satisfies LocatorMap;
