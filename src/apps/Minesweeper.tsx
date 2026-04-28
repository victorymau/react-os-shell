import { useState, useCallback, useEffect, useRef } from 'react';
import { submitGameScore, getGameLeaderboard } from '../api/analytics';
import Modal, { useWindowMenuItem } from '../shell/Modal';
import toast from '../shell/toast';
import { formatDate } from '../utils/date';

const ROWS = 9, COLS = 9, MINES = 10;
const DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const NUM_COLORS: Record<number,string> = {1:'text-blue-700',2:'text-green-700',3:'text-red-600',4:'text-purple-700',5:'text-red-900',6:'text-teal-600',7:'text-black',8:'text-gray-500'};

type Cell = { mine: boolean; revealed: boolean; flagged: boolean; adjacent: number };
type Status = 'playing' | 'won' | 'lost';

function createBoard(): Cell[][] {
  return Array.from({length:ROWS},()=>Array.from({length:COLS},()=>({mine:false,revealed:false,flagged:false,adjacent:0})));
}

function placeMines(board: Cell[][], safeR: number, safeC: number) {
  const b = board.map(r=>r.map(c=>({...c})));
  let placed = 0;
  while (placed < MINES) {
    const r = Math.floor(Math.random()*ROWS), c = Math.floor(Math.random()*COLS);
    if (b[r][c].mine || (Math.abs(r-safeR)<=1 && Math.abs(c-safeC)<=1)) continue;
    b[r][c].mine = true;
    placed++;
  }
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) {
    if (b[r][c].mine) continue;
    b[r][c].adjacent = DIRS.reduce((s,[dr,dc])=>{
      const nr=r+dr,nc=c+dc;
      return s+(nr>=0&&nr<ROWS&&nc>=0&&nc<COLS&&b[nr][nc].mine?1:0);
    },0);
  }
  return b;
}

function floodFill(board: Cell[][], r: number, c: number) {
  const b = board.map(row=>row.map(cell=>({...cell})));
  const stack: [number,number][] = [[r,c]];
  while (stack.length) {
    const [cr,cc] = stack.pop()!;
    if (cr<0||cr>=ROWS||cc<0||cc>=COLS||b[cr][cc].revealed||b[cr][cc].flagged||b[cr][cc].mine) continue;
    b[cr][cc].revealed = true;
    if (b[cr][cc].adjacent === 0) DIRS.forEach(([dr,dc])=>stack.push([cr+dr,cc+dc]));
  }
  return b;
}

function checkWin(board: Cell[][]): boolean {
  return board.every(row=>row.every(c=>c.mine||c.revealed));
}

export default function Minesweeper() {
  const [board, setBoard] = useState(createBoard);
  const [status, setStatus] = useState<Status>('playing');
  const [started, setStarted] = useState(false);
  const [time, setTime] = useState(0); // in centiseconds (hundredths)
  const timerRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const startTimeRef = useRef(0);
  const [clicks, setClicks] = useState(0);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboard, setLeaderboard] = useState<{ rank: number; player_name: string; time_seconds: number; clicks: number; played_at: string }[]>([]);
  const [loadingLb, setLoadingLb] = useState(false);
  const scoreSubmitted = useRef(false);

  const flagCount = board.reduce((s,r)=>s+r.reduce((s2,c)=>s2+(c.flagged?1:0),0),0);

  const timeSeconds = time / 100; // convert centiseconds to seconds with 2 decimals

  useEffect(()=>{
    if (started && status==='playing') {
      startTimeRef.current = performance.now() - time * 10;
      timerRef.current = setInterval(()=>{
        const elapsed = Math.floor((performance.now() - startTimeRef.current) / 10);
        setTime(Math.min(elapsed, 99999));
      }, 10);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return ()=>{if(timerRef.current)clearInterval(timerRef.current)};
  },[started,status]);

  const restart = useCallback(()=>{
    setBoard(createBoard());
    setStatus('playing');
    setStarted(false);
    setTime(0);
    startTimeRef.current = 0;
    setClicks(0);
    scoreSubmitted.current = false;
  },[]);

  const handleClick = useCallback((r:number,c:number)=>{
    if (status!=='playing') return;
    setBoard(prev=>{
      let b = prev;
      if (!started) {
        b = placeMines(prev,r,c);
        setStarted(true);
      }
      const cell = b[r][c];
      if (cell.revealed||cell.flagged) return b;
      if (cell.mine) {
        const lost = b.map(row=>row.map(c=>({...c,revealed:c.mine?true:c.revealed})));
        lost[r][c] = {...lost[r][c], revealed:true};
        setStatus('lost');
        return lost;
      }
      const next = floodFill(b,r,c);
      if (checkWin(next)) setStatus('won');
      return next;
    });
  },[status,started]);

  const handleContext = useCallback((e:React.MouseEvent,r:number,c:number)=>{
    e.preventDefault();
    if (status!=='playing') return;
    setBoard(prev=>{
      if (prev[r][c].revealed) return prev;
      const b = prev.map(row=>row.map(cell=>({...cell})));
      b[r][c].flagged = !b[r][c].flagged;
      return b;
    });
  },[status]);

  // Chord click: both buttons on a revealed number — auto-reveal adjacent if flags match
  const handleChord = useCallback((r:number,c:number)=>{
    if (status!=='playing') return;
    setBoard(prev=>{
      const cell = prev[r][c];
      if (!cell.revealed || cell.adjacent === 0) return prev;
      // Count adjacent flags
      const adjFlags = DIRS.reduce((s,[dr,dc])=>{
        const nr=r+dr,nc=c+dc;
        return s+(nr>=0&&nr<ROWS&&nc>=0&&nc<COLS&&prev[nr][nc].flagged?1:0);
      },0);
      if (adjFlags !== cell.adjacent) return prev;
      // Reveal all unflagged adjacent cells
      let b = prev.map(row=>row.map(c=>({...c})));
      let hitMine = false;
      for (const [dr,dc] of DIRS) {
        const nr=r+dr,nc=c+dc;
        if (nr<0||nr>=ROWS||nc<0||nc>=COLS||b[nr][nc].revealed||b[nr][nc].flagged) continue;
        if (b[nr][nc].mine) { hitMine = true; b[nr][nc].revealed = true; }
        else b = floodFill(b,nr,nc);
      }
      if (hitMine) {
        b = b.map(row=>row.map(c=>({...c,revealed:c.mine?true:c.revealed})));
        setStatus('lost');
      } else if (checkWin(b)) setStatus('won');
      return b;
    });
  },[status]);

  const buttonsDown = useRef(0);

  // Capture precise time on win/loss
  const finalTimeRef = useRef(0);
  useEffect(() => {
    if (status === 'won' || status === 'lost') {
      // Capture the exact elapsed time when game ends
      if (startTimeRef.current > 0) {
        finalTimeRef.current = Math.round((performance.now() - startTimeRef.current) / 10) / 100; // seconds with 2 decimals
      } else {
        finalTimeRef.current = timeSeconds;
      }
    }
  }, [status]);

  // Submit score on win
  useEffect(() => {
    if (status === 'won' && !scoreSubmitted.current) {
      scoreSubmitted.current = true;
      const t = finalTimeRef.current || timeSeconds;
      const tFixed = parseFloat(t.toFixed(2));
      submitGameScore({ game: 'minesweeper', won: true, time_seconds: tFixed, clicks })
        .then(res => { toast.success(`You won! Rank #${res.rank} with ${tFixed}s and ${clicks} clicks`); })
        .catch(() => { toast.success(`You won! ${tFixed}s and ${clicks} clicks`); });
    }
  }, [status, clicks]);

  // Fetch leaderboard (no-op when apiClient isn't wired)
  const fetchLeaderboard = useCallback(() => {
    setLoadingLb(true);
    getGameLeaderboard('minesweeper')
      .then(res => setLeaderboard(res.results || []))
      .catch(() => setLeaderboard([]))
      .finally(() => setLoadingLb(false));
  }, []);

  // Register "Leaderboard" in the window title menu
  const openLb = useCallback(() => { fetchLeaderboard(); setShowLeaderboard(true); }, [fetchLeaderboard]);
  useWindowMenuItem('Leaderboard', openLb, <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0016.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.003 6.003 0 01-2.27.853m0 0h.008v.008h-.008v-.008z" /></svg>);

  const face = status==='lost'?'😵':status==='won'?'😎':'🙂';

  return (
    <div className="flex flex-col items-center select-none" onContextMenu={e => e.preventDefault()}>
      <div className="bg-gray-300 border-4 border-t-white border-l-white border-r-gray-500 border-b-gray-500 p-2">
        {/* Header */}
        <div className="flex items-center justify-between bg-gray-300 border-2 border-t-gray-500 border-l-gray-500 border-r-white border-b-white p-1 mb-2">
          <div className="bg-black text-red-500 font-mono font-bold text-xl px-1 w-14 text-center tracking-wider">
            {String(Math.max(MINES-flagCount,0)).padStart(3,'0')}
          </div>
          <button onClick={restart} className="text-xl w-8 h-8 flex items-center justify-center bg-gray-300 border-2 border-t-white border-l-white border-r-gray-500 border-b-gray-500 active:border-t-gray-500 active:border-l-gray-500 active:border-r-white active:border-b-white cursor-pointer">
            {face}
          </button>
          <div className="bg-black text-red-500 font-mono font-bold text-base px-1 w-[70px] text-center tracking-wider">
            {timeSeconds.toFixed(2)}
          </div>
        </div>
        {/* Grid */}
        <div className="border-2 border-t-gray-500 border-l-gray-500 border-r-white border-b-white">
          {board.map((row,r)=>(
            <div key={r} className="flex">
              {row.map((cell,c)=>{
                const revealed = cell.revealed;
                const base = revealed
                  ? 'w-[35px] h-[35px] flex items-center justify-center text-sm font-bold border border-gray-400'
                  : 'w-[35px] h-[35px] flex items-center justify-center text-sm font-bold border-2 border-t-white border-l-white border-r-gray-500 border-b-gray-500 cursor-pointer active:border active:border-gray-400';
                const bg = revealed && cell.mine && status==='lost' ? 'bg-red-500' : revealed ? 'bg-gray-300' : 'bg-gray-300';
                let content: React.ReactNode = null;
                let color = '';
                if (revealed && cell.mine) { content = '💣'; }
                else if (revealed && cell.adjacent > 0) { content = cell.adjacent; color = NUM_COLORS[cell.adjacent]||''; }
                else if (!revealed && cell.flagged) { content = '🚩'; }
                return (
                  <div key={c} className={`${base} ${bg} ${color}`}
                    onClick={()=>{setClicks(n=>n+1);handleClick(r,c);}}
                    onContextMenu={e=>{setClicks(n=>n+1);handleContext(e,r,c);}}
                    onMouseDown={e=>{buttonsDown.current|=(1<<e.button);if((buttonsDown.current&0b101)===0b101||(buttonsDown.current&0b011)===0b011)handleChord(r,c);}}
                    onMouseUp={e=>{buttonsDown.current&=~(1<<e.button)}}
                    onMouseLeave={()=>{buttonsDown.current=0}}>
                    {content}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Stats + Leaderboard button */}
      <div className="flex items-center justify-between w-full mt-1 px-1">
        <span className="text-[10px] text-gray-400 font-mono">{clicks} clicks</span>
        <button onClick={() => { fetchLeaderboard(); setShowLeaderboard(true); }}
          className="text-[10px] text-blue-600 hover:text-blue-800 font-medium">
          Leaderboard
        </button>
      </div>

      {/* Leaderboard Modal */}
      {showLeaderboard && (
        <Modal open onClose={() => setShowLeaderboard(false)} title="Minesweeper Leaderboard" size="md">
          {loadingLb ? (
            <div className="text-center py-8 text-sm text-gray-400">Loading...</div>
          ) : leaderboard.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-400">No wins recorded yet. Be the first!</div>
          ) : (
            <div className="overflow-y-auto max-h-[60vh]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 w-12">#</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Player</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 w-16">Time</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 w-16">Clicks</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 w-24">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {leaderboard.map((s, i) => (
                    <tr key={i} className={i < 3 ? 'bg-yellow-50/50' : ''}>
                      <td className="py-1.5 px-2 font-mono text-gray-400">
                        {s.rank === 1 ? '🥇' : s.rank === 2 ? '🥈' : s.rank === 3 ? '🥉' : s.rank}
                      </td>
                      <td className="py-1.5 px-2 font-medium text-gray-900">{s.player_name}</td>
                      <td className="py-1.5 px-2 text-right font-mono text-gray-700">{Number(s.time_seconds).toFixed(2)}s</td>
                      <td className="py-1.5 px-2 text-right font-mono text-gray-500">{s.clicks}</td>
                      <td className="py-1.5 px-2 text-right text-xs text-gray-400">
                        {formatDate(s.played_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
