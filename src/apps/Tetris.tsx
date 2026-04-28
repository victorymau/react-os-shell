import { useState, useCallback, useEffect, useRef } from 'react';

const COLS = 10, ROWS = 20, CELL = 28;
const SHAPES: number[][][] = [
  [[1,1,1,1]],                     // I
  [[1,1],[1,1]],                   // O
  [[0,1,0],[1,1,1]],              // T
  [[0,1,1],[1,1,0]],              // S
  [[1,1,0],[0,1,1]],              // Z
  [[1,0,0],[1,1,1]],              // J
  [[0,0,1],[1,1,1]],              // L
];
const COLORS = ['#00f0f0','#f0f000','#a000f0','#00f000','#f00000','#0000f0','#f0a000'];

type Piece = { shape: number[][]; color: string; x: number; y: number; idx: number };

const rotate = (m: number[][]): number[][] =>
  m[0].map((_, i) => m.map(r => r[i]).reverse());

const newPiece = (idx: number): Piece => ({
  shape: SHAPES[idx], color: COLORS[idx], idx,
  x: Math.floor((COLS - SHAPES[idx][0].length) / 2), y: 0,
});

const randIdx = () => Math.floor(Math.random() * 7);

const valid = (board: string[][], shape: number[][], x: number, y: number) =>
  shape.every((row, dy) =>
    row.every((v, dx) =>
      !v || (x + dx >= 0 && x + dx < COLS && y + dy < ROWS && (y + dy < 0 || !board[y + dy][x + dx]))
    )
  );

const merge = (board: string[][], piece: Piece): string[][] =>
  board.map((row, r) =>
    row.map((cell, c) => {
      const dy = r - piece.y, dx = c - piece.x;
      if (dy >= 0 && dy < piece.shape.length && dx >= 0 && dx < piece.shape[0].length && piece.shape[dy][dx])
        return piece.color;
      return cell;
    })
  );

const emptyBoard = (): string[][] => Array.from({ length: ROWS }, () => Array(COLS).fill(''));

export default function Tetris() {
  const [board, setBoard] = useState(emptyBoard);
  const [piece, setPiece] = useState<Piece>(() => newPiece(randIdx()));
  const [nextIdx, setNextIdx] = useState(randIdx);
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [level, setLevel] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [paused, setPaused] = useState(false);
  const [started, setStarted] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval>>();
  const pieceRef = useRef(piece);
  const boardRef = useRef(board);
  pieceRef.current = piece;
  boardRef.current = board;

  const lockPiece = useCallback(() => {
    const p = pieceRef.current;
    let b = merge(boardRef.current, p);
    // Clear lines
    const full = b.reduce<number[]>((acc, row, i) => (row.every(c => c) ? [...acc, i] : acc), []);
    if (full.length) {
      full.forEach(i => { b.splice(i, 1); b.unshift(Array(COLS).fill('')); });
      const pts = [0, 100, 300, 500, 800][full.length] || 800;
      setScore(s => s + pts * (level + 1));
      setLines(l => {
        const nl = l + full.length;
        setLevel(Math.floor(nl / 10));
        return nl;
      });
    }
    setBoard(b);
    // Spawn next
    const np = newPiece(nextIdx);
    if (!valid(b, np.shape, np.x, np.y)) {
      setGameOver(true);
      return;
    }
    setPiece(np);
    setNextIdx(randIdx());
  }, [nextIdx, level]);

  const drop = useCallback(() => {
    const p = pieceRef.current;
    if (valid(boardRef.current, p.shape, p.x, p.y + 1)) {
      setPiece({ ...p, y: p.y + 1 });
    } else {
      lockPiece();
    }
  }, [lockPiece]);

  // Tick
  useEffect(() => {
    if (gameOver || paused || !started) return;
    clearInterval(tickRef.current);
    tickRef.current = setInterval(drop, Math.max(100, 800 - level * 70));
    return () => clearInterval(tickRef.current);
  }, [drop, level, gameOver, paused, started]);

  const move = useCallback((dx: number, dy: number) => {
    const p = pieceRef.current;
    if (valid(boardRef.current, p.shape, p.x + dx, p.y + dy))
      setPiece({ ...p, x: p.x + dx, y: p.y + dy });
  }, []);

  const rotatePiece = useCallback(() => {
    const p = pieceRef.current;
    const r = rotate(p.shape);
    // Wall kick offsets
    for (const dx of [0, -1, 1, -2, 2]) {
      if (valid(boardRef.current, r, p.x + dx, p.y)) {
        setPiece({ ...p, shape: r, x: p.x + dx });
        return;
      }
    }
  }, []);

  const hardDrop = useCallback(() => {
    const p = pieceRef.current;
    let ny = p.y;
    while (valid(boardRef.current, p.shape, p.x, ny + 1)) ny++;
    setPiece({ ...p, y: ny });
    // Use setTimeout to ensure state is set before lock
    setTimeout(() => lockPiece(), 0);
  }, [lockPiece]);

  const restart = useCallback(() => {
    setBoard(emptyBoard());
    const idx = randIdx();
    setPiece(newPiece(idx));
    setNextIdx(randIdx());
    setScore(0);
    setLines(0);
    setLevel(0);
    setGameOver(false);
    setPaused(false);
    setStarted(true);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'p' || e.key === 'P') { if (started && !gameOver) setPaused(v => !v); return; }
      if (gameOver || paused || !started) return;
      switch (e.key) {
        case 'ArrowLeft': e.preventDefault(); move(-1, 0); break;
        case 'ArrowRight': e.preventDefault(); move(1, 0); break;
        case 'ArrowDown': e.preventDefault(); move(0, 1); break;
        case 'ArrowUp': e.preventDefault(); rotatePiece(); break;
        case ' ': e.preventDefault(); hardDrop(); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [move, rotatePiece, hardDrop, gameOver, paused, started]);

  // Ghost piece
  let ghostY = piece.y;
  while (valid(board, piece.shape, piece.x, ghostY + 1)) ghostY++;

  // Render board with piece & ghost
  const display = board.map((row, r) =>
    row.map((cell, c) => {
      const dy = r - piece.y, dx = c - piece.x;
      const inPiece = dy >= 0 && dy < piece.shape.length && dx >= 0 && dx < piece.shape[0].length && piece.shape[dy][dx];
      if (inPiece) return piece.color;
      const gdy = r - ghostY, gdx = c - piece.x;
      const inGhost = gdy >= 0 && gdy < piece.shape.length && gdx >= 0 && gdx < piece.shape[0].length && piece.shape[gdy][gdx];
      if (inGhost && !cell) return 'ghost';
      return cell;
    })
  );

  const nextShape = SHAPES[nextIdx];
  const nextColor = COLORS[nextIdx];

  return (
    <div className="flex items-center justify-center select-none" tabIndex={0}>
      <div className="flex gap-4">
        {/* Board */}
        <div className="border-2 border-gray-600" style={{ width: COLS * CELL, height: ROWS * CELL }}>
          {display.map((row, r) => (
            <div key={r} className="flex">
              {row.map((cell, c) => (
                <div
                  key={c}
                  style={{
                    width: CELL, height: CELL,
                    backgroundColor: cell === 'ghost' ? 'rgba(255,255,255,0.08)' : cell || '#111',
                    border: '1px solid #222',
                    opacity: cell && cell !== 'ghost' ? 0.9 : 1,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
        {/* Side panel */}
        <div className="flex flex-col gap-3 text-white w-28">
          <div>
            <div className="text-xs text-gray-400 uppercase">Next</div>
            <div className="mt-1 p-1 bg-gray-800 rounded flex flex-col items-center justify-center" style={{ minHeight: 5 * CELL }}>
              {nextShape.map((row, r) => (
                <div key={r} className="flex">
                  {row.map((v, c) => (
                    <div key={c} style={{
                      width: CELL, height: CELL,
                      backgroundColor: v ? nextColor : 'transparent',
                      border: v ? '1px solid rgba(0,0,0,0.3)' : 'none',
                    }} />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-400 uppercase">Score</div>
            <div className="text-lg font-bold">{score}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400 uppercase">Level</div>
            <div className="text-lg font-bold">{level}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400 uppercase">Lines</div>
            <div className="text-lg font-bold">{lines}</div>
          </div>
          <div className="text-xs text-gray-500 mt-2 space-y-0.5">
            <div>Arrows: Move/Rotate</div>
            <div>Space: Hard Drop</div>
            <div>P: Pause</div>
          </div>
          {(!started || gameOver) && (
            <button onClick={restart} className="mt-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium">
              {gameOver ? 'Play Again' : 'Start'}
            </button>
          )}
        </div>
      </div>
      {/* Overlays */}
      {paused && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="text-white text-3xl font-bold">PAUSED</div>
        </div>
      )}
      {gameOver && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="text-center">
            <div className="text-white text-3xl font-bold">GAME OVER</div>
            <div className="text-gray-300 mt-2">Score: {score}</div>
          </div>
        </div>
      )}
    </div>
  );
}
