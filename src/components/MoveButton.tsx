// Shows a floating position preview on hover and navigates directly on click or tap.
import { useId, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Chessboard } from 'react-chessboard';
import { boardColors, pieces } from './pieces';

interface MoveButtonProps {
  fen: string;
  flipped: boolean;
  onChoose: () => void;
  children: ReactNode;
  className?: string;
  label?: string;
  active?: boolean;
  lastMove?: { from: string; to: string };
}

/** Shares hover previews across engine lines, move history, variations, and saved games. */
export default function MoveButton({ fen, flipped, onChoose, children, className, label, active, lastMove }: MoveButtonProps) {
  const id = useId();
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const size = Math.min(260, window.innerWidth - 24, window.innerHeight - 40);
  /** Places the preview near the pointer while keeping all four edges in the viewport. */
  function place(x: number, y: number): void {
    setPosition({ x: Math.max(8, Math.min(x + 16 + size < innerWidth ? x + 16 : x - size - 16, innerWidth - size - 8)), y: Math.max(8, Math.min(y + 16 + size < innerHeight ? y + 16 : y - size - 16, innerHeight - size - 8)) });
  }
  /** Enables hover previews only for actual mouse or pen pointers. */
  function hover(event: React.PointerEvent<HTMLButtonElement>): void { if (event.pointerType !== 'touch') place(event.clientX, event.clientY); }
  /** Shows the same preview to keyboard users focusing a move. */
  function focus(event: React.FocusEvent<HTMLButtonElement>): void {
    if (!event.currentTarget.matches(':focus-visible')) return;
    const rect = event.currentTarget.getBoundingClientRect(); place(rect.right, rect.top);
  }
  /** Hides the preview without modifying the current board. */
  function clear(): void { setPosition(null); }
  /** Clears the tooltip before immediately activating the selected position. */
  function choose(): void { clear(); onChoose(); }
  return <>
    <button type="button" className={className} aria-label={label} aria-current={active ? 'step' : undefined} aria-describedby={position ? id : undefined} onPointerEnter={hover} onPointerMove={hover} onPointerLeave={clear} onFocus={focus} onBlur={clear} onClick={choose}>{children}</button>
    {position && createPortal(<div id={id} role="tooltip" className="hover-preview" data-fen={fen} style={{ left: position.x, top: position.y, width: size }}>
      <Chessboard options={{ id: `preview-${id}`, position: fen, boardOrientation: flipped ? 'black' : 'white', pieces, ...boardColors, allowDragging: false, allowDrawingArrows: false, animationDurationInMs: 0,
        squareStyles: lastMove ? { [lastMove.from]: { backgroundColor: '#ffff0066' }, [lastMove.to]: { backgroundColor: '#ffff0066' } } : {},
      }} />
    </div>, document.body)}
  </>;
}
