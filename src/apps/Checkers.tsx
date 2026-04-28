import { useState, useCallback, useEffect } from 'react';

type Cell = null | { color: 'r' | 'b'; king: boolean };
type Pos = [number, number];

const DIRS_B: Pos[] = [[-1, -1], [-1, 1]]; // black moves up
const DIRS_R: Pos[] = [[1, -1], [1, 1]];   // red moves down
const ALL: Pos[] = [...DIRS_B, ...DIRS_R];

const initBoard = (): Cell[][] => {
  const b: Cell[][] = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 8; c++)
      if ((r + c) % 2 === 1) b[r][c] = { color: 'r', king: false };
  for (let r = 5; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if ((r + c) % 2 === 1) b[r][c] = { color: 'b', king: false };
  return b;
};

const clone = (b: Cell[][]): Cell[][] => b.map(r => r.map(c => c ? { ...c } : null));
const inB = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;

const getJumps = (b: Cell[][], r: number, c: number): { to: Pos; cap: Pos }[] => {
  const p = b[r][c];
  if (!p) return [];
  const dirs = p.king ? ALL : p.color === 'b' ? DIRS_B : DIRS_R;
  const jumps: { to: Pos; cap: Pos }[] = [];
  for (const [dr, dc] of dirs) {
    const mr = r + dr, mc = c + dc, tr = r + 2 * dr, tc = c + 2 * dc;
    if (inB(tr, tc) && b[mr][mc] && b[mr][mc]!.color !== p.color && !b[tr][tc])
      jumps.push({ to: [tr, tc], cap: [mr, mc] });
  }
  return jumps;
};

const getMoves = (b: Cell[][], r: number, c: number): Pos[] => {
  const p = b[r][c];
  if (!p) return [];
  const dirs = p.king ? ALL : p.color === 'b' ? DIRS_B : DIRS_R;
  return dirs.filter(([dr, dc]) => { const nr = r + dr, nc = c + dc; return inB(nr, nc) && !b[nr][nc]; })
    .map(([dr, dc]) => [r + dr, c + dc] as Pos);
};

const allMoves = (b: Cell[][], color: 'r' | 'b') => {
  const pieces: { r: number; c: number; jumps: { to: Pos; cap: Pos }[]; moves: Pos[] }[] = [];
  let hasJump = false;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    if (b[r][c]?.color !== color) continue;
    const jumps = getJumps(b, r, c), moves = getMoves(b, r, c);
    if (jumps.length) hasJump = true;
    if (jumps.length || moves.length) pieces.push({ r, c, jumps, moves });
  }
  if (hasJump) return pieces.filter(p => p.jumps.length).map(p => ({ ...p, moves: [] as Pos[] }));
  return pieces;
};

export default function Checkers() {
  const [board, setBoard] = useState(initBoard);
  const [turn, setTurn] = useState<'b' | 'r'>('b');
  const [sel, setSel] = useState<Pos | null>(null);
  const [valid, setValid] = useState<Pos[]>([]);
  const [caps, setCaps] = useState({ r: 0, b: 0 });
  const [winner, setWinner] = useState<string | null>(null);
  const [jumping, setJumping] = useState(false);

  const checkWin = useCallback((b: Cell[][], next: 'r' | 'b') => {
    const m = allMoves(b, next);
    if (m.length === 0) setWinner(next === 'b' ? 'Red' : 'Black');
  }, []);

  const handleClick = useCallback((r: number, c: number) => {
    if (winner || turn !== 'b') return;
    const moves = allMoves(board, 'b');
    const mustJump = moves.length > 0 && moves[0].jumps.length > 0;

    if (jumping && sel) {
      // mid multi-jump: only allow continuing jump from selected piece
      const jumps = getJumps(board, sel[0], sel[1]);
      const j = jumps.find(j => j.to[0] === r && j.to[1] === c);
      if (!j) return;
      const nb = clone(board);
      nb[r][c] = nb[sel[0]][sel[1]];
      nb[sel[0]][sel[1]] = null;
      nb[j.cap[0]][j.cap[1]] = null;
      if (r === 0 && nb[r][c]!.color === 'b') nb[r][c]!.king = true;
      setCaps(p => ({ ...p, r: p.r + 1 }));
      const moreJumps = getJumps(nb, r, c);
      if (moreJumps.length && !(r === 0 && !board[sel[0]][sel[1]]!.king)) {
        setBoard(nb); setSel([r, c]); setValid(moreJumps.map(j => j.to));
        return;
      }
      setBoard(nb); setSel(null); setValid([]); setJumping(false); setTurn('r');
      checkWin(nb, 'r');
      return;
    }

    // selecting a piece
    if (board[r][c]?.color === 'b') {
      const piece = moves.find(m => m.r === r && m.c === c);
      if (!piece) return;
      setSel([r, c]);
      setValid(mustJump ? piece.jumps.map(j => j.to) : piece.moves);
      return;
    }

    // moving to a square
    if (!sel || !valid.some(([vr, vc]) => vr === r && vc === c)) return;
    const nb = clone(board);
    if (mustJump) {
      const piece = moves.find(m => m.r === sel[0] && m.c === sel[1])!;
      const j = piece.jumps.find(j => j.to[0] === r && j.to[1] === c)!;
      nb[r][c] = nb[sel[0]][sel[1]]; nb[sel[0]][sel[1]] = null;
      nb[j.cap[0]][j.cap[1]] = null;
      const wasKing = nb[r][c]!.king;
      if (r === 0 && nb[r][c]!.color === 'b') nb[r][c]!.king = true;
      setCaps(p => ({ ...p, r: p.r + 1 }));
      const moreJumps = getJumps(nb, r, c);
      if (moreJumps.length && !(r === 0 && !wasKing)) {
        setBoard(nb); setSel([r, c]); setValid(moreJumps.map(j => j.to)); setJumping(true);
        return;
      }
    } else {
      nb[r][c] = nb[sel[0]][sel[1]]; nb[sel[0]][sel[1]] = null;
      if (r === 0 && nb[r][c]!.color === 'b') nb[r][c]!.king = true;
    }
    setBoard(nb); setSel(null); setValid([]); setTurn('r');
    checkWin(nb, 'r');
  }, [board, turn, sel, valid, winner, jumping, checkWin]);

  // AI turn
  useEffect(() => {
    if (turn !== 'r' || winner) return;
    const t = setTimeout(() => {
      const moves = allMoves(board, 'r');
      if (moves.length === 0) { setWinner('Black'); return; }
      const mustJump = moves[0].jumps.length > 0;
      const pick = moves[Math.floor(Math.random() * moves.length)];
      const nb = clone(board);
      let cr = pick.r, cc = pick.c, capCount = 0;
      if (mustJump) {
        let jumps = pick.jumps;
        while (jumps.length) {
          const j = jumps[Math.floor(Math.random() * jumps.length)];
          nb[j.to[0]][j.to[1]] = nb[cr][cc]; nb[cr][cc] = null;
          nb[j.cap[0]][j.cap[1]] = null; capCount++;
          const wasKing = nb[j.to[0]][j.to[1]]!.king;
          if (j.to[0] === 7) nb[j.to[0]][j.to[1]]!.king = true;
          cr = j.to[0]; cc = j.to[1];
          if (j.to[0] === 7 && !wasKing) break;
          jumps = getJumps(nb, cr, cc);
        }
      } else {
        const m = pick.moves[Math.floor(Math.random() * pick.moves.length)];
        nb[m[0]][m[1]] = nb[cr][cc]; nb[cr][cc] = null;
        if (m[0] === 7) nb[m[0]][m[1]]!.king = true;
      }
      setCaps(p => ({ ...p, b: p.b + capCount }));
      setBoard(nb); setTurn('b');
      checkWin(nb, 'b');
    }, 400);
    return () => clearTimeout(t);
  }, [turn, board, winner, checkWin]);

  const reset = () => { setBoard(initBoard()); setTurn('b'); setSel(null); setValid([]); setCaps({ r: 0, b: 0 }); setWinner(null); setJumping(false); };
  const isValid = (r: number, c: number) => valid.some(([vr, vc]) => vr === r && vc === c);
  const isSel = (r: number, c: number) => sel?.[0] === r && sel?.[1] === c;

  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <div className="flex items-center justify-between w-full max-w-[352px]">
        <span className="text-sm font-medium">{winner ? `${winner} wins!` : turn === 'b' ? 'Your turn (Black)' : 'Red is thinking...'}</span>
        <button onClick={reset} className="px-3 py-1 text-xs bg-gray-700 text-white rounded hover:bg-gray-600">New Game</button>
      </div>
      <div className="text-xs text-gray-500 flex gap-4">
        <span>Red captured: {caps.r}</span><span>Black captured: {caps.b}</span>
      </div>
      <div className="border-2 border-gray-800 inline-block">
        {board.map((row, r) => (
          <div key={r} className="flex">
            {row.map((cell, c) => {
              const dark = (r + c) % 2 === 1;
              return (
                <div key={c} onClick={() => dark && handleClick(r, c)}
                  className={`w-[41px] h-[41px] flex items-center justify-center ${dark ? 'bg-emerald-800' : 'bg-amber-100'} ${isValid(r, c) ? 'ring-2 ring-inset ring-green-400 bg-green-700/60 cursor-pointer' : ''} ${dark ? 'cursor-pointer' : ''}`}>
                  {cell && (
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-md ${cell.color === 'r' ? 'bg-red-600 border-2 border-red-400' : 'bg-gray-900 border-2 border-gray-600'} ${isSel(r, c) ? 'ring-2 ring-yellow-400 ring-offset-1' : ''}`}>
                      {cell.king && <span className="text-yellow-300 text-sm">&#9813;</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
