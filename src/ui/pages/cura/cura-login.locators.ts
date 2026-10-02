/** Locators for the CURA home and login pages. */
import type { LocatorMap } from '../../../core/locators';

/** CURA demo site. Primary = the role/label locators from the original recorded tests; fallbacks = documented element ids. */
export const CuraLoginLocators = {
  homeHeading: { by: 'role', role: 'heading', name: 'CURA Healthcare Service', exact: true, nth: 'first', description: 'home page heading', fallbacks: [{ by: 'css', value: 'h1' }] },
  makeAppointment: { by: 'role', role: 'link', name: 'Make Appointment', description: 'Make Appointment link', fallbacks: [{ by: 'css', value: '#btn-make-appointment' }] },
  username: { by: 'label', value: 'Username', description: 'username input', fallbacks: [{ by: 'css', value: '#txt-username' }] },
  password: { by: 'label', value: 'Password', description: 'password input', fallbacks: [{ by: 'css', value: '#txt-password' }] },
  login: { by: 'role', role: 'button', name: 'Login', description: 'login button', fallbacks: [{ by: 'css', value: '#btn-login' }] },
  loginError: { by: 'text', value: 'Login failed! Please ensure the username and password are valid.', description: 'login error', fallbacks: [{ by: 'css', value: '#login .text-danger' }] },
} as const satisfies LocatorMap;
