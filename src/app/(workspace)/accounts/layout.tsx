import { redirect } from "next/navigation";
import { getCurrentOperatorRecord } from "@/modules/auth/current-operator";
import { config } from "@/infrastructure/config/env";

export default async function AccountsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const operator = await getCurrentOperatorRecord();
  if (!config.contentWorkspaceEnabled || !operator || operator.role !== "admin") redirect("/chat");
  return children;
}
