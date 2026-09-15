// Streams local analysis immediately and reuses persisted results for history navigation.
import { useEffect, useState } from 'react';
import { Chess } from 'chess.js';
import { analyzeLocal } from './engines';
import type { AnalysisLine, EngineSettings } from './types';

interface AnalysisState { key: string; lines: AnalysisLine[]; busy: boolean; error: string; revision: number }
const CACHE_KEY = 'chess-analyzer.local-analysis.v3';

/** Includes search limits and all FEN fields in the local-only cache identity. */
function cacheKey(fen: string, settings: EngineSettings): string { return `${fen}|${settings.depth}|${settings.lines}`; }

/** Loads a bounded cache while rejecting malformed or illegal saved results. */
function loadCache(): Map<string, AnalysisLine[]> {
  const cache = new Map<string, AnalysisLine[]>();
  try {
    const entries = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]');
    if (!Array.isArray(entries)) return cache;
    for (const entry of entries.slice(-300)) {
      if (!Array.isArray(entry) || typeof entry[0] !== 'string' || !Array.isArray(entry[1]) || !entry[1].length) continue;
      try {
        for (const line of entry[1]) {
          if (!Number.isFinite(line.score) || !Number.isInteger(line.depth) || !Number.isInteger(line.rank) || (line.mate !== null && !Number.isFinite(line.mate)) || !Array.isArray(line.moves) || !line.moves.length) throw new Error('Invalid score');
          const position = new Chess(entry[0].split('|')[0]);
          for (const move of line.moves) { if (typeof move !== 'string') throw new Error('Invalid move'); position.move(move); }
        }
        cache.set(entry[0], entry[1]);
      } catch { /* Discard this cache entry without losing other results. */ }
    }
  } catch { /* Analysis still works when browser storage is unavailable. */ }
  return cache;
}

/** Starts immediately, caches complete searches, and warms nearby history only after completion. */
export function useAnalysis(fen: string, settings: EngineSettings, enabled: boolean, retry: number, nearby: string[]) {
  const [cache] = useState(loadCache);
  const identity = cacheKey(fen, settings);
  const key = `${identity}|${enabled}|${retry}`;
  const neighbors = JSON.stringify(nearby);
  const [state, setState] = useState<AnalysisState>({ key: '', lines: [], busy: false, error: '', revision: 0 });
  useEffect(
    /** Gives the visible position priority and cancels all obsolete searches. */
    () => {
      const controller = new AbortController();
      /** Publishes active search updates without exposing another position's moves. */
      function publish(lines: AnalysisLine[], busy: boolean, error = ''): void {
        if (!controller.signal.aborted) setState(
          /** Advances the cache revision so historical annotations refresh as well. */
          (previous) => ({ key, lines, busy, error, revision: previous.revision + 1 }),
        );
      }
      /** Saves completed local results with a bounded storage footprint. */
      function remember(position: string, lines: AnalysisLine[]): void {
        if (controller.signal.aborted) return;
        cache.set(cacheKey(position, settings), lines);
        while (cache.size > 300) cache.delete(cache.keys().next().value!);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify([...cache])); } catch { /* Keep the in-memory cache when storage is full. */ }
      }
      /** Finishes the active analysis before sequentially evaluating nearby uncached positions. */
      async function run(): Promise<void> {
        let result = cache.get(identity);
        try {
          if (!result) {
            publish([], true);
            result = await analyzeLocal(fen, settings, controller.signal,
              /** Shows results as soon as Stockfish reports its first search iteration. */
              (progress) => publish(progress, true),
            );
            remember(fen, result);
          }
          publish(result, false);
        } catch (error) { publish([], false, error instanceof Error ? error.message : 'Analysis failed.'); return; }
        for (const position of JSON.parse(neighbors) as string[]) {
          if (controller.signal.aborted) break;
          if (cache.has(cacheKey(position, settings)) || new Chess(position).isGameOver()) continue;
          try {
            const lines = await analyzeLocal(position, settings, controller.signal,
              /** Keeps background iterations out of the visible position's display. */
              () => {},
            );
            remember(position, lines); publish(result, false);
          } catch { break; }
        }
      }
      if (enabled) void run();
      return /** Releases foreground or background work immediately on navigation. */ () => controller.abort();
    }, [fen, settings, enabled, retry, key, identity, neighbors, cache],
  );
  /** Reads a completed result for move annotations or immediate cached navigation. */
  function evaluation(position: string): AnalysisLine | undefined { return cache.get(cacheKey(position, settings))?.[0]; }
  const current = state.key === key ? state : { key, lines: enabled ? cache.get(identity) ?? [] : [], busy: enabled && !cache.has(identity), error: '', revision: state.revision };
  return { ...current, evaluation };
}
