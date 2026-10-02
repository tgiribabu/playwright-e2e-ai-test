/** Reusable custom dropdown component (ARIA combobox + listbox). */
import { Locator, Page, expect } from '@playwright/test';
import { bindLocators } from '../../../core/locators';
import { DropdownLocators } from './dropdown.locators';

/** Reusable custom dropdown (button[role=combobox] + [role=listbox]). Scope = the form or dialog that contains it. */
export class Dropdown {
  private readonly el;

  constructor(scope: Page | Locator, private readonly label: string) {
    this.el = bindLocators(scope, DropdownLocators);
  }

  async open(): Promise<void> {
    const trigger = this.el.trigger(this.label);
    if ((await trigger.locator.getAttribute('aria-expanded')) !== 'true') await trigger.click();
    await expect(this.el.options.locator.first()).toBeVisible();
  }

  async optionTexts(): Promise<string[]> {
    await this.open();
    return (await this.el.options.primary.allInnerTexts()).map((t) => t.trim());
  }

  async select(text: string): Promise<void> {
    await this.open();
    await this.el.option(text).click();
    await expect(this.el.trigger(this.label).locator).toHaveText(text);
  }
}
