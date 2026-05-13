/**
 * Skeleton primitives
 *
 * Usage:
 *   <Sk.Box h={20} w="60%" />          — generic block
 *   <Sk.Text lines={3} />              — paragraph lines
 *   <Sk.Circle size={36} />            — icon / avatar circle
 *   <Sk.StatCard />                    — stat card shape
 *   <Sk.Card>...</Sk.Card>             — card shell with children
 *
 * The shimmer animation is defined in globals.css (.skeleton class).
 */

import React from "react";

/* ── Primitive: filled block ── */
function Box({
  h = 16,
  w = "100%",
  radius = 6,
  className = "",
  style,
}: {
  h?: number | string;
  w?: number | string;
  radius?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{
        height: typeof h === "number" ? `${h}px` : h,
        width: typeof w === "number" ? `${w}px` : w,
        borderRadius: `${radius}px`,
        flexShrink: 0,
        ...style,
      }}
    />
  );
}

/* ── Primitive: text line stack ── */
function Text({
  lines = 2,
  gap = 8,
  lastLineWidth = "65%",
}: {
  lines?: number;
  gap?: number;
  lastLineWidth?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: `${gap}px` }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Box
          key={i}
          h={13}
          w={i === lines - 1 && lines > 1 ? lastLineWidth : "100%"}
        />
      ))}
    </div>
  );
}

/* ── Primitive: circle ── */
function Circle({ size = 40 }: { size?: number }) {
  return (
    <div
      className="skeleton"
      style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0 }}
    />
  );
}

/* ── Shell: rounded card with inner padding ── */
function Card({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`bg-card border border-base rounded-2xl shadow-sm ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

/* ── Composite: single stat card ── */
function StatCard({ index = 0 }: { index?: number }) {
  return (
    <Card
      className="p-4"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <Box h={11} w="55%" />
        <Box h={28} w={28} radius={10} />
      </div>
      <Box h={26} w="70%" radius={6} style={{ marginBottom: 8 }} />
      <Box h={11} w="40%" />
    </Card>
  );
}

export const Sk = { Box, Text, Circle, Card, StatCard };
