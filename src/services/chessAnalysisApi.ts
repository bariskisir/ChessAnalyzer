// Handles resilient communication with the remote chess analysis API.
import type { ChessApiResponse, EngineSettings } from "../domain/types";

let isDailyLimitReached = false;

/** Sends a position to the configured chess API with exponential retry handling. */
export async function postChessAnalysis(
  fen: string,
  options: Partial<EngineSettings> = {},
): Promise<ChessApiResponse> {
  if (isDailyLimitReached) {
    return {
      type: "error",
      error: "HIGH_USAGE",
      text: "Daily limit already reached.",
    };
  }

  const apiUrl = options.apiUrl ?? "https://chess-api.com/v1";
  const body = {
    fen,
    depth: options.depth ?? 18,
    variants: options.variants ?? 5,
    maxThinkingTime: options.maxThinkingTime,
  };

  const startTime = Date.now();
  let delay = 200;
  const maxWait = 5 * 60 * 1000;

  while (true) {
    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await response.json()) as ChessApiResponse;

      if (data && "error" in data && data.error === "HIGH_USAGE") {
        isDailyLimitReached = true;
        return data;
      }

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      return data;
    } catch (error) {
      const elapsed = Date.now() - startTime;

      if (elapsed >= maxWait) {
        console.error("API request timed out after 5 minutes of retries.");
        return null;
      }

      console.warn(`API call failed (FEN: ${fen}). Retrying in ${delay}ms...`, error);
      await new Promise((resolve) => window.setTimeout(resolve, delay));
      delay *= 2;
    }
  }
}
