import type { CSSProperties, HTMLAttributes } from "react";

/** Keep progressive bands as siblings rather than nesting backdrop roots. */
export function GlassScrollEdge({
  edge,
  size,
  className = "",
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & { edge: "top" | "bottom"; size?: number }) {
  return (
    <div
      {...props}
      aria-hidden="true"
      className={`glass-scroll-edge ${className}`}
      data-edge={edge}
      style={
        {
          ...style,
          ...(size === undefined
            ? {}
            : { "--optical-transition": `${size}px` }),
        } as CSSProperties
      }
    >
      <i />
      <i />
      <i />
    </div>
  );
}
