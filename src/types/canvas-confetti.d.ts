declare module "canvas-confetti" {
  export type ConfettiShape = "square" | "circle" | "star";

  export type ConfettiOptions = {
    particleCount?: number;
    angle?: number;
    spread?: number;
    startVelocity?: number;
    decay?: number;
    gravity?: number;
    drift?: number;
    flat?: boolean;
    ticks?: number;
    origin?: { x?: number; y?: number };
    colors?: string[];
    shapes?: ConfettiShape[];
    scalar?: number;
    zIndex?: number;
    disableForReducedMotion?: boolean;
  };

  export type ConfettiFunction = {
    (options?: ConfettiOptions): Promise<null> | null;
    reset(): void;
  };

  const confetti: ConfettiFunction;
  export default confetti;
}
