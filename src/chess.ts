// Implements legal move replay, import/export, and readable engine variations.
import { Chess } from 'chess.js';
import type { AnalysisLine, SavedGame } from './types';

/** Creates an empty game at the standard starting position. */
export function newGame(): SavedGame {
  return { id: crypto.getRandomValues(new Uint32Array(4)).join('-'), title: 'New game', initialFen: new Chess().fen(), moves: [] };
}

/** Replays a game up to the requested half-move while retaining repetition history. */
export function replay(gameRecord: SavedGame, cursor = gameRecord.moves.length): Chess {
  const game = new Chess(gameRecord.initialFen);
  for (const move of gameRecord.moves.slice(0, cursor)) game.move(move);
  return game;
}

/** Imports either a complete FEN position or a PGN game without changing existing state. */
export function importGame(input: string): SavedGame {
  const text = input.trim();
  if (!text) throw new Error('Paste a FEN position or PGN game first.');
  const gameRecord = newGame();
  try {
    gameRecord.initialFen = new Chess(text).fen();
    gameRecord.title = 'Imported position';
    return gameRecord;
  } catch { /* Continue with PGN parsing when the input is not a FEN. */ }
  const game = new Chess();
  game.loadPgn(text);
  if (!game.history().length && !text.includes('[')) throw new Error('Enter a valid FEN or PGN.');
  const history = game.history({ verbose: true });
  const headers = game.getHeaders();
  gameRecord.initialFen = history[0]?.before ?? game.fen();
  gameRecord.moves = game.history();
  gameRecord.title = headers.White && headers.Black ? `${headers.White} vs ${headers.Black}` : 'Imported game';
  return gameRecord;
}

/** Converts a legal UCI principal variation into SAN and preview positions. */
export function variation(fen: string, moves: string[]): { san: string; fen: string; uci: string }[] {
  const game = new Chess(fen);
  const result: { san: string; fen: string; uci: string }[] = [];
  for (const uci of moves) {
    try {
      const move = game.move(uci);
      result.push({ san: move.san, fen: game.fen(), uci });
    } catch { break; }
  }
  return result;
}

/** Formats a White-relative evaluation with explicit mate notation. */
export function formatScore(line?: AnalysisLine): string {
  if (!line) return '—';
  if (line.mate !== null) return `${line.mate < 0 ? '−' : ''}M${Math.abs(line.mate)}`;
  return `${line.score > 0 ? '+' : ''}${line.score.toFixed(2)}`;
}

/** Describes terminal positions before falling back to the side to move. */
export function positionStatus(game: Chess): string {
  if (game.isCheckmate()) return `Checkmate · ${game.turn() === 'w' ? 'Black' : 'White'} wins`;
  if (game.isStalemate()) return 'Draw · stalemate';
  if (game.isThreefoldRepetition()) return 'Draw · threefold repetition';
  if (game.isInsufficientMaterial()) return 'Draw · insufficient material';
  if (game.isDraw()) return 'Draw · fifty-move rule';
  return `${game.turn() === 'w' ? 'White' : 'Black'} to move${game.isCheck() ? ' · check' : ''}`;
}

/** Extends an existing continuation or preserves it as an alternative when branching. */
export function applySequence(game: SavedGame, cursor: number, sequence: string[]): SavedGame {
  const position = replay(game, cursor);
  for (const move of sequence) { if (position.isGameOver()) break; position.move(move); }
  const moves = position.history();
  const follows = moves.every(
    /** Checks whether playback simply follows the existing main continuation. */
    (move, index) => game.moves[index] === move,
  );
  if (follows) return { ...game, cursor: moves.length };
  const branches = [...(game.branches ?? [])];
  if (cursor < game.moves.length && !branches.some(
    /** Avoids saving the same alternative path twice. */
    (branch) => branch.join(' ') === game.moves.join(' '),
  )) branches.push(game.moves);
  return { ...game, moves, cursor: moves.length, branches };
}

/** Promotes a saved alternative and retains the old main line for later return. */
export function switchBranch(game: SavedGame, index: number): SavedGame {
  const moves = game.branches?.[index];
  if (!moves) return game;
  let cursor = 0;
  while (cursor < moves.length && moves[cursor] === game.moves[cursor]) cursor++;
  const branches = [...(game.branches ?? [])];
  branches[index] = game.moves;
  return { ...game, moves, branches, cursor: Math.min(cursor + 1, moves.length) };
}

