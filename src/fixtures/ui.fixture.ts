/** Fixture layer 2: page objects (register new pages here). */
import { test as configTest } from './config.fixture';
import { LoginPage } from '../ui/pages/demo/login.page';
import { AppointmentsPage } from '../ui/pages/demo/appointments.page';
import { CuraLoginPage } from '../ui/pages/cura/cura-login.page';
import { CuraAppointmentPage } from '../ui/pages/cura/cura-appointment.page';

type Pages = {
  loginPage: LoginPage;
  appointmentsPage: AppointmentsPage;
  curaLoginPage: CuraLoginPage;
  curaAppointmentPage: CuraAppointmentPage;
};

/** Layer 2: page objects. Register every new page here so tests receive it as a fixture. */
export const test = configTest.extend<Pages>({
  loginPage: async ({ page }, use) => { await use(new LoginPage(page)); },
  appointmentsPage: async ({ page }, use) => { await use(new AppointmentsPage(page)); },
  curaLoginPage: async ({ page }, use) => { await use(new CuraLoginPage(page)); },
  curaAppointmentPage: async ({ page }, use) => { await use(new CuraAppointmentPage(page)); },
});
