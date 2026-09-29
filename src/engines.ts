// Runs cancellable local Stockfish UCI searches without artificial thinking delays.
import { Chess } from 'chess.js';

import type { AnalysisLine, EngineSettings } from './types';

/** Parses exact UCI scores and normalizes them to White's perspective. */
export function parseInfo(text: string, fen: string): AnalysisLine | null {
  if (!text.startsWith('info ') || /\b(upperbound|lowerbound)\b/.test(text)) return null;
  const score = /\bscore (cp|mate) (-?\d+)/.exec(text);
  const pv = /\bpv (.+)/.exec(text);
  if (!score || !pv?.[1]) return null;
  const sign = fen.split(' ')[1] === 'w' ? 1 : -1;
  const value = Number(score[2]) * sign;
  return {
    rank: Number(/\bmultipv (\d+)/.exec(text)?.[1] ?? 1),
    depth: Number(/\bdepth (\d+)/.exec(text)?.[1] ?? 0),
    score: score[1] === 'cp' ? value / 100 : (value < 0 ? -100 : 100),
    mate: score[1] === 'mate' ? value : null,
    moves: pv[1].trim().split(/\s+/),
  };
}

/** Returns principal variations in their engine-assigned order. */
function ordered(lines: Map<number, AnalysisLine>): AnalysisLine[] {
  return [...lines.values()].sort(
    /** Orders lines by their MultiPV rank. */
    (a, b) => a.rank - b.rank,
  );
}

/** Runs one worker per search so cancelled positions cannot leak stale results. */
export function analyzeLocal(
  fen: string, settings: EngineSettings, signal: AbortSignal,
  onProgress: (lines: AnalysisLine[]) => void,
): Promise<AnalysisLine[]> {
  return new Promise(
    /** Owns the worker lifecycle, UCI handshake, timeout, and cancellation. */
    (resolve, reject) => {
      if (signal.aborted) { reject(new DOMException('Analysis cancelled', 'AbortError')); return; }
      const worker = new Worker(`${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`);
      const lines = new Map<number, AnalysisLine>();
      const iterations = new Map<number, Map<number, AnalysisLine>>();
      const expected = Math.min(settings.lines, new Chess(fen).moves().length);
      let complete: AnalysisLine[] = [];
      let finished = false;
      let started = false;
      const timer = globalThis.setTimeout(timeout, 20_000);

      /** Terminates the worker and releases every listener owned by this search. */
      function finish(error?: Error): void {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', cancel);
        worker.terminate();
        if (error) reject(error);
        else resolve(complete.length ? complete : ordered(lines));
      }

      /** Rejects a worker that failed to initialize or complete within its deadline. */
      function timeout(): void { finish(new Error('Stockfish timed out. Retry the analysis.')); }

      /** Immediately frees the old engine when the position or settings change. */
      function cancel(): void { finish(new DOMException('Analysis cancelled', 'AbortError')); }

      /** Advances the UCI handshake and publishes valid principal variations. */
      function receive(event: MessageEvent<unknown>): void {
        if (typeof event.data !== 'string' || finished) return;
        for (const text of event.data.split(/\r?\n/)) {
          if (text.trim() === 'uciok') {
            worker.postMessage(`setoption name MultiPV value ${settings.lines}`);
            worker.postMessage('setoption name Hash value 32');
            worker.postMessage('isready');
          } else if (text.trim() === 'readyok' && !started) {
            started = true;
            clearTimeout(timer);

            worker.postMessage(`position fen ${fen}`);
            worker.postMessage(`go depth ${settings.depth}`);
          } else if (text.startsWith('bestmove ')) {
            const bestMove = text.split(' ')[1];
            const latest = lines.get(1);
            if (latest && latest.moves[0] === bestMove && complete[0]?.moves[0] !== bestMove) {
              complete = [latest, ...complete.filter(
                /** Keeps distinct alternatives when the last partial iteration changes the best move. */
                (candidate) => candidate.moves[0] !== bestMove,
              )].slice(0, expected).map(
                /** Renumbers the final result after promoting the engine's best move. */
                (candidate, index) => ({ ...candidate, rank: index + 1 }),
              );
            }
            finish(lines.size ? undefined : new Error('Stockfish returned no analysis.'));
          } else {
            const line = parseInfo(text, fen);
            if (line && line.rank <= settings.lines) {
              lines.set(line.rank, line);
              const iteration = iterations.get(line.depth) ?? new Map<number, AnalysisLine>();
              iteration.set(line.rank, line);
              iterations.set(line.depth, iteration);
              if (iteration.size === expected) {
                complete = ordered(iteration);
                onProgress(complete);
              } else if (!complete.length) onProgress(ordered(iteration));
            }
          }
        }
      }

      /** Reports worker asset, WebAssembly, or execution failures. */
      function fail(event: ErrorEvent): void {
        finish(new Error(event.message || 'Could not load local Stockfish. Check the engine assets.'));
      }

      signal.addEventListener('abort', cancel, { once: true });
      worker.onmessage = receive;
      worker.onerror = fail;
      worker.postMessage('uci');
    },
  );
}


