"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

// Matches the dye simulation in the Email Updates stepper. Keep the email workflow independent.
export type FluidLayerHandle = {
  disturb: (x: number, y: number, velocityX: number, velocityY: number) => void;
};

type FluidDyeCloud = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  aspect: number;
  phase: number;
  hue: [number, number, number];
  spin: number;
};

/** A small canvas draws six independent dye clouds. */
const ReportStepFluidLayer = forwardRef<FluidLayerHandle, {
  active: boolean;
  reduceMotion: boolean;
}>(function ReportStepFluidLayer({ active, reduceMotion }, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeRef = useRef(active);
  const releasedAtRef = useRef(0);
  const settlingRef = useRef(false);
  const resumeRef = useRef<() => void>(() => undefined);
  const simulationRef = useRef<{
    width: number;
    height: number;
    clouds: FluidDyeCloud[];
    lastFrame: number;
    lastInput: number;
  } | null>(null);
  const [settling, setSettling] = useState(false);

  useEffect(() => {
    activeRef.current = active;
    if (!active) releasedAtRef.current = performance.now();
    if (active) {
      settlingRef.current = true;
      setSettling(true);
      resumeRef.current();
    }
  }, [active]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    let frame = 0;
    let running = false;
    let destroyed = false;
    const now = () => performance.now();

    const createClouds = (width: number, height: number): FluidDyeCloud[] => {
      const colors: [number, number, number][] = [
        [137, 92, 246],
        [62, 130, 246],
        [44, 199, 232],
        [220, 99, 212],
        [104, 114, 255],
        [173, 93, 238],
      ];
      const positions = [
        [0.16, 0.68], [0.34, 0.31], [0.57, 0.72],
        [0.78, 0.34], [0.90, 0.66], [0.49, 0.46],
      ];
      return colors.map((hue, index) => ({
        x: width * positions[index][0],
        y: height * positions[index][1],
        vx: 0,
        vy: 0,
        radius: Math.max(height * (0.64 + (index % 3) * 0.1), 24),
        aspect: 0.82 + (index % 3) * 0.16,
        phase: index * 1.71,
        hue,
        spin: index % 2 ? 1 : -1,
      }));
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      simulationRef.current = {
        width: rect.width,
        height: rect.height,
        clouds: createClouds(rect.width, rect.height),
        lastFrame: now(),
        lastInput: 0,
      };
      draw(true);
    };

    const draw = (isStatic = false) => {
      const simulation = simulationRef.current;
      if (!simulation) return;
      const { width, height, clouds } = simulation;
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "screen";

      clouds.forEach((cloud) => {
        const speed = Math.min(1.8, Math.hypot(cloud.vx, cloud.vy));
        const stretch = 1 + speed * 0.4;
        const angle = Math.atan2(cloud.vy, cloud.vx || 0.0001) + cloud.spin * 0.12;
        const radius = cloud.radius * stretch;
        const alpha = isStatic ? 0.12 : 0.15 + Math.min(0.09, speed * 0.06);
        const gradient = context.createRadialGradient(cloud.x, cloud.y, radius * 0.08, cloud.x, cloud.y, radius);
        gradient.addColorStop(0, `rgba(${cloud.hue[0]}, ${cloud.hue[1]}, ${cloud.hue[2]}, ${alpha})`);
        gradient.addColorStop(0.46, `rgba(${cloud.hue[0]}, ${cloud.hue[1]}, ${cloud.hue[2]}, ${alpha * 0.52})`);
        gradient.addColorStop(1, `rgba(${cloud.hue[0]}, ${cloud.hue[1]}, ${cloud.hue[2]}, 0)`);
        context.save();
        context.translate(cloud.x, cloud.y);
        context.rotate(angle);
        context.scale(1, cloud.aspect);
        context.translate(-cloud.x, -cloud.y);
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(cloud.x, cloud.y, radius, 0, Math.PI * 2);
        context.fill();
        context.restore();
      });
      context.globalCompositeOperation = "source-over";
    };

    const advance = (timestamp: number) => {
      const simulation = simulationRef.current;
      if (!simulation || destroyed) return;
      const elapsed = Math.min(34, Math.max(8, timestamp - simulation.lastFrame));
      simulation.lastFrame = timestamp;
      const step = elapsed / 16.67;
      const ambient = activeRef.current ? 1 : 0;
      let energy = 0;

      simulation.clouds.forEach((cloud, index) => {
        const ambientX = Math.sin(timestamp * 0.00075 + cloud.phase) * 0.010 * ambient;
        const ambientY = Math.cos(timestamp * 0.00062 + cloud.phase * 1.34) * 0.008 * ambient;
        const centerX = simulation.width * (0.48 + Math.sin(cloud.phase) * 0.16);
        const centerY = simulation.height * (0.5 + Math.cos(cloud.phase * 1.4) * 0.12);
        const curl = Math.sin(timestamp * 0.0011 + index * 1.9) * 0.003 * cloud.spin;
        const recovery = activeRef.current ? 1 : 0.12;
        cloud.vx += (ambientX + (centerX - cloud.x) * 0.00018 * recovery - cloud.vy * curl) * step;
        cloud.vy += (ambientY + (centerY - cloud.y) * 0.00024 * recovery + cloud.vx * curl) * step;
        const drag = Math.pow(activeRef.current ? 0.975 : 0.93, step);
        cloud.vx *= drag;
        cloud.vy *= drag;
        cloud.x += cloud.vx * step;
        cloud.y += cloud.vy * step;
        energy += Math.abs(cloud.vx) + Math.abs(cloud.vy);
      });

      draw();
      const stillSettling = timestamp - releasedAtRef.current < 1_800
        && (timestamp - simulation.lastInput < 980 || energy > 0.065);
      const shouldContinue = activeRef.current || stillSettling;
      if (shouldContinue) {
        frame = requestAnimationFrame(advance);
      } else {
        running = false;
        if (settlingRef.current) {
          settlingRef.current = false;
          setSettling(false);
        }
      }
    };

    const resume = () => {
      if (!running && !destroyed && !reduceMotion) {
        running = true;
        frame = requestAnimationFrame(advance);
      }
    };
    resumeRef.current = resume;

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    if (activeRef.current && !reduceMotion) resume();

    return () => {
      destroyed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      resumeRef.current = () => undefined;
    };
  }, [reduceMotion]);

  useImperativeHandle(ref, () => ({
    disturb(x, y, velocityX, velocityY) {
      const simulation = simulationRef.current;
      if (!simulation || reduceMotion) return;
      const speed = Math.min(1.4, Math.hypot(velocityX, velocityY));
      if (speed < 0.015) return;
      const cursorX = simulation.width * (0.2 + x * 0.6);
      const cursorY = simulation.height * (0.15 + y * 0.7);
      const influence = Math.max(28, Math.min(52, simulation.height * 1.2));
      simulation.clouds.forEach((cloud) => {
        const distance = Math.hypot(cloud.x - cursorX, cloud.y - cursorY);
        const falloff = Math.exp(-(distance * distance) / (2 * influence * influence));
        const forwardX = velocityX * (0.72 + falloff * 0.9);
        const forwardY = velocityY * (0.72 + falloff * 0.9);
        const perpendicularX = -velocityY * 0.34 * cloud.spin * falloff;
        const perpendicularY = velocityX * 0.34 * cloud.spin * falloff;
        cloud.vx = Math.max(-2.2, Math.min(2.2, cloud.vx + (forwardX + perpendicularX) * 0.52));
        cloud.vy = Math.max(-2.2, Math.min(2.2, cloud.vy + (forwardY + perpendicularY) * 0.52));
      });
      simulation.lastInput = performance.now();
      settlingRef.current = true;
      setSettling(true);
      resumeRef.current();
    },
  }), [reduceMotion]);

  return (
    <span className={`fluid-step-fluid-wrap ${active ? "is-active" : ""} ${settling ? "is-settling" : ""}`} aria-hidden="true">
      <canvas ref={canvasRef} className="fluid-step-fluid-canvas" />
    </span>
  );
});

export default ReportStepFluidLayer;
