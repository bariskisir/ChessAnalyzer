// Tests chess imports, repetition history, UCI normalization, and game navigation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { applySequence, importGame, replay, variation, formatScore, positionStatus, switchBranch } from '../src/chess';
import { parseInfo } from '../src/engines';

const start = new Chess().fen();

test('following a continuation preserves its tail and branching preserves alternative paths',
  /** Verifies the original navigation and variation-swap behavior. */
  () => {
    const game = importGame('1. e4 e5 2. Nf3 Nc6');
    const followed = applySequence(game, 0, ['e2e4']);
    assert.deepEqual(followed.moves, game.moves);
    assert.equal(followed.cursor, 1);
    const branched = applySequence(followed, 1, ['c7c5', 'g1f3']);
    assert.deepEqual(branched.moves, ['e4', 'c5', 'Nf3']);
    assert.deepEqual(branched.branches, [game.moves]);
    const restored = switchBranch(branched, 0);
    assert.deepEqual(restored.moves, game.moves);
    assert.equal(restored.cursor, 2);
    assert.deepEqual(restored.branches, [branched.moves]);
  },
);

test('UCI scores use White perspective, including mate and MultiPV ranks',
  /** Checks side-to-move normalization and ignores non-exact search bounds. */
  () => {
    const black = new Chess(); black.move('e4');
    const line = parseInfo('info depth 14 multipv 2 score cp 125 nodes 200 pv e7e5 g1f3', black.fen());
    assert.equal(line?.score, -1.25); assert.equal(line?.rank, 2); assert.equal(line?.depth, 14);
    const mate = parseInfo('info depth 8 score mate -3 pv e7e5', black.fen());
    assert.equal(mate?.mate, 3); assert.equal(formatScore(mate!), 'M3');
    assert.equal(parseInfo('info depth 8 score cp 20 lowerbound pv e2e4', start), null);
  },
);

test('FEN and PGN imports preserve custom starting turns and allow export roundtrips',
  /** Replays a PGN with a black-to-move setup and checks the roundtrip position. */
  () => {
    const game = new Chess(); game.move('e4');
    const gameRecord = importGame(`[SetUp "1"]\n[FEN "${game.fen()}"]\n\n1... c5 2. Nf3 d6 *`);
    assert.equal(gameRecord.initialFen, game.fen());
    assert.deepEqual(gameRecord.moves, ['c5', 'Nf3', 'd6']);
    assert.equal(replay(importGame(replay(gameRecord).pgn())).fen(), replay(gameRecord).fen());
    assert.equal(importGame(game.fen()).initialFen, game.fen());
    assert.throws(
      /** Rejects malformed input instead of silently creating an empty gameRecord. */
      () => importGame('not a chess position'),
    );
  },
);

test('replay retains threefold repetition and variation parsing handles special moves',
  /** Exercises repetition, castling, en passant, and underpromotion. */
  () => {
    const repetition = importGame('1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8');
    assert.equal(replay(repetition).isThreefoldRepetition(), true);
    assert.equal(positionStatus(replay(repetition)), 'Draw · threefold repetition');
    const castle = importGame('1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6');
    assert.equal(variation(replay(castle).fen(), ['e1g1'])[0]?.san, 'O-O');
    const ep = importGame('1. e4 a6 2. e5 d5');
    assert.equal(variation(replay(ep).fen(), ['e5d6'])[0]?.san, 'exd6');
    assert.equal(variation('7k/P7/8/8/8/8/8/7K w - - 0 1', ['a7a8n'])[0]?.san, 'a8=N');
    assert.equal(variation(start, ['e2e4', 'e2e3']).length, 1);
  },
);


