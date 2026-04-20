"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { ReactNode, useEffect, useRef, useState } from "react";

export type DashboardTone = "brand" | "emerald" | "rose" | "cyan" | "violet" | "amber" | "sky" | "blue" | "slate";

const DASHBOARD_TONE_STYLES: Record<DashboardTone, {
  badge: string;
  icon: string;
  mutedSurface: string;
  strongText: string;
  progress: string;
}> = {
  brand: {
    badge: "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-300",
    icon: "border border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-300",
    mutedSurface: "border-indigo-200/80 bg-indigo-50/70 dark:border-brand-500/15 dark:bg-brand-500/5",
    strongText: "text-indigo-700 dark:text-brand-200",
    progress: "bg-[linear-gradient(90deg,#4567ff_0%,#7c8fff_100%)]",
  },
  emerald: {
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300",
    icon: "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300",
    mutedSurface: "border-emerald-200/80 bg-emerald-50/70 dark:border-emerald-500/15 dark:bg-emerald-500/5",
    strongText: "text-emerald-700 dark:text-emerald-200",
    progress: "bg-[linear-gradient(90deg,#10b981_0%,#4ade80_100%)]",
  },
  rose: {
    badge: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300",
    icon: "border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300",
    mutedSurface: "border-rose-200/80 bg-rose-50/70 dark:border-rose-500/15 dark:bg-rose-500/5",
    strongText: "text-rose-700 dark:text-rose-200",
    progress: "bg-[linear-gradient(90deg,#f43f5e_0%,#fda4af_100%)]",
  },
  cyan: {
    badge: "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300",
    icon: "border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300",
    mutedSurface: "border-cyan-200/80 bg-cyan-50/70 dark:border-cyan-500/15 dark:bg-cyan-500/5",
    strongText: "text-cyan-700 dark:text-cyan-200",
    progress: "bg-[linear-gradient(90deg,#06b6d4_0%,#67e8f9_100%)]",
  },
  violet: {
    badge: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300",
    icon: "border border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300",
    mutedSurface: "border-violet-200/80 bg-violet-50/70 dark:border-violet-500/15 dark:bg-violet-500/5",
    strongText: "text-violet-700 dark:text-violet-200",
    progress: "bg-[linear-gradient(90deg,#8b5cf6_0%,#c4b5fd_100%)]",
  },
  amber: {
    badge: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
    icon: "border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
    mutedSurface: "border-amber-200/80 bg-amber-50/70 dark:border-amber-500/15 dark:bg-amber-500/5",
    strongText: "text-amber-700 dark:text-amber-200",
    progress: "bg-[linear-gradient(90deg,#f59e0b_0%,#fcd34d_100%)]",
  },
  sky: {
    badge: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300",
    icon: "border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300",
    mutedSurface: "border-sky-200/80 bg-sky-50/70 dark:border-sky-500/15 dark:bg-sky-500/5",
    strongText: "text-sky-700 dark:text-sky-200",
    progress: "bg-[linear-gradient(90deg,#0ea5e9_0%,#7dd3fc_100%)]",
  },
  blue: {
    badge: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300",
    icon: "border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300",
    mutedSurface: "border-blue-200/80 bg-blue-50/70 dark:border-blue-500/15 dark:bg-blue-500/5",
    strongText: "text-blue-700 dark:text-blue-200",
    progress: "bg-[linear-gradient(90deg,#2563eb_0%,#93c5fd_100%)]",
  },
  slate: {
    badge: "border-slate-200 bg-white text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200",
    icon: "border border-slate-200 bg-white text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200",
    mutedSurface: "border-slate-200/85 bg-white/75 dark:border-white/10 dark:bg-white/5",
    strongText: "text-slate-800 dark:text-slate-100",
    progress: "bg-[linear-gradient(90deg,#475569_0%,#cbd5e1_100%)]",
  },
};

export function cn(...inputs: Array<string | false | null | undefined>) {
  return twMerge(clsx(inputs));
}

export function DashboardBadge({ tone = "brand", children, className }: { tone?: DashboardTone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.18em]", DASHBOARD_TONE_STYLES[tone].badge, className)}>
      {children}
    </span>
  );
}

export function DashboardSurface({
  eyebrow,
  tone = "brand",
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
  backdrop,
}: {
  eyebrow?: ReactNode;
  tone?: DashboardTone;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  backdrop?: ReactNode;
}) {
  return (
    <section className={cn("relative overflow-hidden rounded-[30px] border border-slate-200/90 bg-card/95 p-5 shadow-[0_30px_80px_-54px_rgba(15,23,42,0.32)] dark:border-base dark:shadow-[0_30px_80px_-58px_rgba(0,0,0,0.85)] sm:p-6", className)}>
      {backdrop}
      {(title || description || eyebrow || action) && (
        <div className="relative z-[1] mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {eyebrow && <DashboardBadge tone={tone}>{eyebrow}</DashboardBadge>}
            {title && <h2 className="mt-3 text-[1.1rem] font-semibold tracking-[-0.02em] text-default sm:text-[1.35rem]">{title}</h2>}
            {description && <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{description}</p>}
          </div>
          {action && <div className="relative z-[1] flex shrink-0 items-center gap-2">{action}</div>}
        </div>
      )}
      <div className={cn("relative z-[1]", bodyClassName)}>{children}</div>
    </section>
  );
}

export function AnimatedNumber({
  value,
  formatter,
  duration = 900,
  className,
}: {
  value: number;
  formatter: (value: number) => string;
  duration?: number;
  className?: string;
}) {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValue = useRef(value);

  useEffect(() => {
    if (typeof window === "undefined") {
      setDisplayValue(value);
      previousValue.current = value;
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplayValue(value);
      previousValue.current = value;
      return;
    }

    if (previousValue.current === value) {
      setDisplayValue(value);
      return;
    }

    let frameId = 0;
    const startValue = previousValue.current;
    const startedAt = window.performance.now();
    const delta = value - startValue;

    const animate = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(startValue + delta * eased);
      if (progress < 1) {
        frameId = window.requestAnimationFrame(animate);
      } else {
        previousValue.current = value;
      }
    };

    frameId = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frameId);
  }, [duration, value]);

  return <span className={className}>{formatter(displayValue)}</span>;
}

export function DashboardMetricCard({
  tone,
  title,
  icon,
  value,
  formatter,
  subtitle,
  progress,
  progressLabel,
  supportingText,
  actionLabel,
  href,
  details,
}: {
  tone: DashboardTone;
  title: string;
  icon: ReactNode;
  value: number;
  formatter: (value: number) => string;
  subtitle: string;
  progress: number;
  progressLabel: string;
  supportingText: string;
  actionLabel: string;
  href?: string;
  details: Array<{ label: string; value: string }>;
}) {
  const toneStyles = DASHBOARD_TONE_STYLES[tone];
  const content = (
    <div className="group flex h-full min-h-[260px] flex-col justify-between rounded-[28px] border border-slate-200/90 bg-card/90 p-5 shadow-[0_24px_60px_-44px_rgba(15,23,42,0.4)] transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_28px_72px_-42px_rgba(15,23,42,0.32)] dark:border-base dark:bg-card/95 dark:hover:border-white/10 dark:hover:shadow-[0_28px_72px_-46px_rgba(0,0,0,0.88)]">
      <div>
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">{title}</p>
            <AnimatedNumber value={value} formatter={formatter} className={cn("mt-3 block text-[2rem] font-semibold tracking-[-0.03em]", toneStyles.strongText)} />
            <p className="mt-2 text-sm leading-6 text-muted">{subtitle}</p>
          </div>
          <div className={cn("flex h-11 w-11 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-105", toneStyles.icon)}>
            {icon}
          </div>
        </div>

        <div className="mb-3 flex items-center justify-between gap-3 text-xs">
          <span className="text-faint">{progressLabel}</span>
          <span className="font-semibold text-default">{Math.round(progress)}%</span>
        </div>
        <div className="h-2 rounded-full bg-slate-200/85 dark:bg-white/10">
          <div className={cn("h-2 rounded-full transition-all duration-500 group-hover:brightness-110", toneStyles.progress)} style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
        <p className="mt-3 text-xs leading-5 text-faint">{supportingText}</p>
      </div>

      <div className="mt-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {details.map((detail) => (
            <div key={detail.label} className={cn("rounded-2xl border px-3 py-3", toneStyles.mutedSurface)}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-faint">{detail.label}</div>
              <div className="mt-2 text-sm font-semibold text-default">{detail.value}</div>
            </div>
          ))}
        </div>
        <div className={cn("inline-flex items-center gap-1 text-xs font-medium", toneStyles.strongText)}>
          {actionLabel}
          <ChevronRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
        </div>
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}

export function DashboardMiniStatCard({
  tone,
  title,
  icon,
  value,
  formatter,
  description,
}: {
  tone: DashboardTone;
  title: string;
  icon: ReactNode;
  value: number;
  formatter: (value: number) => string;
  description: string;
}) {
  const toneStyles = DASHBOARD_TONE_STYLES[tone];

  return (
    <div className="rounded-[24px] border border-slate-200/85 bg-card/88 p-4 shadow-[0_22px_50px_-46px_rgba(15,23,42,0.38)] transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white dark:border-base dark:bg-card/90 dark:hover:border-white/10 dark:hover:bg-card">
      <div className="mb-3 flex items-center gap-3">
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-2xl", toneStyles.icon)}>
          {icon}
        </div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">{title}</div>
      </div>
      <AnimatedNumber value={value} formatter={formatter} className={cn("block text-[1.4rem] font-semibold tracking-[-0.03em]", toneStyles.strongText)} />
      <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
    </div>
  );
}

export function DashboardQuickActionCard({
  href,
  tone,
  icon,
  title,
  description,
  label = "Open",
}: {
  href: string;
  tone: DashboardTone;
  icon: ReactNode;
  title: string;
  description: string;
  label?: string;
}) {
  const toneStyles = DASHBOARD_TONE_STYLES[tone];

  return (
    <Link
      href={href}
      className={cn(
        "group flex h-full min-h-[168px] flex-col rounded-[24px] border border-slate-200/85 bg-card/90 p-5 shadow-[0_24px_54px_-48px_rgba(15,23,42,0.34)] transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:bg-white dark:border-base dark:bg-card/92 dark:hover:border-white/10 dark:hover:bg-card",
        toneStyles.mutedSurface
      )}
    >
      <div className={cn("flex h-10 w-10 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-3", toneStyles.icon)}>
        {icon}
      </div>
      <div className="mt-5">
        <h3 className="text-base font-semibold tracking-[-0.02em] text-default">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
      </div>
      <div className={cn("mt-auto inline-flex items-center gap-1 pt-5 text-sm font-medium", toneStyles.strongText)}>
        {label}
        <ChevronRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
      </div>
    </Link>
  );
}

export function DashboardEmptyBlock({
  tone = "brand",
  title,
  description,
  icon,
  action,
}: {
  tone?: DashboardTone;
  title: string;
  description: string;
  icon: ReactNode;
  action?: ReactNode;
}) {
  const toneStyles = DASHBOARD_TONE_STYLES[tone];

  return (
    <div className={cn("rounded-[24px] border border-dashed px-5 py-8 text-center", toneStyles.mutedSurface)}>
      <div className={cn("mx-auto flex h-11 w-11 items-center justify-center rounded-2xl", toneStyles.icon)}>
        {icon}
      </div>
      <h3 className="mt-4 text-base font-semibold tracking-[-0.02em] text-default">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
      {action && <div className="mt-4 flex items-center justify-center">{action}</div>}
    </div>
  );
}

export function DashboardLoadingState() {
  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-[36px] border border-slate-200/90 bg-card/95 p-6 shadow-[0_30px_80px_-54px_rgba(15,23,42,0.32)] dark:border-base dark:bg-card">
        <div className="dashboard-grid-backdrop" />
        <div className="relative z-[1] grid gap-5 xl:grid-cols-[1.3fr_0.9fr]">
          <div className="space-y-4">
            <div className="dashboard-skeleton h-8 w-40 rounded-full" />
            <div className="dashboard-skeleton h-14 w-full max-w-[420px] rounded-[24px]" />
            <div className="dashboard-skeleton h-6 w-full max-w-[540px] rounded-full" />
            <div className="flex flex-wrap gap-2 pt-2">
              <div className="dashboard-skeleton h-10 w-28 rounded-full" />
              <div className="dashboard-skeleton h-10 w-32 rounded-full" />
              <div className="dashboard-skeleton h-10 w-28 rounded-full" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="dashboard-skeleton h-[116px] rounded-[26px]" />
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.28fr_0.92fr]">
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="dashboard-skeleton h-[286px] rounded-[30px]" />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="dashboard-skeleton h-[178px] rounded-[28px]" />
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="dashboard-skeleton h-[420px] rounded-[32px]" />
        <div className="dashboard-skeleton h-[420px] rounded-[32px]" />
      </div>
    </div>
  );
}
