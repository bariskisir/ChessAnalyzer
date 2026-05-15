// Defines shared chess analyzer domain types used across the application.
import type { Move, Square } from "chess.js";
import type { CSSProperties, Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";

export type BoardOrientation = "white" | "black";

export type ActiveSidebarTab = "analysis" | "games";

export type SquareStyles = Record<string, CSSProperties>;

export type BoardArrow = {
  startSquare: string;
  endSquare: string;
  color: string;
};

export type EngineSettings = {
  apiUrl: string;
  depth: number;
  variants: number;
  maxThinkingTime: number;
};

export type EngineLine = {
  eval: number;
  mate: number | null;
  pv: string;
};

export type EngineEvaluation = {
  score: number;
  isMate: boolean;
  depth: number;
  bestMove: string | null;
  text?: string;
  continuation: string[];
  variants: EngineLine[];
};

export type ChessApiSuccessResponse = {
  type?: string;
  eval: number;
  mate: number | null;
  depth: number;
  move: string;
  text?: string;
  continuationArr?: string[];
  variants?: EngineLine[];
};

export type ChessApiErrorResponse = {
  type: "error";
  error: "HIGH_USAGE" | string;
  text: string;
};

export type ChessApiResponse = ChessApiSuccessResponse | ChessApiErrorResponse | null;

export type GameHistoryNode = {
  fen: string;
  move: Move | null;
  variations?: GameHistoryNode[][];
  analysis?: EngineEvaluation | null;
};

export type SavedGame = {
  id: number;
  fen: string;
  history: GameHistoryNode[];
  date: string;
  lastMove?: Move | null;
};

export type Annotation = {
  symbol: string;
  color: string;
  title: string;
};

export type HoverPosition = {
  x: number;
  y: number;
};

export type MovePair = {
  moveNumber: number;
  white: GameHistoryNode;
  whiteIndex: number;
  black: GameHistoryNode | null;
  blackIndex: number;
};

export type BoardSquare = Square;

export type SetState<T> = Dispatch<SetStateAction<T>>;

export type EvaluationCache = MutableRefObject<Map<string, EngineEvaluation>>;

export type BoardOverlayRef = RefObject<HTMLDivElement | null>;

export type MoveHistoryRef = RefObject<HTMLDivElement | null>;
