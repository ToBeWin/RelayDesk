# Open-Source Release Checklist

## Product

- [x] Confirm the public core contains only chat, agent, attachment, reminder and administration workflows.
- [ ] Confirm all system-owned pages and statuses have English and Simplified Chinese copy.
- [ ] Record the supported Hermes Agent API Server version in the release notes.

## Security

- [x] Select and add a license.
- [x] Verify `.env`, `data/`, uploads, artifacts, databases and credentials are ignored.
- [ ] Rotate any development secrets that were ever used outside the local machine.
- [ ] Review `SECURITY.md` and publish a maintainer contact.

## Verification

- [x] `pnpm verify:release`
- [x] `pnpm verify:fresh-install`
- [x] `pnpm verify:backup-restore`
- [x] `pnpm verify:docker`
- [ ] `RELAYDESK_RUN_DOCKER_TEST=1 pnpm verify:docker` (builds, starts, and health-checks a clean container)

## GitHub

- [ ] Initialize the repository and create a public remote.
- [ ] Add topics: `hermes-agent`, `web-ui`, `self-hosted`, `ai-agent`.
- [ ] Publish a release with upgrade notes and supported Hermes versions.
