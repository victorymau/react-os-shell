import { useState, useCallback } from 'react'

type Piece = { type: string; color: 'w' | 'b' } | null
type Board = Piece[][]
type Pos = [number, number]

const ICONS: Record<string, string> = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
}

const initBoard = (): Board => {
  const b: Board = Array.from({ length: 8 }, () => Array(8).fill(null))
  const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
  for (let c = 0; c < 8; c++) {
    b[0][c] = { type: back[c], color: 'b' }
    b[1][c] = { type: 'P', color: 'b' }
    b[6][c] = { type: 'P', color: 'w' }
    b[7][c] = { type: back[c], color: 'w' }
  }
  return b
}

const inBounds = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8

function getValidMoves(board: Board, [r, c]: Pos): Pos[] {
  const p = board[r][c]
  if (!p) return []
  const moves: Pos[] = []
  const add = (nr: number, nc: number) => {
    if (!inBounds(nr, nc)) return false
    const t = board[nr][nc]
    if (t && t.color === p.color) return false
    moves.push([nr, nc])
    return !t
  }
  const slide = (dr: number, dc: number) => {
    for (let i = 1; i < 8; i++) if (!add(r + dr * i, c + dc * i)) break
  }

  switch (p.type) {
    case 'P': {
      const dir = p.color === 'w' ? -1 : 1
      const start = p.color === 'w' ? 6 : 1
      if (inBounds(r + dir, c) && !board[r + dir][c]) {
        moves.push([r + dir, c])
        if (r === start && !board[r + 2 * dir][c]) moves.push([r + 2 * dir, c])
      }
      for (const dc of [-1, 1]) {
        const nr = r + dir, nc = c + dc
        if (inBounds(nr, nc) && board[nr][nc] && board[nr][nc]!.color !== p.color)
          moves.push([nr, nc])
      }
      break
    }
    case 'R': [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr,dc]) => slide(dr,dc)); break
    case 'B': [[-1,-1],[-1,1],[1,-1],[1,1]].forEach(([dr,dc]) => slide(dr,dc)); break
    case 'Q': [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]].forEach(([dr,dc]) => slide(dr,dc)); break
    case 'N': [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr,dc]) => add(r+dr,c+dc)); break
    case 'K': [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(([dr,dc]) => add(r+dr,c+dc)); break
  }
  return moves
}

function cloneBoard(b: Board): Board { return b.map(row => row.map(p => p ? { ...p } : null)) }

export default function Chess() {
  const [board, setBoard] = useState<Board>(initBoard)
  const [selected, setSelected] = useState<Pos | null>(null)
  const [validMoves, setValidMoves] = useState<Pos[]>([])
  const [turn, setTurn] = useState<'w' | 'b'>('w')
  const [captured, setCaptured] = useState<{ w: string[]; b: string[] }>({ w: [], b: [] })
  const [gameOver, setGameOver] = useState(false)

  const aiMove = useCallback((b: Board, cap: { w: string[]; b: string[] }) => {
    const allMoves: { from: Pos; to: Pos }[] = []
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++)
        if (b[r][c]?.color === 'b')
          getValidMoves(b, [r, c]).forEach(to => allMoves.push({ from: [r, c], to }))
    if (!allMoves.length) { setGameOver(true); return }
    const m = allMoves[Math.floor(Math.random() * allMoves.length)]
    const nb = cloneBoard(b)
    const newCap = { w: [...cap.w], b: [...cap.b] }
    const target = nb[m.to[0]][m.to[1]]
    if (target) newCap.w.push(ICONS[target.color + target.type])
    nb[m.to[0]][m.to[1]] = nb[m.from[0]][m.from[1]]
    nb[m.from[0]][m.from[1]] = null
    setBoard(nb)
    setCaptured(newCap)
    setTurn('w')
  }, [])

  const handleClick = (r: number, c: number) => {
    if (gameOver || turn !== 'w') return
    if (selected) {
      if (validMoves.some(([mr, mc]) => mr === r && mc === c)) {
        const nb = cloneBoard(board)
        const newCap = { w: [...captured.w], b: [...captured.b] }
        const target = nb[r][c]
        if (target) newCap.b.push(ICONS[target.color + target.type])
        nb[r][c] = nb[selected[0]][selected[1]]
        nb[selected[0]][selected[1]] = null
        setBoard(nb)
        setCaptured(newCap)
        setSelected(null)
        setValidMoves([])
        setTurn('b')
        setTimeout(() => aiMove(nb, newCap), 300)
        return
      }
      if (board[r][c]?.color === 'w') {
        setSelected([r, c])
        setValidMoves(getValidMoves(board, [r, c]))
        return
      }
      setSelected(null)
      setValidMoves([])
      return
    }
    if (board[r][c]?.color === 'w') {
      setSelected([r, c])
      setValidMoves(getValidMoves(board, [r, c]))
    }
  }

  const reset = () => {
    setBoard(initBoard())
    setSelected(null)
    setValidMoves([])
    setTurn('w')
    setCaptured({ w: [], b: [] })
    setGameOver(false)
  }

  const isValid = (r: number, c: number) => validMoves.some(([mr, mc]) => mr === r && mc === c)
  const isSel = (r: number, c: number) => selected?.[0] === r && selected?.[1] === c

  return (
    <div className="flex flex-col items-center gap-3 p-4">
      <div className="flex items-center justify-between w-full max-w-md">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          {gameOver ? 'Game Over' : turn === 'w' ? '♔ White to move' : '♚ Black thinking...'}
        </span>
        <button onClick={reset} className="px-3 py-1 text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-600">
          New Game
        </button>
      </div>

      {captured.b.length > 0 && (
        <div className="text-sm text-gray-500 dark:text-gray-400 w-full max-w-md">
          Captured: {captured.b.join(' ')}
        </div>
      )}

      <div className="border-2 border-gray-700 dark:border-gray-400 rounded overflow-hidden">
        {board.map((row, r) => (
          <div key={r} className="flex">
            {row.map((piece, c) => {
              const light = (r + c) % 2 === 0
              const sel = isSel(r, c)
              const valid = isValid(r, c)
              return (
                <div
                  key={c}
                  onClick={() => handleClick(r, c)}
                  className={`w-[52px] h-[52px] flex items-center justify-center text-3xl cursor-pointer relative select-none
                    ${light ? 'bg-amber-100 dark:bg-amber-200' : 'bg-amber-700 dark:bg-amber-800'}
                    ${sel ? 'ring-2 ring-inset ring-blue-500' : ''}
                    ${valid && piece ? 'ring-2 ring-inset ring-red-400' : ''}
                  `}
                >
                  {piece && <span className={piece.color === 'w' ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : 'text-gray-900 drop-shadow-[0_1px_1px_rgba(255,255,255,0.3)]'}>
                    {ICONS[piece.color + piece.type]}
                  </span>}
                  {valid && !piece && <div className="w-3 h-3 rounded-full bg-green-500 opacity-60" />}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {captured.w.length > 0 && (
        <div className="text-sm text-gray-500 dark:text-gray-400 w-full max-w-md">
          Captured: {captured.w.join(' ')}
        </div>
      )}
    </div>
  )
}
