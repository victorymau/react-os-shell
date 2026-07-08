/**
 * Files app config — the tiny consumer-facing surface of the Files app
 * (demo-tree injection + trash-mode open). Lives apart from Files.tsx so
 * importing these from `react-os-shell/apps` never drags the Files
 * implementation into a host's startup bundle; the Files window component
 * stays behind its React.lazy dynamic import.
 */
import { requestFilesTrashView } from '../shell/desktopIcons';

/**
 * Demo filesystem. When a consumer (e.g. the demo app) injects a static tree
 * via `setFilesDemoTree`, Files browses it in-memory — no file server needed.
 * Browse-only: upload / new-folder / rename / delete / trash are hidden while a
 * demo tree is set. Consumers with a real file server never call it, so their
 * behaviour is unchanged.
 */
export interface FilesDemoNode {
  name: string;
  kind: 'file' | 'folder';
  size?: number;
  modifiedAt?: string;
  children?: FilesDemoNode[];
}

let filesDemoTree: FilesDemoNode[] | null = null;

export function setFilesDemoTree(tree: FilesDemoNode[] | null) {
  filesDemoTree = tree;
}

/** @internal Current injected demo tree, if any — read by Files.tsx. */
export function getFilesDemoTree(): FilesDemoNode[] | null {
  return filesDemoTree;
}

// Side-channel for opening Files on a specific view (trash, desktop folder).
// The flag + event plumbing lives in shell/desktopIcons.tsx; this wrapper is
// kept because consumers import it from the package.
export function openFilesInTrashMode() {
  requestFilesTrashView();
}
