/**
 * Largest integer scale at which a w x h image fits the available area,
 * measured in device pixels so every source pixel maps to a whole number
 * of physical pixels. Never less than 1.
 */
export function integerScale(
  availCssW: number,
  availCssH: number,
  devicePixelRatio = 1,
  w = 256,
  h = 192,
): number {
  const dw = availCssW * devicePixelRatio;
  const dh = availCssH * devicePixelRatio;
  return Math.max(1, Math.floor(Math.min(dw / w, dh / h)));
}

/** CSS size for a given device-pixel scale. */
export function cssSize(scale: number, devicePixelRatio = 1, w = 256, h = 192): { width: number; height: number } {
  return { width: (w * scale) / devicePixelRatio, height: (h * scale) / devicePixelRatio };
}
