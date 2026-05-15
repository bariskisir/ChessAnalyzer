// Renders the vertical score bar that visualizes the engine evaluation.
import "./EvaluationBar.css";
import type { BoardOrientation } from "../../domain/types";

type EvaluationBarProps = {
  score: number;
  isMate: boolean;
  orientation?: BoardOrientation;
};

/** Converts a centipawn score into the percentage used by the evaluation bar. */
function scoreToPercentage(score: number, isMate: boolean): number {
  if (isMate) {
    return score > 0 ? 100 : 0;
  }

  const winChance = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * score)) - 1);
  return Math.max(0, Math.min(100, winChance));
}

/** Displays the engine score with orientation-aware fill direction and label placement. */
export default function EvaluationBar({
  score,
  isMate,
  orientation = "white",
}: EvaluationBarProps) {
  const percentage = scoreToPercentage(score, isMate);
  const isWhiteAtBottom = orientation === "white";
  const isWhiteWinning = percentage > 50;
  const showScoreAtBottom = isWhiteAtBottom ? isWhiteWinning : !isWhiteWinning;

  return (
    <div
      className="eval-bar-container"
      style={{ flexDirection: isWhiteAtBottom ? "column-reverse" : "column" }}
    >
      <div className="eval-bar-fill" style={{ height: `${percentage}%` }} />
      <div className={`eval-score ${showScoreAtBottom ? "bottom" : "top"}`}>
        {isMate ? `M${Math.abs(score)}` : (score / 100).toFixed(1)}
      </div>
    </div>
  );
}
