/** Page object: demo appointments page composed of Modal, Dropdown, DataTable, Toast (Example D). */
import { Download, Page, expect } from '@playwright/test';
import { bindLocators } from '../../../core/locators';
import { DataTable, Dropdown, Modal, Toast } from '../../components';
import { AppointmentsLocators, NewAppointmentFormLocators } from './appointments.locators';

export interface NewAppointment { patientMrn: string; facilityName: string; visitDate: string; comment?: string }

/** EXAMPLE D: a page object composed from reusable components (DataTable, Modal, Dropdown, Toast). */
export class AppointmentsPage {
  readonly el;
  readonly table: DataTable;
  readonly dialog: Modal;
  readonly toast: Toast;
  private readonly form;
  private readonly facility: Dropdown;

  constructor(private readonly page: Page) {
    this.el = bindLocators(page, AppointmentsLocators);
    // Components receive the ROOT locator of their region; they own their inner locators.
    this.table = new DataTable(this.el.table.locator);
    this.dialog = new Modal(this.el.newAppointmentDialog.locator);
    this.form = bindLocators(this.dialog.root, NewAppointmentFormLocators);
    this.facility = new Dropdown(this.dialog.root, 'Facility');
    this.toast = new Toast(page);
  }

  async open(): Promise<void> {
    await this.page.goto('/appointments');
    await this.expectLoaded();
  }

  async expectLoaded(tenantName?: string): Promise<void> {
    await expect(this.el.heading.locator).toBeVisible();
    if (tenantName) await expect(this.el.tenantName.locator).toHaveText(tenantName);
  }

  async facilityOptions(): Promise<string[]> {
    await this.el.newAppointment.click();
    const options = await this.facility.optionTexts();
    await this.dialog.clickButton('Cancel');
    return options;
  }

  /** Creates an appointment through the dialog and returns the reference shown in the toast. */
  async createAppointment(a: NewAppointment): Promise<string> {
    await this.el.newAppointment.click();
    await this.dialog.expectOpen('New appointment');
    await this.form.patientMrn.fill(a.patientMrn);
    await this.facility.select(a.facilityName);
    await this.form.visitDate.fill(a.visitDate);
    await this.form.comment.fill(a.comment ?? '');
    await this.form.save.click();
    await this.dialog.expectClosed();
    const message = await this.toast.expectMessage(/Appointment APT-[0-9A-F]{6} created/);
    return message.match(/APT-[0-9A-F]{6}/)![0];
  }

  /** Submits the dialog expecting a validation error; returns the error text. */
  async submitExpectingError(a: Partial<NewAppointment>): Promise<string> {
    await this.el.newAppointment.click();
    if (a.patientMrn) await this.form.patientMrn.fill(a.patientMrn);
    if (a.facilityName) await this.facility.select(a.facilityName);
    if (a.visitDate) await this.form.visitDate.fill(a.visitDate);
    await this.form.save.click();
    await expect(this.dialog.el.error.locator).toBeVisible();
    return (await this.dialog.errorText()) ?? '';
  }

  async exportCsv(): Promise<Download> { return this.download(() => this.el.exportCsv.click()); }
  async exportExcel(): Promise<Download> { return this.download(() => this.el.exportExcel.click()); }

  private async download(trigger: () => Promise<void>): Promise<Download> {
    const [download] = await Promise.all([this.page.waitForEvent('download'), trigger()]);
    return download;
  }
}
