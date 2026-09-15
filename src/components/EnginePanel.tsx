// Keeps the original compact engine strip and makes every variation move directly navigable.
import { Pause, Play, Settings, RotateCw } from 'lucide-react';
import { formatScore, variation } from '../chess';
import type { AnalysisLine } from '../types';
import MoveButton from './MoveButton';

interface EnginePanelProps {
  fen: string; flipped: boolean; lines: AnalysisLine[]; busy: boolean; error: string;
  paused: boolean; terminal: boolean; onToggle: () => void; onRetry: () => void;
  onSettings: () => void; onPlay: (moves: string[]) => void;
}

/** Renders progressive local results without exposing settings or provider selectors in the main panel. */
export default function EnginePanel({ fen, flipped, lines, busy, error, paused, terminal, onToggle, onRetry, onSettings, onPlay }: EnginePanelProps) {
  return <section className="eval-box" aria-label="Engine analysis">
    <div className="settings-bar"><span>Stockfish 18 · Local</span><div>
      <button className="icon-button" aria-label={paused ? 'Resume analysis' : 'Pause analysis'} onClick={onToggle}>{paused ? <Play size={15} /> : <Pause size={15} />}</button>
      <button className="icon-button" aria-label="Engine settings" onClick={onSettings}><Settings size={19} /></button>
    </div></div>
    <div className="analysis-status" role="status">{terminal ? 'Game over' : paused ? 'Analysis paused' : busy ? 'Analyzing…' : error ? 'Engine unavailable' : 'Analysis complete'}{lines[0] && <span>Depth {lines[0].depth}</span>}</div>
    {error && <div className="error" role="alert">{error}<button onClick={onRetry}><RotateCw size={14} /> Retry</button></div>}
    <div className="engine-lines">{lines.map(
      /** Renders a complete legal principal variation with hover previews for every move. */
      (line) => <div className="engine-line" key={line.rank}><strong className={`line-score ${line.score < 0 ? 'minus' : ''}`}>{formatScore(line)}</strong><div className="line-moves">{variation(fen, line.moves).map(
        /** Associates each displayed move with its exact continuation prefix. */
        (move, index) => <MoveButton key={`${index}-${move.uci}`} fen={move.fen} flipped={flipped} lastMove={{ from: move.uci.slice(0, 2), to: move.uci.slice(2, 4) }} className={`engine-move ${index === 0 ? 'highlight' : ''}`} onChoose={
          /** Immediately plays through the clicked engine move. */
          () => onPlay(line.moves.slice(0, index + 1))
        }>{move.san}</MoveButton>,
      )}</div></div>,
    )}</div>
  </section>;
}
