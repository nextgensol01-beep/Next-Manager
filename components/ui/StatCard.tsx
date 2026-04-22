import { ReactNode } from "react";

const colorMap: Record<string, { bg: string; icon: string; glow: string }> = {
  blue:   { bg: "rgba(0,113,227,0.10)",   icon: "#0071e3", glow: "rgba(0,113,227,0.12)" },
  green:  { bg: "rgba(48,209,88,0.10)",   icon: "#30d158", glow: "rgba(48,209,88,0.12)" },
  teal:   { bg: "rgba(50,173,230,0.10)",  icon: "#32ade6", glow: "rgba(50,173,230,0.12)" },
  purple: { bg: "rgba(191,90,242,0.10)",  icon: "#bf5af2", glow: "rgba(191,90,242,0.12)" },
  orange: { bg: "rgba(255,159,10,0.10)",  icon: "#ff9f0a", glow: "rgba(255,159,10,0.12)" },
  red:    { bg: "rgba(255,59,48,0.10)",   icon: "#ff3b30", glow: "rgba(255,59,48,0.12)" },
  amber:  { bg: "rgba(255,204,0,0.10)",   icon: "#ffcc00", glow: "rgba(255,204,0,0.12)" },
  brand:  { bg: "rgba(0,113,227,0.10)",   icon: "#0071e3", glow: "rgba(0,113,227,0.12)" },
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
  const c = colorMap[color] ?? colorMap.brand;
  const subText = sub ?? subtitle;

  return (
    <div
      className="stat-card group cursor-default relative overflow-hidden"
      style={{ animationDelay: `${index * 60}ms`, transition: "transform 0.2s, box-shadow 0.2s" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"; }}
    >
      {/* Subtle background glow */}
      <div
        className="absolute -top-4 -right-4 w-20 h-20 rounded-full transition-transform duration-300 group-hover:scale-110"
        style={{ background: c.glow, filter: "blur(14px)", opacity: 0.8 }}
      />

      <div className="flex items-start justify-between mb-3 relative">
        <p className="text-xs font-medium text-faint leading-tight">{title}</p>
        <div
          className="w-8 h-8 rounded-[9px] flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-110"
          style={{ background: c.bg, color: c.icon }}
        >
          <span style={{ display: "flex", width: 15, height: 15 }}>{icon}</span>
        </div>
      </div>

      <p className="text-2xl font-bold text-default relative" style={{ letterSpacing: "-0.025em", lineHeight: 1 }}>
        {value}
      </p>

      {subText && <p className="text-xs text-faint mt-1.5 relative">{subText}</p>}
    </div>
  );
}
