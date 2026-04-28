import { useState, useCallback, useEffect, useRef } from 'react';
import toast from '../shell/toast';

type Board = (number | null)[][];
type Givens = boolean[][];

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function emptyBoard(): Board {
  return Array.from({ length: 9 }, () => Array(9).fill(null));
}

function isValid(board: Board, r: number, c: number, num: number): boolean {
  for (let i = 0; i < 9; i++) {
    if (board[r][i] === num || board[i][c] === num) return false;
  }
  const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
  for (let i = br; i < br + 3; i++)
    for (let j = bc; j < bc + 3; j++)
      if (board[i][j] === num) return false;
  return true;
}

function solve(board: Board): boolean {
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) {
      if (board[r][c] !== null) continue;
      const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      for (const n of nums) {
        if (isValid(board, r, c, n)) {
          board[r][c] = n;
          if (solve(board)) return true;
          board[r][c] = null;
        }
      }
      return false;
    }
  return true;
}

function generatePuzzle(): { puzzle: Board; givens: Givens } {
  const board = emptyBoard();
  solve(board);
  const givens: Givens = Array.from({ length: 9 }, () => Array(9).fill(true));
  const cells = shuffle(
    Array.from({ length: 81 }, (_, i) => [Math.floor(i / 9), i % 9] as [number, number])
  );
  let removed = 0;
  for (const [r, c] of cells) {
    if (removed >= 51) break; // 81 - 51 = 30 givens
    board[r][c] = null;
    givens[r][c] = false;
    removed++;
  }
  return { puzzle: board, givens };
}

function hasConflict(board: Board, r: number, c: number): boolean {
  const val = board[r][c];
  if (val === null) return false;
  for (let i = 0; i < 9; i++) {
    if (i !== c && board[r][i] === val) return true;
    if (i !== r && board[i][c] === val) return true;
  }
  const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
  for (let i = br; i < br + 3; i++)
    for (let j = bc; j < bc + 3; j++)
      if ((i !== r || j !== c) && board[i][j] === val) return true;
  return false;
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function Sudoku() {
  const [board, setBoard] = useState<Board>(emptyBoard());
  const [givens, setGivens] = useState<Givens>(Array.from({ length: 9 }, () => Array(9).fill(false)));
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startGame = useCallback(() => {
    const { puzzle, givens: g } = generatePuzzle();
    setBoard(puzzle);
    setGivens(g);
    setSelected(null);
    setSeconds(0);
    setRunning(true);
  }, []);

  useEffect(() => { startGame(); }, [startGame]);

  useEffect(() => {
    if (running) {
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [running]);

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (!selected) return;
    const [r, c] = selected;
    if (givens[r][c]) return;
    if (e.key >= '1' && e.key <= '9') {
      setBoard(b => { const nb = b.map(row => [...row]); nb[r][c] = parseInt(e.key); return nb; });
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      setBoard(b => { const nb = b.map(row => [...row]); nb[r][c] = null; return nb; });
    } else if (e.key === 'ArrowUp' && r > 0) setSelected([r - 1, c]);
    else if (e.key === 'ArrowDown' && r < 8) setSelected([r + 1, c]);
    else if (e.key === 'ArrowLeft' && c > 0) setSelected([r, c - 1]);
    else if (e.key === 'ArrowRight' && c < 8) setSelected([r, c + 1]);
  }, [selected, givens]);

  const checkSolution = useCallback(() => {
    let hasEmpty = false, hasError = false;
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === null) hasEmpty = true;
        else if (hasConflict(board, r, c)) hasError = true;
      }
    if (hasError) toast.error('There are conflicts on the board.');
    else if (hasEmpty) toast.info('Board is not yet complete.');
    else { toast.success('Congratulations! Puzzle solved!'); setRunning(false); }
  }, [board]);

  const inSameGroup = (r: number, c: number): boolean => {
    if (!selected) return false;
    const [sr, sc] = selected;
    return r === sr || c === sc ||
      (Math.floor(r / 3) === Math.floor(sr / 3) && Math.floor(c / 3) === Math.floor(sc / 3));
  };

  const cellBg = (r: number, c: number): string => {
    const isSelected = selected && selected[0] === r && selected[1] === c;
    const val = board[r][c];
    const conflict = val !== null && hasConflict(board, r, c);
    if (conflict) return 'bg-red-100';
    if (isSelected) return 'bg-blue-200';
    const sameNum = selected && val !== null && val === board[selected[0]][selected[1]];
    if (sameNum) return 'bg-blue-100';
    if (inSameGroup(r, c)) return 'bg-gray-100';
    return 'bg-white';
  };

  return (
    <div className="flex flex-col items-center gap-4 p-6 select-none" onKeyDown={handleKey} tabIndex={0}>
      <div className="flex items-center gap-6">
        <span className="text-lg font-mono font-semibold text-gray-700">{formatTime(seconds)}</span>
        <button onClick={startGame}
          className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700">
          New Game
        </button>
        <button onClick={checkSolution}
          className="px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded hover:bg-green-700">
          Check
        </button>
      </div>
      <div className="border-2 border-gray-800 inline-grid grid-cols-9" style={{ lineHeight: 0 }}>
        {board.map((row, r) =>
          row.map((val, c) => {
            const borderR = c % 3 === 2 && c < 8 ? 'border-r-2 border-r-gray-800' : 'border-r border-r-gray-300';
            const borderB = r % 3 === 2 && r < 8 ? 'border-b-2 border-b-gray-800' : 'border-b border-b-gray-300';
            return (
              <div key={`${r}-${c}`}
                className={`w-10 h-10 flex items-center justify-center text-lg cursor-pointer
                  ${borderR} ${borderB} ${cellBg(r, c)}
                  ${givens[r][c] ? 'font-bold text-gray-900' : 'text-blue-600'}`}
                onClick={() => setSelected([r, c])}>
                {val ?? ''}
              </div>
            );
          })
        )}
      </div>
      <p className="text-xs text-gray-400">Click a cell, type 1-9 to fill, Backspace to clear. Arrow keys to navigate.</p>
    </div>
  );
}
