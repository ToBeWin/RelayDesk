# Contributing to RelayDesk

Thanks for contributing to RelayDesk.

## Development

1. Copy `.env.example` to `.env` and keep all secrets local.
2. Install dependencies with `pnpm install`.
3. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` before opening a pull request.

## Scope

Keep the core useful for general Hermes Agent users. Content operations belong
to the optional Content Workspace and must not become a requirement for chat,
files, tasks, Agent access, or deployment.

Do not add model-provider calls to RelayDesk. Runtime integrations must remain
behind `src/runtime/` connectors.

## Pull Requests

Explain the user-facing change, include tests for behavior changes, and avoid
committing `.env`, databases, uploads, artifacts, or credentials.
