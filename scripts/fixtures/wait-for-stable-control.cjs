// Browser automation must click the currently visible control, including during resizing.
module.exports = async function waitForStableControl(handle) {
  await handle.evaluate(node => new Promise(resolve => {
    let previous, stable = 0, frames = 0;
    const sample = () => {
      const rect = node.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      const bounds = [rect.x, rect.y, rect.width, rect.height];
      stable = previous && bounds.every((value, index) => Math.abs(value - previous[index]) < .1) && node.contains(hit) ? stable + 1 : 0;
      previous = bounds;
      if (stable >= 3 || ++frames > 90) resolve(); else requestAnimationFrame(sample);
    };
    sample();
  }));
};
