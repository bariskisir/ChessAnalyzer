# Chess Analyzer Agent Guide

## Scope

These instructions apply to the entire repository.

Chess Analyzer is a browser-only React application for exploring chess positions and games. It uses TypeScript, SCSS, Vite, `chess.js`, `react-chessboard`, and a local Stockfish 19 WebAssembly worker. Preserve the existing board-first experience unless a task explicitly asks for a redesign.

## Required environment

- Use Node.js 24 or newer and npm.
- Install dependencies with `npm install`.
- Start development with `npm run dev`. Vite listens on all local interfaces.
- Build production assets with `npm run build`.
- Preview the production build with `npm run preview`.
- Do not commit `node_modules`, `dist`, `public/engine`, `playwright-report`, or `test-results`.

The `postinstall`, `predev`, and `prebuild` hooks run `scripts/prepare-engine.ts`. This copies the pinned Stockfish worker, WASM binary, and GPL license from `stockfish@19.0.0` into `public/engine`. Treat `public/engine` as generated output; change the package version or preparation script instead of editing generated engine files.

## Validation commands

Run checks that match the change:

```sh
npm run lint
npm test
npm run build
npm run test:e2e
```

- `npm run lint` runs ESLint and `scripts/check-comments.ts`.
- `npm test` runs the Node unit tests in `tests/*.test.ts`.
- `npm run build` performs strict TypeScript checking before the Vite build.
- `npm run test:e2e` runs Playwright against the production build in desktop Chrome and an iPhone-sized Chromium project. Install its browser once with `npx playwright install chromium` when necessary.
- Keep Playwright tests deterministic. Use the real local Stockfish worker where engine integration matters and use depth 8 in browser tests to keep them fast.
- Do not update snapshots or weaken assertions merely to make a failing test pass. Confirm whether behavior or the test is wrong.

## Code rules

- Write source code, identifiers, comments, UI text, tests, and documentation in English.
- Every project-owned code file must start with an English file-level comment describing its purpose.
- Every implemented function must have an English comment immediately above it. This includes React components, event handlers, nested functions, callbacks, arrow functions, test bodies, and utility functions. `npm run lint` enforces this rule.
- Use TypeScript with strict types. Avoid `any`, unchecked casts, and non-null assertions unless the invariant is local and clear.
- Prefer named domain types from `src/types.ts` over repeating object shapes across modules.
- Keep functions focused and express chess rules through `chess.js`; do not duplicate move legality logic manually.
- Keep authored styles in SCSS. The application currently uses the single `src/styles.scss` entry point; do not add plain CSS files.
- Preserve accessible names, native controls, keyboard behavior, and focus handling. Tests locate controls primarily by role and accessible label.
- Use `import.meta.env.BASE_URL` for public asset URLs so non-root deployments continue to work.
- Do not add telemetry, analytics, accounts, a backend, or network requests unless the task explicitly requires them.

## Architecture

- `src/main.tsx` mounts the React application and imports the global SCSS entry point.
- `src/App.tsx` owns the active game, tabs, dialogs, navigation, keyboard shortcuts, game actions, and component composition.
- `src/chess.ts` owns game creation, FEN/PGN import, replay, SAN/UCI variation conversion, status text, branch creation, and branch switching.
- `src/types.ts` defines engine settings, engine lines, and the persisted game shape.
- `src/engines.ts` owns the UCI protocol and one Stockfish worker search.
- `src/useAnalysis.ts` owns analysis cancellation, progressive results, local caching, and nearby-history warming.
- `src/storage.ts` validates persistence, migrates older formats, and stores games/settings.
- `src/components/Board.tsx` owns board interaction, promotion, square selection, highlights, and custom annotations.
- `src/components/EnginePanel.tsx` renders local engine lines and their move controls.
- `src/components/EvaluationBar.tsx` retains the previous evaluation while a new position is calculating.
- `src/components/MoveButton.tsx` provides hover/focus board previews and immediate click navigation.
- `src/components/Modal.tsx` provides native accessible dialogs.
- `src/components/pieces.tsx` is the shared source for piece renderers and board colors.
- `public/pieces` contains the visible Chess.com-style piece image set.
- `tests/chess.test.ts` covers chess replay, imports, special moves, evaluation parsing, and branches.
- `tests/storage.test.ts` covers persistence validation and legacy migrations.
- `tests/browser/workspace.spec.ts` covers the real user workflow on desktop and mobile.

Keep domain logic out of JSX when it can be tested as a pure function in `src/chess.ts` or `src/storage.ts`. Keep raw UCI parsing inside `src/engines.ts` and React lifecycle orchestration inside `src/useAnalysis.ts`.

## Product invariants

### Layout and appearance

- The desktop layout places the large chessboard and evaluation bar on the left and the compact Analysis/Games sidebar on the right.
- On mobile, the board appears first and the sidebar remains fully usable below it without horizontal overflow.
- Keep the sidebar minimal so the move list retains most of the available vertical space.
- Do not add a marketing hero, page title, game-name field, or visible game names to the Games tab.
- Preserve the board colors: dark squares are `#779954` and light squares are `#e9edcc`.
- Use the shared local piece images for the main board and every preview. Do not silently switch to another piece set.
- FEN/PGN entry belongs in a popup opened from the FEN row. Engine depth and line count belong in the settings popup.

### Engine behavior

- Local Stockfish 19 Lite Single is the only engine. Do not add Chess.com, chess-api.com, another remote provider, or an engine selector without an explicit request.
- Search with `go depth <depth>`. There is no thinking-time setting and no `movetime` command.
- Begin analysis immediately. Do not introduce an artificial debounce, delay, or autoplay wait.
- Each search owns an isolated Web Worker. Abort and terminate obsolete workers when the position, settings, paused state, or component lifecycle changes.
- Normalize engine scores to White's perspective in `parseInfo`.
- Publish only complete MultiPV iterations when possible so lines from different depths do not get mixed.
- Analyze the visible position before warming nearby history positions.
- Never send positions or game data over the network during local analysis.

### Evaluation and navigation

- The evaluation bar must keep its last displayed value while a new, uncached position is calculating. It should transition directly from the previous value to the new result rather than reset to neutral.
- Cache keys include the full FEN and engine settings. Do not reuse an evaluation from a different halfmove clock, repetition context, depth, or line count.
- Hovering or keyboard-focusing an engine move, history move, saved variation, or saved game shows its exact position in a floating preview.
- A preview must not change the main board. Clicking or tapping the move must immediately navigate or play through to the previewed position.
- Arrow keys move one ply, Up/Down and Home/End jump to the beginning/end, `F` flips the board, and Space plays the current best move. Do not intercept these shortcuts while the user is typing or a dialog is open.
- Keep Control-click square highlighting, Control-drag arrows, right-click clearing, drag moves, tap moves, legal destination hints, and all four promotion choices working.

### Games and persistence

- Games save automatically after moves, branch switches, and cursor navigation. Reloading restores the active game and exact cursor.
- The Games tab displays compact metadata and FEN positions without user-facing game names.
- Following an existing main-line move advances through that line without truncating its tail.
- Playing a different move from an earlier position preserves the displaced continuation as a branch.
- Switching branches preserves the former main line so users can switch back.
- Continue supporting migrations from `chess_games`, `last_active_game_id`, and `chess-analyzer.studies.v2`. Do not remove migration keys without an explicit data-retention decision.
- Treat localStorage as untrusted and possibly unavailable. Validate records independently so one corrupt game does not hide valid games.

## Assets and licensing

- `public/chess-analyzer-demo.gif` is the README demo shown directly below the project title.
- `public/screenshot.png` was intentionally removed; do not restore it unless explicitly requested.
- Stockfish.js is GPL-3.0 software separate from this repository's MIT-licensed application code.
- Keep the engine license and source links available in the settings dialog and README.
- Preserve `public/engine/Copying.txt` in production output and keep the npm package pinned when engine asset names are hard-coded.

## Change workflow

1. Read the relevant source and existing tests before editing.
2. Preserve unrelated working-tree changes and generated-file boundaries.
3. Update pure unit tests for chess, storage, or UCI changes.
4. Update Playwright coverage for visible interaction, responsive layout, worker lifecycle, or persistence changes.
5. Run lint, focused tests, and a production build. Run the full browser suite for user-facing or engine changes.
6. Check desktop and mobile layout after SCSS or component placement changes.
7. Update README when commands, engine packaging, major behavior, assets, or licensing change.
