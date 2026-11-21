import type { LintResult } from '../plan/oxlint-shapes.mts';

export function mergeResults(results: readonly LintResult[]): LintResult[] {
  const byFile = new Map<string, LintResult['messages'][number][]>();
  for (const result of results) {
    byFile.set(result.filePath, [...(byFile.get(result.filePath) ?? []), ...result.messages]);
  }
  return [...byFile]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([filePath, messages]) => ({ filePath, messages: messages.sort(byPosition) }));
}

function byPosition(
  left: LintResult['messages'][number],
  right: LintResult['messages'][number],
): number {
  return (
    left.line - right.line ||
    left.column - right.column ||
    String(left.ruleId).localeCompare(String(right.ruleId)) ||
    left.message.localeCompare(right.message)
  );
}
