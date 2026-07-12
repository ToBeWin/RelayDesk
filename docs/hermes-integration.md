# Hermes Integration

RelayDesk integrates with the official Hermes Agent API Server, not with Hermes
Python internals or a community WebUI implementation. This keeps the runtime
boundary explicit and lets RelayDesk retain its own SQLite history and assets.

## Runtime setup

Start the Hermes Gateway API Server with a key on a trusted internal network:

```bash
API_SERVER_ENABLED=1 \
API_SERVER_KEY='replace-with-a-long-random-key' \
API_SERVER_HOST=0.0.0.0 \
API_SERVER_PORT=8642 \
hermes gateway start
```

Then configure RelayDesk:

```dotenv
RELAYDESK_RUNTIME_TYPE=hermes
RELAYDESK_HERMES_BASE_URL=http://hermes.internal:8642
RELAYDESK_HERMES_API_KEY=replace-with-the-same-key
RELAYDESK_HERMES_TIMEOUT_MS=120000
```

`RELAYDESK_HERMES_API_KEY` is server-only. It is never exposed to the browser,
stored in SQLite, or written to application logs.

## Supported API contract

The connector is implemented in `src/runtime/hermes/connector.ts` against
`NousResearch/hermes-agent` API Server:

| RelayDesk operation | Hermes API Server endpoint |
| --- | --- |
| Health | `GET /health` |
| Capability discovery | `GET /v1/capabilities` |
| Session list/create/read | `GET/POST /api/sessions`, `GET /api/sessions/{id}` |
| Start agent run | `POST /v1/runs` |
| Stream lifecycle events | `GET /v1/runs/{run_id}/events` (SSE) |
| Stop running agent | `POST /v1/runs/{run_id}/stop` |

The connector maps `message.delta`, `tool.started`, `tool.completed`,
`approval.request`, `run.completed`, `run.failed`, and `run.cancelled` into the
RelayDesk `ChannelEvent` model. Every recognized event carries the original
Hermes payload in `raw`, and unknown events remain in the persisted event log.

Current Hermes API Server releases return newly created sessions as
`{ object: "session", session: { id, title, started_at, ... } }`; older
compatible releases may return top-level `id` or `session_id`. `HermesConnector`
accepts all three forms and uses the actual Hermes session ID as the RelayDesk
external session ID. This is important: generating a local fallback ID would
create a RelayDesk conversation that cannot later be synchronized with Hermes.

For private-chat Memory isolation, every RelayDesk run also sends a stable
`X-Hermes-Session-Key` derived from the RelayDesk member and Agent instance.
Hermes defines this header as a long-term-memory scope independent from the
short-lived transcript `session_id`. New RelayDesk conversations therefore get
new transcripts while retaining only the same member's scoped long-term memory.

## Operational checks

Before switching production traffic from `mock` to `hermes`:

1. Verify `curl -H "Authorization: Bearer $API_SERVER_KEY" http://host:8642/v1/capabilities` returns capabilities.
2. Verify RelayDesk Settings reports the Runtime as healthy.
3. Send a small chat turn and check that its final content and run events are stored in RelayDesk SQLite.
4. Stop an in-progress run from RelayDesk once the chat stop control is enabled.

The Hermes API surface is versioned by the installed Hermes Agent release. Pin
and record that release when deploying; capability discovery is used instead of
assuming optional features are available.
