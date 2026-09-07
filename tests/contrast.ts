/**
 * WCAG 2.2 contrast, for specs that have to MEASURE a colour decision rather
 * than assert the string someone typed.
 *
 * A palette spec that pins hex values proves the file was not edited. It says
 * nothing about whether the pair is readable, which is the only thing the
 * palette is for — and the two come apart exactly when a value is derived
 * (a wash over a surface) rather than picked. So this computes the ratio.
 *
 * Deliberately not a dependency: it is thirty lines of the published formula
 * (WCAG 2.2 §1.4.3), and a library here would be a devDependency CI installs
 * on two Node versions to divide two numbers.
 */

/** `#rgb` / `#rrggbb` → 0–255 channels. */
export function rgb(hex: string): [number, number, number] {
  const h = hex.trim().replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`not a hex colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

/** `rgba(r, g, b, a)` / `rgb(r g b / a)` → channels plus alpha. */
export function rgba(value: string): { channels: [number, number, number]; alpha: number } {
  const nums = value.match(/-?[\d.]+/g);
  if (!nums || nums.length < 3) throw new Error(`not an rgb(a) colour: ${value}`);
  const [r, g, b, a] = nums.map(Number);
  return { channels: [r, g, b], alpha: nums.length > 3 ? a : 1 };
}

/** WCAG relative luminance. */
export function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Contrast ratio between two opaque colours, 1–21. */
export function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * `source` at `alpha` painted over `backdrop` — what the eye actually receives
 * from a transparent wash, and what its ink has to be measured against. Source
 * -over compositing with an opaque backdrop, so the result is opaque.
 */
export function composite(
  source: [number, number, number],
  alpha: number,
  backdrop: [number, number, number],
): [number, number, number] {
  return source.map((c, i) => alpha * c + (1 - alpha) * backdrop[i]) as [number, number, number];
}

/** Two decimals, the way a contrast figure is quoted. */
export const ratio = (n: number): number => Math.round(n * 100) / 100;

/** WCAG 2.2 AA for body text. */
export const AA = 4.5;
