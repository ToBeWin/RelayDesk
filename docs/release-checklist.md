# Open-Source Release Checklist

## Product

- [x] Confirm the general-purpose core works with Content Workspace disabled.
- [x] Confirm the core login, navigation and chat paths have English and Simplified Chinese copy.
- [ ] Record the supported Hermes Agent API Server version in the release notes.

## Security

- [x] Select and add a license.
- [x] Verify `.env`, `data/`, uploads, artifacts, databases and credentials are ignored.
- [ ] Rotate any development secrets that were ever used outside the local machine.
- [ ] Review `SECURITY.md` and publish a maintainer contact.

## Verification

- [x] `pnpm verify:release`
- [ ] `docker compose build` (requires a running Docker daemon)
- [ ] Start a clean container with a fresh data volume and verify `/api/health`.

## GitHub

- [ ] Initialize the repository and create a public remote.
- [ ] Add topics: `hermes-agent`, `web-ui`, `self-hosted`, `ai-agent`.
- [ ] Publish a release with upgrade notes and supported Hermes versions.
