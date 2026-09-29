// Copies the pinned npm Stockfish browser engine and its license into public assets.
import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const packageRoot = dirname(require.resolve('stockfish/package.json'));
const destination = fileURLToPath(new URL('../public/engine/', import.meta.url));
await mkdir(destination, { recursive: true });
for (const file of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']) {
  await copyFile(join(packageRoot, 'bin', file), join(destination, file));
}
await copyFile(join(packageRoot, 'Copying.txt'), join(destination, 'Copying.txt'));
