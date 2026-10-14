// Logical seconds shared by the droplet, receiving pill, and canonical navigation.
export const STYLE_HANDOFF = { detach: .1, arrival: .3, advance: .34, finish: .65 } as const;
// Temporarily increase only the development multiplier for frame-by-frame inspection.
const DEVELOPMENT_SPEED_MULTIPLIER = 1;
export const styleTransitionDuration = (seconds: number) => seconds *
  (process.env.NODE_ENV === "development" ? DEVELOPMENT_SPEED_MULTIPLIER : 1);

export type HandoffPoint = { x: number; y: number };
export type HandoffGeometry = { start: HandoffPoint; control: HandoffPoint; end: HandoffPoint };
type Bounds = { left: number; top: number; width: number; height: number };

/** Convert viewport bounds to the editor's local coordinates, including modal scale. */
export function measureStyleHandoff(tile: Bounds, pill: Bounds, container: Bounds, width: number, height: number): HandoffGeometry {
  const scaleX = container.width / (width || container.width) || 1;
  const scaleY = container.height / (height || container.height) || 1;
  const start = { x: (tile.left + tile.width * .5 - container.left) / scaleX, y: (tile.top + tile.height * .16 - container.top) / scaleY };
  const end = { x: (pill.left + pill.width * .5 - container.left) / scaleX, y: (pill.top + pill.height * .78 - container.top) / scaleY };
  // Rise out of the surface before bending inward toward the pill, from either side.
  const control = { x: start.x + (end.x - start.x) * .2, y: start.y + (end.y - start.y) * .72 };
  return { start, control, end };
}

export function handoffPoint(path: HandoffGeometry, progress: number): HandoffPoint {
  const t = Math.max(0, Math.min(1, progress));
  const eased = t * t * (3 - 2 * t);
  const inverse = 1 - eased;
  return {
    x: inverse * inverse * path.start.x + 2 * inverse * eased * path.control.x + eased * eased * path.end.x,
    y: inverse * inverse * path.start.y + 2 * inverse * eased * path.control.y + eased * eased * path.end.y,
  };
}

export function handoffReceive(elapsed: number): number {
  if (elapsed < STYLE_HANDOFF.arrival || elapsed >= .44) return 0;
  return elapsed < STYLE_HANDOFF.advance
    ? (elapsed - STYLE_HANDOFF.arrival) / (STYLE_HANDOFF.advance - STYLE_HANDOFF.arrival)
    : 1 - (elapsed - STYLE_HANDOFF.advance) / (.44 - STYLE_HANDOFF.advance);
}
