/** Types for the locator standard: LocatorStrategy, LocatorDef, LocatorMap. */
import type { Page } from '@playwright/test';

/** Accessible roles accepted by page.getByRole(). */
export type AriaRole = Parameters<Page['getByRole']>[0];
type TextMatch = string | RegExp;

/**
 * One way to find an element. Ordered by preference in the LOCATOR STANDARD:
 * role > label > placeholder > text/title > testId > css. XPath is not supported (by design).
 */
export type LocatorStrategy =
  | { by: 'role'; role: AriaRole; name?: TextMatch; exact?: boolean }
  | { by: 'label'; value: TextMatch; exact?: boolean }
  | { by: 'placeholder'; value: TextMatch; exact?: boolean }
  | { by: 'text'; value: TextMatch; exact?: boolean }
  | { by: 'title'; value: TextMatch; exact?: boolean }
  | { by: 'testId'; value: string }
  | { by: 'css'; value: string };

/**
 * A locator definition: pure data stored in a `*.locators.ts` file.
 * `fallbacks` are tried in order when the primary strategy finds nothing (self-healing).
 */
export type LocatorDef = LocatorStrategy & {
  /** Human-readable name, used in logs, heal reports and error messages. */
  description: string;
  fallbacks?: readonly LocatorStrategy[];
  /** Narrow the match, e.g. a row containing some text. */
  hasText?: TextMatch;
  /** Pick one match when several are expected. */
  nth?: number | 'first' | 'last';
};

/** Parameterised locator, e.g. `row: (ref: string) => ({ ... })`. */
export type LocatorFactory = (...args: never[]) => LocatorDef;

/** The shape every `*.locators.ts` export must satisfy (`as const satisfies LocatorMap`). */
export type LocatorMap = Record<string, LocatorDef | LocatorFactory>;
