// Tests compatibility with original games, automatic persistence, and corrupted saved entries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { importGame, replay } from '../src/chess';
import { loadSession, saveSession, STORAGE_KEY } from '../src/storage';

/** Creates isolated browser-like storage for each persistence test. */
function memoryStorage(): Map<string, string> {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    /** Reads one stored value using browser null semantics. */
    getItem(key: string): string | null { return values.get(key) ?? null; },
    /** Stores one serialized value. */
    setItem(key: string, value: string): void { values.set(key, value); },
  } });
  return values;
}

test('original node histories and their nested variations migrate without losing moves',
  /** Recreates the first analyzer storage format and its last-active identifier. */
  () => {
    const storage = memoryStorage();
    const game = new Chess(); const first = game.move('e4'); const second = game.move('e5');
    const branch = new Chess(first.after); const alternative = branch.move('c5');
    storage.set('chess_games', JSON.stringify([{ id: 17, date: 'Original game', history: [
      { fen: first.before, move: null },
      { fen: first.after, move: first, variations: [[{ fen: alternative.after, move: alternative }]] },
      { fen: second.after, move: second },
    ] }]));
    storage.set('last_active_game_id', '17');
    const session = loadSession();
    assert.equal(session.activeId, '17');
    assert.deepEqual(session.games[0]?.moves, ['e4', 'e5']);
    assert.deepEqual(session.games[0]?.branches, [['e4', 'c5']]);
    assert.equal(replay(session.games[0]!).fen(), game.fen());
  },
);

test('the previous format imports and the new format preserves the exact active cursor',
  /** Verifies backward compatibility and a full autosave roundtrip. */
  () => {
    const storage = memoryStorage();
    const game = importGame('1. d4 d5 2. c4');
    storage.set('chess-analyzer.studies.v2', JSON.stringify([{ ...game, title: 'Opening study' }]));
    const session = loadSession();
    assert.equal(session.games[0]?.title, 'Opening game');
    session.games[0]!.cursor = 1;
    saveSession(session);
    assert.equal(loadSession().games[0]?.cursor, 1);
    assert.equal(loadSession().activeId, game.id);
  },
);

test('one corrupt saved game does not hide valid games or reload deleted legacy records',
  /** Ensures validation isolates corruption and migration only runs before the new format exists. */
  () => {
    const storage = memoryStorage();
    const game = importGame('1. e4');
    storage.set(STORAGE_KEY, JSON.stringify({ activeId: game.id, games: [{ ...game, moves: ['illegal'] }, game] }));
    assert.equal(loadSession().games.length, 1);
    storage.set('chess-analyzer.studies.v2', JSON.stringify([game]));
    storage.set(STORAGE_KEY, JSON.stringify({ activeId: '', games: [] }));
    assert.notEqual(loadSession().games[0]?.id, game.id);
  },
);
