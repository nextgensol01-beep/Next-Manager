"use client";
import { useState, useEffect, useRef, useCallback, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  Plus, Trash2, Building2, Calendar, FileText,
  Hash, Mail, MapPin, Phone, Shield, User, ChevronRight,
  AlertTriangle, Info, Check
} from "lucide-react";
import toast from "react-hot-toast";
import {
  CLIENT_CUSTOM_FIELD_ICONS,
  CLIENT_CUSTOM_FIELD_PROFILE_POSITIONS,
  CLIENT_CUSTOM_FIELD_TYPES,
  customFieldKeyFromLabel,
  type ClientCustomFieldDefinition,
  type ClientCustomFieldIcon,
  type ClientCustomFieldProfilePosition,
  type ClientCustomFieldType,
} from "@/lib/clientCustomFields";
import { invalidate, useCache } from "@/lib/useCache";
import ConfirmModal from "@/components/ui/ConfirmModal";

/* ─── constants ─────────────────────────────────────────────────────────── */

const emptyFieldForm = {
  label: "",
  key: "",
  type: "text" as ClientCustomFieldType,
  searchable: false,
  required: false,
  active: true,
  showInProfile: true,
  profilePosition: "beforeContact" as ClientCustomFieldProfilePosition,
  icon: "fileText" as ClientCustomFieldIcon,
  order: "",
};

const FIELD_ICON_COMPONENTS: Record<ClientCustomFieldIcon, React.ElementType> = {
  fileText: FileText,
  building: Building2,
  hash: Hash,
  user: User,
  mapPin: MapPin,
  phone: Phone,
  mail: Mail,
  calendar: Calendar,
  shield: Shield,
};

/* icon background colours — unique iOS system tint per icon, no duplicates */
const ICON_COLORS: Record<ClientCustomFieldIcon, { bg: string; fg: string }> = {
  fileText:  { bg: "#007AFF", fg: "#fff" }, // Blue
  building:  { bg: "#34C759", fg: "#fff" }, // Green
  hash:      { bg: "#FF9500", fg: "#fff" }, // Orange
  user:      { bg: "#5856D6", fg: "#fff" }, // Purple
  mapPin:    { bg: "#FF3B30", fg: "#fff" }, // Red
  phone:     { bg: "#30B0C7", fg: "#fff" }, // Teal (was duplicate green)
  mail:      { bg: "#32ADE6", fg: "#fff" }, // Light Blue (was duplicate blue)
  calendar:  { bg: "#FF2D55", fg: "#fff" }, // Pink (was duplicate red)
  shield:    { bg: "#636366", fg: "#fff" }, // Gray (was duplicate purple)
};

/* ─── types ──────────────────────────────────────────────────────────────── */

type ConfirmState = {
  open: boolean;
  title: string;
  description?: string;
  note?: string;
  confirmLabel?: string;
  confirmText?: string;
  variant?: "danger" | "warning";
  onConfirm: () => Promise<void>;
};

type Sheet = "none" | "add" | "edit";

const closedConfirm: ConfirmState = { open: false, title: "", onConfirm: async () => {} };

/* ─── Apple‑style primitives ─────────────────────────────────────────────── */

/** Inset‑grouped section — white card on gray page */
function AppleSection({
  header,
  footer,
  children,
}: {
  header?: string;
  footer?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="apple-section">
      {header && (
        <p className="apple-section-header">{header}</p>
      )}
      <div className="apple-card">
        {children}
      </div>
      {footer && (
        <p className="apple-section-footer">{footer}</p>
      )}
    </div>
  );
}

/** A single row inside an AppleSection */
function AppleRow({
  icon,
  iconBg,
  iconFg = "#fff",
  label,
  value,
  valueColor,
  chevron = false,
  onClick,
  destructive = false,
  disabled = false,
  children,
  badge,
  subtitle,
}: {
  icon?: React.ElementType;
  iconBg?: string;
  iconFg?: string;
  label: string;
  value?: string;
  valueColor?: string;
  chevron?: boolean;
  onClick?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
  badge?: React.ReactNode;
  subtitle?: string;
}) {
  const Icon = icon;
  const isInteractive = Boolean(onClick);
  const Tag = isInteractive ? "button" : "div";

  return (
    <Tag
      type={isInteractive ? "button" : undefined}
      onClick={onClick}
      disabled={disabled}
      className={[
        "apple-row",
        isInteractive ? "apple-row--interactive" : "",
        destructive ? "apple-row--destructive" : "",
        disabled ? "apple-row--disabled" : "",
      ].join(" ")}
    >
      {Icon && iconBg && (
        <span className="apple-row-icon" style={{ background: iconBg }}>
          <Icon size={17} color={iconFg} strokeWidth={1.8} />
        </span>
      )}
      <span className="apple-row-content">
        <span className="apple-row-label-wrap">
          <span className="apple-row-label">{label}</span>
          {badge}
        </span>
        {subtitle && <span className="apple-row-subtitle">{subtitle}</span>}
      </span>
      {value && (
        <span className="apple-row-value" style={valueColor ? { color: valueColor } : {}}>
          {value}
        </span>
      )}
      {children}
      {chevron && <ChevronRight size={16} className="apple-row-chevron" />}
    </Tag>
  );
}

/** Apple‑style toggle switch */
function AppleToggle({
  checked,
  onChange,
  label,
  subtitle,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  subtitle?: string;
}) {
  return (
    <label className="apple-row apple-toggle-row">
      <span className="apple-row-content">
        <span className="apple-row-label">{label}</span>
        {subtitle && <span className="apple-row-subtitle">{subtitle}</span>}
      </span>
      <span
        className={`apple-toggle ${checked ? "apple-toggle--on" : ""}`}
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
        tabIndex={0}
        onKeyDown={(e) => e.key === " " && onChange(!checked)}
      >
        <span className="apple-toggle-thumb" />
      </span>
    </label>
  );
}

/** Apple‑style text / select input row */
function AppleInputRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="apple-input-row">
      <span className="apple-input-label">{label}</span>
      <span className="apple-input-value">{children}</span>
    </div>
  );
}

/* ─── Field icon square ──────────────────────────────────────────────────── */
function FieldIconSquare({
  iconKey,
  size = 29,
}: {
  iconKey: ClientCustomFieldIcon;
  size?: number;
}) {
  const Icon = FIELD_ICON_COMPONENTS[iconKey] || FileText;
  const { bg, fg } = ICON_COLORS[iconKey] || { bg: "#007AFF", fg: "#fff" };
  return (
    <span
      className="apple-row-icon"
      style={{
        background: bg,
        width: size,
        height: size,
        borderRadius: size * 0.225,
        flexShrink: 0,
      }}
    >
      <Icon size={size * 0.58} color={fg} strokeWidth={1.8} />
    </span>
  );
}

/* ─── Apple‑style Inline Picker ──────────────────────────────────────────── */

function AppleInlinePicker({
  label,
  value,
  options,
  onChange,
  isOpen,
  onToggle,
}: {
  label: string;
  value: string;
  options: readonly { id: string; label: string }[];
  onChange: (v: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const selectedLabel = options.find((o) => o.id === value)?.label ?? value;

  return (
    <div className="apple-picker-container">
      <button
        type="button"
        className="apple-picker-trigger"
        onClick={onToggle}
      >
        <span className="apple-input-label">{label}</span>
        <span className="apple-input-value">
          <span className="apple-picker-value">{selectedLabel}</span>
          <ChevronRight
            size={14}
            className={`apple-picker-chevron ${isOpen ? "apple-picker-chevron--open" : ""}`}
          />
        </span>
      </button>
      <div className={`apple-picker-options ${isOpen ? "apple-picker-options--open" : ""}`}>
        <div className="apple-picker-list">
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`apple-picker-option ${value === opt.id ? "apple-picker-option--selected" : ""}`}
              onClick={() => {
                onChange(opt.id);
                setTimeout(onToggle, 150);
              }}
            >
              <span className="apple-picker-option-label">{opt.label}</span>
              {value === opt.id && (
                <svg width="14" height="11" viewBox="0 0 14 11" fill="none" className="apple-picker-check">
                  <path d="M1 5.5L5 9.5L13 1" stroke="#007AFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Apple‑style Icon Grid Picker ───────────────────────────────────────── */

/* ─── Critically-damped spring interpolation (no overshoot) ────────────── */
function springLerp(current: number, target: number, velocity: number, dt: number) {
  // Critically-damped spring: stiffness=220, damping ratio=1.0
  const stiffness = 220;
  const damping = 2 * Math.sqrt(stiffness); // Critical damping
  const mass = 1;
  const force = -stiffness * (current - target) - damping * velocity;
  const newVelocity = velocity + (force / mass) * dt;
  const newValue = current + newVelocity * dt;
  return { value: newValue, velocity: newVelocity };
}

/* ─── Per-icon spring state ────────────────────────────────────────────── */
type IconSpringState = {
  scale: number; scaleV: number;
  tx: number; txV: number;
  ty: number; tyV: number;
  shadowScale: number; shadowScaleV: number;
  glow: number; glowV: number;
  tooltip: number; tooltipV: number;
  magnetX: number; magnetXV: number;   // Magnetic cursor-tracking offset
  magnetY: number; magnetYV: number;
};

function AppleIconGridPicker({
  value,
  onChange,
  isOpen,
  onToggle,
}: {
  value: ClientCustomFieldIcon;
  onChange: (v: ClientCustomFieldIcon) => void;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const springStates = useRef<Map<string, IconSpringState>>(new Map());
  const rafRef = useRef<number | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const prevIsOpen = useRef(false);
  const entrancePhase = useRef(false);
  const entranceStart = useRef(0);

  const SelectedIcon = FIELD_ICON_COMPONENTS[value] || FileText;
  const selectedColors = ICON_COLORS[value] || { bg: "#007AFF", fg: "#fff" };

  const allIcons = CLIENT_CUSTOM_FIELD_ICONS; // flat array of 9
  const rows = [
    allIcons.slice(0, 3),
    allIcons.slice(3, 6),
    allIcons.slice(6, 9),
  ];

  // ── Physics constants ──
  const MAX_DIST = 150;       // Radius of influence (px)
  const MAX_SCALE = 1.55;     // Focused icon scale
  const REPULSION = 18;       // Max px shift away from cursor
  const SCALE_POWER = 2.4;    // Very steep falloff = much sharper focus hierarchy
  const REPULSION_POWER = 2;  // Repulsion falloff exponent
  const MAGNET_STRENGTH = 6;  // Max px the focused icon tracks toward cursor

  // ── Ensure every icon has spring state ──
  const ensureSpring = useCallback((id: string) => {
    if (!springStates.current.has(id)) {
      springStates.current.set(id, {
        scale: 1, scaleV: 0,
        tx: 0, txV: 0,
        ty: 0, tyV: 0,
        shadowScale: 0, shadowScaleV: 0,
        glow: 0, glowV: 0,
        tooltip: 0, tooltipV: 0,
        magnetX: 0, magnetXV: 0,
        magnetY: 0, magnetYV: 0,
      });
    }
    return springStates.current.get(id)!;
  }, []);

  // ── Focus & dwell tracking ──
  const focusedIdRef = useRef<string | null>(null);
  const dwellStartRef = useRef<number>(0);
  const pressedIdRef = useRef<string | null>(null);
  const DWELL_MS = 200; // ms before tooltip appears

  // ── Stable callback for item refs ──
  const FOCUS_RADIUS = 32; // px — must be within icon bounds to be "focused"

  // ── Core physics loop ──
  const lastTime = useRef(0);
  const animate = useCallback(() => {
    const now = performance.now();
    const dt = Math.min((now - (lastTime.current || now)) / 1000, 0.05);
    lastTime.current = now;

    const grid = gridRef.current;
    if (!grid) { rafRef.current = null; return; }

    const gridRect = grid.getBoundingClientRect();
    const pointer = pointerRef.current;
    let anyMoving = false;

    // ═══ Pass 1: Find the focused icon (closest to cursor) ═══
    let focusedId: string | null = null;
    let minDist = Infinity;

    if (pointer) {
      itemRefs.current.forEach((el, id) => {
        const r = el.getBoundingClientRect();
        const cx = r.left - gridRect.left + r.width / 2;
        const cy = r.top - gridRect.top + r.height / 2;
        const d = Math.sqrt((pointer.x - cx) ** 2 + (pointer.y - cy) ** 2);
        if (d < FOCUS_RADIUS && d < minDist) {
          minDist = d;
          focusedId = id;
        }
      });
    }

    // Track dwell time for tooltip delay
    if (focusedId !== focusedIdRef.current) {
      focusedIdRef.current = focusedId;
      dwellStartRef.current = now;
    }
    const dwellElapsed = focusedId ? now - dwellStartRef.current : 0;

    // ═══ Pass 2: Compute & apply transforms ═══
    // Reset all row z-indices first
    const rowEls = grid.querySelectorAll<HTMLElement>(".honeycomb-row");
    rowEls.forEach(row => { row.style.zIndex = "1"; });

    // Elevate the focused icon's parent row
    if (focusedId) {
      const focusedEl = itemRefs.current.get(focusedId);
      const focusedRow = focusedEl?.closest<HTMLElement>(".honeycomb-row");
      if (focusedRow) focusedRow.style.zIndex = "10";
    }
    itemRefs.current.forEach((el, id) => {
      const state = ensureSpring(id);
      const elRect = el.getBoundingClientRect();
      const icx = elRect.left - gridRect.left + elRect.width / 2;
      const icy = elRect.top - gridRect.top + elRect.height / 2;

      let targetScale = 1;
      let targetTx = 0;
      let targetTy = 0;
      let targetShadow = 0;
      let targetGlow = 0;
      let targetTooltip = 0;
      let targetMagnetX = 0;
      let targetMagnetY = 0;

      const isFocused = id === focusedId;

      if (pointer) {
        const dx = pointer.x - icx;
        const dy = pointer.y - icy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < MAX_DIST) {
          const factor = 1 - dist / MAX_DIST;
          const scaleFactor = Math.pow(factor, SCALE_POWER);
          targetScale = 1 + (MAX_SCALE - 1) * scaleFactor;
          targetShadow = scaleFactor;

          // ── Anchoring: focused icon stays put, neighbors repel ──
          if (!isFocused && dist > 1) {
            const repFactor = Math.pow(factor, REPULSION_POWER);
            const nx = -dx / dist;
            const ny = -dy / dist;
            targetTx = nx * REPULSION * repFactor;
            targetTy = ny * REPULSION * repFactor;
          }
        }

        // ── Focus: glow, tooltip, magnetic attachment ──
        if (isFocused) {
          targetGlow = 1;
          if (dwellElapsed >= DWELL_MS) {
            targetTooltip = 1;
          }
          // Magnetic attraction: icon subtly tracks toward cursor
          const magnetFactor = Math.min(1, dist / FOCUS_RADIUS);
          targetMagnetX = dx * magnetFactor * (MAGNET_STRENGTH / FOCUS_RADIUS);
          targetMagnetY = dy * magnetFactor * (MAGNET_STRENGTH / FOCUS_RADIUS);
        }

        // ── Physical Press Squish & Dim ──
        if (pressedIdRef.current === id) {
          targetScale *= 0.82; // Physically compress
          targetGlow *= 0.3;   // Dim the illumination
        }
      }

      // ── Spring integration ──
      const s = springLerp(state.scale, targetScale, state.scaleV, dt);
      state.scale = s.value; state.scaleV = s.velocity;

      const sx = springLerp(state.tx, targetTx, state.txV, dt);
      state.tx = sx.value; state.txV = sx.velocity;

      const sy = springLerp(state.ty, targetTy, state.tyV, dt);
      state.ty = sy.value; state.tyV = sy.velocity;

      const ss = springLerp(state.shadowScale, targetShadow, state.shadowScaleV, dt);
      state.shadowScale = ss.value; state.shadowScaleV = ss.velocity;

      const sg = springLerp(state.glow, targetGlow, state.glowV, dt);
      state.glow = sg.value; state.glowV = sg.velocity;

      const st = springLerp(state.tooltip, targetTooltip, state.tooltipV, dt);
      state.tooltip = st.value; state.tooltipV = st.velocity;

      const smx = springLerp(state.magnetX, targetMagnetX, state.magnetXV, dt);
      state.magnetX = smx.value; state.magnetXV = smx.velocity;

      const smy = springLerp(state.magnetY, targetMagnetY, state.magnetYV, dt);
      state.magnetY = smy.value; state.magnetYV = smy.velocity;

      // ── Apply to DOM (GPU-accelerated) ──
      const finalTx = state.tx + state.magnetX;
      const finalTy = state.ty + state.magnetY;
      el.style.transform = `translate3d(${finalTx.toFixed(2)}px, ${finalTy.toFixed(2)}px, 0) scale(${state.scale.toFixed(4)})`;
      // Focused icon always on top; scaled neighbors behind; rest at base
      el.style.zIndex = state.glow > 0.3 ? "100" : state.scale > 1.08 ? "50" : "1";

      // ── Dynamic shadow + focused glow ──
      const shadowVal = Math.max(0, state.shadowScale);
      const glowVal = Math.max(0, Math.min(1, state.glow));
      const blur = 4 + shadowVal * 20;
      const spread = shadowVal * 4;
      const alpha = 0.12 + shadowVal * 0.2;
      const iconEl = el.querySelector<HTMLElement>(".honeycomb-icon");
      if (iconEl) {
        // Combine depth shadow + subtle white glow for focused icon
        const depthShadow = `0 ${(4 + shadowVal * 8).toFixed(1)}px ${blur.toFixed(1)}px ${spread.toFixed(1)}px rgba(0,0,0,${alpha.toFixed(3)})`;
        const glowShadow = glowVal > 0.01
          ? `, 0 0 ${(12 * glowVal).toFixed(1)}px ${(4 * glowVal).toFixed(1)}px rgba(255,255,255,${(0.15 * glowVal).toFixed(3)})`
          : "";
        iconEl.style.boxShadow = depthShadow + glowShadow;
        // Subtle brightness lift on focused icon
        iconEl.style.filter = glowVal > 0.01 ? `brightness(${(1 + 0.12 * glowVal).toFixed(3)})` : "";
      }

      // ── Tooltip: only for focused icon, spring-driven ──
      const tooltipEl = el.querySelector<HTMLElement>(".honeycomb-tooltip");
      if (tooltipEl) {
        const tp = Math.max(0, Math.min(1, state.tooltip));
        tooltipEl.style.opacity = tp.toFixed(3);
        tooltipEl.style.transform = `translateX(-50%) translateY(${(8 * (1 - tp)).toFixed(1)}px) scale(${(0.9 + 0.1 * tp).toFixed(3)})`;
      }

      // Check if still moving
      if (Math.abs(state.scaleV) > 0.001 || Math.abs(state.scale - targetScale) > 0.001 ||
          Math.abs(state.txV) > 0.01 || Math.abs(state.tx - targetTx) > 0.01 ||
          Math.abs(state.tyV) > 0.01 || Math.abs(state.ty - targetTy) > 0.01 ||
          Math.abs(state.glowV) > 0.001 || Math.abs(state.glow - targetGlow) > 0.001 ||
          Math.abs(state.tooltipV) > 0.001 || Math.abs(state.tooltip - targetTooltip) > 0.001 ||
          Math.abs(state.magnetXV) > 0.01 || Math.abs(state.magnetX - targetMagnetX) > 0.01 ||
          Math.abs(state.magnetYV) > 0.01 || Math.abs(state.magnetY - targetMagnetY) > 0.01) {
        anyMoving = true;
      }
    });

    if (anyMoving || pointer) {
      rafRef.current = requestAnimationFrame(animate);
    } else {
      rafRef.current = null;
    }
  }, [ensureSpring, MAX_DIST, MAX_SCALE, REPULSION, SCALE_POWER, REPULSION_POWER, DWELL_MS, FOCUS_RADIUS, MAGNET_STRENGTH]);

  // ── Start the loop ──
  const startLoop = useCallback(() => {
    if (!rafRef.current) {
      lastTime.current = performance.now();
      rafRef.current = requestAnimationFrame(animate);
    }
  }, [animate]);

  // ── Pointer handlers ──
  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = e.currentTarget.getBoundingClientRect();
    pointerRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    startLoop();
  }, [startLoop]);

  const handlePointerLeave = useCallback(() => {
    pointerRef.current = null;
    focusedIdRef.current = null;
    startLoop(); // Continue loop so springs settle back
  }, [startLoop]);

  // ── Entrance animation ──
  useEffect(() => {
    if (isOpen && !prevIsOpen.current) {
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        entrancePhase.current = true;
        entranceStart.current = performance.now();

        // Reset all items to scale 0 for entrance
        itemRefs.current.forEach((el, id) => {
          const state = ensureSpring(id);
          state.scale = 0;
          state.scaleV = 8; // Initial burst velocity for pop-in
          el.style.transform = "scale(0)";
          el.style.opacity = "0";
        });

        // Stagger entrance
        const items = Array.from(itemRefs.current.entries());
        items.forEach(([id, el], index) => {
          setTimeout(() => {
            el.style.opacity = "1";
            const state = ensureSpring(id);
            state.scaleV = 12; // Pop velocity
            startLoop();
          }, index * 40);
        });
      }
    }
    prevIsOpen.current = isOpen;
  }, [isOpen, ensureSpring, startLoop]);

  // ── Cleanup ──
  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  // ── Ref setter (memoized to prevent React from remounting refs on every render) ──
  const refCallbacks = useRef<Map<string, (el: HTMLButtonElement | null) => void>>(new Map());
  const getRefCallback = useCallback((id: string) => {
    if (!refCallbacks.current.has(id)) {
      refCallbacks.current.set(id, (el: HTMLButtonElement | null) => {
        if (el) {
          itemRefs.current.set(id, el);
          ensureSpring(id);
        } else {
          itemRefs.current.delete(id);
        }
      });
    }
    return refCallbacks.current.get(id)!;
  }, [ensureSpring]);

  return (
    <div className="apple-picker">
      <button type="button" className="apple-picker-trigger" onClick={onToggle}>
        <span className="apple-input-label">Icon</span>
        <span className="apple-input-value">
          <span
            className="apple-picker-value-icon"
            style={{ background: selectedColors.bg }}
          >
            <SelectedIcon size={16} color={selectedColors.fg} strokeWidth={2.5} />
          </span>
          <ChevronRight size={14} className={`apple-picker-chevron ${isOpen ? "apple-picker-chevron--open" : ""}`} />
        </span>
      </button>

      <div className={`apple-picker-options ${isOpen ? "apple-picker-options--open" : ""}`}>
        <div
          className="apple-honeycomb-grid"
          ref={gridRef}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        >
          {rows.map((row, rIdx) => (
            <div className="honeycomb-row" key={rIdx}>
              {row.map((ic) => {
                const iconId = ic.id as ClientCustomFieldIcon;
                const isSelected = value === iconId;
                const Icon = FIELD_ICON_COMPONENTS[iconId] || FileText;
                const colors = ICON_COLORS[iconId] || { bg: "#007AFF", fg: "#fff" };

                return (
                  <button
                    key={ic.id}
                    ref={getRefCallback(ic.id)}
                    type="button"
                    className={`honeycomb-item ${isSelected ? "honeycomb-item--selected" : ""}`}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      pressedIdRef.current = iconId;
                    }}
                    onPointerUp={(e) => {
                      e.currentTarget.releasePointerCapture(e.pointerId);
                      pressedIdRef.current = null;
                    }}
                    onClick={() => {
                      onChange(iconId);
                      setTimeout(onToggle, 220);
                    }}
                  >
                    <span
                      className="honeycomb-icon"
                      style={{ background: colors.bg }}
                    >
                      <Icon size={26} color={colors.fg} strokeWidth={1.8} />
                    </span>
                    <span className="honeycomb-tooltip">{ic.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Add / Edit sheet (premium animation, drag‑to‑dismiss) ──────────────── */

function FieldSheet({
  open,
  editingField,
  onClose,
  onSaved,
}: {
  open: boolean;
  editingField: ClientCustomFieldDefinition | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(editingField);
  const [form, setForm] = useState(emptyFieldForm);
  const [keyTouched, setKeyTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openPicker, setOpenPicker] = useState<string | null>(null);

  // ── Autosave (edit mode only) ──────────────────────────────────────────
  type SyncStatus = "idle" | "saving" | "saved" | "error";
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);

  /* ── Lifecycle: keep mounted during exit animation ── */
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const prevOpenRef = useRef(false);

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      /* Opening */
      setVisible(true);
      setClosing(false);
      setOpenPicker(null);
    } else if (!open && prevOpenRef.current && visible) {
      /* Parent requested close (e.g. onSaved) — start exit */
      if (sheetRef.current) sheetRef.current.style.animation = "";
      setClosing(true);
    }
    prevOpenRef.current = open;
  }, [open, visible]);

  /* After exit animation, unmount and notify parent */
  useEffect(() => {
    if (!closing) return;
    const timeout = setTimeout(() => {
      setVisible(false);
      setClosing(false);
      onClose();
    }, 340);
    return () => clearTimeout(timeout);
  }, [closing, onClose]);

  /* ── Background recession ── */
  useEffect(() => {
    const el = document.getElementById("dashboard-scroll-area");
    if (!el) return;
    // Only apply background scale if it's a mobile screen and not closing
    if (visible && !closing && window.innerWidth < 768) {
      el.setAttribute("data-sheet-open", "true");
    } else {
      el.removeAttribute("data-sheet-open");
    }
  }, [visible, closing]);

  /* ── Portal Mounting ── */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const handleClose = useCallback(() => {
    if (closing) return;
    if (sheetRef.current) sheetRef.current.style.animation = "";
    setClosing(true);
    const t = setTimeout(() => {
      setVisible(false);
      setClosing(false);
      onClose();
    }, 340);
    return () => clearTimeout(t);
  }, [closing, onClose]);

  /* ── Drag‑to‑dismiss (mobile, header zone only) ── */
  const dragState = useRef({
    startY: 0,
    currentY: 0,
    dragging: false,
    startTime: 0,
  });

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = {
      startY: e.clientY,
      currentY: e.clientY,
      dragging: true,
      startTime: Date.now(),
    };
    if (sheetRef.current) {
      sheetRef.current.style.animation = "none";
      sheetRef.current.style.transition = "none";
      sheetRef.current.style.willChange = "transform";
    }
    const bgEl = document.getElementById("dashboard-scroll-area");
    if (bgEl && window.innerWidth < 768) {
      bgEl.style.transition = "none";
    }
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current.dragging) return;
    const y = e.clientY;
    const delta = Math.max(0, y - dragState.current.startY);
    dragState.current.currentY = y;
    
    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${delta}px)`;
    }
    
    const progress = Math.min(1, delta / (window.innerHeight * 0.8 || 600));
    if (backdropRef.current) {
      backdropRef.current.style.opacity = String(Math.max(0, 1 - progress));
    }

    const bgEl = document.getElementById("dashboard-scroll-area");
    if (bgEl && window.innerWidth < 768) {
      const scale = 0.974 + (1 - 0.974) * progress;
      const rotateX = 0.8 - (0.8 * progress);
      const transY = -4 + (4 * progress);
      const brightness = 0.9 + (0.1 * progress);
      const radius = 12 - (12 * progress);
      
      bgEl.style.transform = `perspective(1200px) rotateX(${rotateX}deg) scale(${scale}) translateY(${transY}px)`;
      bgEl.style.filter = `brightness(${brightness})`;
      bgEl.style.borderRadius = `${radius}px`;
    }
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragState.current.dragging) return;
    dragState.current.dragging = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const delta = dragState.current.currentY - dragState.current.startY;
    const elapsed = Date.now() - dragState.current.startTime;
    const velocity = (delta / Math.max(elapsed, 1)) * 1000;

    const bgEl = document.getElementById("dashboard-scroll-area");
    if (bgEl && window.innerWidth < 768) {
      // Clear inline styles to let CSS take over the final animation
      bgEl.style.transition = "";
      bgEl.style.transform = "";
      bgEl.style.filter = "";
      bgEl.style.borderRadius = "";
    }

    if (delta > 120 || velocity > 800) {
      /* Dismiss — accelerate out */
      if (sheetRef.current) {
        sheetRef.current.style.transition = "transform 280ms cubic-bezier(0.4, 0, 1, 1)";
        sheetRef.current.style.transform = "translateY(100%)";
      }
      if (backdropRef.current) {
        backdropRef.current.style.transition = "opacity 230ms ease";
        backdropRef.current.style.opacity = "0";
      }
      setClosing(true);
      setTimeout(() => {
        setVisible(false);
        setClosing(false);
        onClose();
      }, 290);
    } else {
      /* Spring back */
      if (sheetRef.current) {
        sheetRef.current.style.transition = "transform 400ms cubic-bezier(0.34, 1.56, 0.64, 1)";
        sheetRef.current.style.transform = "translateY(0)";
      }
      if (backdropRef.current) {
        backdropRef.current.style.transition = "opacity 200ms ease";
        backdropRef.current.style.opacity = "1";
      }
      setTimeout(() => {
        if (sheetRef.current) {
          sheetRef.current.style.transition = "";
          sheetRef.current.style.willChange = "";
          sheetRef.current.style.transform = "";
          // We purposely do NOT reset animation to "" here, otherwise the CSS entrance animation replays!
        }
        if (backdropRef.current) {
          backdropRef.current.style.transition = "";
          backdropRef.current.style.opacity = "";
        }
      }, 420);
    }
  }, [onClose]);

  /* ── Picker toggle (mutex — only one open at a time) ── */
  const togglePicker = useCallback((name: string) => {
    setOpenPicker((prev) => (prev === name ? null : name));
  }, []);

  /* keep form in sync when editingField changes while sheet is open */
  const [prevEditing, setPrevEditing] = useState<string | null>(null);
  if (open && (editingField?._id ?? null) !== prevEditing) {
    setPrevEditing(editingField?._id ?? null);
    // Reset autosave state whenever we switch to a different field
    isFirstRender.current = true;
    setSyncStatus("idle");
    if (autosaveTimer.current) { clearTimeout(autosaveTimer.current); autosaveTimer.current = null; }
    if (savedFadeTimer.current) { clearTimeout(savedFadeTimer.current); savedFadeTimer.current = null; }
    if (editingField) {
      setForm({
        label: editingField.label,
        key: editingField.key,
        type: editingField.type,
        searchable: editingField.searchable,
        required: editingField.required,
        active: editingField.active,
        showInProfile: editingField.showInProfile !== false,
        profilePosition: editingField.profilePosition || "beforeContact",
        icon: editingField.icon || "fileText",
        order: String(editingField.order || ""),
      });
      setKeyTouched(true);
    } else {
      setForm(emptyFieldForm);
      setKeyTouched(false);
    }
  }

  // ── Autosave effect (edit mode only) ────────────────────────────────────
  useEffect(() => {
    // Skip on initial population of the form (first render after open)
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    // Only autosave when editing an existing field
    if (!isEdit || !editingField?._id) return;
    // Don't autosave if label or key are empty
    if (!form.label.trim() || !form.key.trim()) return;

    // Clear any pending timers
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    if (savedFadeTimer.current) clearTimeout(savedFadeTimer.current);

    setSyncStatus("saving");

    autosaveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/client-custom-fields/${editingField._id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (!res.ok) {
          setSyncStatus("error");
          return;
        }
        invalidate("/api/client-custom-fields", "/api/client-custom-fields?includeInactive=1", "/api/clients");
        setSyncStatus("saved");
        // Fade back to idle after 2.5 s
        savedFadeTimer.current = setTimeout(() => setSyncStatus("idle"), 2500);
      } catch {
        setSyncStatus("error");
      }
    }, 800);

    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  const updateLabel = (label: string) => {
    setForm((c) => ({
      ...c,
      label,
      key: isEdit || keyTouched ? c.key : customFieldKeyFromLabel(label),
    }));
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = isEdit ? `/api/client-custom-fields/${editingField!._id}` : "/api/client-custom-fields";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) { toast.error(body?.error || "Failed to save field"); return; }
      toast.success(isEdit ? "Field updated" : "Field added");
      invalidate("/api/client-custom-fields", "/api/client-custom-fields?includeInactive=1", "/api/clients");
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  if (!mounted || !visible) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        className={`field-sheet-backdrop ${closing ? "field-sheet-backdrop--exit" : ""}`}
        onClick={handleClose}
        aria-hidden
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={`field-sheet ${closing ? "field-sheet--exit" : ""}`}
        role="dialog"
        aria-modal
      >
        {/* Drag handle zone — touch target for swipe-to-dismiss (mobile) */}
        <div
          className="field-sheet-drag-zone"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div className="field-sheet-handle" />

          {/* Nav bar */}
          <div className="field-sheet-navbar">
            <button type="button" className="field-sheet-nav-btn" onClick={handleClose}>
              {isEdit ? "Close" : "Cancel"}
            </button>
            <span className="field-sheet-title">
              {isEdit ? "Edit Field" : "New Field"}
            </span>
            {isEdit ? (
              /* ── Autosave sync indicator (edit mode) ── */
              <span className="field-sheet-sync-slot">
                {syncStatus === "saving" && (
                  <span className="sync-chip sync-chip--saving">
                    <span className="sync-spinner" />
                    Saving
                  </span>
                )}
                {syncStatus === "saved" && (
                  <span className="sync-chip sync-chip--saved">
                    <Check size={11} strokeWidth={2.5} />
                    Saved
                  </span>
                )}
                {syncStatus === "error" && (
                  <span className="sync-chip sync-chip--error">
                    <AlertTriangle size={11} strokeWidth={2} />
                    Failed
                  </span>
                )}
              </span>
            ) : (
              /* ── Done button (add mode only) ── */
              <button
                type="button"
                form="field-form"
                className="field-sheet-nav-btn field-sheet-nav-btn--done"
                disabled={saving || !form.label.trim() || !form.key.trim()}
                onClick={save as unknown as React.MouseEventHandler}
              >
                {saving ? "Saving…" : "Done"}
              </button>
            )}
          </div>
        </div>

        {/* Scrollable body — staggered content reveal */}
        <div className={`field-sheet-body ${!closing ? "field-sheet-content-enter" : "field-sheet-content-exit"}`}>
          <form id="field-form" onSubmit={save}>

            {/* Preview */}
            <div className="field-sheet-preview">
              <FieldIconSquare iconKey={form.icon} size={56} />
              <span className="field-sheet-preview-label">
                {form.label || "Field Name"}
              </span>
              <span className="field-sheet-preview-key">
                {form.key || "fieldKey"}
              </span>
            </div>

            {/* Identity */}
            <AppleSection header="IDENTITY">
              <AppleInputRow label="Label">
                <input
                  className="apple-text-input"
                  value={form.label}
                  onChange={(e) => updateLabel(e.target.value)}
                  placeholder="e.g. Legal Name"
                  required
                  autoFocus
                />
              </AppleInputRow>
              <div className="apple-separator" />
              <AppleInputRow label="Key">
                <input
                  className="apple-text-input apple-text-input--mono"
                  value={form.key}
                  onChange={(e) => { setKeyTouched(true); setForm((c) => ({ ...c, key: e.target.value })); }}
                  disabled={isEdit}
                  placeholder="legalName"
                  required
                />
              </AppleInputRow>
            </AppleSection>
            {isEdit && (
              <p className="apple-section-footer" style={{ marginTop: -8 }}>
                Key is fixed after creation — existing values stay linked.
              </p>
            )}

            {/* Appearance — inline pickers replace native selects */}
            <AppleSection header="APPEARANCE">
              <AppleInlinePicker
                label="Type"
                value={form.type}
                options={CLIENT_CUSTOM_FIELD_TYPES}
                onChange={(v) => setForm((c) => ({ ...c, type: v as ClientCustomFieldType }))}
                isOpen={openPicker === "type"}
                onToggle={() => togglePicker("type")}
              />
              <div className="apple-separator" />
              <AppleIconGridPicker
                value={form.icon}
                onChange={(v) => setForm((c) => ({ ...c, icon: v }))}
                isOpen={openPicker === "icon"}
                onToggle={() => togglePicker("icon")}
              />
              <div className="apple-separator" />
              <AppleInlinePicker
                label="Position"
                value={form.profilePosition}
                options={CLIENT_CUSTOM_FIELD_PROFILE_POSITIONS}
                onChange={(v) => setForm((c) => ({ ...c, profilePosition: v as ClientCustomFieldProfilePosition }))}
                isOpen={openPicker === "position"}
                onToggle={() => togglePicker("position")}
              />
              <div className="apple-separator" />
              <AppleInputRow label="Order">
                <input
                  className="apple-text-input apple-text-input--mono apple-text-input--right"
                  type="number"
                  value={form.order}
                  onChange={(e) => setForm((c) => ({ ...c, order: e.target.value }))}
                  placeholder="Auto"
                />
              </AppleInputRow>
            </AppleSection>

            {/* Options */}
            <AppleSection header="OPTIONS">
              <AppleToggle
                checked={form.searchable}
                onChange={(v) => setForm((c) => ({ ...c, searchable: v }))}
                label="Searchable"
                subtitle="Appear in client search results"
              />
              <div className="apple-separator" />
              <AppleToggle
                checked={form.required}
                onChange={(v) => setForm((c) => ({ ...c, required: v }))}
                label="Required"
                subtitle="Must be filled in when creating a client"
              />
              <div className="apple-separator" />
              <AppleToggle
                checked={form.active}
                onChange={(v) => setForm((c) => ({ ...c, active: v }))}
                label="Active"
                subtitle="Show in forms and exports"
              />
              <div className="apple-separator" />
              <AppleToggle
                checked={form.showInProfile}
                onChange={(v) => setForm((c) => ({ ...c, showInProfile: v }))}
                label="Show in Profile"
                subtitle="Display on client profile page"
              />
            </AppleSection>

          </form>
        </div>
      </div>
    </>,
    document.body
  );
}

/* ─── Main panel ─────────────────────────────────────────────────────────── */

export default function CustomFieldsPanel() {
  const [sheet, setSheet] = useState<Sheet>("none");
  const [editingField, setEditingField] = useState<ClientCustomFieldDefinition | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>(closedConfirm);
  const [permDeleteLoading, setPermDeleteLoading] = useState(false);

  const { data: fields = [], loading, refetch } = useCache<ClientCustomFieldDefinition[]>(
    "/api/client-custom-fields?includeInactive=1",
    { initialData: [] },
  );

  const openAdd = () => { setEditingField(null); setSheet("add"); };
  const openEdit = (f: ClientCustomFieldDefinition) => { setEditingField(f); setSheet("edit"); };
  const closeSheet = () => { setSheet("none"); setEditingField(null); };
  const onSaved = () => { closeSheet(); refetch(); };

  const disableField = (f: ClientCustomFieldDefinition) => {
    if (!f._id) return;
    setConfirmState({
      open: true,
      title: `Disable "${f.label}"?`,
      description: "The field will be hidden from forms and profiles.",
      note: "Existing values stay saved and can be restored by re-enabling the field.",
      confirmLabel: "Disable",
      variant: "warning",
      onConfirm: async () => {
        const res = await fetch(`/api/client-custom-fields/${f._id}`, { method: "DELETE" });
        if (!res.ok) { toast.error("Failed to disable field"); return; }
        toast.success("Field disabled");
        invalidate("/api/client-custom-fields", "/api/client-custom-fields?includeInactive=1", "/api/clients");
        refetch();
        setConfirmState(closedConfirm);
      },
    });
  };

  const enableField = async (f: ClientCustomFieldDefinition) => {
    if (!f._id) return;
    const res = await fetch(`/api/client-custom-fields/${f._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: true }),
    });
    if (!res.ok) { toast.error("Failed to enable field"); return; }
    toast.success(`"${f.label}" re-enabled`);
    invalidate("/api/client-custom-fields", "/api/client-custom-fields?includeInactive=1", "/api/clients");
    refetch();
  };

  const permanentDelete = async (f: ClientCustomFieldDefinition) => {
    if (!f._id) return;
    setPermDeleteLoading(true);
    try {
      const res = await fetch(`/api/client-custom-fields/${f._id}?affectedCount=1`);
      const data = res.ok ? await res.json() : { count: 0 };
      const count: number = data.count ?? 0;
      setConfirmState({
        open: true,
        title: `Permanently delete "${f.label}"?`,
        description:
          count > 0
            ? `This will delete the field and remove its data from ${count} client${count !== 1 ? "s" : ""}.`
            : "This will permanently delete the field definition. No client data will be affected.",
        note: count > 0 ? "All stored values will be wiped from the database immediately." : undefined,
        confirmLabel: "Delete Permanently",
        confirmText: f.key,
        variant: "danger",
        onConfirm: async () => {
          const r = await fetch(`/api/client-custom-fields/${f._id}?permanent=1`, { method: "DELETE" });
          if (!r.ok) { toast.error("Failed to delete field"); return; }
          toast.success(`"${f.label}" permanently deleted`);
          invalidate("/api/client-custom-fields", "/api/client-custom-fields?includeInactive=1", "/api/clients");
          refetch();
          setConfirmState(closedConfirm);
        },
      });
    } finally {
      setPermDeleteLoading(false);
    }
  };

  const active = fields.filter((f) => f.active);
  const inactive = fields.filter((f) => !f.active);

  return (
    <>
      <style>{appleStyles}</style>

      <div className="apple-page">

        {/* ── Active fields ── */}
        <AppleSection
          header="CUSTOM FIELDS"
          footer={
            active.length === 0 && !loading
              ? 'No custom fields yet. Tap "Add Field" to create one.'
              : "Custom fields appear on client forms and profile pages."
          }
        >
          {loading && (
            <div className="apple-loading-row">
              <span className="apple-spinner" />
              <span>Loading…</span>
            </div>
          )}

          {!loading && active.length === 0 && (
            <div className="apple-empty-row">
              <Info size={16} className="apple-empty-icon" />
              <span>No active fields</span>
            </div>
          )}

          {active.map((f, i) => (
            <div key={f._id || f.key}>
              {i > 0 && <div className="apple-separator" />}
              <FieldRow
                field={f}
                onEdit={() => openEdit(f)}
                onDisable={() => disableField(f)}
                onDelete={() => permanentDelete(f)}
                permDeleteLoading={permDeleteLoading}
              />
            </div>
          ))}

          {/* Add row */}
          <div className="apple-separator" />
          <AppleRow
            icon={Plus}
            iconBg="#007AFF"
            label="Add Field"
            chevron
            onClick={openAdd}
          />
        </AppleSection>

        {/* ── Disabled fields ── */}
        {inactive.length > 0 && (
          <AppleSection
            header="DISABLED FIELDS"
            footer="Disabled fields are hidden from forms. Their data is preserved."
          >
            {inactive.map((f, i) => (
              <div key={f._id || f.key}>
                {i > 0 && <div className="apple-separator" />}
                <FieldRow
                  field={f}
                  onEdit={() => openEdit(f)}
                  onEnable={() => enableField(f)}
                  onDelete={() => permanentDelete(f)}
                  permDeleteLoading={permDeleteLoading}
                />
              </div>
            ))}
          </AppleSection>
        )}

      </div>

      {/* ── Sheet ── */}
      <FieldSheet
        open={sheet !== "none"}
        editingField={editingField}
        onClose={closeSheet}
        onSaved={onSaved}
      />

      {/* ── Confirm modal ── */}
      <ConfirmModal
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        note={confirmState.note}
        confirmLabel={confirmState.confirmLabel ?? "Confirm"}
        confirmText={confirmState.confirmText}
        variant={confirmState.variant ?? "danger"}
        onConfirm={confirmState.onConfirm}
        onClose={() => setConfirmState(closedConfirm)}
      />
    </>
  );
}

/* ─── Field row ──────────────────────────────────────────────────────────── */

function FieldRow({
  field,
  onEdit,
  onDisable,
  onEnable,
  onDelete,
  permDeleteLoading,
}: {
  field: ClientCustomFieldDefinition;
  onEdit: () => void;
  onDisable?: () => void;
  onEnable?: () => void;
  onDelete: () => void;
  permDeleteLoading: boolean;
}) {
  const subtitleParts = [
    field.type.charAt(0).toUpperCase() + field.type.slice(1),
    field.searchable ? "Searchable" : null,
    field.required ? "Required" : null,
    field.showInProfile !== false ? "In Profile" : null,
  ].filter(Boolean);

  return (
    <div className={`apple-field-row ${!field.active ? "apple-field-row--inactive" : ""}`}>
      {/* Left: icon + text */}
      <button type="button" className="apple-field-row-main" onClick={onEdit}>
        <FieldIconSquare iconKey={field.icon || "fileText"} size={32} />
        <span className="apple-field-row-text">
          <span className="apple-field-row-label">{field.label}</span>
          <span className="apple-field-row-meta">
            <span className="apple-field-key">{field.key}</span>
            {subtitleParts.length > 0 && (
              <span className="apple-field-row-dots">·</span>
            )}
            <span className="apple-field-meta-tail">{subtitleParts.join(" · ")}</span>
          </span>
        </span>
        <ChevronRight size={16} className="apple-row-chevron" />
      </button>

      {/* Right: quick actions */}
      <div className="apple-field-row-actions">
        {/* iOS-style toggle — same pill as the sheet form */}
        <span
          role="switch"
          aria-checked={field.active}
          title={field.active ? "Disable field" : "Re-enable field"}
          tabIndex={0}
          className={`apple-toggle apple-field-row-toggle ${field.active ? "apple-toggle--on" : ""}`}
          onClick={field.active ? onDisable : onEnable}
          onKeyDown={(e) => e.key === " " && (field.active ? onDisable?.() : onEnable?.())}
        >
          <span className="apple-toggle-thumb" />
        </span>
        <button
          type="button"
          title="Delete permanently"
          onClick={onDelete}
          disabled={permDeleteLoading}
          className="apple-action-btn apple-action-btn--danger"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────────────── */

const appleStyles = `
/* ── Page ── */
.apple-page {
  background: var(--color-surface);
  min-height: 100%;
  padding: 16px 0 40px;
  /* bleed out of the SettingsShell mobile wrapper padding (px-3 pt-3 pb-6) */
  margin: -12px -12px -24px;
}

/* ── Section ── */
.apple-section {
  margin: 0 0 10px;
}
.apple-section-header {
  font-size: 12px;
  font-weight: 400;
  color: var(--color-text-faint);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0 20px 6px;
  margin: 0;
}
.apple-section-footer {
  font-size: 12px;
  color: var(--color-text-faint);
  padding: 6px 20px 0;
  line-height: 1.5;
  margin: 0;
}

/* ── Card ── */
.apple-card {
  background: var(--color-card);
  border-top: 0.5px solid var(--color-border);
  border-bottom: 0.5px solid var(--color-border);
  overflow: hidden;
}

/* ── Separator ── */
.apple-separator {
  height: 0.5px;
  background: var(--color-border);
  margin-left: 54px;
}

/* ── Row base ── */
.apple-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 16px;
  background: transparent;
  border: none;
  width: 100%;
  text-align: left;
  cursor: default;
  min-height: 44px;
  box-sizing: border-box;
}
.apple-row--interactive {
  cursor: pointer;
}
.apple-row--interactive:active {
  background: var(--color-hover);
}
.apple-row--destructive .apple-row-label { color: #FF3B30 !important; }
.apple-row--disabled { opacity: 0.4; pointer-events: none; }

/* ── Row icon (colored square) ── */
.apple-row-icon {
  width: 29px;
  height: 29px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* ── Row content ── */
.apple-row-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.apple-row-label-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}
.apple-row-label {
  font-size: 15px;
  font-weight: 400;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.apple-row-subtitle {
  font-size: 12px;
  color: var(--color-text-faint);
  line-height: 1.3;
}
.apple-row-value {
  font-size: 15px;
  color: var(--color-text-faint);
  flex-shrink: 0;
  white-space: nowrap;
}
.apple-row-chevron {
  color: var(--color-text-faint);
  opacity: 0.5;
  flex-shrink: 0;
}

/* ── Toggle switch ── */
.apple-toggle-row {
  cursor: pointer;
}
.apple-toggle {
  width: 51px;
  height: 31px;
  border-radius: 16px;
  background: #E5E5EA;
  position: relative;
  transition: background 0.25s;
  cursor: pointer;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
}
.dark .apple-toggle {
  background: #3A3A3C;
}
.apple-toggle--on {
  background: #34C759;
}
.dark .apple-toggle--on {
  background: #30D158;
}
.apple-toggle-thumb {
  position: absolute;
  left: 2px;
  width: 27px;
  height: 27px;
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 2px 6px rgba(0,0,0,0.30), 0 1px 3px rgba(0,0,0,0.15);
  transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1);
}
.apple-toggle--on .apple-toggle-thumb {
  transform: translateX(20px);
}

/* ── Input rows (inside sheets / forms) ── */
.apple-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 16px;
  min-height: 44px;
  background: transparent;
}
.apple-input-label {
  font-size: 15px;
  color: var(--color-text);
  flex-shrink: 0;
  min-width: 120px;
}
.apple-input-value {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.apple-text-input {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  color: var(--color-text);
  background: transparent;
  border: none;
  outline: none;
  text-align: right;
  padding: 0;
  -webkit-appearance: none;
}
.apple-text-input--mono {
  font-family: ui-monospace, 'JetBrains Mono', monospace;
  font-size: 13px;
}
.apple-text-input--right {
  text-align: right;
}
.apple-text-input::placeholder {
  color: var(--color-text-faint);
  opacity: 0.6;
}
.apple-text-input:disabled {
  color: var(--color-text-faint);
}

/* ── Loading / empty ── */
.apple-loading-row,
.apple-empty-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px;
  font-size: 14px;
  color: var(--color-text-faint);
}
.apple-empty-icon { opacity: 0.5; }
.apple-spinner {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--color-border);
  border-top-color: #007AFF;
  animation: apple-spin 0.7s linear infinite;
}
@keyframes apple-spin { to { transform: rotate(360deg); } }

/* ── Field row ── */
.apple-field-row {
  display: flex;
  align-items: center;
  background: transparent;
}
.apple-field-row--inactive {
  opacity: 0.55;
}
.apple-field-row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0 10px 16px;
  background: transparent;
  border: none;
  text-align: left;
  cursor: pointer;
  min-height: 52px;
}
.apple-field-row-main:active {
  background: var(--color-hover);
}
.apple-field-row-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.apple-field-row-label {
  font-size: 15px;
  color: var(--color-text);
  font-weight: 400;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.apple-field-row-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}
.apple-field-key {
  font-family: ui-monospace, 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--color-text-muted);
}
.apple-field-row-dots {
  font-size: 11px;
  color: var(--color-text-faint);
}
.apple-field-meta-tail {
  font-size: 11px;
  color: var(--color-text-faint);
}
.apple-field-row-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-right: 14px;
  padding-left: 6px;
  flex-shrink: 0;
}
/* Row toggle — same pill, no extra sizing needed; just a cursor tweak */
.apple-field-row-toggle {
  cursor: pointer;
  outline: none;
}
.apple-field-row-toggle:focus-visible {
  box-shadow: 0 0 0 3px rgba(0,122,255,0.35);
}

.apple-action-btn {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: opacity 0.15s;
  flex-shrink: 0;
}
.apple-action-btn:active { opacity: 0.65; }
.apple-action-btn:disabled { opacity: 0.3; cursor: not-allowed; }
/* Action button colours use semi-transparent tints so they adapt to both modes */
.apple-action-btn--warn {
  background: rgba(255, 149, 0, 0.12);
  color: #FF9500;
}
.dark .apple-action-btn--warn {
  background: rgba(255, 159, 10, 0.15);
  color: #FF9F0A;
}
.apple-action-btn--enable {
  background: rgba(52, 199, 89, 0.12);
  color: #34C759;
}
.dark .apple-action-btn--enable {
  background: rgba(48, 209, 88, 0.15);
  color: #30D158;
}
.apple-action-btn--danger {
  background: transparent;
  color: #FF3B30;
  border-radius: 0;
  width: 36px;
  height: 44px;
}
.dark .apple-action-btn--danger {
  background: transparent;
  color: #FF453A;
}
.apple-action-btn--danger:active {
  opacity: 0.4;
}

/* ══════════════════════════════════════════════════════════════════════════
   SHEET — premium animations (mobile slide-up, desktop slide-right)
   ══════════════════════════════════════════════════════════════════════════ */

/* ── Backdrop ── */
.field-sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 55;
  background: rgba(0,0,0,0.4);
  animation: sheet-backdrop-in 220ms ease forwards;
}
.field-sheet-backdrop--exit {
  animation: sheet-backdrop-out 260ms ease forwards;
}
@keyframes sheet-backdrop-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes sheet-backdrop-out {
  from { opacity: 1; }
  to   { opacity: 0; }
}

/* ── Sheet (mobile default: slide up from bottom) ── */
.field-sheet {
  position: fixed;
  top: 44px;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 60;
  background: var(--color-surface);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 20px 20px 0 0;
  box-shadow: 0 -4px 24px rgba(0,0,0,0.15);
  /* iOS critically-damped spring — no overshoot */
  animation: sheet-mobile-in 380ms cubic-bezier(0.32, 0.72, 0, 1) forwards;
  will-change: transform;
}
.dark .field-sheet {
  box-shadow: 0 -4px 24px rgba(0,0,0,0.5);
  border-top: 0.5px solid var(--color-border);
}
.field-sheet--exit {
  /* Gravity-accelerated exit — feels like the sheet falls away */
  animation: sheet-mobile-out 280ms cubic-bezier(0.4, 0, 1, 1) forwards;
  pointer-events: none;
}
@keyframes sheet-mobile-in {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
@keyframes sheet-mobile-out {
  from { transform: translateY(0); }
  to   { transform: translateY(100%); }
}

/* ── Drag handle zone ── */
.field-sheet-drag-zone {
  flex-shrink: 0;
  touch-action: none;
}
.field-sheet-handle {
  width: 36px;
  height: 5px;
  border-radius: 2.5px;
  background: rgba(0,0,0,0.18);
  margin: 8px auto 0;
  transition: transform 0.15s ease, background 0.15s ease;
}
.dark .field-sheet-handle {
  background: rgba(255,255,255,0.25);
}
.field-sheet-drag-zone:active .field-sheet-handle {
  transform: scaleY(1.3) scaleX(0.95);
  background: rgba(0,0,0,0.35);
}
.dark .field-sheet-drag-zone:active .field-sheet-handle {
  background: rgba(255,255,255,0.45);
}

/* ── Background Recession (applies to page content behind portal) ── */
#dashboard-scroll-area[data-sheet-open="true"] {
  transform: perspective(1200px) rotateX(0.8deg) scale(0.974) translateY(-4px);
  transform-style: preserve-3d;
  transform-origin: 50% 100%;
  border-radius: 12px;
  overflow: hidden;
  filter: brightness(0.9);
  transition:
    transform 380ms cubic-bezier(0.32, 0.72, 0, 1),
    filter 380ms cubic-bezier(0.32, 0.72, 0, 1),
    border-radius 380ms cubic-bezier(0.32, 0.72, 0, 1);
}
#dashboard-scroll-area {
  transform-origin: 50% 100%;
  transition:
    transform 280ms cubic-bezier(0.4, 0, 0.6, 1),
    filter 280ms cubic-bezier(0.4, 0, 0.6, 1),
    border-radius 280ms cubic-bezier(0.4, 0, 0.6, 1);
}

/* ── Staggered content reveal ── */
.field-sheet-content-enter {
  animation: sheet-content-in 280ms ease 60ms both;
}
.field-sheet-content-exit {
  animation: sheet-content-out 150ms ease forwards;
}
@keyframes sheet-content-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes sheet-content-out {
  from { opacity: 1; }
  to   { opacity: 0.4; }
}

/* ── Sheet nav bar ── */
.field-sheet-navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px 12px;
  flex-shrink: 0;
}
.field-sheet-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text);
}
.field-sheet-nav-btn {
  font-size: 15px;
  color: #007AFF;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px 0;
  min-width: 60px;
}
.field-sheet-nav-btn--done {
  font-weight: 600;
  text-align: right;
}
.field-sheet-nav-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* ── Sync indicator (edit mode navbar) ── */
.field-sheet-sync-slot {
  min-width: 60px;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  height: 28px;
}
.sync-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  padding: 3px 9px 3px 7px;
  border-radius: 20px;
  line-height: 1;
  white-space: nowrap;
  animation: sync-chip-in 0.18s cubic-bezier(0.34, 1.4, 0.64, 1) both;
}
@keyframes sync-chip-in {
  from { opacity: 0; transform: scale(0.80) translateY(3px); }
  to   { opacity: 1; transform: scale(1)   translateY(0); }
}
.sync-chip--saving {
  background: color-mix(in srgb, #007AFF 12%, transparent);
  color: #007AFF;
}
.sync-chip--saved {
  background: color-mix(in srgb, #34C759 14%, transparent);
  color: #1a9c3e;
  animation: sync-chip-in 0.18s cubic-bezier(0.34, 1.4, 0.64, 1) both,
             sync-chip-fade 0.4s ease 2.1s forwards;
}
@keyframes sync-chip-fade {
  from { opacity: 1; }
  to   { opacity: 0; transform: scale(0.88); }
}
.sync-chip--error {
  background: color-mix(in srgb, #FF3B30 12%, transparent);
  color: #FF3B30;
}
.sync-spinner {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1.5px solid currentColor;
  border-top-color: transparent;
  animation: sync-spin 0.7s linear infinite;
  flex-shrink: 0;
}
@keyframes sync-spin {
  to { transform: rotate(360deg); }
}

/* ── Sheet body ── */
.field-sheet-body {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: env(safe-area-inset-bottom, 20px);
}

/* ── Field preview ── */
.field-sheet-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 28px 20px 20px;
  background: var(--color-surface);
}
.field-sheet-preview-label {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text);
  text-align: center;
}
.field-sheet-preview-key {
  font-family: ui-monospace, 'JetBrains Mono', monospace;
  font-size: 13px;
  color: var(--color-text-faint);
}

/* ══════════════════════════════════════════════════════════════════════════
   INLINE PICKER — expansion animation
   ══════════════════════════════════════════════════════════════════════════ */

.apple-picker-container {
  overflow: hidden;
}
.apple-picker-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 16px;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
}

.apple-picker-trigger:active {
  background: var(--color-hover);
}
.apple-picker-value {
  font-size: 15px;
  color: var(--color-text-muted);
}
.apple-picker-value-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6.5px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.2);
  margin-right: 8px;
}
.apple-picker-chevron {
  color: var(--color-text-faint);
  opacity: 0.5;
  flex-shrink: 0;
  transition: transform 280ms cubic-bezier(0.4, 0, 0.2, 1);
}
.apple-picker-chevron--open {
  transform: rotate(90deg);
  opacity: 0.7;
}

/* Expandable options panel */
.apple-picker-options {
  max-height: 0;
  overflow: hidden;
  opacity: 0;
  transition: max-height 300ms cubic-bezier(0.4, 0, 0.2, 1),
              opacity 220ms ease;
  background: transparent;
}
.apple-picker-options--open {
  max-height: 360px;
  opacity: 1;
  overflow: visible; /* Allow tooltip + scaled icons to escape bounds */
}
.apple-picker-list {
  padding: 0;
}
.apple-picker-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 16px 11px 54px;
  background: transparent;
  border: none;
  width: 100%;
  text-align: left;
  cursor: pointer;
  min-height: 44px;
  transition: background 150ms ease;
  position: relative;
}
.apple-picker-option:not(:last-child)::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 54px;
  right: 0;
  height: 0.5px;
  background: var(--color-border);
}
.apple-picker-option:active {
  background: rgba(0,0,0,0.04);
}
.dark .apple-picker-option:active {
  background: rgba(255,255,255,0.06);
}
.apple-picker-option-label {
  flex: 1;
  font-size: 15px;
  color: var(--color-text);
}
.apple-picker-option--selected .apple-picker-option-label {
  color: #007AFF;
  font-weight: 400;
}
.apple-picker-check {
  flex-shrink: 0;
}

/* ══════════════════════════════════════════════════════════════════════════
   APPLE WATCH HONEYCOMB PICKER
   ══════════════════════════════════════════════════════════════════════════ */

.apple-honeycomb-grid {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 52px 32px 36px;
  gap: 8px;
  overflow: visible;
}

/* Honeycomb rows — NO transform on rows (avoids stacking context traps) */
.honeycomb-row {
  display: flex;
  justify-content: center;
  gap: 12px;
  position: relative; /* Allow z-index to work */
}
.honeycomb-row:nth-child(even) {
  padding-left: 60px; /* Offset without creating stacking context */
}

.honeycomb-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  border-radius: 50%;
  will-change: transform;
  outline: none;
  transform-origin: center center;
  -webkit-tap-highlight-color: transparent;
}

/* Legacy hover & active removed; all physical interactions handled perfectly by JS physics loop */

.honeycomb-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  position: relative;
  z-index: 1;
  box-shadow: 0 4px 10px rgba(0,0,0,0.12);
  /* JS animates box-shadow and filter continuously */
}

.honeycomb-icon::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0) 40%, rgba(0,0,0,0.1) 100%);
  pointer-events: none;
  box-shadow: inset 0 1px 1px rgba(255,255,255,0.4), inset 0 -1.5px 2px rgba(0,0,0,0.15);
}

/* Premium Selected State — Sleek gap ring */
.honeycomb-item--selected {
  z-index: 5;
}
.honeycomb-item--selected::after {
  content: "";
  position: absolute;
  inset: -6px;
  border-radius: 50%;
  border: 2px solid #007AFF;
  pointer-events: none;
  opacity: 1;
  animation: selection-pop 300ms cubic-bezier(0.32, 0.72, 0, 1);
}
.dark .honeycomb-item--selected::after {
  border-color: #0A84FF;
}

@keyframes selection-pop {
  0% { transform: scale(0.8); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

/* ── Minimal Micro-Label (JS-driven opacity & transform) ── */
.honeycomb-tooltip {
  position: absolute;
  top: -36px;
  left: 50%;
  white-space: nowrap;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(16px) saturate(1.4);
  -webkit-backdrop-filter: blur(16px) saturate(1.4);
  color: rgba(255, 255, 255, 0.92);
  padding: 4px 10px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.2px;
  pointer-events: none;
  z-index: 9999;
  border: 0.5px solid rgba(255,255,255,0.12);
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  opacity: 0;
  transform: translateX(-50%) translateY(8px) scale(0.9);
}
.dark .honeycomb-tooltip {
  background: rgba(255, 255, 255, 0.78);
  color: rgba(0, 0, 0, 0.85);
  border: 0.5px solid rgba(0,0,0,0.08);
  box-shadow: 0 4px 12px rgba(0,0,0,0.12);
}

/* ══════════════════════════════════════════════════════════════════════════
   DESKTOP / iPad (md+)
   ══════════════════════════════════════════════════════════════════════════ */

@media (min-width: 768px) {
  .apple-page {
    padding: 28px 0 48px;
    margin: -24px -28px -40px;
  }
  .apple-section-header {
    padding-left: 16px;
  }
  .apple-section-footer {
    padding-left: 16px;
  }
  .apple-card {
    border-radius: 12px;
    border: 0.5px solid var(--color-border);
    margin: 0 16px;
  }

  /* Desktop backdrop — frosted */
  .field-sheet-backdrop {
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    background: rgba(0,0,0,0.3);
  }

  /* Desktop sheet — right side panel, 480px */
  .field-sheet {
    inset: auto 0 0 auto;
    width: min(480px, 100vw);
    height: 100dvh;
    border-radius: 12px 0 0 12px;
    animation: sheet-desktop-in 320ms cubic-bezier(0.32, 0.72, 0, 1) forwards;
  }
  .field-sheet--exit {
    animation: sheet-desktop-out 260ms cubic-bezier(0.4, 0, 1, 1) forwards;
  }
  @keyframes sheet-desktop-in {
    from {
      transform: translateX(100%);
      box-shadow: none;
    }
    to {
      transform: translateX(0);
      box-shadow: -4px 0 40px rgba(0,0,0,0.18);
    }
  }
  @keyframes sheet-desktop-out {
    from {
      transform: translateX(0);
      box-shadow: -4px 0 40px rgba(0,0,0,0.18);
    }
    to {
      transform: translateX(100%);
      box-shadow: none;
    }
  }

  /* Hide drag handle on desktop */
  .field-sheet-handle {
    display: none;
  }
  .field-sheet-drag-zone {
    touch-action: auto;
  }

  /* Desktop navbar gets bottom border */
  .field-sheet-navbar {
    background: var(--color-card);
    border-bottom: 0.5px solid var(--color-border);
    padding: 12px 16px;
  }

  .apple-separator { margin-left: 58px; }
}

/* ══════════════════════════════════════════════════════════════════════════
   REDUCED MOTION — instant transitions for accessibility
   ══════════════════════════════════════════════════════════════════════════ */

@media (prefers-reduced-motion: reduce) {
  .field-sheet,
  .field-sheet--exit {
    animation-duration: 1ms !important;
  }
  .field-sheet-backdrop,
  .field-sheet-backdrop--exit {
    animation-duration: 1ms !important;
  }
  .field-sheet-content-enter,
  .field-sheet-content-exit {
    animation-duration: 1ms !important;
    animation-delay: 0ms !important;
  }
  .apple-picker-options {
    transition-duration: 1ms !important;
  }
  .apple-picker-chevron {
    transition-duration: 1ms !important;
  }
  .apple-icon-grid-item {
    transition-duration: 1ms !important;
  }
  .apple-toggle-thumb {
    transition-duration: 1ms !important;
  }
  /* New Watch animations — disable instantly */
  .honeycomb-item--entering,
  .honeycomb-item--tapped {
    animation: none !important;
  }
  .honeycomb-item {
    transition: none !important;
  }
}
`
