// Boots the React application and mounts it into the document root.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ChessAnalyzerApp from "./app/ChessAnalyzerApp";
import "./styles/global.css";

/** Mounts the chess analyzer into the root DOM element. */
function mountApplication() {
  const rootElement = document.getElementById("root");

  if (!rootElement) {
    throw new Error("Root element was not found.");
  }

  createRoot(rootElement).render(
    <StrictMode>
      <ChessAnalyzerApp />
    </StrictMode>,
  );
}

mountApplication();
