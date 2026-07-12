# RelayDesk Foundation Design

## Goal

Create the first deployable RelayDesk foundation: a self-hosted Next.js workspace that safely persists local data, exposes a stable runtime boundary, and remains useful while Hermes is unavailable.

## Decisions

- Use one Next.js App Router application running in the Node.js runtime. Route handlers own HTTP concerns and call application modules; pages never access SQLite or a runtime connector directly.
- Use Drizzle with `better-sqlite3` on local disk. Startup applies SQLite safety pragmas; schema changes live in SQL migrations.
- Store media outside SQLite under `data/`, using random names, path containment checks, SHA-256 and temporary-file atomic moves.
- Define `RuntimeConnector` and normalized `ChannelEvent` contracts first. V1 ships a deterministic `MockConnector`; `HermesConnector` is intentionally deferred until its real protocol is available.
- Use signed, HttpOnly session cookies. The initial login route is intentionally small but validates origin and uses constant-time password comparison.
- Mirror the supplied Stage I design system in the application shell: desktop-first with responsive navigation, restrained blue-gray tokens, and Chinese product UI.

## First Milestone Boundaries

Included: project tooling, application shell, configuration validation, database bootstrap/migrations, controlled storage, connector contracts/mock implementation, login/session primitives, health endpoint, Docker deployment files, and unit tests.

Deferred: real Hermes protocol adapter, full conversation persistence workflow, file upload endpoints, content workflows, backups, and all production pages beyond the shell/status surface.

## Acceptance Criteria

- `pnpm dev` starts RelayDesk and renders a responsive shell.
- Invalid environment settings fail safely at startup; secrets are never exposed to the client.
- SQLite runs with WAL, foreign keys, normal synchronous mode and a busy timeout.
- Storage rejects paths outside its controlled root and produces deterministic content hashes.
- The mock runtime streams normalized lifecycle/message events.
- `/api/health` returns application, database, storage and runtime status without requiring Hermes.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` pass.
