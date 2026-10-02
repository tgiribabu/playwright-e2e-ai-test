/** Self-tests: SmartLocator healing, strict/off modes, factories. */
import { test, expect } from '@playwright/test';
import { bindLocators, LocatorMap } from '../../src/core/locators';

// Framework self-tests for the locator engine (static HTML, no environment). Run: npm run test:unit
const Locators = {
  save: { by: 'testId', value: 'save-v1', description: 'save button', fallbacks: [{ by: 'role', role: 'button', name: 'Save' }] },
  missing: { by: 'testId', value: 'nope', description: 'missing element' },
  headers: { by: 'role', role: 'columnheader', description: 'headers' },
  rowFor: (name: string) => ({ by: 'role', role: 'row', hasText: name, description: `row ${name}` }),
} as const satisfies LocatorMap;

const HTML = `<button data-testid="save-v2" onclick="this.textContent='saved'">Save</button>
<table><tr><th>Name</th><th>Status</th></tr><tr><td>Ann</td><td>ok</td></tr><tr><td>Bob</td><td>late</td></tr></table>`;

test.describe('SmartLocator @unit', () => {
  test.afterEach(() => { delete process.env.HEALING_MODE; });

  test('heals through a fallback and records the heal on the test', { tag: '@expected-heal' }, async ({ page }) => {
    await page.setContent(HTML);
    const el = bindLocators(page, Locators);
    await el.save.click();
    await expect(el.save.locator).toHaveText('saved');
    const heal = test.info().annotations.find((a) => a.type === 'self-heal');
    expect(JSON.parse(heal!.description!)).toMatchObject({ primary: 'testId=save-v1', healedWith: 'role=button[name=Save]' });
  });

  test('strict mode fails and names the working fallback', { tag: '@expected-heal' }, async ({ page }) => {
    process.env.HEALING_MODE = 'strict';
    await page.setContent(HTML);
    await expect(bindLocators(page, Locators).save.click()).rejects.toThrow(/self-heal:strict.*role=button\[name=Save\]/);
  });

  test('off mode uses only the primary strategy', async ({ page }) => {
    process.env.HEALING_MODE = 'off';
    await page.setContent(HTML);
    await expect(bindLocators(page, Locators).save.resolve(1_000)).rejects.toThrow(/not found\. Tried: testId=save-v1$/m);
  });

  test('not-found errors list every strategy tried', async ({ page }) => {
    await page.setContent(HTML);
    await expect(bindLocators(page, Locators).missing.resolve(500)).rejects.toThrow('Element "missing element" not found. Tried: testId=nope');
  });

  test('.locator keeps multi-element matches (no silent .first())', async ({ page }) => {
    await page.setContent(HTML);
    expect(await bindLocators(page, Locators).headers.locator.allInnerTexts()).toEqual(['Name', 'Status']);
  });

  test('factories build parameterised locators', async ({ page }) => {
    await page.setContent(HTML);
    expect(await bindLocators(page, Locators).rowFor('Bob').text()).toContain('late');
  });
});
