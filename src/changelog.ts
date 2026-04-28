/**
 * INTERNAL stub — Desktop's About modal references the consumer-side
 * changelog. The package ships no built-in changelog; consumer wires their
 * own through the eventual `branding` prop (TODO). Default = empty array
 * keeps the import compiling.
 */
export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}
const changelog: ChangelogEntry[] = [];
export default changelog;
