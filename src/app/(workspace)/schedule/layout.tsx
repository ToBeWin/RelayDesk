import { redirect } from "next/navigation";
import { config } from "@/infrastructure/config/env";

export default function ScheduleLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  if (!config.contentWorkspaceEnabled) redirect("/chat");
  return children;
}
