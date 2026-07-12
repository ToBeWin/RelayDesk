"use client";

import { type FormEvent, useEffect, useEffectEvent, useState } from "react";
import { useToast } from "@/shared/components/toast-provider";
import { useLocale } from "@/shared/i18n/locale-provider";
import { memberT } from "@/shared/i18n/messages";

type Member = { id: string; name: string; role: "admin" | "member"; active: boolean; hasPassword: boolean };
type Permission = "chat" | "upload" | "view_history";
type Agent = { id: string; name: string; workspaceLabel: string; profileName?: string; hostName?: string | null; baseUrl: string; sharingMode?: "shared" | "dedicated"; permissions?: Permission[]; enabled: boolean };
type Grant = { runtimeConnectionId: string; permissions: Permission[] };
const allPermissions: Permission[] = ["chat", "upload", "view_history"];

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [grants, setGrants] = useState<Record<string, Grant[]>>({});
  const [message, setMessage] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [busyMemberId, setBusyMemberId] = useState<string>();
  const [creating, setCreating] = useState(false);
  const { notify } = useToast();
  const { locale } = useLocale();
  const permissionLabels: Record<Permission, string> = {
    chat: memberT(locale, "startChats"),
    upload: memberT(locale, "sendFiles"),
    view_history: memberT(locale, "viewHistory"),
  };

  async function load() {
    const [membersResponse, agentsResponse] = await Promise.all([fetch("/api/members"), fetch("/api/agent-instances")]);
    if (membersResponse.status === 403) { setForbidden(true); return; }
    if (!membersResponse.ok || !agentsResponse.ok) { setMessage(memberT(locale, "loadFailed")); return; }
    const memberItems = await membersResponse.json() as Member[]; const agentItems = await agentsResponse.json() as Agent[];
    setMembers(memberItems); setAgents(agentItems);
    const entries = await Promise.all(memberItems.map(async (member) => {
      const response = await fetch(`/api/members/${member.id}/agents`); const items = response.ok ? await response.json() as Agent[] : [];
      return [member.id, items.map((agent) => ({ runtimeConnectionId: agent.id, permissions: agent.permissions?.length ? agent.permissions : allPermissions }))] as const;
    }));
    setGrants(Object.fromEntries(entries));
  }

  const loadMembers = useEffectEvent(() => { void load(); });
  useEffect(() => { const timer = window.setTimeout(loadMembers, 0); return () => window.clearTimeout(timer); }, []);

  async function createMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(""); setCreating(true); const formElement = event.currentTarget; const form = new FormData(formElement);
    try {
      const response = await fetch("/api/members", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.get("name"), password: form.get("password"), role: form.get("role") }) });
      const data = await response.json(); const text = response.ok ? memberT(locale, "memberCreated") : data.message ?? memberT(locale, "memberCreateFailed"); setMessage(text); notify(text, response.ok ? "success" : "error"); if (!response.ok) return; formElement.reset(); await load();
    } catch {
      const text = memberT(locale, "memberNetworkError"); setMessage(text); notify(text, "error");
    } finally { setCreating(false); }
  }

  async function saveAccess(memberId: string) {
    setBusyMemberId(memberId); try {
      const response = await fetch(`/api/members/${memberId}/agents`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ grants: grants[memberId] ?? [] }) });
      const data = await response.json(); const text = response.ok ? memberT(locale, "accessSaved") : data.message ?? memberT(locale, "accessSaveFailed"); setMessage(text); notify(text, response.ok ? "success" : "error");
    } catch {
      const text = memberT(locale, "accessNetworkError"); setMessage(text); notify(text, "error");
    } finally { setBusyMemberId(undefined); }
  }

  async function toggleMember(member: Member) {
    setBusyMemberId(member.id); try {
      const response = await fetch(`/api/members/${member.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ active: !member.active }) });
      const data = await response.json(); const text = response.ok ? member.active ? memberT(locale, "memberDisabled") : memberT(locale, "memberEnabled") : data.message ?? memberT(locale, "memberUpdateFailed"); setMessage(text); notify(text, response.ok ? "success" : "error"); if (response.ok) await load();
    } catch {
      const text = memberT(locale, "memberStatusNetworkError"); setMessage(text); notify(text, "error");
    } finally { setBusyMemberId(undefined); }
  }

  function toggleAgentGrant(memberId: string, agentId: string, enabled: boolean) { setGrants((current) => ({ ...current, [memberId]: enabled ? [...(current[memberId] ?? []), { runtimeConnectionId: agentId, permissions: allPermissions }] : (current[memberId] ?? []).filter((grant) => grant.runtimeConnectionId !== agentId) })); }
  function togglePermission(memberId: string, agentId: string, permission: Permission, enabled: boolean) { setGrants((current) => ({ ...current, [memberId]: (current[memberId] ?? []).map((grant) => grant.runtimeConnectionId === agentId ? { ...grant, permissions: enabled ? [...new Set([...grant.permissions, permission])] : grant.permissions.filter((item) => item !== permission) } : grant).filter((grant) => grant.permissions.length) })); }

  if (forbidden) return <section className="standard-page"><p className="eyebrow">{memberT(locale, "access")}</p><h1>{memberT(locale, "memberAccess")}</h1><p className="form-error">{memberT(locale, "accessDenied")}</p></section>;
  return <section className="standard-page members-page"><p className="eyebrow">{memberT(locale, "membersAgents")}</p><h1>{memberT(locale, "memberAgentAccess")}</h1><p className="muted">{memberT(locale, "memberAccessDescription")}</p><form className="member-create-form" onSubmit={createMember}><input name="name" placeholder={memberT(locale, "memberName")} required /><input name="password" type="password" minLength={8} placeholder={memberT(locale, "initialPassword")} required /><select name="role" defaultValue="member"><option value="member">{memberT(locale, "member")}</option><option value="admin">{memberT(locale, "administrator")}</option></select><button className="primary-button" disabled={creating}>{creating ? memberT(locale, "creating") : memberT(locale, "addMember")}</button></form>{message ? <p className="settings-message">{message}</p> : null}<div className="member-list">{members.map((member) => <article key={member.id}><header><div><strong>{member.name}</strong><span>{member.role === "admin" ? memberT(locale, "administrator") : memberT(locale, "member")}</span></div><button className="secondary-button" disabled={busyMemberId === member.id} onClick={() => toggleMember(member)}>{busyMemberId === member.id ? memberT(locale, "working") : member.active ? memberT(locale, "disable") : memberT(locale, "enable")}</button></header><p>{member.active ? memberT(locale, "accountCanSignIn") : memberT(locale, "accountDisabled")} · {member.hasPassword ? memberT(locale, "passwordSet") : memberT(locale, "passwordNotSet")}</p><div className="member-agent-options">{agents.map((agent) => { const grant = (grants[member.id] ?? []).find((item) => item.runtimeConnectionId === agent.id); return <section key={agent.id} className="member-agent-grant"><label><input type="checkbox" checked={Boolean(grant)} disabled={!agent.enabled || busyMemberId === member.id} onChange={(event) => toggleAgentGrant(member.id, agent.id, event.target.checked)} /><span><strong>{agent.name}</strong><small>{agent.hostName ?? "Hermes"} · {agent.profileName || agent.workspaceLabel || agent.baseUrl} · {agent.sharingMode === "dedicated" ? memberT(locale, "dedicated") : memberT(locale, "shared")}</small></span></label>{grant ? <div className="permission-options">{allPermissions.map((permission) => <label key={permission}><input type="checkbox" checked={grant.permissions.includes(permission)} disabled={busyMemberId === member.id} onChange={(event) => togglePermission(member.id, agent.id, permission, event.target.checked)} />{permissionLabels[permission]}</label>)}</div> : null}</section>; })}</div><button className="primary-button" disabled={busyMemberId === member.id} onClick={() => saveAccess(member.id)}>{busyMemberId === member.id ? memberT(locale, "saving") : memberT(locale, "saveAccess")}</button></article>)}</div></section>;
}
