// Enforces file headers and documented functions in all project-owned code.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const failures: string[] = [];

/** Lists source files while excluding dependencies and generated output. */
function listFiles(directory: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git', 'public', 'test-results', 'playwright-report'].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...listFiles(path));
    else if (/\.(tsx?|[cm]?js|scss)$/.test(entry.name)) result.push(path);
  }
  return result;
}

for (const file of listFiles('.')) {
  const text = readFileSync(file, 'utf8');
  if (!/^\s*\/[/*]/.test(text)) failures.push(`${file}: Missing file header comment.`);
  if (file.endsWith('.scss')) continue;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);

  /** Checks that each implemented function has a comment in its leading trivia. */
  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node) || ts.isGetAccessor(node) || ts.isSetAccessor(node)) {
      const prefix = text.slice(node.getFullStart(), node.getStart(source));
      if (!/\/\*[^]*?\*\/|\/\/[^\n]+/.test(prefix)) {
        const position = source.getLineAndCharacterOfPosition(node.getStart(source));
        failures.push(`${file}:${position.line + 1}: Missing function comment.`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else console.log('All source files and functions have header comments.');
