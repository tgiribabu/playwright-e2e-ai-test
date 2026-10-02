/** Page object: demo login page (Example A consumer). */
import { Page, expect } from '@playwright/test';
import { bindLocators } from '../../../core/locators';
import { LoginLocators } from './login.locators';

/** EXAMPLE A (consumer): the page object binds its locator file once and exposes business actions. */
export class LoginPage {
  /** Bound, self-healing elements. Tests may use `el.<name>.locator` in assertions only. */
  readonly el;

  constructor(private readonly page: Page) {
    this.el = bindLocators(page, LoginLocators);
  }

  async open(): Promise<void> {
    await this.page.goto('/login');
    await expect(this.el.heading.locator).toBeVisible();
  }

  async login(username: string, password: string, tenantId: string): Promise<void> {
    await this.el.username.fill(username);
    await this.el.password.fill(password);
    await this.el.organization.selectOption(tenantId);
    await this.el.submit.click();
  }

  async expectError(text: string | RegExp): Promise<void> {
    await expect(this.el.error.locator).toContainText(text);
  }
}
