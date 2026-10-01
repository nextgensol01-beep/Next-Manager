"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import {
  glassDefaults,
  type GlassSettings,
} from "@/components/ui/liquid-glass/material";
import { lensFragment, lensVertex, paintLensScene } from "./lens-renderer";

export default function LensExperiment({
  materialRef,
}: {
  materialRef: RefObject<HTMLDivElement | null>;
}) {
  const sourceRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const position = useRef(440);
  const redraw = useRef<() => void>(() => {});
  const [ready, setReady] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [restart, setRestart] = useState(0);
  useEffect(() => {
    const canvas = canvasRef.current,
      source = sourceRef.current,
      root = materialRef.current,
      stage = stageRef.current;
    if (!canvas || !source || !root || !stage) return;
    paintLensScene(source);
    setReady(false);
    const reduced = matchMedia("(prefers-reduced-transparency: reduce)");
    const contrast = matchMedia("(forced-colors: active)");
    const preferenceChanged = () => setRestart((value) => value + 1);
    reduced.addEventListener("change", preferenceChanged);
    contrast.addEventListener("change", preferenceChanged);
    const removePreferences = () => {
      reduced.removeEventListener("change", preferenceChanged);
      contrast.removeEventListener("change", preferenceChanged);
    };
    if (fallback || reduced.matches || contrast.matches) {
      redraw.current = () => {};
      return removePreferences;
    }
    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: "low-power",
    });
    if (!gl) return removePreferences;
    const shaders: WebGLShader[] = [];
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    let texture: WebGLTexture | null = null;
    let frame = 0,
      visible = true;
    const dispose = () => {
      cancelAnimationFrame(frame);
      shaders.forEach((shader) => gl.deleteShader(shader));
      gl.deleteBuffer(buffer);
      gl.deleteTexture(texture);
      gl.deleteProgram(program);
    };
    try {
      const compile = (type: number, code: string) => {
        const shader = gl.createShader(type);
        if (!shader) throw new Error("Shader unavailable");
        shaders.push(shader);
        gl.shaderSource(shader, code);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw new Error("Shader compilation unavailable");
        return shader;
      };
      program = gl.createProgram();
      if (!program) throw new Error("Renderer unavailable");
      gl.attachShader(program, compile(gl.VERTEX_SHADER, lensVertex));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, lensFragment));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error("Renderer linking unavailable");
      gl.useProgram(program);
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW,
      );
      const attribute = gl.getAttribLocation(program, "position");
      gl.enableVertexAttribArray(attribute);
      gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
      texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source,
      );
      const uniform = (name: string) => gl.getUniformLocation(program!, name);
      const locations = Object.fromEntries(
        [
          "center",
          "radius",
          "refraction",
          "edgeRefraction",
          "fresnel",
          "highlight",
          "depth",
          "transmission",
          "aberration",
          "enabled",
          "bounds",
          "layer",
        ].map((name) => [name, uniform(name)]),
      );
      gl.uniform1i(uniform("scene"), 0);
      const draw = () => {
        frame = 0;
        if (!visible || document.hidden || gl.isContextLost()) return;
        const css = getComputedStyle(root);
        const read = (key: keyof GlassSettings) =>
          parseFloat(css.getPropertyValue(`--optical-${key}`)) ||
          (key === "lensRadius" ? glassDefaults.lensRadius : 0);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(locations.center, position.current, 205);
        gl.uniform1f(locations.radius, read("lensRadius"));
        for (const key of [
          "refraction",
          "edgeRefraction",
          "fresnel",
          "highlight",
          "depth",
          "transmission",
          "aberration",
        ] as const)
          gl.uniform1f(locations[key], read(key));
        gl.uniform1f(
          locations.enabled,
          root.dataset.refraction === "off" ? 0 : 1,
        );
        gl.uniform1f(locations.bounds, root.dataset.bounds === "on" ? 1 : 0);
        gl.uniform1i(
          locations.layer,
          [
            "composite",
            "transmission",
            "edge",
            "specular",
            "depth",
            "refraction",
          ].indexOf(root.dataset.debug ?? "composite"),
        );
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        setReady(true);
      };
      const schedule = () => {
        if (!frame && visible && !document.hidden)
          frame = requestAnimationFrame(draw);
      };
      redraw.current = schedule;
      const resize = new ResizeObserver((entries) => {
        const width = entries[0]?.contentRect.width ?? 900;
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        canvas.width = Math.max(1, Math.round(Math.min(width, 1000) * dpr));
        canvas.height = Math.round((canvas.width * 400) / 900);
        schedule();
      });
      resize.observe(stage);
      const observer = new IntersectionObserver((entries) => {
        visible = entries[0]?.isIntersecting ?? false;
        if (visible) schedule();
        else {
          cancelAnimationFrame(frame);
          frame = 0;
        }
      });
      observer.observe(stage);
      const lost = (event: Event) => {
        event.preventDefault();
        cancelAnimationFrame(frame);
        frame = 0;
        setReady(false);
      };
      const restored = () => setRestart((value) => value + 1);
      canvas.addEventListener("webglcontextlost", lost);
      canvas.addEventListener("webglcontextrestored", restored);
      root.addEventListener("glass-tune", schedule);
      document.addEventListener("visibilitychange", schedule);
      schedule();
      return () => {
        redraw.current = () => {};
        resize.disconnect();
        observer.disconnect();
        removePreferences();
        canvas.removeEventListener("webglcontextlost", lost);
        canvas.removeEventListener("webglcontextrestored", restored);
        root.removeEventListener("glass-tune", schedule);
        document.removeEventListener("visibilitychange", schedule);
        dispose();
      };
    } catch {
      dispose();
      removePreferences();
      redraw.current = () => {};
    }
  }, [materialRef, fallback, restart]);
  return (
    <div className="lab-lens" data-glass-environment="light">
      <div
        className="lab-lens-stage"
        ref={stageRef}
        role="img"
        aria-label="Liquid glass typography with a circular convex lens distorting the known canvas scene"
      >
        <canvas ref={sourceRef} aria-hidden="true" />
        <canvas
          ref={canvasRef}
          className="lab-lens-gpu"
          style={{ visibility: ready ? "visible" : "hidden" }}
          aria-hidden="true"
        />
        {!ready && (
          <div className="glass-surface glass-surface--pill lab-lens-fallback" />
        )}
      </div>
      <div className="lab-lens-controls">
        <label>
          Lens position{" "}
          <input
            type="range"
            min="150"
            max="750"
            defaultValue="440"
            aria-label="Lens position"
            onChange={(event) => {
              position.current = Number(event.target.value);
              stageRef.current?.style.setProperty(
                "--lens-left",
                `${position.current / 9}%`,
              );
              redraw.current();
            }}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={fallback}
            onChange={(event) => setFallback(event.target.checked)}
          />{" "}
          Test CSS fallback
        </label>
        <span role="status">
          {ready
            ? "Texture refraction · WebGL"
            : "CSS material · no refraction"}
        </span>
      </div>
      <p className="lab-caption">
        One canvas texture supplies both the scene and the displaced lens
        pixels. This renderer cannot sample DOM behind a normal element.
      </p>
    </div>
  );
}
