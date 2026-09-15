// Restores games, migrates older saved formats, and persists the active game automatically.
import { newGame, replay } from './chess';
import { DEFAULT_SETTINGS, type EngineSettings, type SavedGame } from './types';

export const STORAGE_KEY = 'chess-analyzer.games.v3';
export const SETTINGS_KEY = 'chess-analyzer.settings.v3';
export interface Session { games: SavedGame[]; activeId: string }

/** Checks a saved game and retains only legal alternative continuations. */
function validateGame(value: unknown): SavedGame | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Record<string, unknown>;
  if (typeof entry.id !== 'string' || typeof entry.title !== 'string' || typeof entry.initialFen !== 'string' || !Array.isArray(entry.moves)) return null;
  const moves: string[] = [];
  for (const move of entry.moves) { if (typeof move !== 'string') return null; moves.push(move); }
  const game: SavedGame = { id: entry.id, title: entry.title.replace(/study/gi, 'game'), initialFen: entry.initialFen, moves, branches: [] };
  try { replay(game); } catch { return null; }
  game.cursor = typeof entry.cursor === 'number' && Number.isInteger(entry.cursor) ? Math.max(0, Math.min(moves.length, entry.cursor)) : moves.length;
  if (Array.isArray(entry.branches)) {
    for (const branch of entry.branches) {
      if (!Array.isArray(branch)) continue;
      try { replay({ ...game, moves: branch }); game.branches!.push(branch); } catch { /* Ignore a corrupt branch only. */ }
    }
  }
  return game;
}

/** Converts the original analyzer's node history, including side variations, into saved paths. */
function migrateLegacy(entry: Record<string, unknown>): SavedGame | null {
  if (!Array.isArray(entry.history) || !entry.history[0]?.fen) return null;
  const paths: string[][] = [];
  /** Collects complete legal paths from the original nested variation representation. */
  function collect(nodes: Record<string, unknown>[], prefix: string[]): void {
    const moves = [...prefix];
    for (const node of nodes) {
      const move = node.move as { san?: string } | string | null;
      const san = typeof move === 'string' ? move : move?.san;
      if (san) moves.push(san);
      if (Array.isArray(node.variations)) for (const branch of node.variations) if (Array.isArray(branch)) collect(branch, moves);
    }
    paths.push(moves);
  }
  collect(entry.history, []);
  const moves = paths.pop() ?? [];
  return validateGame({ id: String(entry.id), title: `Game ${entry.date ?? ''}`.trim(), initialFen: entry.history[0].fen, moves, branches: paths, cursor: moves.length });
}

/** Restores the last active game and supports both previous storage versions. */
export function loadSession(): Session {
  const games: SavedGame[] = [];
  let activeId = '';
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current !== null) {
      const data = JSON.parse(current);
      activeId = typeof data.activeId === 'string' ? data.activeId : '';
      if (Array.isArray(data.games)) for (const entry of data.games) { const game = validateGame(entry); if (game) games.push(game); }
    } else {
      const previous = JSON.parse(localStorage.getItem('chess-analyzer.studies.v2') ?? '[]');
      if (Array.isArray(previous)) for (const entry of previous) { const game = validateGame(entry); if (game) games.push(game); }
      const legacy = JSON.parse(localStorage.getItem('chess_games') ?? '[]');
      if (Array.isArray(legacy)) for (const entry of legacy) {
        try { const game = migrateLegacy(entry); if (game) games.push(game); } catch { /* Skip damaged legacy entries. */ }
      }
      activeId = localStorage.getItem('last_active_game_id') ?? '';
    }
  } catch { /* Keep valid records recovered before an invalid storage entry. */ }
  if (!games.length) games.push(newGame());
  if (!games.some(
    /** Verifies that the saved active identifier still belongs to a valid game. */
    (game) => game.id === activeId,
  )) activeId = games[0]!.id;
  return { games, activeId };
}

/** Saves games and the active cursor together so reloads restore the exact position. */
export function saveSession(session: Session): void { localStorage.setItem(STORAGE_KEY, JSON.stringify(session)); }

/** Restores validated local-only depth and variation preferences. */
export function loadSettings(): EngineSettings {
  try {
    const value = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
    if (value && Number.isInteger(value.depth) && value.depth >= 1 && value.depth <= 30 && Number.isInteger(value.lines) && value.lines >= 1 && value.lines <= 5) return { depth: value.depth, lines: value.lines };
  } catch { /* Fall back to usable local engine defaults. */ }
  return DEFAULT_SETTINGS;
}
