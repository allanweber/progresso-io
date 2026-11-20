import type { CSSProperties } from "react";

export function tintStyle(fg: string, bg: string): CSSProperties {
  return { "--tint-fg": fg, "--tint-bg": bg } as CSSProperties;
}
