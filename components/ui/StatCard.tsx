import { ReactNode } from "react";

const colorMap: Record<string, string> = {
  blue:   "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  green:  "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
  teal:   "bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400",
  purple: "bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400",
  orange: "bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
  red:    "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  amber:  "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
  brand:  "bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400",
};

interface StatCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  color?: string;
  sub?: string;
  subtitle?: string;
  index?: number;
}

export default function StatCard({ title, value, icon, color = "brand", sub, subtitle, index = 0 }: StatCardProps) {
  const colorClass = colorMap[color] ?? color;
  const subText = sub ?? subtitle;
  return (
    <div
      className="stat-card group cursor-default"
      style={{
        animationDelay: `${index * 60}ms`,
        transition: "transform 0.2s, box-shadow 0.2s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"; }}
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm font-medium text-muted">{title}</p>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-110 ${colorClass}`}>
          {icon}
        </div>
      </div>
      <p className="text-2xl font-bold text-default">{value}</p>
      {subText && <p className="text-xs text-muted mt-1">{subText}</p>}
    </div>
  );
}
