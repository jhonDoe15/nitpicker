import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect } from 'vitest';
import { compareFindings } from '../../../../../core/diff/comparison/compare.mjs';
import { normalizeEslintResults } from '../normalize.mjs';

export const temporaryRoots = [];

export function removeTemporaryRoots() {
  for (const root of temporaryRoots) {
    rmSync(root, { recursive: true, force: true });
  }
}

export function positionOf(code, offset) {
  const before = code.slice(0, offset).split('\n');
  return { line: before.length, column: (before.at(-1)?.length ?? 0) + 1 };
}

// Normalizes ESLint messages that point at `reported` (a substring of `code`, or a list of them,
// one message each), the way ESLint reports them: a 1-based start and end.
export function findingFor({
  code,
  reported,
  ruleId = 'functional/prefer-immutable-types',
  messageId,
  message = 'Reported text.',
}) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-eslint-fingerprint-'));
  temporaryRoots.push(root);
  mkdirSync(path.join(root, 'src'), { recursive: true });
  writeFileSync(path.join(root, 'src/legacy.ts'), code);
  const reportedTexts = [reported].flat();
  const messages = reportedTexts.map((text, index) => {
    const start = code.indexOf(text, index === 0 ? 0 : code.indexOf(reportedTexts[index - 1]) + 1);
    const first = positionOf(code, start);
    const last = positionOf(code, start + text.length);
    return {
      ruleId,
      messageId,
      message,
      severity: 2,
      line: first.line,
      column: first.column,
      endLine: last.line,
      endColumn: last.column,
    };
  });
  const findings = normalizeEslintResults({
    value: [{ filePath: path.join(root, 'src/legacy.ts'), messages }],
    projectRoot: root,
    analyzerName: 'eslint-strict',
  });
  expect(findings).toHaveLength(reportedTexts.length);
  return findings;
}

export function compare(base, head) {
  return compareFindings({ baseFindings: base, headFindings: head });
}
