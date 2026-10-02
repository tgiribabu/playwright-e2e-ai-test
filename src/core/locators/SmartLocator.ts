/** Self-healing locator: primary strategy, ordered fallbacks, heal reporting, stale-DOM retry. */
import { Locator, Page, test } from '@playwright/test';
import { LocatorDef, LocatorStrategy } from './locator.types';
import { createLogger } from '../logger';

const log = createLogger('SmartLocator');

/**
 * HEALING_MODE
 *   report (default): use a working fallback, record a "self-heal" annotation, keep going
 *   strict          : fail and name the fallback that worked (use in release pipelines)
 *   off             : primary strategy only
 */
export type HealingMode = 'report' | 'strict' | 'off';
const mode = (): HealingMode => (process.env.HEALING_MODE as HealingMode) || 'report';

export interface HealEvent { element: string; primary: string; healedWith: string; mode: HealingMode }

/** Converts one strategy into a Playwright Locator inside `scope` (a Page or a component root Locator). */
export function toLocator(scope: Page | Locator, s: LocatorStrategy): Locator {
  switch (s.by) {
    case 'role': return scope.getByRole(s.role, { name: s.name, exact: s.exact });
    case 'label': return scope.getByLabel(s.value, { exact: s.exact });
    case 'placeholder': return scope.getByPlaceholder(s.value, { exact: s.exact });
    case 'text': return scope.getByText(s.value, { exact: s.exact });
    case 'title': return scope.getByTitle(s.value, { exact: s.exact });
    case 'testId': return scope.getByTestId(s.value);
    case 'css': return scope.locator(s.value);
  }
}

export function describeStrategy(s: LocatorStrategy): string {
  switch (s.by) {
    case 'role': return `role=${s.role}${s.name ? `[name=${String(s.name)}]` : ''}`;
    case 'testId': return `testId=${s.value}`;
    case 'css': return `css=${s.value}`;
    default: return `${s.by}=${String(s.value)}`;
  }
}

/** Patterns that mean "the element moved or re-rendered, try again" (stale-element style failures). */
const RETRYABLE = /element is not attached|detached from the DOM|element is not stable|intercepts pointer events|Element is outside of the viewport/i;

/**
 * Self-healing, retrying wrapper around a LocatorDef.
 * - `locator`  → web-first assertions: `await expect(page.el.title.locator).toBeVisible()`
 * - actions    → resolve the element (primary, then fallbacks), act, re-resolve once if the DOM re-rendered
 */
export class SmartLocator {
  private healedIndex: number | undefined;

  constructor(private readonly scope: Page | Locator, readonly def: LocatorDef, readonly key = def.description) {}

  private refine(l: Locator): Locator {
    let out = this.def.hasText !== undefined ? l.filter({ hasText: this.def.hasText }) : l;
    if (this.def.nth === 'first') out = out.first();
    else if (this.def.nth === 'last') out = out.last();
    else if (typeof this.def.nth === 'number') out = out.nth(this.def.nth);
    return out;
  }

  private get strategies(): LocatorStrategy[] {
    return [this.def, ...(mode() === 'off' ? [] : this.def.fallbacks ?? [])];
  }

  /** Primary strategy only. */
  get primary(): Locator { return this.refine(toLocator(this.scope, this.def)); }

  /**
   * All strategies OR-ed, for web-first assertions and multi-element reads (allInnerTexts, count).
   * No implicit .first(): a def that should match ONE element says so with `nth`, so strict-mode
   * violations (ambiguous selectors) stay visible instead of being silently narrowed.
   */
  get locator(): Locator {
    if (this.healedIndex !== undefined) return this.refine(toLocator(this.scope, this.strategies[this.healedIndex]!));
    return this.strategies.slice(1).reduce((acc, s) => acc.or(this.refine(toLocator(this.scope, s))), this.primary);
  }

  /**
   * Finds the element: gives the primary strategy a fair wait, then tries each fallback.
   * Every heal is recorded on the running test so selector drift is visible in reports.
   */
  async resolve(timeoutMs = 15_000): Promise<Locator> {
    const all = this.strategies;
    const primaryWait = all.length > 1 ? Math.min(5_000, timeoutMs) : timeoutMs;
    try {
      await this.primary.first().waitFor({ state: 'visible', timeout: primaryWait });
      return this.primary;
    } catch (err) {
      if (all.length === 1) throw this.notFound(err);
    }
    const deadline = Date.now() + Math.max(timeoutMs - primaryWait, 2_000);
    while (Date.now() < deadline) {
      for (let i = 1; i < all.length; i++) {
        const candidate = this.refine(toLocator(this.scope, all[i]!));
        if (await candidate.first().isVisible().catch(() => false)) return this.onHeal(i, candidate);
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw this.notFound();
  }

  // ---------------- actions (each with one stale-DOM retry) ----------------
  async click(opts?: Parameters<Locator['click']>[0]): Promise<void> { await this.act((l) => l.click(opts)); }
  async fill(value: string): Promise<void> { await this.act((l) => l.fill(value)); }
  async check(): Promise<void> { await this.act((l) => l.check()); }
  async press(key: string): Promise<void> { await this.act((l) => l.press(key)); }
  async selectOption(value: string | { label: string }): Promise<void> { await this.act((l) => l.selectOption(value).then(() => undefined)); }
  async text(): Promise<string> { return (await this.act((l) => l.innerText())).trim(); }
  async value(): Promise<string> { return this.act((l) => l.inputValue()); }
  async isVisible(): Promise<boolean> { return this.locator.isVisible(); }

  private async act<T>(fn: (l: Locator) => Promise<T>): Promise<T> {
    const target = await this.resolve();
    try {
      return await fn(target);
    } catch (err) {
      if (!RETRYABLE.test(String(err))) throw err;
      log.warn(`"${this.key}" re-rendered during action, re-resolving once`);
      return fn(await this.resolve());
    }
  }

  private onHeal(index: number, candidate: Locator): Locator {
    const event: HealEvent = {
      element: this.key,
      primary: describeStrategy(this.def),
      healedWith: describeStrategy(this.strategies[index]!),
      mode: mode(),
    };
    try { test.info().annotations.push({ type: 'self-heal', description: JSON.stringify(event) }); } catch { /* outside a test */ }
    if (event.mode === 'strict') {
      throw new Error(`[self-heal:strict] "${this.key}": primary (${event.primary}) failed, fallback (${event.healedWith}) matched. Update the .locators.ts file.`);
    }
    log.warn(`Healed "${this.key}": ${event.primary} → ${event.healedWith}`);
    this.healedIndex = index;
    return candidate;
  }

  private notFound(cause?: unknown): Error {
    const tried = this.strategies.map(describeStrategy).join(' | ');
    return new Error(`Element "${this.key}" not found. Tried: ${tried}${cause ? `\nLast error: ${String(cause).split('\n')[0]}` : ''}`);
  }
}
