# OAK Living Plot agent roles

These instructions apply to the entire repository.

## Model assignment
- The main project orchestrator is `gpt-5.6-sol` with `xhigh` reasoning.
- By default, Sol also implements the active stage directly.
- When the user explicitly requests a worker handoff, use `gpt-5.6-luna` with `high` reasoning for bounded implementation work unless the user names another model.
- Never silently substitute a requested worker model when it is unavailable.

## Authority boundary
- Sol owns project-state recovery, goal and scope decisions, architecture judgment, live plans, implementation by default, diff review, final verification, external actions, commits, pushes, and STOP GATE decisions.
- When a worker is explicitly enabled, the worker implements exactly one bounded stage or repair task from a Sol brief and returns evidence; the worker does not choose the roadmap or close the gate.
- Only Sol reconciles implementation output with product and architecture source-of-truth documents.

## Stage workflow
1. Sol reads the current repository, working tree, active plan, and relevant product/architecture documents before choosing or continuing a stage.
2. Sol locks scope, acceptance criteria, files, verification commands, and external-action boundaries in the live Aki task plan.
3. Sol implements directly unless the user explicitly requests a worker handoff.
4. If a worker is requested, Sol passes exact paths, constraints, dirty-tree state, and return format; the worker does not commit, push, deploy, or close the plan unless the user explicitly grants that authority.
5. Sol reviews the complete diff and verification evidence, resolves architecture/product judgments, and performs any user-authorized commit, push, CI monitoring, deployment, and external verification.
6. Sol alone declares the STOP GATE result unless the user explicitly changes this authority model.

## Concurrency and handoff
- Use at most one write-capable implementation agent at a time so agents never edit the same worktree concurrently.
- A worker inherits no assumed context; every brief must explicitly name `AGENTS.md`, `CLAUDE.md`, applicable Aki rule files, source files, plan, acceptance criteria, and verification expectations.
- Worker output must begin with a rule receipt and then state files changed, checks run with results, unresolved risks, and decisions needed from Sol.
- Sol must inspect source and git state after every worker handoff; a worker summary alone is never completion evidence.
