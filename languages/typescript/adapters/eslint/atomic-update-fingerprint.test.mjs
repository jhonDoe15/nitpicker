import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { compareFindings } from '../../../../core/diff/comparison/compare.mjs';
import { normalizeEslintResults } from './normalize.mts';

const temporaryRoots = [];
const REPORTED = 'state.total += await load()';
const CODE = `export async function update(state, load) { ${REPORTED}; }`;

afterAll(() => {
  for (const root of temporaryRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

function findingFor(code) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-atomic-fingerprint-'));
  temporaryRoots.push(root);
  mkdirSync(path.join(root, 'src'), { recursive: true });
  writeFileSync(path.join(root, 'src/legacy.ts'), code);
  const start = code.indexOf(REPORTED);
  const before = code.slice(0, start).split('\n');
  const through = code.slice(0, start + REPORTED.length).split('\n');
  const message = {
    ruleId: 'nitpicker/require-atomic-updates',
    messageId: 'nonAtomicObjectUpdate',
    message: 'Reported text.',
    severity: 2,
    line: before.length,
    column: (before.at(-1)?.length ?? 0) + 1,
    endLine: through.length,
    endColumn: (through.at(-1)?.length ?? 0) + 1,
  };
  return normalizeEslintResults({
    value: [{ filePath: path.join(root, 'src/legacy.ts'), messages: [message] }],
    projectRoot: root,
    analyzerName: 'eslint-strict',
  });
}

describe('atomic-update differential identity', () => {
  it('keeps a stale update baselined across inserted lines', () => {
    const result = compareFindings({
      baseFindings: findingFor(CODE),
      headFindings: findingFor(`export const unrelated = 1;\n${CODE}`),
    });
    expect(result.newFindings).toEqual([]);
    expect(result.resolvedFindings).toEqual([]);
    expect(result.unchangedFindings).toHaveLength(1);
  });
});
