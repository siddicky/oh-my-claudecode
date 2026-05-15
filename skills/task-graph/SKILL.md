---
name: task-graph
description: Task-graph execution mode that fans out isolated short-lived ralph workers, then merges and verifies
argument-hint: "[--workers N] [--dry-run] <approved plan or task>"
pipeline: [deep-interview, ralplan, task-graph, ralph]
handoff: .omc/plans/task-graph-{slug}.md
level: 4
---

# Task-Graph Mode

Task Graph is an execution orchestrator that converts an approved consensus plan into a dependency graph, runs isolated short-lived `ralph` workers per node, then performs merge + verification before reporting completion.

## Use When

- You already have a refined plan from `ralplan` and want structured execution.
- Work can be decomposed into independent or partially independent tasks.
- You want bounded worker scope, explicit merge order, and final verification gates.

## Do Not Use When

- The task is a tiny one-file fix (use `ralph` directly).
- Requirements are still ambiguous (run `deep-interview` first).
- Planning consensus is not done yet (run `ralplan` first).

## Required Inputs

1. Approved plan artifacts (`.omc/plans/prd-*.md` + matching `test-spec-*.md`)
   - "Matching" means the `test-spec` file corresponds to the same PRD slug (and timestamp prefix when present), following the existing planning artifact naming convention.
   - Example: `prd-20260515T012800Z-auth-hardening.md` matches `test-spec-20260515T012800Z-auth-hardening.md`.
2. Explicit execution approval from the user

If approval is missing, stop and keep artifacts marked `pending approval`.

## Execution Contract

1. **Graph generation**
   - Read the latest approved planning artifacts.
   - Build a task DAG with clear node ids, dependencies, acceptance criteria mapping, and expected touched areas.
   - Persist to `.omc/plans/task-graph-{slug}.md`.

2. **Isolated short-lived ralph workers**
   - For each ready node (dependency-satisfied), launch a scoped `ralph` run with only that node’s objective.
   - Keep workers short-lived: one node objective per worker invocation, then stop.
   - Never allow a worker to broaden scope outside its node definition.

3. **Merge orchestration**
   - Merge completed node outputs in dependency/topological order.
   - Resolve conflicts without dropping already-satisfied acceptance criteria.
   - Re-run affected node checks after conflict resolution.

4. **Verification gate**
   - Run lint, build, and tests for the merged result.
   - Run reviewer/security validation as required by repo policy.
   - Only report complete when all verification gates pass.

## Output

- `task-graph` artifact with node status and execution summary
- merged code result
- verification evidence (commands + outcomes)

## Handoff

When invoked from `ralplan`, treat the approved consensus plan as the source of truth and execute this sequence:

`task-graph generation → isolated short-lived ralph workers → merge + verification`

Task: {{ARGUMENTS}}
