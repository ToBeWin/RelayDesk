import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDatabase } from "@/infrastructure/db/client";
import { createMemberService } from "@/modules/members/service";
import { createAgentService } from "@/modules/agents/service";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

describe("member service", () => {
  it("bootstraps one admin and then requires personal member credentials", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "relaydesk-members-")); directories.push(directory);
    const { sqlite } = createDatabase(path.join(directory, "relaydesk.db")); const members = createMemberService(sqlite);
    const admin = await members.authenticateOrBootstrap({ name: "管理员", password: "workspace-password", workspacePassword: "workspace-password" });
    expect(admin?.role).toBe("admin");
    await expect(members.authenticateOrBootstrap({ name: "陌生人", password: "workspace-password", workspacePassword: "workspace-password" })).resolves.toBeNull();
    const member = await members.create({ name: "员工", password: "member-password", role: "member" });
    await expect(members.authenticateOrBootstrap({ name: member.name, password: "member-password", workspacePassword: "workspace-password" })).resolves.toMatchObject({ id: member.id });
    await expect(members.authenticateOrBootstrap({ name: member.name, password: "wrong-password", workspacePassword: "workspace-password" })).resolves.toBeNull();
    sqlite.close();
  });

  it("reports active members that still need an authorized chat Agent", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "relaydesk-member-access-")); directories.push(directory);
    const { sqlite } = createDatabase(path.join(directory, "relaydesk.db"));
    const members = createMemberService(sqlite); const agents = createAgentService(sqlite);
    const first = await members.create({ name: "已授权成员", password: "member-password", role: "member" });
    await members.create({ name: "未授权成员", password: "member-password", role: "member" });
    agents.grantDefaultAccess(first.id);
    expect(members.getAccessSummary()).toEqual({ activeMembers: 2, membersWithChatAccess: 1, membersWithoutChatAccess: 1 });
    sqlite.close();
  });
});
