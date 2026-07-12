import { redirect } from "next/navigation";
import { getCurrentOperatorRecord } from "@/modules/auth/current-operator";
import { config } from "@/infrastructure/config/env";
import { WorkspaceSidebar } from "@/shared/components/workspace-sidebar";

export default async function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const operator = await getCurrentOperatorRecord();
  if (!operator) redirect("/login");
  const runtimeLabel = config.runtimeType === "hermes" ? "Hermes Agent 已连接" : config.runtimeType === "mock" ? "Mock Runtime 就绪" : "Runtime 未配置";
  return <div className="workspace"><WorkspaceSidebar operatorName={operator.name} isAdmin={operator.role === "admin"} runtimeLabel={runtimeLabel} /><main className="workspace-main">{children}</main></div>;
}
