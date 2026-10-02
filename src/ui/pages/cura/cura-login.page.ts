/** Page object: CURA home and login. */
import { Page, expect } from '@playwright/test';
import { bindLocators } from '../../../core/locators';
import { CuraLoginLocators } from './cura-login.locators';

export class CuraLoginPage {
  readonly el;
  constructor(private readonly page: Page) { this.el = bindLocators(page, CuraLoginLocators); }

  async open(): Promise<void> {
    await this.page.goto('/');
    await expect(this.el.homeHeading.locator).toBeVisible();
  }

  async goToLogin(): Promise<void> { await this.el.makeAppointment.click(); }

  async login(username: string, password: string): Promise<void> {
    await this.el.username.fill(username);
    await this.el.password.fill(password);
    await this.el.login.click();
  }

  async expectLoginFailed(): Promise<void> { await expect(this.el.loginError.locator).toBeVisible(); }
}
