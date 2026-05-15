// Coordinates chess state, engine analysis, persistence, board markup, and the application layout.
import { useEffect, useRef, useState } from "react";
import { Chess, type Move, type Square } from "chess.js";
import AnalysisBoard from "../components/analysis-board/AnalysisBoard";
import AnalysisSidebar from "../components/analysis-sidebar/AnalysisSidebar";
import HoverPreviewBoard from "../components/hover-preview-board/HoverPreviewBoard";
import SettingsDialog from "../components/settings-dialog/SettingsDialog";
import { createInitialHistory, getGameOverMessage, normalizeFen } from "../domain/chessRules";
import type {
  ActiveSidebarTab,
  BoardArrow,
  BoardOrientation,
  ChessApiResponse,
  ChessApiSuccessResponse,
  EngineEvaluation,
  EngineSettings,
  GameHistoryNode,
  HoverPosition,
  SavedGame,
  SquareStyles,
} from "../domain/types";
import { postChessAnalysis } from "../services/chessAnalysisApi";
import "./ChessAnalyzerApp.css";

const DEFAULT_ENGINE_SETTINGS: EngineSettings = {
  apiUrl: "https://chess-api.com/v1",
  depth: 18,
  variants: 1,
  maxThinkingTime: 100,
};

const BOARD_FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const WHITE_RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"] as const;
const FILE_INDEX: Record<string, number> = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8 };

/** Determines whether a chess API response is a usable analysis payload. */
function isAnalysisResponse(data: ChessApiResponse): data is ChessApiSuccessResponse {
  return Boolean(data && "move" in data && data.move);
}

/** Converts the raw API payload into the app's normalized evaluation shape. */
function formatAnalysisResponse(data: ChessApiSuccessResponse): EngineEvaluation {
  return {
    score: data.mate !== null ? data.mate : data.eval * 100,
    isMate: data.mate !== null,
    depth: data.depth,
    bestMove: data.move,
    text: data.text,
    continuation: data.continuationArr ?? [],
    variants: data.variants ?? [],
  };
}

/** Reads and validates saved games from localStorage. */
function readSavedGames(): SavedGame[] {
  const saved = localStorage.getItem("chess_games");

  if (!saved) {
    return [];
  }

  try {
    const parsed = JSON.parse(saved) as SavedGame[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Creates a persisted saved-game entry for a new starting position. */
function createSavedGame(fen: string): SavedGame {
  return {
    id: Date.now(),
    fen,
    history: createInitialHistory(fen),
    date: new Date().toLocaleString(),
  };
}

/** Returns the square under a board overlay mouse event. */
function getOverlaySquare(
  event: React.MouseEvent<HTMLDivElement>,
  boardElement: HTMLDivElement | null,
  orientation: BoardOrientation,
): Square | null {
  if (!boardElement) {
    return null;
  }

  const rect = boardElement.getBoundingClientRect();
  const width = rect.width;
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const fileIndex = Math.max(0, Math.min(7, Math.floor((x / width) * 8)));
  const rankIndex = Math.max(0, Math.min(7, Math.floor((y / width) * 8)));
  const file = orientation === "white" ? BOARD_FILES[fileIndex] : BOARD_FILES[7 - fileIndex];
  const rank = orientation === "white" ? WHITE_RANKS[rankIndex] : WHITE_RANKS[7 - rankIndex];

  if (!file || !rank) {
    return null;
  }

  return `${file}${rank}` as Square;
}

/** Returns true when a candidate move is a legal promotion move. */
function isPromotionMove(game: Chess, from: Square, to: Square): boolean {
  return game.moves({ square: from, verbose: true }).some((move) => move.to === to && move.isPromotion());
}

/** Returns true when the given move matches the next move already present in history. */
function isSameMove(nextNode: GameHistoryNode | undefined, move: Move): boolean {
  return Boolean(
    nextNode?.move &&
      nextNode.move.from === move.from &&
      nextNode.move.to === move.to &&
      (!move.promotion || nextNode.move.promotion === move.promotion),
  );
}

/** Builds board square highlights for the last move in the active history line. */
function getLastMoveStyles(history: GameHistoryNode[], currentMoveIndex: number): SquareStyles {
  const lastMove = history[currentMoveIndex]?.move;

  if (!lastMove) {
    return {};
  }

  return {
    [lastMove.from]: { backgroundColor: "rgba(255, 255, 0, 0.5)" },
    [lastMove.to]: { backgroundColor: "rgba(255, 255, 0, 0.5)" },
  };
}

/** Renders and manages the full chess analyzer application. */
export default function ChessAnalyzerApp() {
  const [game, setGame] = useState(() => new Chess());
  const [history, setHistory] = useState<GameHistoryNode[]>(() => createInitialHistory(new Chess().fen()));
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
  const [evalData, setEvalData] = useState<EngineEvaluation | null>(null);
  const [orientation, setOrientation] = useState<BoardOrientation>("white");
  const [calculating, setCalculating] = useState(false);
  const [currentGameId, setCurrentGameId] = useState<number | null>(null);
  const [apiLimitReached, setApiLimitReached] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [engineSettings, setEngineSettings] = useState<EngineSettings>(DEFAULT_ENGINE_SETTINGS);
  const [gameOverVisible, setGameOverVisible] = useState(false);
  const [gameOverText, setGameOverText] = useState("");
  const [activeTab, setActiveTab] = useState<ActiveSidebarTab>("analysis");
  const [gamesList, setGamesList] = useState<SavedGame[]>([]);
  const [inputFen, setInputFen] = useState("");
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);
  const [dragStart, setDragStart] = useState<Square | null>(null);
  const [arrows, setArrows] = useState<BoardArrow[]>([]);
  const [customHighlights, setCustomHighlights] = useState<SquareStyles>({});
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [hoveredFen, setHoveredFen] = useState<string | null>(null);
  const [hoveredLastMove, setHoveredLastMove] = useState<Move | null>(null);
  const [hoverPos, setHoverPos] = useState<HoverPosition>({ x: 0, y: 0 });

  const fenCache = useRef(new Map<string, EngineEvaluation>());
  const activeBackgroundGeneration = useRef(0);
  const historyRef = useRef(history);
  const boardOverlayRef = useRef<HTMLDivElement | null>(null);
  const moveHistoryRef = useRef<HTMLDivElement | null>(null);
  const boardFen = history[currentMoveIndex]?.fen ?? new Chess().fen();

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    try {
      const savedCache = localStorage.getItem("chess_analysis_cache");

      if (savedCache) {
        const parsed = JSON.parse(savedCache) as Record<string, EngineEvaluation>;

        Object.entries(parsed).forEach(([fen, data]) => {
          fenCache.current.set(fen, data);
        });
      }
    } catch (error) {
      console.error("Failed to load analysis cache:", error);
    }
  }, []);

  /** Persists the bounded analysis cache to localStorage. */
  function saveCacheToStorage() {
    try {
      const entries = Array.from(fenCache.current.entries());
      const limited = entries.slice(-1000);
      localStorage.setItem("chess_analysis_cache", JSON.stringify(Object.fromEntries(limited)));
    } catch (error) {
      console.warn("Failed to persist analysis cache:", error);
    }
  }

  /** Adds an engine evaluation to the normalized FEN cache. */
  function addToCache(fen: string, data: EngineEvaluation) {
    fenCache.current.set(normalizeFen(fen), data);
    saveCacheToStorage();
  }

  useEffect(() => {
    const gameForEnd = new Chess(boardFen);
    const historySlice = history.slice(0, currentMoveIndex + 1);
    const message = getGameOverMessage(gameForEnd, historySlice);

    if (gameForEnd.isGameOver() || message) {
      if (message) {
        setGameOverText(message);
        setGameOverVisible(true);
        const timer = window.setTimeout(() => setGameOverVisible(false), 5000);
        return () => window.clearTimeout(timer);
      }
    } else {
      setGameOverVisible(false);
    }
  }, [boardFen, currentMoveIndex, history]);

  useEffect(() => {
    setInputFen(boardFen);
  }, [boardFen]);

  useEffect(() => {
    const activeMove = moveHistoryRef.current?.querySelector(".move-item.active");

    if (activeMove && moveHistoryRef.current) {
      const container = moveHistoryRef.current;
      const containerRect = container.getBoundingClientRect();
      const itemRect = activeMove.getBoundingClientRect();

      if (itemRect.top < containerRect.top) {
        container.scrollBy({ top: itemRect.top - containerRect.top, behavior: "smooth" });
      } else if (itemRect.bottom > containerRect.bottom) {
        container.scrollBy({ top: itemRect.bottom - containerRect.bottom, behavior: "smooth" });
      }
    }
  }, [currentMoveIndex, history]);

  useEffect(() => {
    /** Handles global keyboard shortcuts for board navigation and engine move playback. */
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Control") setIsCtrlPressed(true);
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

      if (event.key === "ArrowLeft") jumpToMove(Math.max(0, currentMoveIndex - 1));
      if (event.key === "ArrowRight") jumpToMove(Math.min(history.length - 1, currentMoveIndex + 1));
      if (event.key === "ArrowUp") jumpToMove(0);
      if (event.key === "ArrowDown") jumpToMove(history.length - 1);
      if (event.key === "f") setOrientation((value) => (value === "white" ? "black" : "white"));
      if ((event.code === "Space" || event.key === " ") && evalData?.bestMove) {
        event.preventDefault();
        playSequence([evalData.bestMove]);
      }
    }

    /** Clears the control-key board markup mode when the key is released. */
    function handleKeyUp(event: KeyboardEvent) {
      if (event.key === "Control") setIsCtrlPressed(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [currentMoveIndex, evalData, history.length]);

  useEffect(() => {
    let isCancelled = false;
    const generation = ++activeBackgroundGeneration.current;

    /** Warms the analysis cache for nearby history positions without blocking the active position. */
    async function backgroundAnalyzeHistory(startIndex: number) {
      if (apiLimitReached) return;

      try {
        const historySnapshot = historyRef.current;
        const indices = [
          ...Array.from({ length: startIndex }, (_, index) => startIndex - index - 1),
          ...Array.from({ length: Math.max(0, historySnapshot.length - startIndex - 1) }, (_, index) => startIndex + index + 1),
        ];
        const targets = indices.filter((index) => {
          const node = historySnapshot[index];
          return Boolean(
            node &&
              Math.abs(index - startIndex) <= 3 &&
              !fenCache.current.has(normalizeFen(node.fen)),
          );
        });

        for (const index of targets) {
          const node = historySnapshot[index];

          if (!node || isCancelled || generation !== activeBackgroundGeneration.current) break;

          await new Promise((resolve) => window.setTimeout(resolve, 200));

          if (isCancelled || generation !== activeBackgroundGeneration.current) break;

          const data = await postChessAnalysis(node.fen, engineSettings);

          if (data && "error" in data && data.error === "HIGH_USAGE") {
            setApiLimitReached(true);
            break;
          }

          if (isAnalysisResponse(data) && !isCancelled && generation === activeBackgroundGeneration.current) {
            const formatted = formatAnalysisResponse(data);
            addToCache(node.fen, formatted);
            setHistory((previousHistory) => {
              if (previousHistory[index]?.fen !== node.fen) return previousHistory;
              const nextHistory = [...previousHistory];
              nextHistory[index] = { ...previousHistory[index], analysis: formatted };
              return nextHistory;
            });
          }
        }
      } catch (error) {
        console.error("Background analysis error:", error);
      }
    }

    const normalizedFen = normalizeFen(boardFen);
    const tempGame = new Chess(boardFen);

    if (tempGame.isCheckmate()) {
      const mateData: EngineEvaluation = {
        score: tempGame.turn() === "b" ? 100 : -100,
        isMate: true,
        depth: 0,
        bestMove: null,
        text: "Checkmate",
        continuation: [],
        variants: [],
      };
      setEvalData(mateData);
      setCalculating(false);
      return;
    }

    if (fenCache.current.has(normalizedFen)) {
      const cachedData = fenCache.current.get(normalizedFen) ?? null;
      setEvalData(cachedData);
      setCalculating(false);
      void backgroundAnalyzeHistory(currentMoveIndex);
      return;
    }

    const currentNode = history[currentMoveIndex];

    if (currentNode?.fen === boardFen && currentNode.analysis) {
      setEvalData(currentNode.analysis);
      setCalculating(false);
      addToCache(boardFen, currentNode.analysis);
      return;
    }

    setCalculating(true);

    /** Evaluates the currently visible board position after a short debounce. */
    async function evaluatePosition() {
      if (apiLimitReached) return;

      const data = await postChessAnalysis(boardFen, engineSettings);
      if (isCancelled) return;

      setCalculating(false);

      if (data && "error" in data && data.error === "HIGH_USAGE") {
        setApiLimitReached(true);
        return;
      }

      if (isAnalysisResponse(data)) {
        const formattedData = formatAnalysisResponse(data);
        setEvalData(formattedData);
        addToCache(boardFen, formattedData);
        setHistory((previousHistory) => {
          const index = previousHistory.findIndex((node) => node.fen === boardFen);

          if (index === -1) return previousHistory;

          const nextHistory = [...previousHistory];
          const node = nextHistory[index];

          if (!node) return previousHistory;

          nextHistory[index] = { ...node, analysis: formattedData };
          return nextHistory;
        });
        void backgroundAnalyzeHistory(currentMoveIndex);
      }
    }

    const timer = window.setTimeout(() => {
      void evaluatePosition();
    }, 500);

    return () => {
      isCancelled = true;
      window.clearTimeout(timer);
    };
  }, [apiLimitReached, boardFen, currentMoveIndex, engineSettings, history]);

  useEffect(() => {
    const games = readSavedGames();
    const lastActiveId = localStorage.getItem("last_active_game_id");

    if (games.length > 0) {
      setGamesList(games);

      if (lastActiveId) {
        const activeGame = games.find((savedGame) => savedGame.id === Number(lastActiveId));

        if (activeGame) {
          loadGameFromList(activeGame);
          return;
        }
      }

      setCurrentGameId(games[0]?.id ?? null);
      return;
    }

    const defaultFen = new Chess().fen();
    const newEntry = createSavedGame(defaultFen);
    setGamesList([newEntry]);
    localStorage.setItem("chess_games", JSON.stringify([newEntry]));
    setCurrentGameId(newEntry.id);
    localStorage.setItem("last_active_game_id", String(newEntry.id));
  }, []);

  useEffect(() => {
    if (currentGameId) {
      localStorage.setItem("last_active_game_id", String(currentGameId));
    }
  }, [currentGameId]);

  /** Saves the active game into the saved-games collection. */
  function saveCurrentGame(
    fenToSave: string,
    lastMoveArg: Move | null = null,
    historyOverride: GameHistoryNode[] | null = null,
  ) {
    const lastMove = lastMoveArg ?? history[currentMoveIndex]?.move ?? null;
    const currentHistory = historyOverride ?? history;

    setGamesList((previousGames) => {
      let updatedList: SavedGame[];

      if (currentGameId) {
        updatedList = previousGames.map((savedGame) =>
          savedGame.id === currentGameId
            ? {
                ...savedGame,
                fen: fenToSave,
                history: currentHistory,
                lastMove,
                date: new Date().toLocaleString(),
              }
            : savedGame,
        );
      } else {
        const newGameEntry: SavedGame = {
          id: Date.now(),
          fen: fenToSave,
          history: currentHistory,
          lastMove,
          date: new Date().toLocaleString(),
        };
        setCurrentGameId(newGameEntry.id);
        updatedList = [newGameEntry, ...previousGames];
      }

      localStorage.setItem("chess_games", JSON.stringify(updatedList));
      return updatedList;
    });
  }

  /** Navigates to a specific move in the current linear history. */
  function jumpToMove(index: number) {
    const targetNode = history[index];

    if (!targetNode) {
      return;
    }

    const normalized = normalizeFen(targetNode.fen);
    setCurrentMoveIndex(index);
    setGame(new Chess(targetNode.fen));
    setArrows([]);
    setCustomHighlights({});
    setSelectedSquare(null);
    setInputFen(targetNode.fen);
    setEvalData(fenCache.current.get(normalized) ?? targetNode.analysis ?? null);
  }

  /** Handles drag-and-drop moves from the chessboard. */
  function onDrop(sourceSquare: Square, targetSquare: Square): boolean {
    setSelectedSquare(null);

    try {
      const gameCopy = new Chess(boardFen);
      const promotion = isPromotionMove(gameCopy, sourceSquare, targetSquare) ? "q" : undefined;
      const result = gameCopy.move({ from: sourceSquare, to: targetSquare, promotion });
      completeMove(gameCopy, result);
      return true;
    } catch (error) {
      console.error("Drop error:", error);
      return false;
    }
  }

  /** Handles tap-to-move interactions for small screens. */
  function onSquareClick(square: Square) {
    if (window.innerWidth > 900) return;

    const currentGame = new Chess(boardFen);
    const piece = currentGame.get(square);

    if (!selectedSquare) {
      if (piece && piece.color === currentGame.turn()) setSelectedSquare(square);
      return;
    }

    if (selectedSquare === square) {
      setSelectedSquare(null);
      return;
    }

    if (piece && piece.color === currentGame.turn()) {
      setSelectedSquare(square);
      return;
    }

    try {
      const promotion = isPromotionMove(currentGame, selectedSquare, square) ? "q" : undefined;
      const result = currentGame.move({ from: selectedSquare, to: square, promotion });
      completeMove(currentGame, result);
      setSelectedSquare(null);
    } catch {
      setSelectedSquare(null);
    }
  }

  /** Commits a legal move to game state, handling variations when moving from history. */
  function completeMove(gameCopy: Chess, result: Move) {
    const newFen = gameCopy.fen();
    const newNode: GameHistoryNode = { fen: newFen, move: result, variations: [], analysis: null };
    setGame(gameCopy);

    if (currentMoveIndex === history.length - 1) {
      const newHistory = [...history, newNode];
      setHistory(newHistory);
      setCurrentMoveIndex(newHistory.length - 1);
      saveCurrentGame(newFen, result, newHistory);
    } else if (isSameMove(history[currentMoveIndex + 1], result)) {
      setCurrentMoveIndex(currentMoveIndex + 1);
    } else {
      const currentTail = history.slice(currentMoveIndex + 1);
      const parentNode = history[currentMoveIndex];

      if (!parentNode) {
        return;
      }

      const parentWithVariation =
        currentTail.length > 0
          ? { ...parentNode, variations: [...(parentNode.variations ?? []), currentTail] }
          : parentNode;
      const newHistory = [...history.slice(0, currentMoveIndex), parentWithVariation, newNode];
      setHistory(newHistory);
      setCurrentMoveIndex(newHistory.length - 1);
      saveCurrentGame(newFen, result, newHistory);
    }

    setArrows([]);
    setCustomHighlights({});
    setCalculating(true);
  }

  /** Loads the FEN entered in the sidebar input. */
  function handleFenLoad() {
    try {
      const tempGame = new Chess(inputFen);
      const newFen = tempGame.fen();
      const newHistory = createInitialHistory(newFen);
      setGame(tempGame);
      setHistory(newHistory);
      setCurrentMoveIndex(0);
      setEvalData(null);
      setSelectedSquare(null);
      saveCurrentGame(newFen, null, newHistory);
    } catch {
      window.alert("Invalid FEN string");
    }
  }

  /** Creates and selects a new saved game from the initial position. */
  function handleNewGame() {
    const defaultFen = new Chess().fen();
    const newEntry = createSavedGame(defaultFen);
    const updatedList = [newEntry, ...gamesList];
    setGamesList(updatedList);
    localStorage.setItem("chess_games", JSON.stringify(updatedList));
    setCurrentGameId(newEntry.id);
    setGame(new Chess());
    setHistory(newEntry.history);
    setCurrentMoveIndex(0);
    setEvalData(null);
    setSelectedSquare(null);
    setInputFen(defaultFen);
  }

  /** Loads a saved game into the active board and move history. */
  function loadGameFromList(savedGame: SavedGame) {
    const tempGame = new Chess(savedGame.fen);
    setGame(tempGame);
    setHistory(savedGame.history?.length ? savedGame.history : [{ fen: tempGame.fen(), move: savedGame.lastMove ?? null }]);
    setCurrentMoveIndex(savedGame.history?.length ? savedGame.history.length - 1 : 0);
    setCurrentGameId(savedGame.id);
    setInputFen(savedGame.fen);
  }

  /** Plays one or more engine moves from the active board position. */
  function playSequence(moves: string[]) {
    try {
      const tempGame = new Chess(boardFen);
      let currentPathIndex = currentMoveIndex;
      let currentPathHistory = [...history];

      for (const moveText of moves.filter(Boolean)) {
        const result = tempGame.move(moveText);
        const newNode: GameHistoryNode = { fen: tempGame.fen(), move: result, variations: [], analysis: null };
        const nextMoveNode = currentPathHistory[currentPathIndex + 1];
        const isNextMove =
          nextMoveNode?.move &&
          (nextMoveNode.move.san === result.san ||
            (nextMoveNode.move.from === result.from && nextMoveNode.move.to === result.to));

        if (isNextMove) {
          currentPathIndex += 1;
        } else {
          const currentTail = currentPathHistory.slice(currentPathIndex + 1);
          const parentNode = currentPathHistory[currentPathIndex];

          if (!parentNode) break;

          const parentWithVariation =
            currentTail.length > 0
              ? { ...parentNode, variations: [...(parentNode.variations ?? []), currentTail] }
              : parentNode;
          currentPathHistory = [...currentPathHistory.slice(0, currentPathIndex), parentWithVariation, newNode];
          currentPathIndex = currentPathHistory.length - 1;
        }
      }

      setHistory(currentPathHistory);
      setCurrentMoveIndex(currentPathIndex);
      setGame(tempGame);
      saveCurrentGame(tempGame.fen(), currentPathHistory[currentPathIndex]?.move ?? null, currentPathHistory);
      setArrows([]);
      setCustomHighlights({});
    } catch (error) {
      console.error("Sequence error:", error);
    }
  }

  /** Promotes a stored side variation into the active main line. */
  function swapVariation(moveIndex: number, variationIndex: number) {
    const node = history[moveIndex];
    const newLine = node?.variations?.[variationIndex];

    if (!node || !newLine) {
      return;
    }

    const updatedVariations = [...(node.variations ?? [])];
    updatedVariations[variationIndex] = history.slice(moveIndex + 1);
    const updatedNode = { ...node, variations: updatedVariations };
    const finalHistory = [...history.slice(0, moveIndex), updatedNode, ...newLine];
    const nextNode = finalHistory[moveIndex + 1];

    if (!nextNode) {
      return;
    }

    setHistory(finalHistory);
    setCurrentMoveIndex(moveIndex + 1);
    setGame(new Chess(nextNode.fen));
    saveCurrentGame(finalHistory[finalHistory.length - 1]?.fen ?? nextNode.fen, null, finalHistory);
    setEvalData(null);
  }

  /** Starts a board-markup drag from the current overlay square. */
  function onBoardMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    setDragStart(getOverlaySquare(event, boardOverlayRef.current, orientation));
  }

  /** Completes board markup by toggling a square highlight or adding an arrow. */
  function onBoardMouseUp(event: React.MouseEvent<HTMLDivElement>) {
    if (!dragStart) return;

    const dragEnd = getOverlaySquare(event, boardOverlayRef.current, orientation);

    if (!dragEnd) {
      setDragStart(null);
      return;
    }

    if (dragStart === dragEnd) {
      setCustomHighlights((previousHighlights) => {
        const nextHighlights = { ...previousHighlights };

        if (nextHighlights[dragStart]) delete nextHighlights[dragStart];
        else nextHighlights[dragStart] = { backgroundColor: "rgba(255, 0, 0, 0.4)" };

        return nextHighlights;
      });
    } else {
      const dragStartFile = dragStart[0] ?? "";
      const dragEndFile = dragEnd[0] ?? "";
      const f1 = FILE_INDEX[dragStartFile] ?? 0;
      const r1 = Number.parseInt(dragStart[1] ?? "0", 10);
      const f2 = FILE_INDEX[dragEndFile] ?? 0;
      const r2 = Number.parseInt(dragEnd[1] ?? "0", 10);
      const df = Math.abs(f2 - f1);
      const dr = Math.abs(r2 - r1);
      const pieceAtStart = game.get(dragStart);
      const isKnight = pieceAtStart?.type === "n" && ((df === 1 && dr === 2) || (df === 2 && dr === 1));
      const color = "rgba(255, 255, 0, 0.8)";

      setCustomHighlights((previousHighlights) => ({
        ...previousHighlights,
        [dragEnd]: { backgroundColor: "rgba(255, 0, 0, 0.4)" },
      }));

      if (isKnight) {
        const midRank = dr === 2 ? r2 : r1;
        const midFile = dr === 2 ? f1 : f2;
        const midFileChar = Object.keys(FILE_INDEX).find((key) => FILE_INDEX[key] === midFile);

        if (midFileChar) {
          const midSquare = `${midFileChar}${midRank}`;
          setArrows((previousArrows) => [
            ...previousArrows,
            { startSquare: dragStart, endSquare: midSquare, color },
            { startSquare: midSquare, endSquare: dragEnd, color },
          ]);
        }
      } else {
        setArrows((previousArrows) => [...previousArrows, { startSquare: dragStart, endSquare: dragEnd, color }]);
      }
    }

    setDragStart(null);
  }

  /** Clears custom arrows and square highlights from the board. */
  function clearBoardMarkup() {
    setCustomHighlights({});
    setArrows([]);
  }

  return (
    <div className="app-container">
      <SettingsDialog
        show={showSettings}
        onClose={() => setShowSettings(false)}
        settings={engineSettings}
        onSave={(newSettings) => {
          setEngineSettings(newSettings);
          setShowSettings(false);
        }}
      />

      <AnalysisSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        calculating={calculating}
        evalData={evalData}
        history={history}
        currentMoveIndex={currentMoveIndex}
        jumpToMove={jumpToMove}
        moveHistoryRef={moveHistoryRef}
        inputFen={inputFen}
        setInputFen={setInputFen}
        handleFenLoad={handleFenLoad}
        handleNewGame={handleNewGame}
        setOrientation={setOrientation}
        gamesList={gamesList}
        loadGameFromList={loadGameFromList}
        setHoveredFen={setHoveredFen}
        setHoveredLastMove={setHoveredLastMove}
        setHoverPos={setHoverPos}
        currentGameId={currentGameId}
        setGamesList={setGamesList}
        playSequence={playSequence}
        setShowSettings={setShowSettings}
        engineSettings={engineSettings}
        fenCache={fenCache}
        swapVariation={swapVariation}
        boardFen={boardFen}
      />

      <AnalysisBoard
        currentFen={boardFen}
        onDrop={onDrop}
        orientation={orientation}
        customSquareStyles={getLastMoveStyles(history, currentMoveIndex)}
        customHighlights={customHighlights}
        dragStart={dragStart}
        evalData={evalData}
        calculating={calculating}
        clearBoardMarkup={clearBoardMarkup}
        arrows={arrows}
        gameOverVisible={gameOverVisible}
        gameOverText={gameOverText}
        boardOverlayRef={boardOverlayRef}
        isCtrlPressed={isCtrlPressed}
        onBoardMouseDown={onBoardMouseDown}
        onBoardMouseUp={onBoardMouseUp}
        onSquareClick={onSquareClick}
        selectedSquare={selectedSquare}
      />

      <HoverPreviewBoard
        fen={hoveredFen}
        x={hoverPos.x}
        y={hoverPos.y}
        orientation={orientation}
        customPieces={null}
        customSquareStyles={
          hoveredLastMove
            ? {
                [hoveredLastMove.from]: { backgroundColor: "rgba(255, 255, 0, 0.4)" },
                [hoveredLastMove.to]: { backgroundColor: "rgba(255, 255, 0, 0.4)" },
              }
            : {}
        }
      />
    </div>
  );
}
