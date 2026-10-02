/** bindLocators(): turns a *.locators.ts map into SmartLocators for a page or component root. */
import { Locator, Page } from '@playwright/test';
import { LocatorDef, LocatorFactory, LocatorMap } from './locator.types';
import { SmartLocator } from './SmartLocator';

/** Maps a LocatorMap to SmartLocators: plain defs become SmartLocator, factories become (...args) => SmartLocator. */
export type Bound<M extends LocatorMap> = {
  [K in keyof M]: M[K] extends (...args: infer A) => LocatorDef ? (...args: A) => SmartLocator : SmartLocator;
};

/**
 * THE ONLY way page objects and components turn locator data into elements:
 *   readonly el = bindLocators(page, LoginLocators);     // page object
 *   readonly el = bindLocators(root, DataTableLocators); // component, scoped to its root
 */
export function bindLocators<M extends LocatorMap>(scope: Page | Locator, map: M): Bound<M> {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(map)) {
    out[key] = typeof entry === 'function'
      ? (...args: never[]) => new SmartLocator(scope, (entry as LocatorFactory)(...args))
      : new SmartLocator(scope, entry as LocatorDef);
  }
  return out as Bound<M>;
}
