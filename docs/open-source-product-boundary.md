# RelayDesk Open-Source Product Boundary

RelayDesk is a general-purpose, self-hosted Web Channel for Hermes Agent and
compatible runtimes. The open-source core must remain useful for personal,
engineering, research, operations and team-agent workflows.

## Core

- private conversations, history, search and attachments;
- multi-Agent and multi-host connection management;
- member identity, authorization and conversation isolation;
- streamed Runtime events, tool state, jobs and browser notifications;
- controlled local file storage, backups and health checks.

## Explicitly out of scope

The public core intentionally does not include content accounts, saved-content
records, publishing plans, cover workflows, or a CMS. Teams that need those
product-specific workflows should build them as a separate extension rather
than adding private business tables to the RelayDesk core.

## Internationalization

The public product supports `en` and `zh-CN`. UI copy, errors, status labels,
dates and notifications must move behind locale resources. Runtime output is
never automatically translated.

## Naming

The product and repository name are `RelayDesk`. Public descriptions may use
the subtitle: `RelayDesk — An Open-Source Web UI for Hermes Agent`.
RelayDesk must be described as an independent community project, not an
official Hermes or Nous Research product.
