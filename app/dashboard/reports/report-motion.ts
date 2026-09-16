import type { Transition } from "framer-motion";

export const reportControlSpring: Transition = {
  type: "spring",
  stiffness: 500,
  damping: 34,
  mass: 0.65,
};

export const reportPanelSpring: Transition = {
  type: "spring",
  stiffness: 300,
  damping: 27,
  mass: 0.82,
  restDelta: 0.35,
  restSpeed: 4,
};

export const reportPanelExitTransition: Transition = {
  type: "tween",
  duration: 0.38,
  times: [0, 0.18, 1],
  ease: [0.3, 0, 0.62, 1],
};

export const reportSoftSpring: Transition = {
  type: "spring",
  stiffness: 300,
  damping: 30,
  mass: 0.78,
};

export const reportFadeTransition: Transition = {
  duration: 0.18,
  ease: [0.32, 0.72, 0, 1],
};
