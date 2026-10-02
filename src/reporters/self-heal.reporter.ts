/** Reporter: collects self-heal events into test-results/self-heal-report.json. */
import * as fs from 'fs';
import * as path from 'path';
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';

/** Collects every self-heal event into test-results/self-heal-report.json so drifted locators get fixed at the source. */
export default class SelfHealReporter implements Reporter {
  private readonly heals: Array<Record<string, unknown>> = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    if (test.tags.includes('@expected-heal')) return; // self-tests that heal on purpose
    for (const a of result.annotations ?? []) {
      if (a.type !== 'self-heal' || !a.description) continue;
      this.heals.push({ test: test.titlePath().slice(3).join(' › '), project: test.parent.project()?.name, file: path.relative(process.cwd(), test.location.file), ...JSON.parse(a.description) });
    }
  }

  onEnd(): void {
    if (!this.heals.length) return;
    const unique = new Map(this.heals.map((h) => [`${h.element}|${h.healedWith}`, h]));
    fs.mkdirSync('test-results', { recursive: true });
    fs.writeFileSync('test-results/self-heal-report.json', JSON.stringify({ heals: this.heals, uniqueLocators: [...unique.values()] }, null, 2));
    console.log(`\n[self-heal] ${unique.size} locator(s) healed in ${this.heals.length} place(s). Update their .locators.ts primary strategy: test-results/self-heal-report.json`);
  }
}
