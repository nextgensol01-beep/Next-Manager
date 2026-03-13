"use client";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
}

export default function Modal({ open, onClose, title, children, size = "md" }: ModalProps) {
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (open) {
      setRendered(true);
      // tiny delay so CSS transition runs after mount
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      const t = setTimeout(() => setRendered(false), 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!rendered) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        backdropFilter: "blur(4px)",
        backgroundColor: visible ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0)",
        transition: "background-color 0.2s",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={cn(
          "w-full max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl border",
          size === "lg" && "max-w-2xl",
          size === "sm" && "max-w-sm",
          size === "md" && "max-w-lg"
        )}
        style={{
          backgroundColor: "var(--color-card)",
          borderColor: "var(--color-border)",
          opacity: visible ? 1 : 0,
          transform: visible ? "scale(1) translateY(0)" : "scale(0.93) translateY(14px)",
          transition: "opacity 0.22s cubic-bezier(0.34,1.4,0.64,1), transform 0.22s cubic-bezier(0.34,1.4,0.64,1)",
        }}
      >
        <div className="flex items-center justify-between p-5 border-b border-base sticky top-0 z-10 rounded-t-2xl"
          style={{ backgroundColor: "var(--color-card)" }}>
          <h3 className="font-semibold text-default">{title}</h3>
          <button
            onClick={onClose}
            className="text-muted hover:text-default transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface active:scale-90"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
