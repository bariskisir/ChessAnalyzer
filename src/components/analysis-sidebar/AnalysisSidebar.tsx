// Renders analysis controls, engine lines, move history, and saved game management.
import { Chess, type Move } from "chess.js";
import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Compass,
  History,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";
import "./AnalysisSidebar.css";
import { buildMovePairs, getAnnotation, normalizeFen } from "../../domain/chessRules";
import type {
  ActiveSidebarTab,
  BoardOrientation,
  EngineEvaluation,
  EngineSettings,
  EvaluationCache,
  GameHistoryNode,
  HoverPosition,
  MoveHistoryRef,
  SavedGame,
  SetState,
} from "../../domain/types";

type AnalysisSidebarProps = {
  activeTab: ActiveSidebarTab;
  setActiveTab: SetState<ActiveSidebarTab>;
  calculating: boolean;
  evalData: EngineEvaluation | null;
  history: GameHistoryNode[];
  currentMoveIndex: number;
  jumpToMove: (index: number) => void;
  moveHistoryRef: MoveHistoryRef;
  inputFen: string;
  setInputFen: SetState<string>;
  handleFenLoad: () => void;
  handleNewGame: () => void;
  setOrientation: SetState<BoardOrientation>;
  gamesList: SavedGame[];
  loadGameFromList: (game: SavedGame) => void;
  setHoveredFen: SetState<string | null>;
  setHoveredLastMove: SetState<Move | null>;
  setHoverPos: SetState<HoverPosition>;
  currentGameId: number | null;
  setGamesList: SetState<SavedGame[]>;
  playSequence: (moves: string[]) => void;
  setShowSettings: SetState<boolean>;
  engineSettings: EngineSettings;
  fenCache: EvaluationCache;
  swapVariation: (moveIndex: number, variationIndex: number) => void;
  boardFen: string;
};

/** Calculates a hover preview position that stays inside the current viewport. */
function getHoverPosition(event: React.MouseEvent): HoverPosition {
  let x = event.clientX + 15;
  let y = event.clientY + 15;

  if (x + 220 > window.innerWidth) x = event.clientX - 235;
  if (y + 150 > window.innerHeight) y = event.clientY - 165;

  return { x, y };
}

/** Converts a stored move into displayable SAN text. */
function getMoveSan(node: GameHistoryNode): string {
  if (!node.move) return "";
  return typeof node.move === "string" ? node.move : node.move.san;
}

/** Renders the full sidebar for analysis and saved game workflows. */
export default function AnalysisSidebar({
  activeTab,
  setActiveTab,
  calculating,
  evalData,
  history,
  currentMoveIndex,
  jumpToMove,
  moveHistoryRef,
  inputFen,
  setInputFen,
  handleFenLoad,
  handleNewGame,
  setOrientation,
  gamesList,
  loadGameFromList,
  setHoveredFen,
  setHoveredLastMove,
  setHoverPos,
  currentGameId,
  setGamesList,
  playSequence,
  setShowSettings,
  engineSettings,
  fenCache,
  swapVariation,
  boardFen,
}: AnalysisSidebarProps) {
  const movePairs = buildMovePairs(history);

  /** Updates the hover preview position for an active move preview. */
  function updateHoverPosition(event: React.MouseEvent) {
    setHoverPos(getHoverPosition(event));
  }

  /** Shows a board preview after applying a candidate move sequence. */
  function handleMoveHover(moves: string[], event: React.MouseEvent) {
    try {
      const temp = new Chess(boardFen);
      let lastMove: Move | null = null;

      for (const move of moves) {
        lastMove = temp.move(move);
      }

      if (lastMove) {
        setHoveredFen(temp.fen());
        setHoveredLastMove(lastMove);
        updateHoverPosition(event);
      }
    } catch (error) {
      console.error("Hover error:", error);
    }
  }

  /** Clears the hover preview when the pointer leaves a previewable move. */
  function clearHoverPreview() {
    setHoveredFen(null);
    setHoveredLastMove(null);
  }

  /** Deletes a saved game from local state and localStorage. */
  function deleteSavedGame(gameId: number) {
    const newList = gamesList.filter((game) => game.id !== gameId);
    setGamesList(newList);
    localStorage.setItem("chess_games", JSON.stringify(newList));
  }

  /** Renders one move in the move history list with optional quality annotation. */
  function renderMove(moveData: GameHistoryNode | null, index: number, isWhite: boolean) {
    if (!moveData) return null;

    const prevFen = history[index - 1]?.fen;
    const moveSan = getMoveSan(moveData);
    let annotation = null;

    if (prevFen) {
      const prevEval = fenCache.current.get(normalizeFen(prevFen));
      const currEval = fenCache.current.get(normalizeFen(moveData.fen));

      if (prevEval && currEval && !prevEval.isMate && !currEval.isMate) {
        const diff = isWhite
          ? (currEval.score - prevEval.score) / 100
          : (prevEval.score - currEval.score) / 100;
        annotation = getAnnotation(diff);
      }
    }

    return (
      <button
        type="button"
        className={`move-item ${index === currentMoveIndex ? "active" : ""}`}
        onClick={() => jumpToMove(index)}
      >
        <span>{moveSan}</span>
        {annotation && (
          <span className="move-annotation" style={{ color: annotation.color }} title={annotation.title}>
            {annotation.symbol}
          </span>
        )}
        {history[index]?.variations && history[index].variations.length > 0 && (
          <span
            className="variation-indicator"
            onClick={(event) => {
              event.stopPropagation();
              swapVariation(index, 0);
            }}
          >
            +{history[index].variations.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <aside className="sidebar">
      <div className="panel-header">
        <button
          type="button"
          className={`panel-tab ${activeTab === "analysis" ? "active" : ""}`}
          onClick={() => setActiveTab("analysis")}
        >
          <Compass size={20} />
          Analysis
        </button>
        <button
          type="button"
          className={`panel-tab ${activeTab === "games" ? "active" : ""}`}
          onClick={() => setActiveTab("games")}
        >
          <History size={20} />
          Games
        </button>
      </div>

      <div className="panel-content">
        {activeTab === "analysis" ? (
          <>
            <div className="nav-buttons">
              <button
                className="nav-btn"
                onClick={() => jumpToMove(0)}
                disabled={currentMoveIndex === 0}
                title="First move"
              >
                <ChevronsLeft size={20} />
              </button>
              <button
                className="nav-btn"
                onClick={() => jumpToMove(Math.max(0, currentMoveIndex - 1))}
                disabled={currentMoveIndex === 0}
                title="Previous move"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                className="nav-btn"
                onClick={() => jumpToMove(Math.min(history.length - 1, currentMoveIndex + 1))}
                disabled={currentMoveIndex === history.length - 1}
                title="Next move"
              >
                <ChevronRight size={20} />
              </button>
              <button
                className="nav-btn"
                onClick={() => jumpToMove(history.length - 1)}
                disabled={currentMoveIndex === history.length - 1}
                title="Last move"
              >
                <ChevronsRight size={20} />
              </button>
            </div>

            <div className="eval-box">
              <div className="settings-bar">
                <span>
                  Stockfish 17 (chess-api.com) | Depth {engineSettings.depth} | MultiPV{" "}
                  {engineSettings.variants} | {engineSettings.maxThinkingTime}ms
                </span>
                <button
                  type="button"
                  className="settings-button"
                  onClick={() => setShowSettings(true)}
                  title="Engine settings"
                >
                  <Settings size={16} />
                </button>
              </div>

              <div className="engine-lines">
                {calculating && <div className="engine-line calculating">Calculating...</div>}
                {!calculating && evalData?.bestMove && (
                  <div className="engine-line" key="best">
                    <div className={`line-score ${evalData.score >= 0 ? "plus" : "minus"}`}>
                      {evalData.isMate ? `M${Math.abs(evalData.score)}` : (evalData.score / 100).toFixed(2)}
                    </div>
                    <div className="line-moves">
                      <button
                        type="button"
                        className="engine-move highlight"
                        onMouseEnter={(event) => handleMoveHover([evalData.bestMove ?? ""], event)}
                        onMouseMove={updateHoverPosition}
                        onMouseLeave={clearHoverPreview}
                        onClick={() => {
                          clearHoverPreview();
                          playSequence([evalData.bestMove ?? "", ...evalData.continuation]);
                        }}
                      >
                        {evalData.bestMove}
                      </button>
                      {evalData.continuation.map((move, index) => (
                        <button
                          type="button"
                          key={`${move}-${index}`}
                          className="engine-move"
                          onMouseEnter={(event) =>
                            handleMoveHover(
                              [evalData.bestMove ?? "", ...evalData.continuation.slice(0, index + 1)],
                              event,
                            )
                          }
                          onMouseMove={updateHoverPosition}
                          onMouseLeave={clearHoverPreview}
                          onClick={() => {
                            clearHoverPreview();
                            playSequence([evalData.bestMove ?? "", ...evalData.continuation.slice(0, index + 1)]);
                          }}
                        >
                          {move}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {evalData?.variants
                  .filter((variant) => variant.pv.split(" ")[0] !== evalData.bestMove)
                  .map((variant, variantIndex) => (
                    <div className="engine-line" key={`${variant.pv}-${variantIndex}`}>
                      <div className={`line-score ${variant.eval >= 0 ? "plus" : "minus"}`}>
                        {variant.mate ? `M${Math.abs(variant.mate)}` : (variant.eval / 100).toFixed(2)}
                      </div>
                      <div className="line-moves">
                        {variant.pv.split(" ").map((move, moveIndex) => (
                          <button
                            type="button"
                            key={`${move}-${moveIndex}`}
                            className="engine-move"
                            onMouseEnter={(event) => handleMoveHover(variant.pv.split(" ").slice(0, moveIndex + 1), event)}
                            onMouseMove={updateHoverPosition}
                            onMouseLeave={clearHoverPreview}
                            onClick={() => {
                              clearHoverPreview();
                              playSequence(variant.pv.split(" ").slice(0, moveIndex + 1));
                            }}
                          >
                            {move}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="action-buttons">
              <button onClick={handleNewGame} className="action-btn" title="New game">
                <Plus size={16} /> New Game
              </button>
              <button
                onClick={() => setOrientation((value) => (value === "white" ? "black" : "white"))}
                className="action-btn"
                title="Flip board"
              >
                <ArrowLeftRight size={16} /> Flip
              </button>
            </div>

            <div className="move-list-header">Moves</div>
            <div className="move-history" ref={moveHistoryRef}>
              <div className="move-list">
                {movePairs.map((pair) => (
                  <div key={pair.moveNumber} className="move-row">
                    <div className="move-num">{pair.moveNumber}.</div>
                    {renderMove(pair.white, pair.whiteIndex, true)}
                    {renderMove(pair.black, pair.blackIndex, false)}
                  </div>
                ))}
              </div>
            </div>

            <div className="fen-input-container">
              <span>FEN:</span>
              <input
                type="text"
                value={inputFen}
                onChange={(event) => setInputFen(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && handleFenLoad()}
                placeholder="Paste FEN and press Enter..."
              />
            </div>
          </>
        ) : (
          <div className="saved-games-list">
            <h3>Saved Games</h3>
            {gamesList.length === 0 && <div className="empty-history">No saved games yet.</div>}
            {gamesList.map((game) => (
              <button
                type="button"
                key={game.id}
                className={`game-item ${game.id === currentGameId ? "active" : ""}`}
                onClick={() => loadGameFromList(game)}
                onMouseEnter={() => {
                  setHoveredFen(game.fen);
                  setHoveredLastMove(game.lastMove ?? null);
                }}
                onMouseMove={(event) => setHoverPos(getHoverPosition(event))}
                onMouseLeave={() => {
                  setHoveredFen(null);
                  setHoveredLastMove(null);
                }}
              >
                <span className="game-info">
                  <span className="game-date">{game.date}</span>
                  <span className="game-fen">
                    <strong>FEN:</strong> {game.fen}
                  </span>
                </span>
                {game.id !== currentGameId && (
                  <span
                    className="delete-game-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteSavedGame(game.id);
                    }}
                    title="Delete game"
                  >
                    <Trash2 size={16} />
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
