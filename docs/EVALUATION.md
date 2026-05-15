# OMC Evaluation Report

<!-- Version evaluated: 4.13.7 | Date: 2026-05-15 -->

## Executive Summary

oh-my-claudecode (OMC) v4.13.7 is a mature multi-agent orchestration layer for Claude Code. It ships 19 specialized agents, 44 skills, 24 hook handlers, an MCP server with LSP+AST tooling, and four autonomous execution modes. The architecture demonstrates clear role separation and solid fundamentals: typed state I/O, file locking, atomic writes, Zod schema validation on the critical project-memory path, and a CI pipeline with version-consistency gates.

The primary technical risks are concentrated in five oversized hook handler scripts (`scripts/*.mjs`), which together account for 5,831 lines of the highest-blast-radius code in the system and have no dedicated unit tests. A secondary cluster of risks involves metadata drift (`plugin.json` lists 12 of 44 skills; three `CLAUDE.md` files diverge on version and contribution rules), an undocumented env-var surface (15 `OMC_*` variables defined ad-hoc), and tight hook timeouts (3–10 s) on handlers that may perform file I/O on slow filesystems.

The roadmap below groups fixes into three priority bands. P1 items directly threaten correctness or data integrity. P2 items accumulate technical debt and increase incident surface. P3 items improve developer and contributor experience.

---

## Architecture Overview

```
Claude Code runtime
    │
    ├── hooks/hooks.json          # 24 event→handler registrations
    │       │
    │       └── scripts/*.mjs     # Hook handlers (Node.js ESM, no types)
    │               └── scripts/lib/  # Shared: atomic-write, read-json, stdin, config-dir, state-root
    │
    ├── src/                      # TypeScript bridge layer (tsc + vitest)
    │   ├── hooks/bridge.ts       # 3,258-line central dispatch
    │   ├── hooks/<feature>/      # Per-feature hook modules
    │   ├── config/models.ts      # Model tier/family defaults
    │   ├── lib/                  # file-lock, atomic-write, mode-state-io, …
    │   └── __tests__/            # 218 test files (vitest, node env)
    │
    ├── agents/*.md               # 19 agent prompts (XML-structured Markdown)
    ├── skills/*/SKILL.md         # 44 skill definitions
    └── .claude-plugin/           # Marketplace distribution manifest
        ├── plugin.json           # 12 "official" skills listed
        └── marketplace.json
```

**Persistence layer** (four mechanisms, lowest to highest durability):
| Store | Format | Lock? | Validate? |
|---|---|---|---|
| `.omc/state/` mode files | JSON (via `mode-state-io.ts`) | No | Partial |
| `.omc/notepad.md` | Markdown | No | None |
| `.omc/project-memory.json` | JSON | Yes (`withFileLock`) | Zod `safeParse` |
| SQLite (`job-state-db.ts`) | SQLite via `better-sqlite3` | POSIX WAL | Schema enforced |

---

## Strengths

**Clean agent role separation.** 19 agents carry narrow mandates enforced at prompt level. Read-only tool restrictions are consistently applied to the seven analysis/review agents (`architect`, `analyst`, `code-reviewer`, `critic`, `security-reviewer`, `document-specialist`, `explore`). One agent (`code-simplifier.md`) is missing `Success_Criteria` — all others follow the full XML schema.

**Typed, atomic state I/O.** `src/lib/mode-state-io.ts` provides typed read/write/clear for mode state. `src/lib/atomic-write.ts` + `scripts/lib/atomic-write.mjs` provide dual-stack (TS and CJS) atomic file writes. `src/lib/file-lock.ts` with `withProjectMemoryLock` (`src/hooks/project-memory/storage.ts:80-85`) prevents concurrent read-modify-write races on project memory.

**Zod validation on project memory.** `storage.ts:33` calls `ProjectMemorySchema.safeParse(raw)` and logs a structured error before returning `null`. This is the correct pattern — corruption degrades gracefully rather than propagating.

**Centralized model routing.** `src/config/models.ts` holds `CLAUDE_FAMILY_DEFAULTS` and `BUILTIN_TIER_MODEL_DEFAULTS`. Tier aliases (`sonnet`/`opus`/`haiku`) resolve at runtime via `resolveInheritedModelFromEnv`. A Claude version bump is a one-line edit per family.

**Mature CI.** `.github/workflows/ci.yml` gates on lint, type-check, `npm test`, npm-pack smoke test, and three-file version consistency (`package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` at CI:88–115). Pre-release drift is caught before publish.

**Shared hook library.** `scripts/lib/` now contains `read-json.mjs`, `atomic-write.mjs`, `stdin.mjs`, `config-dir.mjs`, and `state-root.mjs`. The `readJsonFile` helper and JSONC comment-stripping logic previously duplicated across hook scripts have been consolidated (see recent commits `3c93f31`, `5f5c65b`).

**Commit discipline.** `CLAUDE.md` documents conventional commits with structured trailers (`Constraint`, `Rejected`, `Directive`, `Scope-risk`, `Not-tested`). Git log confirms consistent adherence.

---

## Weaknesses & Risks

### Reliability & State Integrity (High Priority)

**R1 — Hook timeout mismatch with handler complexity.**
`post-tool-verifier.mjs` (1,086 lines) runs on every `PostToolUse` event with a **3-second timeout** (`hooks/hooks.json:93–94`). `persistent-mode.mjs` (1,349 lines) runs on `Stop` with **10 seconds** (`hooks/hooks.json:183`). On network-mounted filesystems or under CPU contention these timeouts are reachable mid-write. Claude Code silently kills the process on timeout; there is no retry and no user-visible error. A partial state write leaves the next session reading stale mode flags.

**R2 — Mode state files have no schema validation.**
`src/lib/mode-state-io.ts` reads JSON from `.omc/state/*.json` but applies only structural coercion, not a Zod schema. A truncated write (from an R1 timeout) produces a file that parses as `{}`, silently resetting all mode flags. The fix pattern already exists in `storage.ts:33` — it has not been applied to `mode-state-io.ts`.

**R3 — Three `CLAUDE.md` files diverge silently.**
`/CLAUDE.md` (116 lines, version ref omitted), `docs/CLAUDE.md` (65 lines, `<!-- OMC:VERSION:4.13.7 -->`), and `.github/CLAUDE.md` (121 lines, `<!-- OMC:VERSION:4.8.2 -->`) carry different version stamps and different rule sets. Specifically, the critical contribution rule — *"Never commit `dist/` or `bridge/`"* — appears only in `.github/CLAUDE.md:114`. A contributor working from `/CLAUDE.md` or `docs/CLAUDE.md` never sees it. No CI step detects drift between these files.

**R4 — `plugin.json` skills array is out of date.**
`.claude-plugin/plugin.json` lists 12 skills; `skills/` contains 39 subdirectories (44 counting nested SKILL.md files). The gap is undocumented: it is unclear which skills are "official" vs. "contrib" and what the distribution contract is. Users who discover unlisted skills may rely on them without knowing they lack plugin-level lifecycle support.

**R5 — No env-var schema or registry.**
15 `OMC_*` environment variables (`OMC_SECURITY`, `OMC_QUIET`, `OMC_DEBUG`, `OMC_AGENT_OUTPUT_ANALYSIS_LIMIT`, `OMC_PREEMPTIVE_COMPACTION_*`, `OMC_SKIP_HOOKS`, `OMC_STATE_DIR`, `OMC_NOTIFY`, `OMC_ROUTING_FORCE_INHERIT`, `OMC_TEAM_WORKER`, `OMC_CONTEXT_GUARD_THRESHOLD`, `OMC_HUD_DISABLE_NPM_FALLBACK`) are defined ad-hoc, scattered across `scripts/*.mjs`. `src/lib/env-vars.ts` exports only one constant (`OMC_PLUGIN_ROOT_ENV`). There is no central schema, no `omc env list` command, and no user-facing documentation. Undocumented kill switches (`OMC_SKIP_HOOKS`) are particularly risky: a stale env from a prior session silently disables hooks.

### Code Quality & Maintainability

**C1 — `src/hooks/bridge.ts` is a 3,258-line monolith.**
This file mixes keyword detection, hook routing, background notification dispatch, skill state management, HUD updates, and mode lifecycle transitions. It is the single highest blast-radius module in the TypeScript layer. Its size makes it effectively untestable as a unit; test files in `src/__tests__/` cover isolated bridge helpers (`bridge-help-question-regex.test.ts`, etc.) but not the main dispatch logic. A bug here affects every hook event.

**C2 — Five hook handlers exceed 1,000 lines each.**

| File | Lines | Hook event | Timeout |
|---|---|---|---|
| `scripts/persistent-mode.mjs` | 1,349 | `Stop` | 10 s |
| `scripts/keyword-detector.mjs` | 1,241 | `UserPromptSubmit` | 5 s |
| `scripts/pre-tool-enforcer.mjs` | 1,097 | `PreToolUse` | 3 s |
| `scripts/post-tool-verifier.mjs` | 1,086 | `PostToolUse` | 3 s |
| `scripts/session-start.mjs` | 1,058 | `SessionStart` | 5 s |

These five files handle the most frequent hook events in the system. Their size makes code review impractical and correlates with missing test coverage (see T1).

**C3 — Execution mode decision matrix absent.**
Four autonomous execution modes — `autopilot`, `ralph`, `ultrawork`, `team` — have overlapping capabilities and share the same `persistent-mode.mjs` continuation enforcer. No documented decision guide explains when to use which. Skill files describe individual modes but do not compare them. Users routinely invoke `ultrawork` when `autopilot` is sufficient (or vice versa), burning unnecessary tokens.

**C4 — 12 translated READMEs with no sync process.**
`README.{de,es,fr,it,ja,ko,pt,ru,tr,vi,zh}.md` (11 files) are generated translations. There is no documented regeneration process, no CI check for staleness, and no generation script visible in the repository root or `scripts/`. When `README.md` changes, translated versions drift silently.

### Testing

**T1 — No unit tests for hook handlers.**
`scripts/*.mjs` (24+ handler files) have zero unit tests. The 218 test files in `src/__tests__/` cover the TypeScript bridge layer only. Hook handlers contain complex business logic (mode continuation, context-guard thresholds, subagent tracking) that is entirely tested manually or not at all. This is the largest coverage gap in the project.

**T2 — `scripts/qa-tests/` not wired into CI.**
`scripts/qa-tests/test-custom-integration.mjs` exists but `.github/workflows/ci.yml` runs only `npm test`. Shell and integration-level QA tests never execute in CI.

**T3 — No coverage thresholds enforced.**
`vitest.config.ts:11–21` configures `v8` coverage with `text/json/html` reporters but sets no `thresholds`. `npm run test:coverage` produces a report but CI does not fail on regression. Coverage can silently erode.

**T4 — Agent prompt integrity unverified.**
19 agent markdown files use an XML schema (`<Agent_Prompt>`, `<Role>`, `<Success_Criteria>`, `<Constraints>`). One file (`agents/code-simplifier.md`) is missing `Success_Criteria`. No linting step validates tag structure, required sections, or model/level frontmatter. Prompt regressions are discovered at runtime.

### Developer Experience

**DX1 — `skills/` vs. `plugin.json` split is undocumented.**
39 skill directories exist; 12 appear in `plugin.json`. The project does not document the promotion criteria from "contrib skill" to "official skill", or what guarantees official skills carry. `CONTRIBUTING.md` covers code contributions but not skill contributions.

**DX2 — `omc env` listing absent.**
With 15+ tunable env vars there is no `omc env list` or reference page. Operators tuning `OMC_PREEMPTIVE_COMPACTION_WARNING_PERCENT` or `OMC_AGENT_OUTPUT_ANALYSIS_LIMIT` must `grep` through `scripts/post-tool-verifier.mjs` to discover them.

---

## Prioritized Improvement Roadmap

| Priority | ID | Theme | Description | Effort | Key file(s) |
|---|---|---|---|---|---|
| P1 | R1 | Reliability | Raise `PostToolUse` hook timeout to ≥10 s; add user-visible stderr on timeout/interrupt for state-writing hooks | S | `hooks/hooks.json:93` |
| P1 | R2 | State integrity | Apply Zod `safeParse` to all mode-state reads in `mode-state-io.ts`; log schema errors and return typed defaults | S | `src/lib/mode-state-io.ts` |
| P1 | R3 | Doc integrity | Consolidate three `CLAUDE.md` files: single source at `CLAUDE.md`, `docs/CLAUDE.md` as symlink or redirect, `.github/CLAUDE.md` auto-generated in CI; add version-sync check | M | `CLAUDE.md`, `docs/CLAUDE.md`, `.github/CLAUDE.md`, `ci.yml` |
| P1 | T1 | Testing | Add unit tests for `persistent-mode.mjs` (mode continuation logic) and `post-tool-verifier.mjs` (context-guard thresholds) using Node.js `--experimental-vm-modules` or a Jest-ESM shim | L | `scripts/persistent-mode.mjs`, `scripts/post-tool-verifier.mjs` |
| P2 | R4 | Metadata | Document the official/contrib skill split; add a CI check that counts `skills/*/SKILL.md` entries and warns when `plugin.json` skills array diverges by more than a defined threshold | S | `.claude-plugin/plugin.json`, `ci.yml` |
| P2 | R5 | Observability | Extract all `OMC_*` env vars into `src/lib/env-vars.ts` with `zod` schema and descriptions; expose as `omc env list` subcommand | M | `src/lib/env-vars.ts`, `src/index.ts` |
| P2 | C1 | Maintainability | Split `src/hooks/bridge.ts` into focused modules: `keyword-router.ts`, `mode-lifecycle.ts`, `hud-dispatch.ts`, `background-notify.ts` | L | `src/hooks/bridge.ts` |
| P2 | C2 | Maintainability | Extract the top three responsibilities of each oversized handler into sub-modules under `src/hooks/<feature>/`; target ≤400 lines per handler entry point | L | `scripts/persistent-mode.mjs`, `scripts/keyword-detector.mjs`, `scripts/pre-tool-enforcer.mjs` |
| P2 | T2 | Testing | Wire `scripts/qa-tests/` into CI as a separate `integration-test` job; gate release on its passage | S | `.github/workflows/ci.yml`, `scripts/qa-tests/` |
| P2 | T3 | Testing | Add coverage thresholds to `vitest.config.ts` (`lines: 70`, `functions: 70`) and fail CI on regression | S | `vitest.config.ts` |
| P3 | C3 | Developer UX | Add a "Which mode?" decision guide to `docs/FEATURES.md` or a new `docs/EXECUTION-MODES.md`; cross-link from each skill SKILL.md | S | `docs/FEATURES.md`, `skills/autopilot/SKILL.md`, `skills/ralph/SKILL.md`, `skills/ultrawork/SKILL.md`, `skills/team/SKILL.md` |
| P3 | C4 | Maintenance | Add a `scripts/generate-translations.mjs` script and a CI staleness check (diff word count or hash) for translated READMEs | M | `README.md`, `README.*.md`, `ci.yml` |
| P3 | T4 | Testing | Add a `scripts/validate-agents.mjs` linter that checks each `agents/*.md` for required XML tags and frontmatter fields; run in CI | S | `agents/*.md`, `ci.yml` |
| P3 | DX2 | Developer UX | Add an `omc env` subcommand that prints all recognized `OMC_*` env vars with type, default, and description | S | `src/lib/env-vars.ts`, `src/index.ts` |

**Effort key:** S = hours to 1 day, M = 2–5 days, L = 1–2 weeks.

---

## Appendix: File Hot-Spots

Files with the highest change risk (size, centrality, or low test coverage):

| File | Lines | Risk factor |
|---|---|---|
| `src/hooks/bridge.ts` | 3,258 | Central dispatch for all hook events; no unit tests for main logic |
| `scripts/persistent-mode.mjs` | 1,349 | Mode continuation on every `Stop`; 10 s timeout; no unit tests |
| `scripts/keyword-detector.mjs` | 1,241 | Keyword→skill routing on every prompt; 5 s timeout; no unit tests |
| `scripts/pre-tool-enforcer.mjs` | 1,097 | Tool allowlist enforcement on every `PreToolUse`; 3 s timeout; no unit tests |
| `scripts/post-tool-verifier.mjs` | 1,086 | Context-guard, HUD update, compaction warnings on every `PostToolUse`; 3 s timeout; no unit tests |
| `scripts/session-start.mjs` | 1,058 | State initialization on `SessionStart`; 5 s timeout; no unit tests |
| `src/config/models.ts` | ~60 | Model ID source of truth; one-line bumps; high blast radius if wrong |
| `hooks/hooks.json` | ~200 | Timeout and routing config for all 24 hook registrations; no schema validation |
| `.claude-plugin/plugin.json` | ~50 | Marketplace distribution manifest; skills list 32 entries behind reality |
| `agents/code-simplifier.md` | — | Only agent missing `Success_Criteria`; prompt quality regression |

**Highest-leverage single change:** applying `withProjectMemoryLock` + Zod validation to `mode-state-io.ts` (R2) eliminates the most common class of silent state corruption with minimal code change, following the pattern already established in `src/hooks/project-memory/storage.ts`.
