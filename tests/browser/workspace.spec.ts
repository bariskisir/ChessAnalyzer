// Checks the original layout, local-only Stockfish, popup input, previews, and preserved game state.
import { test, expect, type Page } from '@playwright/test';

/** Imports a game through the FEN/PGN popup without interacting with the main board. */
async function importGame(page: Page, text: string): Promise<void> {
  await page.getByRole('button', { name: 'Import FEN / PGN', exact: true }).click();
  const popup = page.getByRole('dialog', { name: 'Import FEN / PGN' });
  await popup.getByLabel('FEN or PGN', { exact: true }).fill(text);
  await popup.getByRole('button', { name: 'Load game' }).click();
  await expect(popup).toHaveCount(0);
}

/** Sets a short depth for deterministic real-WASM browser checks without using a time limit. */
async function configureEngine(page: Page, lines = 1): Promise<void> {
  await page.getByRole('button', { name: 'Engine settings', exact: true }).click();
  const popup = page.getByRole('dialog', { name: 'Engine settings' });
  await popup.getByLabel('Search depth').selectOption('8');
  await popup.getByLabel('Variation count').selectOption(String(lines));
  await popup.getByRole('button', { name: 'Done' }).click();
}

test('original layout, pieces, colors, local search, and mobile moves remain available',
  /** Exercises the actual npm WASM worker and captures both responsive layouts. */
  async ({ page }, testInfo) => {
    const errors: string[] = [];
    const remote: string[] = [];
    page.on('pageerror',
      /** Collects unexpected application exceptions. */
      (error) => errors.push(error.message),
    );
    page.on('request',
      /** Verifies that no remote chess provider is contacted. */
      (request) => { if (/chess-api\.com|chess\.com/.test(request.url())) remote.push(request.url()); },
    );
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Analysis', exact: true })).toBeVisible();
    await expect(page.locator('#analysis-board-square-b8')).toHaveCSS('background-color', 'rgb(119, 153, 84)');
    await expect(page.locator('#analysis-board-square-a8')).toHaveCSS('background-color', 'rgb(233, 237, 204)');
    await expect(page.locator('#analysis-board-square-b8 img')).toHaveAttribute('src', '/pieces/bn.png');
    await expect(page.getByLabel('Search depth')).toHaveCount(0);
    await expect(page.getByLabel('Analysis engine')).toHaveCount(0);
    await configureEngine(page, 3);
    await expect(page.locator('.analysis-status')).toContainText('Analysis complete');
    await expect(page.locator('.engine-line')).toHaveCount(3);
    await page.screenshot({ path: testInfo.outputPath('original-layout.png'), fullPage: true });
    const board = await page.locator('.board-layout-main').boundingBox();
    const sidebar = await page.locator('.sidebar').boundingBox();
    if (testInfo.project.name === 'desktop') expect(board!.x + board!.width).toBeLessThanOrEqual(sidebar!.x + 1);
    else expect(board!.y + board!.height).toBeLessThanOrEqual(sidebar!.y + 1);
    await page.locator('#analysis-board-square-e2').click();
    await page.locator('#analysis-board-square-e4').click();
    await expect(page.getByLabel('Current FEN')).toHaveValue(/4P3.* b KQkq/);
    await page.reload();
    await expect(page.getByLabel('Current FEN')).toHaveValue(/4P3.* b KQkq/);
    expect(await page.evaluate(
      /** Detects horizontal overflow at desktop and phone widths. */
      () => document.documentElement.scrollWidth > innerWidth,
    )).toBe(false);
    expect(errors).toEqual([]); expect(remote).toEqual([]);
  },
);

test('popups validate import, settings persist, and local searches have no movetime',
  /** Observes real UCI commands and verifies native popup keyboard behavior. */
  async ({ page }) => {
    await page.addInitScript(
      /** Records outgoing UCI commands without replacing the actual worker. */
      () => {
        const commands: string[] = [];
        Object.assign(window, { testCommands: commands });
        const original = Worker.prototype.postMessage;
        Object.defineProperty(Worker.prototype, 'postMessage', { value:
          /** Records a command before forwarding it unchanged to Stockfish. */
          function (this: Worker, message: unknown, ...args: unknown[]) { commands.push(String(message)); return Reflect.apply(original, this, [message, ...args]); },
        });
      },
    );
    await page.goto('/');
    await configureEngine(page, 2);
    await expect(page.locator('.analysis-status')).toContainText('Analysis complete');
    const commands = await page.evaluate(
      /** Reads the worker command log captured by the browser fixture. */
      () => (window as unknown as { testCommands: string[] }).testCommands,
    );
    expect(commands).toContain('go depth 8');
    expect(commands.join(' ')).not.toContain('movetime');
    await page.getByRole('button', { name: 'Import FEN / PGN', exact: true }).click();
    const popup = page.getByRole('dialog');
    await popup.getByLabel('FEN or PGN').fill('invalid position');
    await popup.getByRole('button', { name: 'Load game' }).click();
    await expect(popup.getByRole('alert')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(popup).toHaveCount(0);
    await page.reload();
    await page.getByRole('button', { name: 'Engine settings', exact: true }).click();
    await expect(page.getByLabel('Search depth')).toHaveValue('8');
    await expect(page.getByLabel('Variation count')).toHaveValue('2');
    await expect(page.getByLabel('Thinking time')).toHaveCount(0);
  },
);

test('hover previews do not move the board and clicking jumps directly to the previewed position',
  /** Checks exact FEN agreement for engine moves and historical moves. */
  async ({ page }) => {
    await page.goto('/');
    await configureEngine(page);
    await expect(page.locator('.analysis-status')).toContainText('Analysis complete');
    const original = await page.getByLabel('Current FEN').inputValue();
    const engineMove = page.locator('.engine-move').nth(2);
    await engineMove.hover();
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip.locator('img').first()).toHaveAttribute('src', /\/pieces\//);
    const target = await tooltip.getAttribute('data-fen');
    await expect(page.getByLabel('Current FEN')).toHaveValue(original);
    await engineMove.click();
    await expect(page.getByLabel('Current FEN')).toHaveValue(target!);
    await expect(tooltip).toHaveCount(0);
    await page.getByRole('button', { name: 'Pause analysis' }).click();
    const historyMove = page.locator('.move-item').first();
    await historyMove.hover();
    await expect(tooltip).toBeVisible();
    const previous = await tooltip.getAttribute('data-fen');
    await historyMove.click();
    await expect(page.getByLabel('Current FEN')).toHaveValue(previous!);
    await expect(tooltip).toHaveCount(0);
  },
);

test('evaluation holds its last value across an uncached move until the next result arrives',
  /** Uses real analysis followed by a paused unseen move to catch transient neutral resets. */
  async ({ page }) => {
    await page.goto('/');
    await configureEngine(page);
    await expect(page.locator('.analysis-status')).toContainText('Analysis complete');
    const score = await page.locator('.eval-track').getAttribute('data-evaluation');
    const fill = await page.locator('.eval-white').getAttribute('style');
    await page.getByRole('button', { name: 'Pause analysis' }).click();
    await page.locator('#analysis-board-square-e2').click();
    await page.locator('#analysis-board-square-e4').click();
    await expect(page.locator('.eval-track')).toHaveAttribute('data-evaluation', score!);
    await expect(page.locator('.eval-white')).toHaveAttribute('style', fill!);
    await page.getByRole('button', { name: 'Resume analysis' }).click();
    await expect(page.locator('.analysis-status')).toContainText('Analysis complete');
    await expect(page.locator('.eval-track')).not.toHaveAttribute('data-evaluation', '—');
    await page.getByRole('button', { name: 'Previous move', exact: true }).click();
    await expect(page.locator('.eval-track')).toHaveAttribute('data-evaluation', score!);
  },
);

test('games auto-save alternatives, restore cursors, and support shortcuts and deletion',
  /** Exercises the original game and branch workflows without requiring manual saves. */
  async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Pause analysis' }).click();
    await importGame(page, '1. e4 e5 2. Nf3 Nc6');
    await page.getByRole('button', { name: 'First move', exact: true }).click();
    await page.locator('#analysis-board-square-d2').click();
    await page.locator('#analysis-board-square-d4').click();
    await expect(page.getByRole('button', { name: 'Variations (1)', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Current FEN')).toHaveValue(/3P4.* b KQkq/);
    await page.getByRole('button', { name: 'Variations (1)', exact: true }).click();
    await page.getByRole('button', { name: 'Switch to variation 1' }).click();
    await expect(page.getByLabel('Current FEN')).toHaveValue(/4P3.* b KQkq/);
    await expect(page.locator('.move-item')).toHaveCount(4);
    await page.keyboard.press('ArrowDown');
    await expect(page.getByLabel('Current FEN')).toHaveValue(/ w KQkq - 2 3$/);
    await page.getByRole('tab', { name: 'Games', exact: true }).click();
    await expect(page.getByLabel('Game name')).toHaveCount(0);
    await expect(page.locator('.game-info strong')).toHaveCount(0);
    await page.getByRole('tab', { name: 'Analysis', exact: true }).click();
    await page.getByRole('button', { name: 'New Game', exact: true }).click();
    await page.getByRole('tab', { name: 'Games', exact: true }).click();
    const count = await page.locator('.game-item').count();
    await page.getByRole('button', { name: 'Delete game 2', exact: true }).click();
    await expect(page.locator('.game-item')).toHaveCount(count - 1);
  },
);

test('special moves, terminal positions, and PGN exports remain functional',
  /** Verifies underpromotion and game-over behavior in the restored board layout. */
  async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Pause analysis' }).click();
    await importGame(page, '7k/P7/8/8/8/8/8/7K w - - 0 1');
    await page.locator('#analysis-board-square-a7').click();
    await page.locator('#analysis-board-square-a8').click();
    await page.getByRole('button', { name: 'Knight', exact: true }).click();
    await expect(page.getByLabel('Current FEN')).toHaveValue(/^N6k/);
    await expect(page.locator('.game-over-modal')).toContainText('insufficient material');
    await importGame(page, '1. f3 e5 2. g4 Qh4#');
    await expect(page.locator('.game-over-modal')).toContainText('Checkmate');
    await expect(page.getByRole('button', { name: 'Play best', exact: true })).toBeDisabled();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export PGN', exact: true }).click();
    expect((await download).suggestedFilename()).toBe('chess-game.pgn');
  },
);

test('Control gestures mark the board, right click clears it, and F and Space shortcuts work',
  /** Prevents annotation gestures from accidentally dragging pieces or making moves. */
  async ({ page }) => {
    await page.goto('/');
    await configureEngine(page);
    await expect(page.locator('.analysis-status')).toContainText('Analysis complete');
    const original = await page.getByLabel('Current FEN').inputValue();
    const from = await page.locator('#analysis-board-square-e2').boundingBox();
    const to = await page.locator('#analysis-board-square-e4').boundingBox();
    await page.keyboard.down('Control');
    await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
    await page.mouse.down();
    await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up('Control');
    await expect(page.locator('.board-surface path[marker-end]')).toHaveCount(1);
    await expect(page.getByLabel('Current FEN')).toHaveValue(original);
    await page.locator('#analysis-board-square-e4').click({ button: 'right' });
    await expect(page.locator('.board-surface path[marker-end]')).toHaveCount(0);
    await page.locator('#analysis-board-square-a3').click({ modifiers: ['Control'] });
    await expect(page.locator('#analysis-board-square-a3 > div')).toHaveCSS('background-color', 'rgba(255, 0, 0, 0.4)');
    await expect(page.getByLabel('Current FEN')).toHaveValue(original);
    await page.locator('#analysis-board-square-a3').click({ button: 'right' });
    await page.locator('body').click({ position: { x: 2, y: 2 } });
    await page.keyboard.press('f');
    const h1 = await page.locator('#analysis-board-square-h1').boundingBox();
    const a8 = await page.locator('#analysis-board-square-a8').boundingBox();
    expect(h1!.y).toBeLessThan(a8!.y);
    await page.keyboard.press('Space');
    await expect(page.locator('.move-item')).toHaveCount(1);
  },
);
