const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const handoffModule = { exports: {}, process: { env: { NODE_ENV: "production" } } };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, "../lib/workflow-style-handoff.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, handoffModule);
const { STYLE_HANDOFF, handoffReceive, handoffPoint, measureStyleHandoff } = handoffModule.exports;

// Exercise the actual hook with a deterministic animation clock, including events
// fired before React can render and callbacks delivered after cancellation.
function harness(reduced = false) {
  const slots = [];
  const effects = [];
  const animations = [];
  const timers = new Map();
  let cursor = 0, timerId = 0;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useCallback(callback, deps) {
      const index = cursor++, old = slots[index];
      if (!old || deps.some((dep, i) => dep !== old.deps[i])) slots[index] = { callback, deps };
      return slots[index].callback;
    },
    useEffect(callback, deps) {
      const index = cursor++, old = slots[index];
      if (!old || deps.some((dep, i) => dep !== old.deps[i])) {
        old?.cleanup?.();
        slots[index] = { deps };
        effects.push(() => { slots[index].cleanup = callback(); });
      }
    },
    forwardRef: value => value,
  };
  const context = { exports: {}, setTimeout(callback) { timers.set(++timerId, callback); return timerId; }, clearTimeout(id) { timers.delete(id); },
    require(name) {
      if (name === "react") return react;
      if (name === "framer-motion") return {
        useMotionValue(initial) { return react.useRef({ value: initial, set(value) { this.value = value; }, get() { return this.value; } }).current; },
        animate(_from, _to, options) { const animation = { ...options, stopped: false, stop() { this.stopped = true; } }; animations.push(animation); return animation; }
      };
      if (name === "@/lib/workflow-style-handoff") return handoffModule.exports;
      if (name === "lucide-react") return {};
      throw Error(`Unexpected dependency: ${name}`);
    },
  };
  const source = fs.readFileSync(path.join(__dirname, "../components/client-trackers/WorkflowStepNavigation.tsx"), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, context);
  const pages = ["About", "Send rule", "Email style", "Messages", "Template"].map(title => ({ title, description: "" }));
  const render = () => { cursor = 0; const result = context.exports.useWorkflowStepNavigation("test", 2, pages, reduced); effects.splice(0).forEach(effect => effect()); return result; };
  render();
  return { render, animations, flushTimers() { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()); }, unmount() { slots.forEach(slot => slot?.cleanup?.()); } };
}

for (const reduced of [false, true]) for (const mode of ["points", "statements", "combinations"]) {
  const h = harness(reduced);
  let nav = h.render(), storedStyle = "points", writes = 0;
  const apply = () => { storedStyle = mode; writes++; };
  nav.selectStyleAndAdvance(mode, storedStyle, true, apply);
  nav.selectStyleAndAdvance("points", storedStyle, false, () => writes++);
  nav.navigateStep("next");
  nav.navigateToStep(4);
  assert.equal(writes, 1, "Only the first rapid activation may update the mode");
  assert.equal(h.render().setupPage, 2, "Stay on chooser during acknowledgement");
  const animation = h.animations.at(-1);
  animation.onUpdate(reduced ? .07 : .21);
  assert.equal(h.render().setupPage, 2);
  if (!reduced) {
    const delay = h.render().styleCommit.selectionDelay;
    animation.onUpdate(delay + STYLE_HANDOFF.arrival - .001);
    assert.equal(h.render().setupPage, 2, "Stepper cannot advance while droplet is still travelling");
    animation.onUpdate(delay + STYLE_HANDOFF.arrival + .02);
    assert.equal(h.render().setupPage, 2, "Email Style receives the droplet before horizontal navigation");
    assert(handoffReceive(h.render().styleClock.get() - delay) > 0, "The original pill reacts at contact");
  }
  animation.onUpdate(animation.duration - .01);
  nav = h.render();
  assert.equal(nav.setupPage, 3, "Canonical handoff opens Messages exactly once");
  assert.equal(storedStyle, mode);
  assert.equal(nav.styleCommit.keyboard, true);
  assert.equal(nav.commit, null, "Selection never runs the arrow animation");
  animation.onComplete();
  nav = h.render();
  assert.equal(nav.styleCommit, null, "Lock is released after completion");
  nav.navigateStep("previous", true);
  h.flushTimers();
  nav = h.render();
  assert.equal(nav.setupPage, 2, "Normal Previous returns to Email style");
  assert.equal(nav.styleCommit, null, "Returning does not auto-advance");
  nav.selectStyleAndAdvance(mode, storedStyle, false, apply);
  const repeat = h.animations.at(-1);
  repeat.onUpdate(repeat.duration);
  assert.equal(h.render().setupPage, 3, "Reselecting the same style continues again");
  h.render().navigateToStep(1);
  repeat.onUpdate(repeat.duration);
  repeat.onComplete();
  assert.equal(h.render().setupPage, 1, "Stale callbacks cannot supersede newer navigation");
  h.render().navigateToStep(2);
  h.render().selectStyleAndAdvance(mode, mode, false, apply);
  const unmounted = h.animations.at(-1);
  h.unmount();
  assert.equal(unmounted.stopped, true, "Unmount cancels the animation clock");
}
const failure = harness();
assert.throws(() => failure.render().selectStyleAndAdvance("points", "points", false, () => { throw Error("selection failed"); }));
assert.equal(failure.render().styleCommit, null);
failure.render().selectStyleAndAdvance("points", "points", false, () => {});
assert.equal(failure.animations.length, 1, "Failed selection releases the lock for retry");
for (const left of [120, 400, 680]) {
  const tile = { left, top: 400, width: 240, height: 150 };
  const pill = { left: 430, top: 200, width: 110, height: 36 };
  const container = { left: 50, top: 80, width: 1000, height: 700 };
  const path = measureStyleHandoff(tile, pill, container, 1000, 700);
  assert.equal(path.start.x, left + 120 - 50);
  assert.equal(path.start.y, 344);
  assert.equal(handoffPoint(path, 0).x, path.start.x);
  assert.equal(handoffPoint(path, 1).x, path.end.x);
  assert.equal(handoffPoint(path, 1).y, path.end.y);
  let previous = path.start.y;
  for (let step = 1; step <= 20; step++) {
    const point = handoffPoint(path, step / 20);
    assert(point.y < previous, "Every sample travels upward continuously to the measured pill");
    previous = point.y;
  }
  const scaled = rect => Object.fromEntries(Object.entries(rect).map(([key, value]) => [key, value * .8]));
  const scaledPath = measureStyleHandoff(scaled(tile), scaled(pill), scaled(container), 1000, 700);
  assert(Math.abs(scaledPath.start.x - path.start.x) < .001, "Modal transforms preserve local coordinates");
  assert(Math.abs(scaledPath.end.y - path.end.y) < .001);
}
assert.equal(handoffReceive(STYLE_HANDOFF.arrival - .001), 0, "No disconnected stepper glow before arrival");
console.log("Style navigation passed: arrival-gated handoff, three measured paths, modal scaling, all modes, reselection, rapid activation, keyboard, Previous, reduced motion, cancellation, unmount, and failure recovery.");
