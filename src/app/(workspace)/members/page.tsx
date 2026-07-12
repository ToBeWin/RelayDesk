"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useToast } from "@/shared/components/toast-provider";

type Member = { id: string; name: string; role: "admin" | "member"; active: boolean; hasPassword: boolean };
type Permission = "chat" | "upload" | "manage_content" | "view_history";
type Agent = { id: string; name: string; workspaceLabel: string; profileName?: string; hostName?: string | null; baseUrl: string; sharingMode?: "shared" | "dedicated"; permissions?: Permission[]; enabled: boolean };
type Grant = { runtimeConnectionId: string; permissions: Permission[] };
const permissionLabels: Record<Permission, string> = { chat: "发起私聊", upload: "发送文件", manage_content: "管理内容", view_history: "查看历史" };
const allPermissions = Object.keys(permissionLabels) as Permission[];

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [grants, setGrants] = useState<Record<string, Grant[]>>({});
  const [message, setMessage] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [busyMemberId, setBusyMemberId] = useState<string>();
  const [creating, setCreating] = useState(false);
  const { notify } = useToast();

  async function load() {
    const [membersResponse, agentsResponse] = await Promise.all([fetch("/api/members"), fetch("/api/agent-instances")]);
    if (membersResponse.status === 403) { setForbidden(true); return; }
    if (!membersResponse.ok || !agentsResponse.ok) { setMessage("成员与 Agent 数据加载失败。"); return; }
    const memberItems = await membersResponse.json() as Member[]; const agentItems = await agentsResponse.json() as Agent[];
    setMembers(memberItems); setAgents(agentItems);
    const entries = await Promise.all(memberItems.map(async (member) => {
      const response = await fetch(`/api/members/${member.id}/agents`); const items = response.ok ? await response.json() as Agent[] : [];
      return [member.id, items.map((agent) => ({ runtimeConnectionId: agent.id, permissions: agent.permissions?.length ? agent.permissions : allPermissions }))] as const;
    }));
    setGrants(Object.fromEntries(entries));
  }

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []);

  async function createMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(""); setCreating(true); const formElement = event.currentTarget; const form = new FormData(formElement);
    try {
      const response = await fetch("/api/members", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.get("name"), password: form.get("password"), role: form.get("role") }) });
      const data = await response.json(); const text = response.ok ? "成员已创建，请继续分配 Agent。" : data.message ?? "成员创建失败"; setMessage(text); notify(text, response.ok ? "success" : "error"); if (!response.ok) return; formElement.reset(); await load();
    } catch {
      const text = "网络异常，成员未创建。请检查服务连接后重试。"; setMessage(text); notify(text, "error");
    } finally { setCreating(false); }
  }

  async function saveAccess(memberId: string) {
    setBusyMemberId(memberId); try {
      const response = await fetch(`/api/members/${memberId}/agents`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ grants: grants[memberId] ?? [] }) });
      const data = await response.json(); const text = response.ok ? "Agent 授权已保存。" : data.message ?? "授权保存失败"; setMessage(text); notify(text, response.ok ? "success" : "error");
    } catch {
      const text = "网络异常，授权未保存。请稍后重试。"; setMessage(text); notify(text, "error");
    } finally { setBusyMemberId(undefined); }
  }

  async function toggleMember(member: Member) {
    setBusyMemberId(member.id); try {
      const response = await fetch(`/api/members/${member.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ active: !member.active }) });
      const data = await response.json(); const text = response.ok ? `成员已${member.active ? "停用" : "启用"}。` : data.message ?? "成员更新失败"; setMessage(text); notify(text, response.ok ? "success" : "error"); if (response.ok) await load();
    } catch {
      const text = "网络异常，成员状态未更新。请稍后重试。"; setMessage(text); notify(text, "error");
    } finally { setBusyMemberId(undefined); }
  }

  function toggleAgentGrant(memberId: string, agentId: string, enabled: boolean) { setGrants((current) => ({ ...current, [memberId]: enabled ? [...(current[memberId] ?? []), { runtimeConnectionId: agentId, permissions: allPermissions }] : (current[memberId] ?? []).filter((grant) => grant.runtimeConnectionId !== agentId) })); }
  function togglePermission(memberId: string, agentId: string, permission: Permission, enabled: boolean) { setGrants((current) => ({ ...current, [memberId]: (current[memberId] ?? []).map((grant) => grant.runtimeConnectionId === agentId ? { ...grant, permissions: enabled ? [...new Set([...grant.permissions, permission])] : grant.permissions.filter((item) => item !== permission) } : grant).filter((grant) => grant.permissions.length) })); }

  if (forbidden) return <section className="standard-page"><p className="eyebrow">Access</p><h1>成员授权</h1><p className="form-error">只有管理员可以查看和修改成员授权。</p></section>;
  return <section className="standard-page members-page"><p className="eyebrow">Members &amp; Agents</p><h1>成员与 Agent 授权</h1><p className="muted">员工使用个人密码登录；权限撤销后立即停止新的聊天、上传、内容管理和历史访问。</p><form className="member-create-form" onSubmit={createMember}><input name="name" placeholder="员工姓名" required /><input name="password" type="password" minLength={8} placeholder="初始密码（至少 8 位）" required /><select name="role" defaultValue="member"><option value="member">普通成员</option><option value="admin">管理员</option></select><button className="primary-button" disabled={creating}>{creating ? "正在创建" : "新增成员"}</button></form>{message ? <p className="settings-message">{message}</p> : null}<div className="member-list">{members.map((member) => <article key={member.id}><header><div><strong>{member.name}</strong><span>{member.role === "admin" ? "管理员" : "成员"}</span></div><button className="secondary-button" disabled={busyMemberId === member.id} onClick={() => toggleMember(member)}>{busyMemberId === member.id ? "正在处理" : member.active ? "停用" : "启用"}</button></header><p>{member.active ? "账号可登录" : "账号已停用"} · {member.hasPassword ? "个人密码已设置" : "等待设置密码"}</p><div className="member-agent-options">{agents.map((agent) => { const grant = (grants[member.id] ?? []).find((item) => item.runtimeConnectionId === agent.id); return <section key={agent.id} className="member-agent-grant"><label><input type="checkbox" checked={Boolean(grant)} disabled={!agent.enabled || busyMemberId === member.id} onChange={(event) => toggleAgentGrant(member.id, agent.id, event.target.checked)} /><span><strong>{agent.name}</strong><small>{agent.hostName ?? "Hermes"} · {agent.profileName || agent.workspaceLabel || agent.baseUrl} · {agent.sharingMode === "dedicated" ? "独占" : "共享"}</small></span></label>{grant ? <div className="permission-options">{allPermissions.map((permission) => <label key={permission}><input type="checkbox" checked={grant.permissions.includes(permission)} disabled={busyMemberId === member.id} onChange={(event) => togglePermission(member.id, agent.id, permission, event.target.checked)} />{permissionLabels[permission]}</label>)}</div> : null}</section>; })}</div><button className="primary-button" disabled={busyMemberId === member.id} onClick={() => saveAccess(member.id)}>{busyMemberId === member.id ? "正在保存" : "保存 Agent 授权"}</button></article>)}</div></section>;
}
