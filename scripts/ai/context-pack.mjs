#!/usr/bin/env node
// Builds a token-budgeted, task-specific context pack for ANY model or chat UI (local Llama/Qwen via Ollama, Gemini, ChatGPT, Claude.ai…).
//   npm run ai:context -- "add a page object for the patient search page"
//   npm run ai:context -- "fix failing appointments test" --budget 6000 --files tests/ui/demo/appointments.spec.ts
//   options: --budget <tokens> (default 8000) · --files a,b · --diff (include git diff) · --stdout
// Writes ai/out/context.md (git-ignored). Sections are added by priority until the budget is reached.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const task = args.filter((a, i) => !a.startsWith('--') && !['--budget', '--files'].includes(args[i - 1])).join(' ').trim();
if (!task) { console.error('Usage: npm run ai:context -- "<task description>" [--budget 8000] [--files a,b] [--diff] [--stdout]'); process.exit(1); }
const budget = Number(opt('budget', 8000));
const extraFiles = (opt('files', '') || '').split(',').filter(Boolean);
const tokens = (s) => Math.ceil(s.length / 4);
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const manifest = JSON.parse(read('ai/manifest.json'));
const t = task.toLowerCase();
const score = (keywords) => keywords.reduce((n, k) => n + (t.includes(k) ? k.split(' ').length : 0), 0);

const playbook = manifest.playbooks.map((p) => ({ p, s: score(p.keywords) })).sort((a, b) => b.s - a.s)[0];
const rules = manifest.rules.filter((r) => score(r.keywords) > 0 || extraFiles.some((f) => r.globs.some((g) => f.startsWith(g.replace(/\*.*$/, '')))));

// Priority order: earlier sections survive tight budgets.
const sections = [
  { title: 'Task', body: `${task}\n\nAnswer with complete file contents or unified diffs. Follow the rules below exactly. Run nothing that is not listed under Commands; say what the user should run.` },
  { title: 'Project rules (AGENTS.md)', body: read('AGENTS.md') },
  ...(playbook.s > 0 ? [{ title: `Playbook: ${playbook.p.id}`, body: read(`ai/playbooks/${playbook.p.id}.md`) }] : []),
  ...rules.map((r) => ({ title: `Rules: ${r.id}`, body: read(r.file) })),
  ...extraFiles.filter((f) => existsSync(join(ROOT, f))).map((f) => ({ title: `File: ${f}`, body: '```ts\n' + read(f) + '\n```' })),
  ...(args.includes('--diff') ? [{ title: 'Current git diff', body: '```diff\n' + execSync('git diff', { cwd: ROOT }).toString() + '\n```' }] : []),
  ...(playbook.s > 0 ? playbook.p.examples : []).filter((f) => !extraFiles.includes(f)).map((f) => ({ title: `Reference example: ${f}`, body: '```' + (f.endsWith('.json') ? 'json' : 'ts') + '\n' + read(f) + '\n```' })),
  { title: 'Glossary', body: read('ai/context/glossary.md') },
  { title: 'Repository map', body: read('ai/context/repo-map.md'), truncatable: true },
];

let used = 0;
const included = [];
const dropped = [];
for (const s of sections) {
  const text = `\n## ${s.title}\n\n${s.body.trim()}\n`;
  if (used + tokens(text) <= budget) { included.push(text); used += tokens(text); continue; }
  if (s.truncatable && budget - used > 300) {
    const keep = (budget - used - 50) * 4;
    included.push(`${text.slice(0, keep)}\n…(truncated to fit the token budget)\n`);
    used = budget;
    continue;
  }
  dropped.push(s.title);
}

const header = `# Context pack\n<!-- ~${used} tokens of ${budget}. Playbook: ${playbook.s > 0 ? playbook.p.id : 'none matched'}. Rules: ${rules.map((r) => r.id).join(', ') || 'none'}. Dropped: ${dropped.join(', ') || 'nothing'}. -->\n`;
const pack = header + included.join('');
if (args.includes('--stdout')) process.stdout.write(pack);
else {
  mkdirSync(join(ROOT, 'ai/out'), { recursive: true });
  writeFileSync(join(ROOT, 'ai/out/context.md'), pack);
  console.log(`ai/out/context.md: ~${used}/${budget} tokens · playbook: ${playbook.s > 0 ? playbook.p.id : 'none'} · rules: ${rules.map((r) => r.id).join(', ') || 'none'}${dropped.length ? ` · dropped: ${dropped.join(', ')}` : ''}`);
}
