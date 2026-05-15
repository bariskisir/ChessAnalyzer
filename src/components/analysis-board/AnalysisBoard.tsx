// Renders the interactive chess board, engine highlights, arrows, and game-over overlay.
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import EvaluationBar from "../evaluation-bar/EvaluationBar";
import "./AnalysisBoard.css";
import type {
  BoardArrow,
  BoardOrientation,
  BoardOverlayRef,
  EngineEvaluation,
  SquareStyles,
} from "../../domain/types";

type AnalysisBoardProps = {
  currentFen: string;
  onDrop: (sourceSquare: Square, targetSquare: Square) => boolean;
  orientation: BoardOrientation;
  customSquareStyles: SquareStyles;
  customHighlights: SquareStyles;
  dragStart: Square | null;
  evalData: EngineEvaluation | null;
  calculating: boolean;
  clearBoardMarkup: () => void;
  arrows: BoardArrow[];
  gameOverVisible: boolean;
  gameOverText: string;
  boardOverlayRef: BoardOverlayRef;
  isCtrlPressed: boolean;
  onBoardMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
  onBoardMouseUp: (event: React.MouseEvent<HTMLDivElement>) => void;
  onSquareClick: (square: Square) => void;
  selectedSquare: Square | null;
};

/** Calculates the board squares highlighted for the current engine best move. */
function getEngineHighlights(
  fen: string,
  evalData: EngineEvaluation | null,
  calculating: boolean,
): SquareStyles {
  if (calculating || !evalData?.bestMove) {
    return {};
  }

  try {
    const gameCopy = new Chess(fen);
    const uci = evalData.bestMove;
    const from = uci.substring(0, 2);
    const to = uci.substring(2, 4);
    const promotion = uci.length === 5 ? uci.substring(4, 5) : undefined;
    const move = gameCopy.move({ from, to, promotion });

    return {
      [move.from]: { backgroundColor: "rgba(0, 255, 0, 0.4)" },
      [move.to]: { backgroundColor: "rgba(0, 255, 0, 0.4)" },
    };
  } catch {
    return {};
  }
}

/** Merges board highlights while keeping the selected mobile square visually dominant. */
function buildSquareStyles(
  baseStyles: SquareStyles,
  customHighlights: SquareStyles,
  engineHighlights: SquareStyles,
  dragStart: Square | null,
  selectedSquare: Square | null,
): SquareStyles {
  const filteredEngineHighlights = Object.fromEntries(
    Object.entries(engineHighlights).filter(([square]) => square !== selectedSquare),
  );

  return {
    ...baseStyles,
    ...customHighlights,
    ...filteredEngineHighlights,
    ...(dragStart ? { [dragStart]: { backgroundColor: "rgba(255, 0, 0, 0.4)" } } : {}),
    ...(selectedSquare && window.innerWidth <= 900
      ? { [selectedSquare]: { backgroundColor: "rgba(0, 0, 0, 0.85)", zIndex: 999 } }
      : {}),
  };
}

/** Displays the board surface and translates react-chessboard events into app handlers. */
export default function AnalysisBoard({
  currentFen,
  onDrop,
  orientation,
  customSquareStyles,
  customHighlights,
  dragStart,
  evalData,
  calculating,
  clearBoardMarkup,
  arrows,
  gameOverVisible,
  gameOverText,
  boardOverlayRef,
  isCtrlPressed,
  onBoardMouseDown,
  onBoardMouseUp,
  onSquareClick,
  selectedSquare,
}: AnalysisBoardProps) {
  const engineHighlights = getEngineHighlights(currentFen, evalData, calculating);
  const boardSquareStyles = buildSquareStyles(
    customSquareStyles,
    customHighlights,
    engineHighlights,
    dragStart,
    selectedSquare,
  );

  /** Prevents the browser context menu and clears custom board markup. */
  function handleContextMenu(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    clearBoardMarkup();
  }

  return (
    <div className="board-layout-main" onContextMenu={handleContextMenu}>
      <div className="board-container">
        <div className="board-row">
          <div className="eval-bar-wrapper">
            <EvaluationBar
              score={evalData?.score ?? 0}
              isMate={evalData?.isMate ?? false}
              orientation={orientation}
            />
          </div>

          <div className="board-wrapper">
            <Chessboard
              options={{
                position: currentFen,
                onPieceDrop: ({ sourceSquare, targetSquare }) => {
                  if (!targetSquare) return false;
                  return onDrop(sourceSquare as Square, targetSquare as Square);
                },
                boardOrientation: orientation,
                darkSquareStyle: { backgroundColor: "#779954" },
                lightSquareStyle: { backgroundColor: "#e9edcc" },
                squareStyles: boardSquareStyles,
                arrows,
                animationDurationInMs: 200,
                onSquareClick: ({ square }) => onSquareClick(square as Square),
                onSquareRightClick: clearBoardMarkup,
                allowDragging: window.innerWidth > 900,
              }}
            />
            {gameOverVisible && <div className="game-over-modal">{gameOverText}</div>}
            <div
              ref={boardOverlayRef}
              className="board-overlay"
              style={{ display: isCtrlPressed ? "block" : "none" }}
              onMouseDown={onBoardMouseDown}
              onMouseUp={onBoardMouseUp}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
