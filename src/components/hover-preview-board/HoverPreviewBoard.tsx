// Renders a small non-interactive board preview near hovered engine or game moves.
import { Chessboard } from "react-chessboard";
import type { PieceRenderObject } from "react-chessboard";
import "./HoverPreviewBoard.css";
import type { BoardOrientation, SquareStyles } from "../../domain/types";

type HoverPreviewBoardProps = {
  fen: string | null;
  x: number;
  y: number;
  orientation: BoardOrientation;
  customPieces: PieceRenderObject | null;
  customSquareStyles: SquareStyles;
};

/** Shows a fixed-position board preview when a hover FEN is available. */
export default function HoverPreviewBoard({
  fen,
  x,
  y,
  orientation,
  customPieces,
  customSquareStyles,
}: HoverPreviewBoardProps) {
  if (!fen) return null;

  return (
    <div
      className="hover-board-container"
      style={{
        left: x + 15,
        top: y + 15,
      }}
    >
      <Chessboard
        options={{
          position: fen,
          boardOrientation: orientation,
          pieces: customPieces ?? undefined,
          animationDurationInMs: 0,
          darkSquareStyle: { backgroundColor: "#779954" },
          lightSquareStyle: { backgroundColor: "#e9edcc" },
          squareStyles: customSquareStyles,
          allowDragging: false,
        }}
      />
    </div>
  );
}
