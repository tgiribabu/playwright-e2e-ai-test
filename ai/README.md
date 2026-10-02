# AI layer: one source, every tool

```
AGENTS.md                 hand-written · the rules every tool reads (kept under ~1,600 tokens)
ai/                       hand-written · SINGLE SOURCE for everything else
  manifest.json           which rule packs / playbooks exist, their globs, keywords, examples, token budgets
  rules/*.md              scoped rule packs (loaded only when matching files are touched)
  playbooks/*.md          step-by-step tasks (add page object, write UI/API test, fix failing test, …)
  context/glossary.md     domain + framework terms
  context/repo-map.md     GENERATED: one line per file, from each file's first-line purpose comment
  ignore                  canonical "never read/index" list (secrets, reports, lockfile)
scripts/ai/sync.mjs       generates every tool's native files from the above; --check fails CI on drift
scripts/ai/context-pack.mjs  token-budgeted, task-specific context bundle for any model or chat UI
```

**Never edit generated files.** Change `AGENTS.md` or `ai/`, run `npm run ai:sync`, commit both.
`npm run verify` (and CI) runs `npm run ai:check`, which fails when a generated file was hand-edited or is stale,
when `AGENTS.md`, a rule pack or a playbook exceeds its token budget, or when a source file lacks its purpose line.

## What each tool reads
| Tool | Always loaded | Scoped rules (by path) | Playbooks / commands | Ignore | MCP |
|---|---|---|---|---|---|
| **GitHub Copilot** (VS Code, coding agent) | `.github/copilot-instructions.md` (+ `AGENTS.md`) | `.github/instructions/*.instructions.md` (`applyTo`) | `.github/prompts/*.prompt.md` → `/add-page-object` … · Playwright agents in `.github/agents/` | org content exclusion | `.vscode/mcp.json` |
| **Claude Code** | `CLAUDE.md` → imports `AGENTS.md` | `.claude/rules/*.md` (`paths`) | `.claude/skills/*/SKILL.md` → `/add-page-object` … | `.claude/settings.json` deny rules | `.mcp.json` |
| **Gemini CLI** | `AGENTS.md` + `GEMINI.md` (`.gemini/settings.json` → `context.fileName`) | index in `GEMINI.md` (read on demand) | `.gemini/commands/*.toml` → `/add-page-object` … | `.geminiignore` | add with `gemini mcp add` |
| **Cursor** | `AGENTS.md` | `.cursor/rules/*.mdc` (`globs`) | `@ai/playbooks/<x>.md` in chat | `.cursorignore` | Cursor MCP settings |
| **Continue** (VS Code/JetBrains; local Llama/Qwen via Ollama) | `AGENTS.md` | `.continue/rules/*.md` (`globs`) | `@ai/playbooks/<x>.md` | `.gitignore` | Continue config |
| **Cline** | `.clinerules/00-project.md` (= AGENTS.md) | index in `.clinerules/01-index.md` | `ai/playbooks/` | `.gitignore` | Cline MCP settings |
| **Aider** (any model incl. Ollama) | `.aider.conf.yml` → `read: AGENTS.md, glossary` | `/read ai/rules/<x>.md` | `/read ai/playbooks/<x>.md` | `.aiderignore` | n/a |
| **Any chat UI / local model without repo access** | `npm run ai:context -- "<task>"` → `ai/out/context.md` | picked by task keywords | picked by task keywords | n/a | n/a |
| **Any LLM crawler / doc tool** | `llms.txt` index | | | | |

## Local models (Llama, Qwen, Mistral via Ollama / LM Studio)
- Small context windows are the main constraint (often 8k–32k tokens). That is why `AGENTS.md` is budgeted, rule packs are
  scoped by path, and `ai:context` assembles only what a task needs:
  `npm run ai:context -- "fix the failing appointments test" --budget 6000 --files tests/ui/demo/appointments.spec.ts`
- Use a coding-tuned model (e.g. a Qwen-Coder or Llama code variant) and set the client's context length to at least the pack size.
- Smaller models follow positive, concrete instructions and examples better than long prose; the playbooks are numbered
  steps that point at a reference file for exactly that reason.
- Local models cannot run the repo's checks for you: always run `npm run verify` on their output.

## Why this structure is AI-friendly
1. **Predictable names:** `<name>.page.ts` + `<name>.locators.ts`, `<widget>.component.ts`, `*.api.spec.ts`, `*.db.spec.ts`: a model can find or create the right file from the task wording.
2. **Purpose on line 1 of every file** → `ai/context/repo-map.md`: the whole repo is navigable in a few hundred tokens.
3. **Small files, one concept each;** data (locators, env JSON, test data) separated from behaviour.
4. **Layered context:** always-on rules are tiny; scoped rules load by path; playbooks load per task.
5. **Machine-checkable rules:** typecheck, locator lint, `ai:check`, self-tests. Models verify their own output.
6. **Reference implementations** named in every playbook, so models copy proven patterns instead of inventing new ones.
