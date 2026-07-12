# Roadmap

RelayDesk is published as a self-hosted Web UI for Hermes Agent. This document
separates the supported release surface from planned work so deployers can make
informed decisions.

## Supported in 0.1

- Hermes API Server integration through `HermesConnector`.
- Per-member conversation isolation and Agent access grants.
- Streaming chat, attachments, local asset archiving, message history, search,
  archive, restore, pin and deletion from the RelayDesk list.
- Local profile discovery, multi-host Agent registration and health checks.
- SQLite persistence, controlled file storage, backup, audit logs and Docker
  deployment configuration.
- English and Simplified Chinese for the core login, navigation and chat
  workspace. Runtime output is preserved as returned by Hermes.
- Optional Content Workspace for teams that need content records and schedules.

## Planned, not part of the compatibility promise

- OpenClaw production connector.
- Additional locale coverage for optional content-management and administrator
  screens.
- Broader browser and accessibility test coverage.
- A hosted update channel or SaaS deployment mode.

## Compatibility

RelayDesk only relies on Hermes public API Server endpoints. It never imports
or modifies Hermes internals. Check the supported endpoint notes in
[`hermes-integration.md`](hermes-integration.md) before upgrading Hermes.
