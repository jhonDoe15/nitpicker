import type TypeScript from 'typescript';
import path from 'node:path';
import { enclosingSymbol } from '../typecheck/typescript-program.mts';
import { typescriptApi } from '../typed/typescript-program.mts';

const ts = typescriptApi();

function keyOf(diagnostic: TypeScript.Diagnostic): string {
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

export function diagnosticCounts(
  diagnostics: readonly TypeScript.Diagnostic[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const diagnostic of diagnostics) {
    const key = keyOf(diagnostic);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function addedDiagnostics(
  diagnostics: readonly TypeScript.Diagnostic[],
  baseline: ReadonlyMap<string, number>,
): TypeScript.Diagnostic[] {
  const remaining = new Map(baseline);
  return diagnostics.filter((diagnostic) => {
    const key = keyOf(diagnostic);
    const count = remaining.get(key) ?? 0;
    remaining.set(key, Math.max(0, count - 1));
    return count === 0;
  });
}
