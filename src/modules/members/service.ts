import { randomUUID } from "node:crypto";
import { compare, hash } from "bcryptjs";
import type Database from "better-sqlite3";
import { verifyWorkspacePassword } from "@/modules/auth/password";

export type Member = { id: string; name: string; role: "admin" | "member"; active: boolean; hasPassword: boolean; createdAt: number; updatedAt: number };
export type MemberAccessSummary = {
  activeMembers: number;
  membersWithChatAccess: number;
  membersWithoutChatAccess: number;
};

type MemberRow = { id: string; name: string; role: "admin" | "member"; active: number; passwordHash: string | null; createdAt: number; updatedAt: number };

export function createMemberService(sqlite: Database.Database) {
  const select = `SELECT id, name, role, active, password_hash as passwordHash, created_at as createdAt, updated_at as updatedAt FROM operators`;
  const toMember = (row: MemberRow): Member => ({ id: row.id, name: row.name, role: row.role, active: Boolean(row.active), hasPassword: Boolean(row.passwordHash), createdAt: row.createdAt, updatedAt: row.updatedAt });
  return {
    list(): Member[] { return (sqlite.prepare(`${select} ORDER BY role, name`).all() as MemberRow[]).map(toMember); },
    getAccessSummary(): MemberAccessSummary {
      const row = sqlite.prepare(`
        SELECT
          COUNT(*) as activeMembers,
          SUM(CASE WHEN EXISTS (
            SELECT 1 FROM operator_runtime_access access
            INNER JOIN runtime_connections runtime ON runtime.id = access.runtime_connection_id
            LEFT JOIN agent_hosts host ON host.id = runtime.host_id
            WHERE access.operator_id = operators.id
              AND access.enabled = 1
              AND runtime.enabled = 1
              AND COALESCE(host.enabled, 1) = 1
              AND instr(access.permissions_json, '"chat"') > 0
          ) THEN 1 ELSE 0 END) as membersWithChatAccess
        FROM operators
        WHERE role = 'member' AND active = 1
      `).get() as { activeMembers: number; membersWithChatAccess: number | null };
      const activeMembers = row.activeMembers;
      const membersWithChatAccess = row.membersWithChatAccess ?? 0;
      return { activeMembers, membersWithChatAccess, membersWithoutChatAccess: activeMembers - membersWithChatAccess };
    },
    get(id: string): Member | undefined { const row = sqlite.prepare(`${select} WHERE id = ?`).get(id) as MemberRow | undefined; return row ? toMember(row) : undefined; },
    getByName(name: string): MemberRow | undefined { return sqlite.prepare(`${select} WHERE name = ?`).get(name) as MemberRow | undefined; },
    isAdmin(id: string): boolean { return Boolean(sqlite.prepare(`SELECT 1 FROM operators WHERE id = ? AND role = 'admin' AND active = 1`).get(id)); },
    async authenticateOrBootstrap(input: { name: string; password: string; workspacePassword: string }): Promise<Member | null> {
      const existing = this.getByName(input.name);
      if (existing?.passwordHash) return existing.active && await compare(input.password, existing.passwordHash) ? toMember(existing) : null;
      const configuredMembers = (sqlite.prepare(`SELECT COUNT(*) as count FROM operators WHERE password_hash IS NOT NULL`).get() as { count: number }).count;
      if (configuredMembers > 0 || !verifyWorkspacePassword(input.workspacePassword, input.password)) return null;
      const now = Date.now(); const passwordHash = await hash(input.password, 12);
      if (existing) sqlite.prepare(`UPDATE operators SET password_hash = ?, role = 'admin', active = 1, updated_at = ? WHERE id = ?`).run(passwordHash, now, existing.id);
      else sqlite.prepare(`INSERT INTO operators (id, name, password_hash, role, active, created_at, updated_at) VALUES (?, ?, ?, 'admin', 1, ?, ?)`).run(randomUUID(), input.name, passwordHash, now, now);
      const member = this.getByName(input.name)!; return toMember(member);
    },
    async create(input: { name: string; password: string; role: "admin" | "member" }): Promise<Member> {
      const now = Date.now(); const id = randomUUID(); const passwordHash = await hash(input.password, 12);
      sqlite.prepare(`INSERT INTO operators (id, name, password_hash, role, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)`).run(id, input.name, passwordHash, input.role, now, now);
      return this.get(id)!;
    },
    async resetPassword(id: string, password: string): Promise<Member | undefined> {
      const result = sqlite.prepare(`UPDATE operators SET password_hash = ?, updated_at = ? WHERE id = ?`).run(await hash(password, 12), Date.now(), id);
      return result.changes ? this.get(id) : undefined;
    },
    setActive(id: string, active: boolean): Member | undefined { const result = sqlite.prepare(`UPDATE operators SET active = ?, updated_at = ? WHERE id = ?`).run(active ? 1 : 0, Date.now(), id); return result.changes ? this.get(id) : undefined; },
  };
}
