import type { ConfettiFunction, ConfettiOptions } from "canvas-confetti";

export type FireworksKind = "created" | "updated";

type ConfettiModule = ConfettiFunction & { default?: ConfettiFunction };

const honeyFireworkColors = ["#ffffff", "#fef3c7", "#fde68a", "#fbbf24", "#f59e0b", "#b45309"];

function reducedMotionPreferred() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export async function launchFireworks(kind: FireworksKind, options: { force?: boolean } = {}) {
  if (typeof window === "undefined" || (!options.force && reducedMotionPreferred())) {
    return;
  }

  try {
    const module = (await import("canvas-confetti")) as unknown as ConfettiModule;
    const confetti = module.default ?? module;

    if (typeof confetti !== "function") {
      return;
    }

    const forced = options.force === true;
    const defaults: ConfettiOptions = {
      colors: honeyFireworkColors,
      disableForReducedMotion: !forced,
      spread: 360,
      startVelocity: 30,
      ticks: 60,
      zIndex: 2147483647
    };

    confetti({
      ...defaults,
      origin: { x: 0.5, y: 0.55 },
      particleCount: kind === "created" ? 180 : 110,
      scalar: kind === "created" ? 1.05 : 0.9
    });
  } catch (error) {
    console.warn("Fireworks efekt se nepodařilo spustit.", error);
  }
}
