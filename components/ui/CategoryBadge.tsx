import { cn } from "@/lib/utils";

const badgeMap: Record<string, string> = {
  "PWP": "badge-pwp",
  "Producer": "badge-producer",
  "Importer": "badge-importer",
  "Brand Owner": "badge-brandowner",
  "SIMP": "badge-simp",
};
export function CategoryBadge({ category }: { category: string }) {
  return <span className={cn(badgeMap[category] || "bg-surface text-muted text-xs font-semibold px-2 py-0.5 rounded-full")}>{category}</span>;
}
const statusMap: Record<string, string> = { "Paid": "badge-paid", "Partial": "badge-partial", "Unpaid": "badge-unpaid" };
export function PaymentStatusBadge({ status }: { status: string }) {
  return <span className={cn(statusMap[status] || "bg-surface text-muted text-xs font-semibold px-2 py-0.5 rounded-full")}>{status}</span>;
}
