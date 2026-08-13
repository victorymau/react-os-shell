/**
 * INTERNAL stub — Desktop's What's New modal references the consumer-side
 * changelog. The package ships no built-in changelog; the consumer wires
 * their own through `DesktopHostConfig.productChangelog` (the What's New
 * dialog reads it first, and this empty default keeps the import compiling
 * when they don't). Layout's `branding` prop carries the rest of the visual
 * identity — name, logo, tagline.
 */
export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}
const changelog: ChangelogEntry[] = [];
export default changelog;
