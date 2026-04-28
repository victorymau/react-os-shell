import { useState, useCallback, useEffect } from 'react';

type Board = number[][];

const TILE_COLORS: Record<number, string> = {
  0: 'bg-gray-200', 2: 'bg-gray-100 text-gray-700', 4: 'bg-gray-200 text-gray-700',
  8: 'bg-orange-300 text-white', 16: 'bg-orange-400 text-white', 32: 'bg-orange-500 text-white',
  64: 'bg-red-500 text-white', 128: 'bg-yellow-300 text-gray-800', 256: 'bg-yellow-400 text-gray-800',
  512: 'bg-yellow-500 text-white', 1024: 'bg-yellow-600 text-white', 2048: 'bg-yellow-300 text-gray-800 ring-4 ring-yellow-400',
};

const empty = (): Board => Array.from({ length: 4 }, () => Array(4).fill(0));

function addRandom(b: Board): Board {
  const cells: [number, number][] = [];
  b.forEach((r, i) => r.forEach((v, j) => { if (!v) cells.push([i, j]); }));
  if (!cells.length) return b;
  const [r, c] = cells[Math.floor(Math.random() * cells.length)];
  const nb = b.map(r => [...r]);
  nb[r][c] = Math.random() < 0.9 ? 2 : 4;
  return nb;
}

function slideRow(row: number[]): { row: number[]; score: number } {
  const nums = row.filter(v => v);
  let score = 0;
  const merged: number[] = [];
  for (let i = 0; i < nums.length; i++) {
    if (i + 1 < nums.length && nums[i] === nums[i + 1]) {
      merged.push(nums[i] * 2);
      score += nums[i] * 2;
      i++;
    } else merged.push(nums[i]);
  }
  while (merged.length < 4) merged.push(0);
  return { row: merged, score };
}

function rotate(b: Board): Board {
  return b[0].map((_, i) => b.map(r => r[i]).reverse());
}

function move(board: Board, dir: 'left' | 'right' | 'up' | 'down'): { board: Board; score: number } {
  let b = board.map(r => [...r]);
  const rotations = { left: 0, down: 1, right: 2, up: 3 };
  for (let i = 0; i < rotations[dir]; i++) b = rotate(b);
  let score = 0;
  b = b.map(r => { const res = slideRow(r); score += res.score; return res.row; });
  for (let i = 0; i < (4 - rotations[dir]) % 4; i++) b = rotate(b);
  return { board: b, score };
}

function hasValidMoves(b: Board): boolean {
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      if (!b[i][j]) return true;
      if (j < 3 && b[i][j] === b[i][j + 1]) return true;
      if (i < 3 && b[i][j] === b[i + 1][j]) return true;
    }
  return false;
}

function boardsEqual(a: Board, b: Board): boolean {
  return a.every((r, i) => r.every((v, j) => v === b[i][j]));
}

function initBoard(): Board {
  return addRandom(addRandom(empty()));
}

export default function Game2048() {
  const [board, setBoard] = useState<Board>(initBoard);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => Number(localStorage.getItem('game2048_best') || 0));
  const [won, setWon] = useState(false);
  const [showWin, setShowWin] = useState(false);
  const [gameOver, setGameOver] = useState(false);

  const handleMove = useCallback((dir: 'left' | 'right' | 'up' | 'down') => {
    if (gameOver) return;
    setBoard(prev => {
      const { board: nb, score: gained } = move(prev, dir);
      if (boardsEqual(prev, nb)) return prev;
      const withNew = addRandom(nb);
      setScore(s => {
        const ns = s + gained;
        setBest(b => { const nb = Math.max(b, ns); localStorage.setItem('game2048_best', String(nb)); return nb; });
        return ns;
      });
      if (!won && withNew.some(r => r.some(v => v >= 2048))) { setWon(true); setShowWin(true); }
      if (!hasValidMoves(withNew)) setGameOver(true);
      return withNew;
    });
  }, [gameOver, won]);

  useEffect(() => {
    const keyMap: Record<string, 'left' | 'right' | 'up' | 'down'> = {
      ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    };
    const handler = (e: KeyboardEvent) => {
      const dir = keyMap[e.key];
      if (dir) { e.preventDefault(); handleMove(dir); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleMove]);

  useEffect(() => {
    let sx = 0, sy = 0;
    const el = document.getElementById('game2048-board');
    if (!el) return;
    const ts = (e: TouchEvent) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; };
    const te = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) return;
      if (Math.abs(dx) > Math.abs(dy)) handleMove(dx > 0 ? 'right' : 'left');
      else handleMove(dy > 0 ? 'down' : 'up');
    };
    el.addEventListener('touchstart', ts, { passive: true });
    el.addEventListener('touchend', te, { passive: true });
    return () => { el.removeEventListener('touchstart', ts); el.removeEventListener('touchend', te); };
  }, [handleMove]);

  const newGame = () => { setBoard(initBoard()); setScore(0); setWon(false); setShowWin(false); setGameOver(false); };

  const fontSize = (v: number) => v >= 1024 ? 'text-lg' : v >= 128 ? 'text-xl' : 'text-2xl';

  return (
    <div className="flex flex-col items-center select-none">
      <div className="w-full max-w-[340px]">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-3xl font-bold text-gray-800">2048</h1>
          <button onClick={newGame} className="px-4 py-1.5 bg-gray-700 text-white rounded font-semibold text-sm hover:bg-gray-800">
            New Game
          </button>
        </div>
        <div className="flex gap-3 mb-3">
          <div className="flex-1 bg-gray-700 text-white rounded px-3 py-1 text-center">
            <div className="text-[10px] uppercase tracking-wider opacity-70">Score</div>
            <div className="text-lg font-bold">{score}</div>
          </div>
          <div className="flex-1 bg-gray-700 text-white rounded px-3 py-1 text-center">
            <div className="text-[10px] uppercase tracking-wider opacity-70">Best</div>
            <div className="text-lg font-bold">{best}</div>
          </div>
        </div>
        <div id="game2048-board" className="relative bg-gray-300 rounded-lg p-2 grid grid-cols-4 gap-2">
          {board.flat().map((v, i) => (
            <div key={i} className={`aspect-square rounded-md flex items-center justify-center font-bold transition-all duration-100
              ${TILE_COLORS[v] || 'bg-yellow-200 text-gray-800'} ${fontSize(v)} ${v ? 'animate-pop' : ''}`}>
              {v || ''}
            </div>
          ))}
          {showWin && (
            <div className="absolute inset-0 bg-yellow-300/80 rounded-lg flex flex-col items-center justify-center gap-3">
              <div className="text-4xl font-bold text-gray-800">You Win!</div>
              <div className="flex gap-2">
                <button onClick={() => setShowWin(false)} className="px-4 py-2 bg-gray-700 text-white rounded font-semibold text-sm">
                  Continue
                </button>
                <button onClick={newGame} className="px-4 py-2 bg-gray-500 text-white rounded font-semibold text-sm">
                  New Game
                </button>
              </div>
            </div>
          )}
          {gameOver && (
            <div className="absolute inset-0 bg-gray-800/70 rounded-lg flex flex-col items-center justify-center gap-3">
              <div className="text-3xl font-bold text-white">Game Over</div>
              <button onClick={newGame} className="px-4 py-2 bg-white text-gray-800 rounded font-semibold text-sm">
                Try Again
              </button>
            </div>
          )}
        </div>
        <p className="text-xs text-gray-400 text-center mt-3">Use arrow keys or swipe to play</p>
      </div>
      <style>{`@keyframes pop{0%{transform:scale(0)}50%{transform:scale(1.1)}100%{transform:scale(1)}}.animate-pop{animation:pop .15s ease-out}`}</style>
    </div>
  );
}
