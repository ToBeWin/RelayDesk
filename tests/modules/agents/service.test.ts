import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDatabase } from "@/infrastructure/db/client";
import { createAgentHostService } from "@/modules/agents/host-service";
import { createAgentService } from "@/modules/agents/service";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

describe("Agent fleet and grants", () => {
  it("registers private hosts and rejects public unapproved addresses", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "relaydesk-host-")); directories.push(directory); const { sqlite } = createDatabase(path.join(directory, "relaydesk.db")); const hosts = createAgentHostService(sqlite);
    expect(hosts.create({ name: "内容工作站", address: "192.168.1.20" }, "admin")).toMatchObject({ address: "192.168.1.20", enabled: true });
    expect(() => hosts.create({ name: "公网主机", address: "8.8.8.8" }, "admin")).toThrow("私有内网");
    expect(sqlite.prepare(`SELECT action FROM audit_logs WHERE target_type = 'agent_host'`).get()).toEqual({ action: "agent_host.created" }); sqlite.close();
  });

  it("enforces dedicated assignment and permission-specific access", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "relaydesk-agent-grant-")); directories.push(directory); const { sqlite } = createDatabase(path.join(directory, "relaydesk.db")); const hosts = createAgentHostService(sqlite); const host = hosts.create({ name: "工作站", address: "10.0.0.8" }, "admin"); const agents = createAgentService(sqlite);
    const agent = agents.create({ name: "私有 Agent", baseUrl: "http://10.0.0.8:8643", profileName: "private", hostId: host.id, sharingMode: "dedicated", credentialCiphertext: "encrypted" }, "admin");
    expect(agent.attachmentSupport).toBe("images_only");
    agents.setAccess("member-a", [{ runtimeConnectionId: agent.id, permissions: ["chat", "view_history"] }], "admin");
    expect(agents.canAccess("member-a", agent.id, "chat")).toBe(true);
    expect(agents.canAccess("member-a", agent.id, "upload")).toBe(false);
    expect(() => agents.setAccess("member-b", [{ runtimeConnectionId: agent.id, permissions: ["chat"] }], "admin")).toThrow("独占 Agent");
    agents.setAccess("member-a", [], "admin");
    expect(agents.canUse("member-a", agent.id)).toBe(false);
    sqlite.close();
  });

  it("marks loopback Hermes Agents as capable of controlled file bridging", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "relaydesk-local-agent-")); directories.push(directory);
    const { sqlite } = createDatabase(path.join(directory, "relaydesk.db")); const hosts = createAgentHostService(sqlite); const agents = createAgentService(sqlite);
    const host = hosts.create({ name: "本机", address: "127.0.0.1" }, "admin");
    const agent = agents.create({ name: "本机 Agent", baseUrl: "http://127.0.0.1:8643", profileName: "local", hostId: host.id, sharingMode: "shared", credentialCiphertext: "encrypted" }, "admin");
    expect(agent.attachmentSupport).toBe("files");
    sqlite.close();
  });
});
