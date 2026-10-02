/** Page object: CURA appointment booking and confirmation. */
import { Page, expect } from '@playwright/test';
import { bindLocators } from '../../../core/locators';
import { CuraAppointmentLocators } from './cura-appointment.locators';

export interface CuraBooking { facility: string; program: 'Medicare' | 'Medicaid' | 'None'; visitDate: string; comment: string }

/** Ported from tests/demo/login.spec.ts + locators.spec.ts: the repeated getByRole calls now live in one locator file. */
export class CuraAppointmentPage {
  readonly el;
  constructor(private readonly page: Page) { this.el = bindLocators(page, CuraAppointmentLocators); }

  async facilityOptions(): Promise<string[]> {
    return (await this.el.facilityOptions.locator.allInnerTexts()).map((t) => t.trim());
  }

  /** visitDate as ISO (YYYY-MM-DD); CURA expects dd/mm/yyyy. */
  async book(b: CuraBooking): Promise<void> {
    const [y, m, d] = b.visitDate.split('-');
    await this.el.facility.selectOption(b.facility);
    await this.el.program(b.program).check();
    await this.el.visitDate.fill(`${d}/${m}/${y}`);
    await this.el.visitDate.press('Enter'); // closes the date picker overlay
    await this.el.comment.fill(b.comment);
    await this.el.book.click();
  }

  async expectConfirmed(b: CuraBooking): Promise<void> {
    await expect(this.el.confirmationHeading.locator).toBeVisible();
    await expect(this.el.confirmedFacility.locator).toHaveText(b.facility);
    await expect(this.el.confirmedProgram.locator).toHaveText(b.program);
    await expect(this.el.confirmedComment.locator).toHaveText(b.comment);
  }
}
