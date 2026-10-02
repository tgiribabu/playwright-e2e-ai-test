/** Reusable Modal (dialog) component: open/closed state, title, error, buttons. */
import { Locator, expect } from '@playwright/test';
import { bindLocators } from '../../../core/locators';
import { ModalLocators } from './modal.locators';

/** Reusable dialog: open/closed state, title, inline validation error, footer buttons. */
export class Modal {
  readonly el;

  constructor(readonly root: Locator) {
    this.el = bindLocators(root, ModalLocators);
  }

  async expectOpen(title?: string | RegExp): Promise<void> {
    await expect(this.root).toBeVisible();
    if (title) await expect(this.el.title.locator).toHaveText(title);
  }

  async expectClosed(timeout = 15_000): Promise<void> { await expect(this.root).toBeHidden({ timeout }); }

  async clickButton(name: string): Promise<void> { await this.el.button(name).click(); }

  async errorText(): Promise<string | undefined> {
    return (await this.el.error.isVisible()) ? this.el.error.text() : undefined;
  }
}
