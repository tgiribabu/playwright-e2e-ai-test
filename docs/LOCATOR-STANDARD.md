# Locator management standard

**Rule of one place:** a selector exists in exactly one file: the `*.locators.ts` next to the page object or
component that uses it. Tests never contain selectors. Enforced by `npm run lint:locators` (CI + `npm run verify`).

## Where locators live
| Element belongs to | Locator file | Bound in |
|---|---|---|
| One page | `src/ui/pages/<app>/<page>.locators.ts` | `<page>.page.ts` → `bindLocators(page, XLocators)` |
| A region of a page (dialog, panel) | second export in the page's locator file (e.g. `NewAppointmentFormLocators`) | page → `bindLocators(regionRoot, …)` |
| A reusable widget | `src/ui/components/<widget>/<widget>.locators.ts` | component → `bindLocators(root, …)` |

## File template
```ts
import type { LocatorMap } from '../../../core/locators';   // type-only import: locator files are data

export const LoginLocators = {
  // key: { primary strategy, description, fallbacks? }
  username: { by: 'label', value: 'Username', exact: true, description: 'username input',
              fallbacks: [{ by: 'css', value: '#username' }] },
  submit:   { by: 'role', role: 'button', name: 'Log in', description: 'login button',
              fallbacks: [{ by: 'testId', value: 'login-submit' }] },
  // parameterised: an arrow function returning a LocatorDef
  rowFor:   (ref: string) => ({ by: 'role', role: 'row', hasText: ref, description: `row ${ref}` }),
} as const satisfies LocatorMap;    // compile-time check of every strategy
```

### Naming
- Export name: `<PascalName>Locators`. Keys: camelCase nouns for what the element **is** (`submit`, `patientMrn`),
  not how it is found (`btnId3`).
- `description` is human-readable; it appears in errors and the self-heal report.

### Strategy order (primary = first that works)
1. `role` (+ `name`): what users and screen readers perceive
2. `label` / `placeholder`: form fields
3. `text` / `title`
4. `testId`: when the team agrees on `data-testid` contracts (use as primary only if it is a real contract)
5. `css`: last resort, preferably as a **fallback**; no positional (`:nth-child`) or deep chains
- **XPath is not supported** (brittle, no shadow DOM).
- Use `nth` only when several matches are expected and position is meaningful.

## Consuming locators
```ts
// Page object
export class LoginPage {
  readonly el;                                   // bound SmartLocators (self-healing)
  constructor(private readonly page: Page) { this.el = bindLocators(page, LoginLocators); }
  async login(u: string, p: string) {             // business action, not raw clicks
    await this.el.username.fill(u);
    await this.el.password.fill(p);
    await this.el.submit.click();
  }
}

// Component: receives its ROOT from the page, binds its own locators
this.table = new DataTable(this.el.table.locator);

// Test: uses methods; asserts on elements only through the page object's `el`
await loginPage.login(user, pass);
await expect(loginPage.el.error.locator).toContainText('Invalid');   // allowed
await page.getByRole('button', { name: 'Log in' }).click();          // NOT allowed (lint fails)
```

### `SmartLocator` API
| Member | Use |
|---|---|
| `.click() .fill() .check() .press() .selectOption() .text() .value()` | actions: resolve with healing, one re-resolve if the DOM re-renders |
| `.locator` | all strategies OR-ed, for `expect(...)` and multi-element reads (`allInnerTexts`, `count`) |
| `.primary` | primary strategy only (diagnostics) |
| `.resolve(timeout)` | explicit resolution, returns a Playwright `Locator` |

## Self-healing rules
- Fallbacks are for **known variance** (old/new markup, A/B variants, ids that differ per tenant), not guesses.
- A heal is a warning: `test-results/self-heal-report.json` lists the element, the failed primary and the strategy that
  healed. Promote that strategy to primary in the locator file.
- Release pipelines run with `HEALING_MODE=strict`, so un-promoted heals fail the build.

## Lint rules (`scripts/lint-locators.mjs`)
`no-selectors-in-tests`, `no-locator-imports-in-tests`, `no-inline-selectors-in-pages`, `locator-file-shape`,
`locator-file-pure-data`, `no-xpath`, `no-brittle-css`, `no-fixed-waits`, `specs-use-framework-test`, `no-focused-tests`.
Exception (reviewed in PR): `// locator-lint-disable-next-line <rule> <reason>` on the line above.
