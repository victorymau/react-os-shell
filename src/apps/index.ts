/**
 * Bundled apps — pre-built window registry entries for the 12 apps that ship
 * with `react-os-shell`. Consumers compose them into their own registry via
 * `createWindowRegistry`:
 *
 *   import { createWindowRegistry } from 'react-os-shell';
 *   import { bundledApps } from 'react-os-shell/apps';
 *   import { erpEntities } from './shell-config';
 *
 *   const windows = createWindowRegistry(bundledApps, erpEntities);
 *
 * Subsets are also exported (`utilityApps`, `documentApps`, `webApps`) so a
 * consumer can pick-and-choose without importing every component.
 *
 * NOTE: Notepad requires consumer-supplied persistence for stored content.
 * WorldClock uses `useShellPrefs()` so it lives in `bundledApps`; without a
 * consumer-supplied prefs adapter the city list won't survive a reload.
 */
import { lazy } from 'react';
import type { WindowRegistry } from '../windowRegistry/types';

// ── Utility apps ──
const Calculator = lazy(() => import('./Calculator'));
const Spreadsheet = lazy(() => import('./Spreadsheet'));
const Weather = lazy(() => import('./Weather'));
const CurrencyConverter = lazy(() => import('./CurrencyConverter'));
const PomodoroTimer = lazy(() => import('./PomodoroTimer'));
const Notepad = lazy(() => import('./Notepad'));
const WorldClock = lazy(() => import('./WorldClock'));
const Stock = lazy(() => import('./Stock'));

// ── Document apps ──
const Preview = lazy(() => import('./Preview'));
const Documents = lazy(() => import('./Documents'));
const Files = lazy(() => import('./Files'));

// ── Web ──
const Browser = lazy(() => import('./Browser'));

export const utilityApps: WindowRegistry = {
  '/calculator': { component: Calculator, label: 'Calculator', size: 'sm', allowPinOnTop: true, utility: true, widget: true, dimensions: [280, 420] },
  '/spreadsheet': { component: Spreadsheet, label: 'Spreadsheets', size: '2xl', appStyle: true, multiInstance: true },
  '/notepad': { component: Notepad, label: 'Notepad', size: 'lg', allowPinOnTop: true, flushBody: true },
  '/weather': { component: Weather, label: 'Weather', size: 'sm', utility: true, widget: true, autoHeight: true, dimensions: [320, 400] },
  '/currency': { component: CurrencyConverter, label: 'Currency Converter', size: 'sm', utility: true, widget: true, autoHeight: true, dimensions: [320, 480] },
  '/pomodoro': { component: PomodoroTimer, label: 'Pomodoro Timer', size: 'sm', utility: true, widget: true, dimensions: [320, 600] },
  '/world-clock': { component: WorldClock, label: 'World Clock', size: 'sm', utility: true, widget: true, autoHeight: true, dimensions: [320, 480] },
  '/stock': { component: Stock, label: 'Stocks', size: 'sm', utility: true, widget: true, autoHeight: true, dimensions: [320, 360] },
};

export const documentApps: WindowRegistry = {
  '/preview': { component: Preview, label: 'Preview', size: '2xl', appStyle: true, multiInstance: true },
  '/documents': { component: Documents, label: 'Documents', size: 'xl', appStyle: true, multiInstance: true },
  '/files': { component: Files, label: 'Files', size: 'xl', appStyle: true },
};

export const webApps: WindowRegistry = {
  '/browser': { component: Browser, label: 'Browser', size: '2xl', appStyle: true, multiInstance: true },
};

export const bundledApps: WindowRegistry = {
  ...utilityApps,
  ...documentApps,
  ...webApps,
};

export {
  Calculator,
  Spreadsheet,
  Notepad,
  Weather,
  CurrencyConverter,
  PomodoroTimer,
  WorldClock,
  Stock,
  Preview,
  Documents,
  Files,
  Browser,
};

export { BUILTIN_APP_INFO } from './_about';
export type { BuiltinAppId, BuiltinAppInfo } from './_about';
export { setPdfPreview } from './Preview';
export { setSpreadsheetPreview } from './Spreadsheet';
export { setBrowserStartUrl } from './Browser';
export { openFilesInTrashMode, setFilesDemoTree } from './Files';
export type { FilesDemoNode } from './Files';
export type { PdfPreviewData, PdfPreviewHandle } from './Preview';
export type { SpreadsheetPreviewData, SpreadsheetPreviewHandle } from './Spreadsheet';
