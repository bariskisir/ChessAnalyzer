// Restores the original board-first analyzer layout, game management, and move interactions.
import { useEffect, useRef, useState } from 'react';
import type { Move } from 'chess.js';
import { Compass, History, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, Plus, ArrowLeftRight, Upload, Copy, Download, Play, Trash2 } from 'lucide-react';
import Board from './components/Board';
import EnginePanel from './components/EnginePanel';
import EvaluationBar from './components/EvaluationBar';
import Modal from './components/Modal';
import MoveButton from './components/MoveButton';
import { applySequence, importGame, newGame, positionStatus, replay, switchBranch } from './chess';
import { loadSession, loadSettings, saveSession, SETTINGS_KEY } from './storage';
import { useAnalysis } from './useAnalysis';
import type { SavedGame } from './types';

/** Coordinates the original analysis/game tabs with immediate local engine playback. */
export default function App() {
  const [session, setSession] = useState(loadSession);
  const [settings, setSettings] = useState(loadSettings);
  const [tab, setTab] = useState<'analysis' | 'games'>('analysis');
  const [popup, setPopup] = useState<'import' | 'settings' | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [paused, setPaused] = useState(false);
  const [retry, setRetry] = useState(0);
  const [input, setInput] = useState('');
  const [importError, setImportError] = useState('');
  const [notice, setNotice] = useState('');
  const [showBranches, setShowBranches] = useState(false);
  const historyElement = useRef<HTMLDivElement>(null);
  const gameRecord = session.games.find(
    /** Locates the selected game without discarding the other saved games. */
    (entry) => entry.id === session.activeId,
  )!;
  const cursor = gameRecord.cursor ?? gameRecord.moves.length;
  const game = replay(gameRecord, cursor);
  const history = replay(gameRecord).history({ verbose: true });
  const fen = game.fen();
  const terminal = game.isGameOver();
  const positions = [gameRecord.initialFen, ...history.map(
    /** Collects history positions for nearby background cache warming. */
    (move) => move.after,
  )];
  const nearby: string[] = [];
  for (let distance = 1; distance <= 3; distance++) {
    if (positions[cursor - distance]) nearby.push(positions[cursor - distance]!);
    if (positions[cursor + distance]) nearby.push(positions[cursor + distance]!);
  }
  const analysis = useAnalysis(fen, settings, !paused && !terminal, retry, nearby);
  const best = analysis.lines[0];
  const evaluation = best ?? analysis.evaluation(fen);
  const result = terminal ? game.isCheckmate() ? game.turn() === 'w' ? 'black' : 'white' : 'draw' : null;
  const moveRows = new Map<number, { white?: { move: Move; index: number }; black?: { move: Move; index: number } }>();
  for (const [index, move] of history.entries()) {
    const number = Number(move.before.split(' ')[5]);
    const row = moveRows.get(number) ?? {};
    row[move.color === 'w' ? 'white' : 'black'] = { move, index: index + 1 };
    moveRows.set(number, row);
  }

  useEffect(
    /** Persists every move, variation, rename, and navigation position automatically. */
    () => { try { saveSession(session); } catch { setNotice('Browser storage is unavailable. Export PGN to keep this game.'); } }, [session],
  );
  useEffect(
    /** Saves local engine preferences independently from games. */
    () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* Preferences remain usable in memory. */ } }, [settings],
  );
  useEffect(
    /** Scrolls only the history list to keep the selected move in view. */
    () => {
      const container = historyElement.current;
      const active = container?.querySelector<HTMLElement>('[aria-current="step"]');
      if (!container || !active) return;
      const outer = container.getBoundingClientRect(); const inner = active.getBoundingClientRect();
      if (inner.top < outer.top) container.scrollTop += inner.top - outer.top;
      else if (inner.bottom > outer.bottom) container.scrollTop += inner.bottom - outer.bottom;
    }, [cursor, gameRecord.moves, tab],
  );
  useEffect(
    /** Restores arrow navigation, F to flip, and Space to play the engine move. */
    () => {
      /** Ignores typing and modal dialogs before applying a board shortcut. */
      function navigate(event: KeyboardEvent): void {
        if (popup || event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.target instanceof HTMLElement && (event.target.closest('input,textarea,select') || event.target.isContentEditable)) return;
        let destination: number | undefined;
        if (event.key === 'ArrowLeft') destination = Math.max(0, cursor - 1);
        if (event.key === 'ArrowRight') destination = Math.min(history.length, cursor + 1);
        if (event.key === 'ArrowUp' || event.key === 'Home') destination = 0;
        if (event.key === 'ArrowDown' || event.key === 'End') destination = history.length;
        if (destination !== undefined) { event.preventDefault(); jump(destination); }
        if (event.key.toLowerCase() === 'f') { event.preventDefault(); setFlipped(!flipped); }
        if (event.code === 'Space' && !(event.target instanceof HTMLElement && event.target.closest('button'))) { event.preventDefault(); if (best?.moves[0]) playLine([best.moves[0]]); }
      }
      window.addEventListener('keydown', navigate);
      return /** Removes the previous shortcut closure as the active position changes. */ () => window.removeEventListener('keydown', navigate);
    }, [session, popup, cursor, history.length, best, flipped],
  );

  /** Replaces just the active game while preserving the saved collection. */
  function updateGame(next: SavedGame): void {
    setSession({ ...session, games: session.games.map(
      /** Keeps unrelated saved games unchanged. */
      (entry) => entry.id === next.id ? next : entry,
    ) });
  }
  /** Jumps directly to an existing move without altering its continuation. */
  function jump(index: number): void { updateGame({ ...gameRecord, cursor: index }); }
  /** Plays a complete legal variation prefix and preserves any displaced continuation. */
  function playLine(moves: string[]): void {
    try { updateGame(applySequence(gameRecord, cursor, moves)); setNotice(''); }
    catch { setNotice('This continuation is not legal in the current position.'); }
  }
  /** Converts board interactions into the same branching path used by engine playback. */
  function makeMove(from: string, to: string, promotion?: string): boolean {
    if (terminal) return false;
    try { const position = replay(gameRecord, cursor); const move = position.move({ from, to, promotion }); updateGame(applySequence(gameRecord, cursor, [move.san])); return true; }
    catch { return false; }
  }
  /** Adds a game without losing the current saved position. */
  function addGame(next: SavedGame): void { setSession({ games: [next, ...session.games], activeId: next.id }); setTab('analysis'); setShowBranches(false); }
  /** Starts a standard game using the original New Game control. */
  function createGame(): void { addGame(newGame()); }
  /** Opens a saved game at its most recently selected move. */
  function openGame(id: string): void { setSession({ ...session, activeId: id }); setTab('analysis'); setShowBranches(false); }
  /** Deletes an inactive saved game while protecting the visible board. */
  function deleteGame(id: string): void {
    if (id === session.activeId) return;
    setSession({ ...session, games: session.games.filter(
      /** Removes only the explicitly selected game. */
      (entry) => entry.id !== id,
    ) });
  }
  /** Shows the original analysis panel. */
  function showAnalysis(): void { setTab('analysis'); }
  /** Shows the original saved-game list. */
  function showGames(): void { setTab('games'); }
  /** Opens the popup for importing a FEN position or PGN game. */
  function openImport(): void { setInput(''); setImportError(''); setPopup('import'); }
  /** Opens the local engine's depth and variation settings. */
  function openSettings(): void { setPopup('settings'); }
  /** Dismisses the current popup and restores its trigger focus. */
  function closePopup(): void { setPopup(null); }
  /** Changes the import text without parsing incomplete input. */
  function changeInput(event: React.ChangeEvent<HTMLTextAreaElement>): void { setInput(event.target.value); }
  /** Applies valid imported positions atomically and leaves invalid input editable. */
  function submitImport(event: React.FormEvent): void {
    event.preventDefault();
    try { addGame(importGame(input)); closePopup(); }
    catch { setImportError('Could not read this position. Check your FEN or PGN.'); }
  }
  /** Updates supported local-only limits from the settings popup. */
  function changeSetting(event: React.ChangeEvent<HTMLSelectElement>): void { setSettings({ ...settings, [event.target.name]: Number(event.target.value) }); }
  /** Flips both the main board and all preview boards. */
  function flipBoard(): void { setFlipped(!flipped); }
  /** Navigates to the initial position. */
  function firstMove(): void { jump(0); }
  /** Navigates to the preceding half-move. */
  function previousMove(): void { jump(Math.max(0, cursor - 1)); }
  /** Navigates to the following half-move. */
  function nextMove(): void { jump(Math.min(history.length, cursor + 1)); }
  /** Navigates to the final half-move. */
  function lastMove(): void { jump(history.length); }
  /** Plays the engine's first move using the active position only. */
  function playBest(): void { if (best?.moves[0]) playLine([best.moves[0]]); }
  /** Pauses or resumes all foreground and background engine work. */
  function toggleAnalysis(): void { setPaused(!paused); }
  /** Restarts a failed local engine search. */
  function retryAnalysis(): void { setRetry(retry + 1); }
  /** Toggles the saved alternative continuation list. */
  function toggleBranches(): void { setShowBranches(!showBranches); }
  /** Copies the current FEN, retaining a selectable field as a fallback. */
  async function copyFen(): Promise<void> {
    try { await navigator.clipboard.writeText(fen); setNotice('FEN copied.'); }
    catch { setNotice('Select the FEN field to copy this position.'); }
  }
  /** Exports the current main line as a portable PGN file. */
  function exportPgn(): void {
    const exported = replay(gameRecord); exported.setHeader('Event', gameRecord.title || 'Chess game');
    const url = URL.createObjectURL(new Blob([exported.pgn()], { type: 'application/x-chess-pgn' }));
    const link = document.createElement('a'); link.href = url; link.download = 'chess-game.pgn'; link.click();
    setTimeout(
      /** Releases the download URL once the browser has consumed it. */
      () => URL.revokeObjectURL(url), 1000,
    );
  }
  /** Dismisses a transient clipboard or persistence message. */
  function clearNotice(): void { setNotice(''); }
  /** Renders the original move-quality labels when both positions are evaluated. */
  function annotation(move: Move): React.ReactNode {
    const before = analysis.evaluation(move.before); const after = analysis.evaluation(move.after);
    if (!before || !after || before.mate !== null || after.mate !== null) return null;
    const difference = (after.score - before.score) * (move.color === 'w' ? 1 : -1);
    const value = difference >= 1 ? ['!!', 'Perfect', '#26c281'] : difference >= .3 ? ['!', 'Good', '#81b64c'] : difference >= -.5 ? ['!?', 'Interesting', '#5bc0de'] : difference >= -1 ? ['?!', 'Dubious', '#f7c045'] : difference >= -2 ? ['?', 'Mistake', '#e6912c'] : ['??', 'Blunder', '#d9534f'];
    return <span className="move-annotation" title={value[1]} style={{ color: value[2] }}>{value[0]}</span>;
  }
  /** Renders a historical move with the same hover and direct-click behavior as engine moves. */
  function renderMove(entry?: { move: Move; index: number }): React.ReactNode {
    if (!entry) return <span className="move-placeholder" />;
    return <MoveButton fen={entry.move.after} flipped={flipped} lastMove={entry.move} active={cursor === entry.index} className={`move-item ${cursor === entry.index ? 'active' : ''}`} onChoose={
      /** Navigates immediately to this historical move. */
      () => jump(entry.index)
    }>{entry.move.san}{annotation(entry.move)}</MoveButton>;
  }

  return <main className="app-container">
    <section className="board-layout-main" aria-label="Chess board">
      <div className="board-container"><div className="board-row">
        <EvaluationBar line={evaluation} result={result} flipped={flipped} />
        <Board key={`${gameRecord.id}-${fen}`} fen={fen} flipped={flipped} bestMove={best?.moves[0]} lastMove={history[cursor - 1]} result={terminal ? positionStatus(game) : undefined} onMove={makeMove} />
      </div></div>
    </section>
    <aside className="sidebar">
      <div className="panel-header" role="tablist" aria-label="Game panels"><button className={`panel-tab ${tab === 'analysis' ? 'active' : ''}`} role="tab" aria-selected={tab === 'analysis'} onClick={showAnalysis}><Compass size={20} />Analysis</button><button className={`panel-tab ${tab === 'games' ? 'active' : ''}`} role="tab" aria-selected={tab === 'games'} onClick={showGames}><History size={20} />Games</button></div>
      {tab === 'analysis' ? <div className="panel-content">
        <EnginePanel fen={fen} flipped={flipped} lines={analysis.lines} busy={analysis.busy} error={analysis.error} paused={paused} terminal={terminal} onToggle={toggleAnalysis} onRetry={retryAnalysis} onSettings={openSettings} onPlay={playLine} />
        <div className="move-list-header"><span>Moves</span><span className="position-status">{positionStatus(game)}</span>{!!gameRecord.branches?.length && <button className="variation-indicator" onClick={toggleBranches} aria-expanded={showBranches}>Variations ({gameRecord.branches.length})</button>}</div>
        <div className="move-history" ref={historyElement}>
          {!history.length && <div className="empty-history">No moves yet.</div>}
          {[...moveRows].map(
            /** Preserves the original numbered White/Black move rows, including custom starting turns. */
            ([number, row]) => <div className="move-row" key={number}><span className="move-num">{number}.</span>{renderMove(row.white)}{renderMove(row.black)}</div>,
          )}
          {showBranches && <div className="branch-list">{gameRecord.branches?.map(
            /** Exposes preserved alternatives without deleting the current main line. */
            (branch, index) => <MoveButton key={index} fen={replay({ ...gameRecord, moves: branch }).fen()} flipped={flipped} className="branch-button" label={`Switch to variation ${index + 1}`} onChoose={
              /** Promotes this alternative and preserves the displaced main line. */
              () => updateGame(switchBranch(gameRecord, index))
            }>Variation {index + 1}: {branch.join(' ')}</MoveButton>,
          )}</div>}
        </div>
        <div className="fen-input-container"><span>FEN:</span><input aria-label="Current FEN" value={fen} readOnly /><button className="icon-button" aria-label="Import FEN / PGN" title="Import FEN / PGN" onClick={openImport}><Upload size={17} /></button><button className="icon-button" aria-label="Copy FEN" onClick={copyFen}><Copy size={16} /></button></div>
        <div className="nav-buttons"><button className="nav-btn" aria-label="First move" disabled={!cursor} onClick={firstMove}><ChevronsLeft size={22} /></button><button className="nav-btn" aria-label="Previous move" disabled={!cursor} onClick={previousMove}><ChevronLeft size={22} /></button><button className="nav-btn" aria-label="Next move" disabled={cursor === history.length} onClick={nextMove}><ChevronRight size={22} /></button><button className="nav-btn" aria-label="Last move" disabled={cursor === history.length} onClick={lastMove}><ChevronsRight size={22} /></button></div>
        <div className="action-buttons"><button className="action-btn" onClick={createGame}><Plus size={16} />New Game</button><button className="action-btn" aria-label="Flip board" onClick={flipBoard}><ArrowLeftRight size={16} />Flip</button><button className="icon-button" aria-label="Play best" title="Play best move (Space)" disabled={!best?.moves[0] || terminal} onClick={playBest}><Play size={16} /></button><button className="icon-button" aria-label="Export PGN" onClick={exportPgn}><Download size={17} /></button></div>
      </div> : <div className="saved-games-list">{session.games.map(
        /** Lists automatically saved games with position previews and inactive-game deletion. */
        (entry, index) => <div className={`game-item ${entry.id === session.activeId ? 'active' : ''}`} key={entry.id}>
          <MoveButton fen={replay(entry, entry.cursor).fen()} flipped={flipped} className="game-link" label={`Open game ${index + 1}`} onChoose={
            /** Restores this game's saved board and cursor. */
            () => openGame(entry.id)
          }><span className="game-info"><small>{entry.moves.length} moves{entry.branches?.length ? ` · ${entry.branches.length} variations` : ''}{entry.id === session.activeId ? ' · Active' : ''}</small><span className="game-fen">{replay(entry, entry.cursor).fen()}</span></span></MoveButton>
          {entry.id !== session.activeId && <button className="icon-button delete-game-button" aria-label={`Delete game ${index + 1}`} onClick={
            /** Deletes this inactive game without opening it. */
            () => deleteGame(entry.id)
          }><Trash2 size={17} /></button>}
        </div>,
      )}<button className="action-btn" onClick={createGame}><Plus size={16} />New Game</button></div>}
    </aside>
    {popup === 'import' && <Modal title="Import FEN / PGN" onClose={closePopup}><form onSubmit={submitImport}><label htmlFor="import-text">FEN or PGN</label><textarea id="import-text" rows={5} value={input} onChange={changeInput} autoFocus placeholder="Paste a position or game…" />{importError && <p className="error" role="alert">{importError}</p>}<button className="primary-button" type="submit">Load game</button></form></Modal>}
    {popup === 'settings' && <Modal title="Engine settings" onClose={closePopup}><div className="settings-form"><label>Depth<select name="depth" aria-label="Search depth" value={settings.depth} onChange={changeSetting}>{[8, 12, 16, 18, 20, 24, 30].map(
      /** Renders local depth limits without adding a thinking-time limit. */
      (depth) => <option key={depth} value={depth}>{depth}</option>,
    )}</select></label><label>Lines<select name="lines" aria-label="Variation count" value={settings.lines} onChange={changeSetting}>{[1, 2, 3, 4, 5].map(
      /** Renders the number of locally analyzed principal variations. */
      (lines) => <option key={lines} value={lines}>{lines}</option>,
    )}</select></label></div><button className="primary-button" onClick={closePopup}>Done</button><p className="engine-license">Stockfish 18 · <a href={`${import.meta.env.BASE_URL}engine/Copying.txt`} target="_blank" rel="noreferrer">GPL-3.0</a> · <a href="https://github.com/nmrugg/stockfish.js" target="_blank" rel="noreferrer">Source</a></p></Modal>}
    {notice && <div className="notice" role="status">{notice}<button onClick={clearNotice} aria-label="Dismiss notification">×</button></div>}
  </main>;
}
