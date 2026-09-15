// Uses the original local Chess.com-style piece assets on every board and preview.
import type { PieceRenderObject } from 'react-chessboard';

export const pieces: PieceRenderObject = {};
for (const color of ['w', 'b']) for (const piece of ['P', 'N', 'B', 'R', 'Q', 'K']) {
  pieces[`${color}${piece}`] =
    /** Renders the original piece bitmap without browser dragging or pointer interception. */
    function OriginalPiece() {
      return <img src={`${import.meta.env.BASE_URL}pieces/${color}${piece.toLowerCase()}.png`} alt="" draggable={false} style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }} />;
    };
}
export const boardColors = {
  darkSquareStyle: { backgroundColor: '#779954' }, lightSquareStyle: { backgroundColor: '#e9edcc' },
  darkSquareNotationStyle: { color: '#e9edcc', fontWeight: 700 }, lightSquareNotationStyle: { color: '#779954', fontWeight: 700 },
};
