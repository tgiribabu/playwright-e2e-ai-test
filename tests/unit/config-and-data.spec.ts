/** Self-tests: config/secrets, Excel source, locator linter. */
import { test, expect } from '@playwright/test';
import * as path from 'path';
import ExcelJS from 'exceljs';
import { secretCandidates, resolveSecret } from '../../src/config/secrets';
import { buildConfig, readEnvFile, availableEnvironments } from '../../src/config/ConfigManager';
import { readExcel } from '../../src/data/sources/excel.source';

test.describe('Config @unit', () => {
  test('secret lookup order: env+tenant → env → global', () => {
    expect(secretCandidates('DB_PASSWORD', 'qa', 'acme')).toEqual(['QA_ACME_DB_PASSWORD', 'QA_DB_PASSWORD', 'DB_PASSWORD']);
    expect(resolveSecret('X', 'qa', 'acme', { QA_X: 'env', X: 'global' })).toBe('env');
    expect(resolveSecret('X', 'qa', 'acme', { QA_ACME_X: 'tenant', QA_X: 'env' })).toBe('tenant');
  });

  test('a missing secret names every key it tried', () => {
    expect(() => resolveSecret('NOPE', 'stage', 'globex', {})).toThrow('Set one of: STAGE_GLOBEX_NOPE, STAGE_NOPE, NOPE');
  });

  test('every environment file is valid against the schema', () => {
    for (const env of availableEnvironments()) expect(() => readEnvFile(env), env).not.toThrow();
  });

  test('unknown environment lists the available ones', () => {
    expect(() => readEnvFile('uat')).toThrow(/Unknown TEST_ENV "uat"\. Available: .*qa/);
  });

  test('tenant overrides are deep-merged and secrets are masked in the summary', () => {
    const vars = { QA_APP_USERNAME: 'u', QA_APP_PASSWORD: 'p-secret', QA_DB_PASSWORD: 'db-secret', QA_SF_CLIENT_ID: 'cid' };
    Object.assign(process.env, vars);
    try {
      const cfg = buildConfig('qa', 'globex');
      expect(cfg.ui.baseUrl).toBe('https://globex.qa.app.example.com');   // tenant override
      expect(cfg.api?.baseUrl).toBe('https://qa.api.example.com');        // inherited
      expect(JSON.stringify(cfg.safeSummary())).not.toMatch(/p-secret|db-secret/);
    } finally {
      for (const k of Object.keys(vars)) delete process.env[k];
    }
  });
});

test.describe('Excel source @unit', () => {
  test('ignores blank header columns and blank rows (the old employees.xlsx problem)', async ({}, info) => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('S');
    ws.getRow(1).values = ['TC_ID', 'Name', null as never, null as never, 'Extra'];
    ws.getRow(2).values = ['T-1', 'Ann', null as never, null as never, 'x'];
    ws.getRow(4).values = ['T-2', 'Bob'];
    const file = info.outputPath('s.xlsx');
    await wb.xlsx.writeFile(file);
    expect(await readExcel(file)).toEqual([{ TC_ID: 'T-1', Name: 'Ann', Extra: 'x' }, { TC_ID: 'T-2', Name: 'Bob', Extra: null }]);
  });

  test('sample case workbook is readable', async () => {
    const rows = await readExcel(path.resolve(__dirname, '../../data/excel/appointment-cases.xlsx'));
    expect(rows.map((r) => r.TC_ID)).toContain('TC-APPT-001');
  });
});

test.describe('Locator standard linter @unit', () => {
  test('repository follows the standard', () => {
    const r = require('child_process').spawnSync('node', ['scripts/lint-locators.mjs'], { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
  });
});

test.describe('AI layer @unit', () => {
  const root = path.resolve(__dirname, '../..');
  const run = (script: string, args: string[]) => require('child_process').spawnSync('node', [script, ...args], { cwd: root, encoding: 'utf8' });

  test('generated AI tool files are in sync with ai/ and within token budgets', () => {
    const r = run('scripts/ai/sync.mjs', ['--check']);
    expect(r.status, r.stderr).toBe(0);
  });

  test('context pack routes the task and respects the token budget', () => {
    const r = run('scripts/ai/context-pack.mjs', ['add a page object for the patient search page', '--budget', '3000', '--stdout']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('## Playbook: add-page-object');
    expect(r.stdout).toContain('## Rules: ui-layer');
    expect(Math.ceil(r.stdout.length / 4)).toBeLessThanOrEqual(3100); // budget + header
  });
});
