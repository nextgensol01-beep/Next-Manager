// A controlled scene texture, never a capture of arbitrary DOM.
export const lensVertex = `
attribute vec2 position;
varying vec2 uv;
void main() { uv = vec2(position.x * .5 + .5, .5 - position.y * .5); gl_Position = vec4(position, 0., 1.); }
`;
export const lensFragment = `
precision mediump float;
varying vec2 uv;
uniform sampler2D scene;
uniform vec2 center;
uniform float radius, refraction, edgeRefraction, fresnel, highlight, depth, transmission, aberration, enabled, bounds;
uniform int layer;
const vec2 size = vec2(900., 400.);
void main() {
  vec3 base = texture2D(scene, uv).rgb;
  vec2 local = (uv * size - center) / radius;
  float r = length(local);
  if (r > 1.) {
    if (bounds > .5 && r < 1.018) base = mix(base, vec3(.55,.29,.16), .8);
    gl_FragColor = vec4(base, 1.); return;
  }
  float z = sqrt(max(0., 1. - r*r));
  vec3 normal = normalize(vec3(local * .8, max(.02, z)));
  // Approximate convex refraction: clear centre, progressively stronger rim.
  vec3 ray = refract(vec3(0.,0.,-1.), normal, 1./1.45);
  vec2 offset = ray.xy * radius / size * refraction * (0.15 + edgeRefraction * r*r * 3.) * enabled;
  vec2 displaced = clamp(uv + offset, vec2(.001), vec2(.999));
  vec2 split = local * aberration * r*r * enabled;
  vec3 transmitted = vec3(texture2D(scene, displaced + split).r, texture2D(scene, displaced).g, texture2D(scene, displaced - split).b);
  float rim = pow(1. - z, 3.);
  float spec = pow(max(0., dot(normal, normalize(vec3(-.5,-.65,.7)))), 24.);
  float shade = max(0., dot(normal.xy, normalize(vec2(.65,.7)))) * pow(r, 3.) * depth;
  vec3 colour = mix(transmitted, vec3(.93,.91,.88), (1.-transmission)*.22);
  colour += vec3(rim * fresnel * .55 + spec * highlight);
  colour *= 1. - shade;
  if (layer == 1) colour = transmitted;
  if (layer == 2) colour = base + vec3(rim * fresnel * .55);
  if (layer == 3) colour = base + vec3(spec * highlight);
  if (layer == 4) colour = base * (1. - shade);
  if (layer == 5) colour = transmitted;
  float coverage = 1. - smoothstep(1. - 1.5/radius, 1., r);
  gl_FragColor = vec4(mix(base, colour, coverage), 1.);
}
`;

export function paintLensScene(canvas: HTMLCanvasElement) {
  canvas.width = 900;
  canvas.height = 400;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#eeede8";
  ctx.fillRect(0, 0, 900, 400);
  ctx.strokeStyle = "#d8d5cb";
  ctx.lineWidth = 1;
  for (let x = 30; x < 900; x += 30) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 400);
    ctx.stroke();
  }
  ctx.fillStyle = "#dca267";
  ctx.beginPath();
  ctx.ellipse(715, 205, 88, 155, 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#272724";
  ctx.font = "600 124px Arial, sans-serif";
  ctx.fillText("Liquid", 55, 170);
  ctx.fillText("glass", 55, 294);
  ctx.fillStyle = "#69675e";
  ctx.font = "12px Arial, sans-serif";
  ctx.fillText("A KNOWN SCENE / DISPLACED PIXELS", 60, 355);
}
