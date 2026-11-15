import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, onTestFinished } from 'vitest';
import { normalizeEslintResults } from '../normalize.mts';
import type { EslintFinding } from '../typed/engine.mts';

export function makeTemporaryRoot(prefix: string): string {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  onTestFinished(() => {
    rmSync(root, { recursive: true, force: true });
  });
  return root;
}

export function positionOf(code: string, offset: number): { line: number; column: number } {
  const before = code.slice(0, offset).split('\n');
  return { line: before.length, column: (before.at(-1)?.length ?? 0) + 1 };
}

export function findingFor({
  code,
  reported,
  ruleId = 'functional/prefer-immutable-types',
  messageId,
  message = 'Reported text.',
}: {
  readonly code: string;
  readonly reported: string | readonly string[];
  readonly ruleId?: string;
  readonly messageId?: string | undefined;
  readonly message?: string;
}): EslintFinding[] {
  const root = makeTemporaryRoot('nitpicker-eslint-fingerprint-');
  mkdirSync(path.join(root, 'src'), { recursive: true });
  writeFileSync(path.join(root, 'src/legacy.ts'), code);
  const reportedTexts = [reported].flat();
  const messages = reportedTexts.map((text, index) => {
    const start = code.indexOf(
      text,
      index === 0 ? 0 : code.indexOf(reportedTexts[index - 1] ?? '') + 1,
    );
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
