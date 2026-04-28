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

// ── 7 utility apps (3 require persistence — held back for now) ──
const Calculator = lazy(() => import('./Calculator'));
const Spreadsheet = lazy(() => import('./Spreadsheet'));
const Weather = lazy(() => import('./Weather'));
const CurrencyConverter = lazy(() => import('./CurrencyConverter'));
const PomodoroTimer = lazy(() => import('./PomodoroTimer'));
// const Notepad = lazy(() => import('./Notepad'));      // needs prefs config
// const WorldClock = lazy(() => import('./WorldClock')); // needs prefs config

// ── 6 games (1 requires leaderboard — held back) ──
const Chess = lazy(() => import('./Chess'));
const Checkers = lazy(() => import('./Checkers'));
const Sudoku = lazy(() => import('./Sudoku'));
const Tetris = lazy(() => import('./Tetris'));
const Game2048 = lazy(() => import('./Game2048'));
// const Minesweeper = lazy(() => import('./Minesweeper')); // needs leaderboard config

// ── 3 Google apps (1 requires prefs — held back) ──
const Email = lazy(() => import('./Email'));
const GeminiChat = lazy(() => import('./GeminiChat'));
// const Calendar = lazy(() => import('./Calendar')); // needs prefs config

export const utilityApps: WindowRegistry = {
  '/calculator': { component: Calculator, label: 'Calculator', size: 'sm', allowPinOnTop: true, utility: true, widget: true, dimensions: [280, 420] },
  '/spreadsheet': { component: Spreadsheet, label: 'Spreadsheet', size: '2xl', compact: true },
  '/weather': { component: Weather, label: 'Weather', size: 'sm', utility: true, widget: true, autoHeight: true, dimensions: [320, 400] },
  '/currency': { component: CurrencyConverter, label: 'Currency Converter', size: 'sm', utility: true, widget: true, dimensions: [320, 480] },
  '/pomodoro': { component: PomodoroTimer, label: 'Pomodoro Timer', size: 'sm', utility: true, widget: true, dimensions: [320, 420] },
};

export const gameApps: WindowRegistry = {
  '/chess': { component: Chess, label: 'Chess', size: 'lg', compact: true },
  '/checkers': { component: Checkers, label: 'Checkers', size: 'lg', compact: true },
  '/sudoku': { component: Sudoku, label: 'Sudoku', size: 'sm', compact: true, dimensions: [360, 535] },
  '/tetris': { component: Tetris, label: 'Tetris', size: 'md', compact: true, dimensions: [452, 618] },
  '/2048': { component: Game2048, label: '2048', size: 'sm', compact: true },
};

export const googleApps: WindowRegistry = {
  '/email': { component: Email, label: 'Email', size: '2xl' },
  '/gemini': { component: GeminiChat, label: 'Gemini AI', size: 'lg' },
};

export const bundledApps: WindowRegistry = {
  ...utilityApps,
  ...gameApps,
  ...googleApps,
};

export {
  Calculator,
  Spreadsheet,
  Weather,
  CurrencyConverter,
  PomodoroTimer,
  Chess,
  Checkers,
  Sudoku,
  Tetris,
  Game2048,
  Email,
  GeminiChat,
};
