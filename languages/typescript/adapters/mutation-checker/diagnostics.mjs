import { ts } from '../../typescript-api/typescript-api.mjs';
import path from 'node:path';
import { enclosingSymbol } from '../typecheck/typescript-program.mjs';

function keyOf(diagnostic) {
  const file = diagnostic.file;
  const symbol =
    file === undefined || diagnostic.start === undefined
      ? undefined
      : enclosingSymbol(ts, file, diagnostic.start);
  return JSON.stringify([
    diagnostic.code,
    file === undefined ? undefined : path.resolve(file.fileName),
    symbol,
    ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  ]);
}

export function diagnosticCounts(diagnostics) {
  const counts = new Map();
  for (const diagnostic of diagnostics) {
    const key = keyOf(diagnostic);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function addedDiagnostics(diagnostics, baseline) {
  const remaining = new Map(baseline);
  return diagnostics.filter((diagnostic) => {
    const key = keyOf(diagnostic);
    const count = remaining.get(key) ?? 0;
    remaining.set(key, Math.max(0, count - 1));
    return count === 0;
  });
}
