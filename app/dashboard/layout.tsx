import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/layout/DashboardShell";
import "@/components/client-trackers/email-delivery-activity.css";
import "@/components/client-trackers/email-delivery-security.css";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return <DashboardShell session={session}>{children}</DashboardShell>;
}
