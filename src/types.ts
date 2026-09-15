// Defines local engine results, persisted games, and analysis preferences.
export interface EngineSettings {
  depth: number;
  lines: number;
}
export interface AnalysisLine {
  rank: number;
  depth: number;
  score: number;
  mate: number | null;
  moves: string[];
}
export interface SavedGame {
  id: string;
  title: string;
  initialFen: string;
  moves: string[];
  branches?: string[][];
  cursor?: number;
}
export const DEFAULT_SETTINGS: EngineSettings = { depth: 18, lines: 1 };
