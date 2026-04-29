/**
 * Bundled apps — pre-built window registry entries for the 16 apps that ship
 * with `react-os-shell`. Consumers compose them into their own registry via
 * `createWindowRegistry`:
 *
 *   import { createWindowRegistry } from 'react-os-shell';
 *   import { bundledApps } from 'react-os-shell/apps';
 *   import { erpEntities } from './shell-config';
 *
 *   const windows = createWindowRegistry(bundledApps, erpEntities);
 *
 * Subsets are also exported (`utilityApps`, `gameApps`, `googleApps`) so a
 * consumer can pick-and-choose without importing every component.
 *
 * NOTE: 4 apps require consumer-supplied persistence (Calendar / Notepad /
 * WorldClock for stored preferences, Minesweeper for leaderboard). They're
 * exported individually but absent from `bundledApps` — wire the prefs
 * provider to opt them in.
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

// ── Games ──
const Chess = lazy(() => import('./Chess'));
const Checkers = lazy(() => import('./Checkers'));
const Sudoku = lazy(() => import('./Sudoku'));
const Tetris = lazy(() => import('./Tetris'));
const Game2048 = lazy(() => import('./Game2048'));
const Minesweeper = lazy(() => import('./Minesweeper'));

// ── Google apps ──
const Email = lazy(() => import('./Email'));
const GeminiChat = lazy(() => import('./GeminiChat'));
const Calendar = lazy(() => import('./Calendar'));

// ── Document apps ──
const Preview = lazy(() => import('./Preview'));

export const utilityApps: WindowRegistry = {
  '/calculator': { component: Calculator, label: 'Calculator', size: 'sm', allowPinOnTop: true, utility: true, widget: true, autoHeight: true, dimensions: [280, 420] },
  '/spreadsheet': { component: Spreadsheet, label: 'Spreadsheets', size: '2xl', compact: true, multiInstance: true },
  '/notepad': { component: Notepad, label: 'Notepad', size: 'lg', allowPinOnTop: true },
  '/weather': { component: Weather, label: 'Weather', size: 'sm', utility: true, widget: true, autoHeight: true, dimensions: [320, 400] },
  '/currency': { component: CurrencyConverter, label: 'Currency Converter', size: 'sm', utility: true, widget: true, autoHeight: true, dimensions: [320, 480] },
  '/pomodoro': { component: PomodoroTimer, label: 'Pomodoro Timer', size: 'sm', utility: true, widget: true, autoHeight: true, dimensions: [320, 420] },
};

export const gameApps: WindowRegistry = {
  '/chess': { component: Chess, label: 'Chess', size: 'lg', compact: true },
  '/checkers': { component: Checkers, label: 'Checkers', size: 'lg', compact: true },
  '/sudoku': { component: Sudoku, label: 'Sudoku', size: 'sm', compact: true, dimensions: [360, 535] },
  '/tetris': { component: Tetris, label: 'Tetris', size: 'md', compact: true, dimensions: [452, 618] },
  '/2048': { component: Game2048, label: '2048', size: 'sm', compact: true },
  '/minesweeper': { component: Minesweeper, label: 'Minesweeper', size: 'sm', compact: true },
};

export const googleApps: WindowRegistry = {
  '/email': { component: Email, label: 'Email', size: '2xl' },
  '/gemini': { component: GeminiChat, label: 'Gemini AI', size: 'lg' },
  '/calendar': { component: Calendar, label: 'Calendar', size: 'xl' },
};

export const documentApps: WindowRegistry = {
  '/preview': { component: Preview, label: 'Preview', size: '2xl', multiInstance: true },
};

export const bundledApps: WindowRegistry = {
  ...utilityApps,
  ...gameApps,
  ...googleApps,
  ...documentApps,
};

export {
  Calculator,
  Spreadsheet,
  Notepad,
  Weather,
  CurrencyConverter,
  PomodoroTimer,
  Chess,
  Checkers,
  Sudoku,
  Tetris,
  Game2048,
  Minesweeper,
  Email,
  GeminiChat,
  Calendar,
  Preview,
};

export { setPdfPreview } from './Preview';
export type { PdfPreviewData } from './Preview';
