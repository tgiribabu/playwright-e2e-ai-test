/** Reusable Toast component: waits for and reads notifications. */
import { Page, expect } from '@playwright/test';
import { bindLocators } from '../../../core/locators';
import { ToastLocators } from './toast.locators';

/** Reusable toast/snackbar: waits for the message and returns its text (toasts auto-dismiss). */
export class Toast {
  private readonly el;

  constructor(page: Page) {
    this.el = bindLocators(page, ToastLocators);
  }

  async expectMessage(text: string | RegExp, timeout = 15_000): Promise<string> {
    await expect(this.el.message.locator).toContainText(text, { timeout });
    return this.el.message.text();
  }
}
