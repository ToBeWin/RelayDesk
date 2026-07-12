# RelayDesk Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a runnable RelayDesk foundation with durable local infrastructure and a testable runtime boundary.

**Architecture:** A single Next.js Node Runtime process owns UI, HTTP endpoints, SQLite and file storage. Domain-facing modules depend on internal contracts; `MockConnector` validates the channel before the real Hermes adapter exists.

**Tech Stack:** Next.js App Router, React, TypeScript strict, Tailwind CSS, Drizzle, better-sqlite3, Zod, Vitest, Docker Compose.

## Global Constraints

- Product, package, Docker service and data names use `RelayDesk` / `relaydesk`.
- All SQLite, filesystem and runtime proxy handlers use Node.js runtime.
- Do not call model providers directly; all runtime access goes through `RuntimeConnector`.
- Store file metadata in SQLite and files on local disk only.

---

### Task 1: Engineering Skeleton

**Files:** package/tool configuration, Tailwind tokens, root layout, responsive workspace shell.

- [ ] Add strict TypeScript, lint, test and build commands.
- [ ] Add design tokens extracted from `stitch_relaydesk/relaydesk_design_system/DESIGN.md`.
- [ ] Render a responsive Chinese RelayDesk workspace shell.

### Task 2: Configuration and Durable Infrastructure

**Files:** `src/infrastructure/config`, `src/infrastructure/db`, `src/infrastructure/storage`, Drizzle schema/migration.

- [ ] Write failing tests for configuration validation, database bootstrap and path containment.
- [ ] Implement environment validation, SQLite pragmas, schema and safe storage helpers.
- [ ] Verify tests pass.

### Task 3: Runtime and HTTP Foundation

**Files:** runtime contracts/registry/mock, authentication helpers, health route.

- [ ] Write failing tests for mock runtime event ordering and constant-time login verification.
- [ ] Implement contracts, deterministic mock stream, session primitives and health endpoint.
- [ ] Verify unit tests and production build.

### Task 4: Operations and Documentation

**Files:** Docker assets, environment example and architecture/deployment documentation.

- [ ] Add non-root Docker image, Compose service and persistent data volume.
- [ ] Document local startup and the deferred Hermes integration boundary.
- [ ] Run lint, typecheck, test and build.
