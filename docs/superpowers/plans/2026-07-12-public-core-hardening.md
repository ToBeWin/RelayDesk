# RelayDesk Public Core Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a lean, bilingual, self-hosted Hermes Web UI without the private content-management subsystem.

**Architecture:** The public core owns authentication, member access, agent hosts, Hermes session mirroring, attachments, backups, and configuration. Content accounts, content records, cover generation, and scheduling are removed from the public API, UI, schema, permissions, and tests. UI text is resolved from one client-side bilingual catalog; runtime payload text remains untouched.

**Tech Stack:** Next.js App Router, TypeScript, React, SQLite, Vitest, Playwright, Docker Compose.

## Global Constraints

- Keep Hermes as the owner of LLM, tools, memory, and runtime sessions.
- Do not modify Hermes or require a custom Hermes build.
- Preserve existing RelayDesk chat history, assets, members, agents, and backups during migration.
- Do not track `.env`, SQLite, uploaded files, artifacts, or test data in Git.
- Keep all SQLite and filesystem route handlers on the Node runtime.
- Use MIT licensing and keep the public UI branded RelayDesk.

---

### Task 1: Remove the private content-workspace domain

**Files:**
- Delete: `src/app/(workspace)/accounts/**`, `src/app/(workspace)/contents/**`, `src/app/(workspace)/schedule/**`
- Delete: `src/app/api/accounts/**`, `src/app/api/contents/**`, `src/app/api/schedules/**`
- Delete: `src/modules/contents/**`, `src/modules/schedules/**`, `tests/modules/contents/**`, `tests/modules/schedules/**`
- Modify: `src/modules/conversations/chat-workspace.tsx`, `src/modules/conversations/service.ts`, `src/modules/agents/service.ts`, `src/modules/agents/access.ts`, `src/infrastructure/db/schema.ts`, `src/infrastructure/db/migrations.ts`, `src/app/api/uploads/route.ts`, `src/app/api/conversations/route.ts`, `src/app/api/members/[id]/agents/route.ts`, `tests/e2e/core-workflow.spec.ts`

**Interfaces:**
- Produces a public `AgentPermission` union of `chat | upload | view_history`.
- Produces a conversation model with no `contentAccountId` or `contentAccountName`.
- Keeps old SQLite content tables as ignored legacy data; no public code reads or writes them.

- [ ] Write failing type/API tests asserting a member grant rejects `manage_content`, conversation creation accepts no content account, and public routes do not expose content/account/schedule handlers.
- [ ] Run the focused tests and confirm failure against the current content-aware implementation.
- [ ] Remove public content routes/modules and all caller imports; remove chat UI account selection and save-content flows.
- [ ] Add a non-destructive migration that retains legacy tables while removing new runtime dependencies on them.
- [ ] Run focused tests, full typecheck, and E2E; commit `refactor: remove private content workspace from public core`.

### Task 2: Create a single bilingual UI catalog and enforcement test

**Files:**
- Modify: `src/shared/i18n/messages.ts`, `src/shared/i18n/locale-provider.tsx`, `src/modules/conversations/chat-workspace.tsx`, `src/app/(workspace)/members/page.tsx`, `src/app/(workspace)/settings/page.tsx`, `src/shared/components/toast-provider.tsx`
- Create: `tests/shared/i18n/messages.test.ts`, `tests/e2e/english-ui.spec.ts`

**Interfaces:**
- `t(locale, key, values?)` is the sole source for system copy.
- `formatRuntimeError(locale, code, fallback?)` maps RelayDesk errors without translating Hermes-authored output.

- [ ] Write a failing catalog test for all supported keys in both locales and a Playwright English-mode test that detects Chinese text in system-owned selectors.
- [ ] Run tests and confirm they fail because pages still embed Chinese literals.
- [ ] Move navigation, chat status, dialogs, toasts, members, settings, and API-error mappings into `messages.ts`.
- [ ] Keep model answers, user names, profile names, and runtime tool payloads unmodified.
- [ ] Run full unit and E2E suites; commit `feat: centralize bilingual system copy`.

### Task 3: Make public chat layout a single responsive system

**Files:**
- Modify: `src/app/globals.css`, `src/modules/conversations/chat-workspace.tsx`, `tests/e2e/core-workflow.spec.ts`

**Interfaces:**
- Public chat layout is a two-pane flex container above 1100px and a single-pane canvas at or below 1100px.
- `conversation-rail-collapsed` hides only the rail; it never changes the canvas placement.

- [ ] Add failing Playwright viewport tests for 1100px, 1400px, 2048px, collapse, expand, and refresh persistence.
- [ ] Run the focused E2E test and confirm old grid rules fail at least one viewport assertion.
- [ ] Delete remaining public-core grid overrides and use one scoped Flex layout block.
- [ ] Verify no public layout selector relies on `content-workspace-disabled` after Task 1.
- [ ] Run all browser tests; commit `refactor: simplify responsive public chat layout`.

### Task 4: Add deployment and optional real-runtime verification

**Files:**
- Create: `tests/integration/hermes-real.spec.ts`, `scripts/verify-fresh-install.sh`, `scripts/verify-backup-restore.sh`, `scripts/verify-docker.sh`, `docs/verification.md`
- Modify: `package.json`, `docker-compose.yml`, `.github/workflows/ci.yml`, `README.md`, `README.zh-CN.md`

**Interfaces:**
- `pnpm test:hermes-real` skips unless `RELAYDESK_RUN_REAL_HERMES_TESTS=1` and explicit Hermes test credentials are provided.
- `pnpm verify:fresh-install`, `pnpm verify:docker`, and `pnpm verify:backup` run against disposable directories only.

- [ ] Write scripts that fail when required runtime variables are absent only after opt-in is set; otherwise exit as skipped.
- [ ] Run scripts in skip mode and verify no local data path is modified.
- [ ] Implement disposable Docker startup, health check, backup manifest inspection, and restoration into a fresh data directory.
- [ ] Document exact opt-in variables and expected behavior without printing secrets.
- [ ] Run CI-equivalent verification; commit `test: add deployment and real Hermes verification gates`.

### Task 5: Publish the public-core release

**Files:**
- Modify: `README.md`, `README.zh-CN.md`, `CHANGELOG.md`, `docs/architecture.md`, `docs/deployment.md`

- [ ] Update docs to state the public core scope and migration behavior for legacy content tables.
- [ ] Re-capture bilingual screenshots from the final public UI.
- [ ] Run lint, typecheck, unit tests, E2E, fresh-install, Docker, backup, and optional real-Hermes skip checks.
- [ ] Verify `git ls-files` has no databases, data directories, or `.env` files.
- [ ] Commit `docs: publish hardened public core` and push the verified release.
