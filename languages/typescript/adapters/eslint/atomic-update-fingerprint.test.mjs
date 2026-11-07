import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareFindings } from '../../../../core/diff/comparison/compare.mjs';
import { normalizeEslintResults } from './normalize.mjs';

const REPORTED = 'state.total += await load()';
const CODE = 'export async function update(state, load) { state.total += await load(); }';

function atomicFinding(source) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-eslint-atomic-'));
  try {
    mkdirSync(path.join(root, 'src'), { recursive: true });
    writeFileSync(path.join(root, 'src/legacy.ts'), source);
    const lines = source.slice(0, source.indexOf(REPORTED)).split('\n');
    const column = (lines.at(-1)?.length ?? 0) + 1;
    const message = {
      ruleId: 'nitpicker/require-atomic-updates',
      messageId: 'nonAtomicObjectUpdate',
      message: 'Reported text.',
      severity: 2,
      line: lines.length,
      column,
      endLine: lines.length,
      endColumn: column + REPORTED.length,
    };
    return normalizeEslintResults({
      value: [{ filePath: path.join(root, 'src/legacy.ts'), messages: [message] }],
      projectRoot: root,
      analyzerName: 'eslint-strict',
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('atomic-update differential identity', () => {
  it('keeps a stale update baselined across inserted lines', () => {
    const result = compareFindings({
      baseFindings: atomicFinding(CODE),
      headFindings: atomicFinding(`export const unrelated = 1;\n${CODE}`),
    });

    expect(result.newFindings).toEqual([]);
    expect(result.resolvedFindings).toEqual([]);
    expect(result.unchangedFindings).toHaveLength(1);
  });
});
