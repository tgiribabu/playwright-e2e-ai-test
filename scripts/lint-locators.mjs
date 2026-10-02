#!/usr/bin/env node
// Enforces the LOCATOR STANDARD (docs/LOCATOR-STANDARD.md). Zero dependencies; runs in CI and pre-commit.
//   node scripts/lint-locators.mjs            # whole repo
//   node scripts/lint-locators.mjs <files…>   # specific files
// Escape hatch (needs a reason, reviewed in PR):  // locator-lint-disable-next-line <rule> <reason>
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = process.cwd();
const RULES = [
  {
    id: 'no-selectors-in-tests',
    applies: (p) => /^tests\//.test(p) && !/^tests\/(unit|setup)\//.test(p),
    test: (l) => /\.(getBy[A-Z]\w*|locator)\(/.test(l) || /\bpage\.\$\$?\(/.test(l),
    fix: 'Tests call page-object methods. Put the selector in a *.locators.ts file and expose an action/assertion on the page object.',
  },
  {
    id: 'no-locator-imports-in-tests',
    applies: (p) => /^tests\//.test(p) && !/^tests\/unit\//.test(p),
    test: (l) => /from\s+['"][^'"]*\.locators['"]/.test(l),
    fix: 'Tests must not import locator files; use the page object (assert via pageObject.el.<name>.locator if needed).',
  },
  {
    id: 'no-inline-selectors-in-pages',
    applies: (p) => /^src\/ui\/.*\.(page|component)\.ts$/.test(p),
    test: (l) => /\.(getBy[A-Z]\w*)\(/.test(l) || /\.locator\(\s*['"`]/.test(l) || /\bpage\.\$\$?\(/.test(l),
    fix: 'Pages/components get elements only via bindLocators(scope, XLocators). Add the selector to the matching *.locators.ts.',
  },
  {
    id: 'locator-file-shape',
    applies: (p) => /\.locators\.ts$/.test(p),
    test: (l, ctx) => ctx.lineNo === 1 && !/satisfies LocatorMap/.test(ctx.content),
    fix: 'Export each map as `{ … } as const satisfies LocatorMap` so typos in strategies fail at compile time.',
  },
  {
    id: 'locator-file-pure-data',
    applies: (p) => /\.locators\.ts$/.test(p),
    test: (l) => /^\s*import\s+(?!type\b)[^;]*from\s+['"]@playwright\/test['"]/.test(l) || /\b(page|locator)\.\w+\(/.test(l),
    fix: 'Locator files are data: only `import type` and plain objects/arrow factories, no Playwright calls.',
  },
  {
    id: 'no-xpath',
    applies: (p) => /^(src|tests)\//.test(p) && !/^tests\/unit\//.test(p),
    test: (l) => /['"`]xpath=|['"`]\/\/[a-z*]/.test(l),
    fix: 'XPath is brittle and does not pierce shadow DOM. Use role/label/testId (or css as a last resort).',
  },
  {
    id: 'no-brittle-css',
    applies: (p) => /\.locators\.ts$/.test(p),
    test: (l) => /value:\s*['"`][^'"`]*(:nth-child\(|:nth-of-type\(|(?:\s*>\s*[^'"`]*){3,})/.test(l),
    fix: 'Positional/deeply chained CSS breaks on layout changes. Prefer role/label/testId, or keep it as a fallback only.',
  },
  {
    id: 'no-fixed-waits',
    applies: (p) => /^(src|tests)\//.test(p),
    test: (l) => /\.waitForTimeout\(/.test(l),
    fix: 'Wait for a condition (expect(...).toBeVisible(), expect.poll, db.waitFor, sf.waitFor), never for time.',
  },
  {
    id: 'specs-use-framework-test',
    applies: (p) => /^tests\/(?!unit\/|setup\/).*\.spec\.ts$/.test(p),
    test: (l) => /from\s+['"]@playwright\/test['"]/.test(l),
    fix: "Import { test, expect } from 'src/fixtures' to get config, clients, data, files and page objects.",
  },
  {
    id: 'no-focused-tests',
    applies: (p) => /^tests\//.test(p),
    test: (l) => /\b(test|describe)(\.describe)?\.only\(/.test(l),
    fix: 'Remove .only before committing.',
  },
];

const walk = (d) => !existsSync(d) ? [] : readdirSync(d).flatMap((n) => {
  if (n === 'node_modules' || n.startsWith('.')) return [];
  const f = join(d, n);
  return statSync(f).isDirectory() ? walk(f) : /\.(ts|mts)$/.test(n) ? [f] : [];
});

const args = process.argv.slice(2);
const files = (args.length ? args.map((a) => resolve(root, a)) : ['src', 'tests'].flatMap((d) => walk(join(root, d))));
const findings = [];
for (const file of files) {
  const rel = relative(root, file).replace(/\\/g, '/');
  const content = readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*)/.test(line) && !/locator-lint/.test(line)) return; // comments/docs
    for (const r of RULES) {
      if (!r.applies(rel) || !r.test(line, { content, lineNo: i + 1 })) continue;
      const prev = lines[i - 1] ?? '';
      const m = prev.match(/locator-lint-disable-next-line\s+([\w-]+)\s+\S+/);
      if (m && m[1] === r.id) continue;
      findings.push(`${rel}:${i + 1}  ${r.id}\n    > ${line.trim().slice(0, 140)}\n    fix: ${r.fix}`);
    }
  });
}
if (findings.length) {
  console.error(findings.join('\n') + `\n\nlocator-lint: ${findings.length} problem(s) in ${files.length} file(s)`);
  process.exit(1);
}
console.log(`locator-lint: ${files.length} file(s) follow the locator standard`);
