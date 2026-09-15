// Displays a responsive board with tap moves, drag moves, and explicit promotion choices.
import { useRef, useState, type CSSProperties } from 'react';
import { Chess, type Square } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { pieces, boardColors } from './pieces';

interface BoardProps {
  fen: string;
  flipped: boolean;
  bestMove?: string;
  lastMove?: { from: string; to: string };
  result?: string;
  onMove: (from: string, to: string, promotion?: string) => boolean;
}

/** Supports both touch selection and dragging while enforcing legal promotion moves. */
export default function Board({ fen, flipped, bestMove, lastMove, result, onMove }: BoardProps) {
  const game = new Chess(fen);
  const [selected, setSelected] = useState<Square | null>(null);
  const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(null);
  const [marks, setMarks] = useState<Record<string, CSSProperties>>({});
  const [arrows, setArrows] = useState<{ startSquare: string; endSquare: string; color: string }[]>([]);
  const drawing = useRef<string | null>(null);
  const suppressClick = useRef(false);
  const styles: Record<string, CSSProperties> = {};
  if (lastMove) {
    styles[lastMove.from] = { backgroundColor: 'rgba(255, 255, 0, .5)' };
    styles[lastMove.to] = { backgroundColor: 'rgba(255, 255, 0, .5)' };
  }
  if (bestMove) {
    styles[bestMove.slice(0, 2)] = { backgroundColor: 'rgba(0, 255, 0, .4)' };
    styles[bestMove.slice(2, 4)] = { backgroundColor: 'rgba(0, 255, 0, .4)' };
  }
  Object.assign(styles, marks);
  if (selected) {
    styles[selected] = { backgroundColor: 'rgba(232, 186, 92, .85)' };
    for (const move of game.moves({ square: selected, verbose: true })) {
      styles[move.to] = { backgroundImage: 'radial-gradient(circle, rgba(22, 37, 35, .35) 22%, transparent 24%)' };
    }
  }

  /** Opens promotion selection before committing a pawn move to its final rank. */
  function attempt(from: string, to: string): boolean {
    const choices = game.moves({ square: from as Square, verbose: true });
    const move = choices.find(
      /** Finds a legal destination for the selected piece. */
      (candidate) => candidate.to === to,
    );
    if (!move) return false;
    if (move.isPromotion()) { setPromotion({ from, to }); return false; }
    setSelected(null);
    return onMove(from, to);
  }

  /** Selects friendly pieces or moves the current selection on touch and click. */
  function clickSquare({ square }: { square: string }): void {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (promotion) return;
    if (selected && selected !== square && attempt(selected, square)) return;
    const piece = game.get(square as Square);
    setSelected(piece?.color === game.turn() && selected !== square ? square as Square : null);
  }

  /** Adapts drag events to the same legal-move path used by touch controls. */
  function dropPiece({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }): boolean {
    return !promotion && targetSquare !== null && attempt(sourceSquare, targetSquare);
  }

  /** Commits the selected promotion piece. */
  function choosePromotion(event: React.MouseEvent<HTMLButtonElement>): void {
    if (promotion) onMove(promotion.from, promotion.to, event.currentTarget.value);
    setPromotion(null);
  }

  /** Dismisses the promotion picker without making a move. */
  function cancelPromotion(): void { setPromotion(null); }

  /** Begins the original Control-drag square annotation gesture. */
  function startMarkup(event: React.PointerEvent<HTMLDivElement>): void {
    if (!event.ctrlKey || event.button !== 0) { suppressClick.current = false; return; }
    const square = (event.target as HTMLElement).closest<HTMLElement>('[data-square]')?.dataset.square;
    if (!square) return;
    drawing.current = square; suppressClick.current = true;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
  }

  /** Ends a Control gesture with a square highlight or a directional arrow. */
  function finishMarkup({ square }: { square: string }): void {
    const from = drawing.current;
    if (!from) return;
    drawing.current = null;
    if (from === square) {
      const next = { ...marks }; if (next[square]) delete next[square]; else next[square] = { backgroundColor: '#ff000066' }; setMarks(next);
    } else {
      const existing = arrows.findIndex(
        /** Finds a matching arrow so drawing it again toggles it off. */
        (arrow) => arrow.startSquare === from && arrow.endSquare === square,
      );
      if (existing >= 0) setArrows(arrows.filter(
        /** Removes only the repeated annotation. */
        (_, index) => index !== existing,
      ));
      else setArrows([...arrows, { startSquare: from, endSquare: square, color: '#ffff00cc' }]);
      setMarks({ ...marks, [square]: { backgroundColor: '#ff000066' } });
    }
  }

  /** Resolves a captured annotation gesture without letting it become a chess move. */
  function releaseMarkup(event: React.PointerEvent<HTMLDivElement>): void {
    if (!drawing.current) return;
    event.preventDefault(); event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const file = Math.floor((event.clientX - rect.left) / rect.width * 8);
    const rank = Math.floor((event.clientY - rect.top) / rect.height * 8);
    if (file >= 0 && file < 8 && rank >= 0 && rank < 8) finishMarkup({ square: `${'abcdefgh'[flipped ? 7 - file : file]}${flipped ? rank + 1 : 8 - rank}` });
    else drawing.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  /** Cancels an interrupted touch or pointer annotation without changing the board. */
  function cancelMarkup(): void { drawing.current = null; suppressClick.current = false; }

  /** Clears custom board annotations with the original right-click shortcut. */
  function clearMarkup(event: React.MouseEvent): void { event.preventDefault(); drawing.current = null; suppressClick.current = false; setMarks({}); setArrows([]); }

  /** Allows piece dragging only outside annotation gestures. */
  function canDrag(): boolean { return !drawing.current && !promotion && !result; }

  return <div className="board-surface" onContextMenu={clearMarkup} onPointerDownCapture={startMarkup} onPointerUpCapture={releaseMarkup} onPointerCancel={cancelMarkup}>
    <Chessboard options={{
      id: 'analysis-board', position: fen, boardOrientation: flipped ? 'black' : 'white',
      onPieceDrop: dropPiece, onSquareClick: clickSquare, squareStyles: styles,
      pieces, ...boardColors, animationDurationInMs: 0,
      arrows, clearArrowsOnClick: false, allowDrawingArrows: false, canDragPiece: canDrag,
    }} />
    {result && <div className="game-over-modal" role="status">{result}</div>}
    {promotion && <div className="promotion" role="dialog" aria-modal="true" aria-label="Choose promotion piece">
      <strong>Promote pawn</strong>
      <div>{['q', 'r', 'b', 'n'].map(
        /** Renders each legal promotion choice with a readable label. */
        (piece, index) => <button key={piece} value={piece} onClick={choosePromotion} autoFocus={index === 0}>
          {['Queen', 'Rook', 'Bishop', 'Knight'][index]}
        </button>,
      )}</div>
      <button onClick={cancelPromotion}>Cancel</button>
    </div>}
  </div>;
}
