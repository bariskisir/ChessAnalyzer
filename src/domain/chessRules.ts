// Provides chess-specific helpers for position identity, result messaging, and move quality labels.
import type { Chess } from "chess.js";
import type { Annotation, GameHistoryNode, MovePair } from "./types";

/** Normalizes a FEN string to the fields that identify a repeated board state. */
export function normalizeFen(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

/** Classifies the evaluation swing after a move into a human-readable annotation. */
export function getAnnotation(diff: number): Annotation {
  if (diff >= 1.0) return { symbol: "!!", color: "#26c281", title: "Perfect" };
  if (diff >= 0.3) return { symbol: "!", color: "#81b64c", title: "Good" };
  if (diff >= -0.5) return { symbol: "!?", color: "#5bc0de", title: "Interesting" };
  if (diff >= -1.0) return { symbol: "?!", color: "#f7c045", title: "Dubious" };
  if (diff >= -2.0) return { symbol: "?", color: "#e6912c", title: "Mistake" };
  return { symbol: "??", color: "#d9534f", title: "Blunder" };
}

/** Returns the game-over text for the current position, including repetition tracked in app history. */
export function getGameOverMessage(chessGame: Chess, history: GameHistoryNode[] = []): string | null {
  if (chessGame.isCheckmate()) return "Checkmate!";
  if (chessGame.isStalemate()) return "Draw (Stalemate)";

  if (history.length > 0) {
    const currentFen = normalizeFen(chessGame.fen());
    let count = 0;

    for (const node of history) {
      if (normalizeFen(node.fen) === currentFen) {
        count += 1;
      }
    }

    if (count >= 3) return "Draw (Threefold Repetition)";
  }

  if (chessGame.isThreefoldRepetition()) return "Draw (Threefold Repetition)";
  if (chessGame.isInsufficientMaterial()) return "Draw (Dead Position)";
  if (chessGame.isDraw()) return "Draw (50-move rule)";
  return null;
}

/** Groups linear history nodes into white and black move rows for the sidebar. */
export function buildMovePairs(history: GameHistoryNode[]): MovePair[] {
  const movePairs: MovePair[] = [];

  for (let i = 1; i < history.length; i += 2) {
    const white = history[i];

    if (!white) {
      continue;
    }

    movePairs.push({
      moveNumber: Math.ceil(i / 2),
      white,
      whiteIndex: i,
      black: history[i + 1] ?? null,
      blackIndex: i + 1,
    });
  }

  return movePairs;
}

/** Builds the default starting history node for a new chess game. */
export function createInitialHistory(fen: string): GameHistoryNode[] {
  return [{ fen, move: null }];
}
