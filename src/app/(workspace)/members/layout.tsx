import { redirect } from "next/navigation";
import { getCurrentOperatorRecord } from "@/modules/auth/current-operator";

export default async function MembersLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const operator = await getCurrentOperatorRecord();
  if (!operator || operator.role !== "admin") redirect("/chat");
  return children;
}
