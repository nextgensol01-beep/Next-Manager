import { notFound } from "next/navigation";
import GlassLab from "./GlassLab";

export default function LiquidGlassDemoPage() {
  if (
    process.env.NODE_ENV !== "development" &&
    process.env.LIQUID_GLASS_LAB_ENABLED !== "1"
  )
    notFound();
  return <GlassLab />;
}
