export interface SnowfallOptions {
  /** Defaults to the viewport. */
  target?: HTMLElement;
  /** Selector scoped to the target, or a collection of explicit surfaces. */
  surfaces?: string | Iterable<Element>;
  /** Number from 0 to 1. Defaults to 0.55. */
  intensity?: number;
  color?: string;
  enabled?: boolean;
  /** Number from 0 to 1. Defaults to 1. */
  opacity?: number;
  accumulate?: boolean;
  /** Accumulation rate and depth multiplier from 0 to 2. Defaults to 1. */
  accumulation?: number;
  ground?: boolean;
  interactive?: boolean;
  melt?: boolean;
  zIndex?: number;
  /** Show the settings button. Defaults to true. */
  settings?: boolean;
  /** Override the localStorage key, or pass false to disable persistence. */
  storageKey?: string | false;
  /** Opt into Santa's occasional cleanup of a navigation surface. */
  santa?: {
    surface: string;
    /** Selector for jump destinations inside the surface. */
    stops?: string;
    /** Selector for visible jump destinations outside the navigation surface. */
    destinations?: string;
    /** Give the nav, buttons and cards independent continuous cleaners. Crew routes also repeat. */
    patrols?: { buttons: string; cards: string };
    /** Minimum time between cleanups in seconds. Defaults to 35. */
    interval?: number;
    /** Animation playback speed from 0.2 to 1. Defaults to 0.4. */
    speed?: number;
    /** Enable the rope cleaner and bottom plow. The footer marks the end of the rope and jumper routes. */
    crew?: { footer: string };
  };
}

export interface Snowfall {
  start(): void;
  stop(): void;
  clear(): void;
  refresh(): void;
  setIntensity(value: number): void;
  destroy(): void;
}

export function createSnowfall(options?: SnowfallOptions): Snowfall;
