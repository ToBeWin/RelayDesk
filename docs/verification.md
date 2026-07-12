# Verification

RelayDesk has a deterministic mock-runtime test path for normal development and opt-in checks for local infrastructure.

```bash
pnpm verify:fresh-install
pnpm verify:backup-restore
pnpm verify:docker
pnpm verify:release
```

`verify:fresh-install` creates an isolated SQLite database and confirms that the public core only creates chat, agent, asset, reminder and settings tables. It explicitly rejects retired content and scheduling tables.

`verify:backup-restore` creates a temporary database and upload, backs them up, restores them into a separate directory, and verifies both records and files.

`verify:docker` validates the Compose configuration. Docker is optional locally: when the command is unavailable the check reports a skip. Set `RELAYDESK_REQUIRE_DOCKER=1` in CI or release automation to make Docker availability mandatory.

## Optional real Hermes validation

The regular test suite never needs a running Hermes instance. To validate a real, supported Hermes API Server before release, opt in explicitly:

```bash
export RELAYDESK_HERMES_BASE_URL=http://127.0.0.1:8642
export RELAYDESK_HERMES_API_KEY='...'
pnpm test:hermes
```

The check only performs a health request. It never prints the API key or sends a chat message.
