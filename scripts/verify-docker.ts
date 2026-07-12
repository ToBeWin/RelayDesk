import { spawnSync } from "node:child_process";

const compose = process.env.RELAYDESK_DOCKER_COMPOSE_COMMAND ?? "docker compose";
const [command, ...prefixArgs] = compose.split(" ");
const environment = {
  ...process.env,
  RELAYDESK_PASSWORD: process.env.RELAYDESK_PASSWORD ?? "relaydesk-docker-test-password",
  RELAYDESK_SESSION_SECRET: process.env.RELAYDESK_SESSION_SECRET ?? "relaydesk-docker-test-session-secret-at-least-32-characters",
  RELAYDESK_CREDENTIALS_KEY: process.env.RELAYDESK_CREDENTIALS_KEY ?? "relaydesk-docker-test-credentials-key-at-least-32-characters",
};
const config = spawnSync(command, [...prefixArgs, "config", "--quiet"], {
  cwd: process.cwd(),
  encoding: "utf8",
  env: environment,
});

if (config.error) {
  if (process.env.RELAYDESK_REQUIRE_DOCKER === "1") throw config.error;
  process.stdout.write("Docker is unavailable; skipped optional Docker verification.\n");
  process.exit(0);
}
if (config.status !== 0) throw new Error(config.stderr || "docker compose config failed");
if (process.env.RELAYDESK_RUN_DOCKER_TEST !== "1") {
  process.stdout.write("Docker Compose configuration verification passed. Set RELAYDESK_RUN_DOCKER_TEST=1 to build, start, and health-check the container.\n");
  process.exit(0);
}

async function verifyStartup() {
  const project = `relaydesk-verify-${Date.now()}`;
  const port = process.env.RELAYDESK_DOCKER_TEST_PORT ?? "3180";
  const run = (args: string[]) => spawnSync(command, [...prefixArgs, "-p", project, ...args], { cwd: process.cwd(), encoding: "utf8", env: { ...environment, RELAYDESK_PORT: port } });

  try {
  const started = run(["up", "--build", "--detach"]);
  if (started.status !== 0) throw new Error(started.stderr || "docker compose up failed");
  let healthy = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) { healthy = true; break; }
    } catch {
      // The container may still be booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  if (!healthy) throw new Error("RelayDesk Docker health check did not become ready");
  process.stdout.write("Docker Compose startup and health verification passed.\n");
  } finally {
    run(["down", "--volumes", "--remove-orphans"]);
  }
}

void verifyStartup();
