// Retains the last score while a new position is being analyzed and transitions directly to its result.
import { useState } from 'react';
import { formatScore } from '../chess';
import type { AnalysisLine } from '../types';

/** Holds the displayed evaluation across unknown positions, pauses, and engine restarts. */
export default function EvaluationBar({ line, result, flipped }: { line?: AnalysisLine; result: 'white' | 'black' | 'draw' | null; flipped: boolean }) {
  const [previous, setPrevious] = useState({ percent: 50, label: '—' });
  const target = result ? { percent: result === 'draw' ? 50 : result === 'white' ? 100 : 0, label: result === 'draw' ? '½–½' : 'M0' }
    : line ? { percent: line.mate !== null ? (line.mate < 0 ? 0 : 100) : Math.max(2, Math.min(98, 50 + 45 * Math.tanh(line.score / 4))), label: formatScore(line) } : null;
  if (target && (previous.percent !== target.percent || previous.label !== target.label)) setPrevious(target);
  const display = target ?? previous;
  return <div className={`eval-track ${flipped ? 'flipped' : ''}`} aria-label={`Evaluation ${display.label}`} data-evaluation={display.label}>
    <div className="eval-white" style={{ height: `${display.percent}%` }} /><span className={display.percent < 50 ? 'negative' : ''}>{display.label}</span>
  </div>;
}
