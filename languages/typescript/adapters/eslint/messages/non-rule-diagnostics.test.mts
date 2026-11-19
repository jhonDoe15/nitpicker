import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { normalizeEslintResults } from '../normalize.mts';

const ENABLE = 'Unused eslint-enable directive (no matching eslint-disable directives were found).';
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function normalized(messages: readonly object[]) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-non-rule-'));
  roots.push(root);
  mkdirSync(path.join(root, 'src'), { recursive: true });
  writeFileSync(path.join(root, 'src/a.ts'), '/* eslint-enable */\nexport const a = 1;\n');
  const findings = normalizeEslintResults({
    value: [{ filePath: path.join(root, 'src/a.ts'), messages }],
    projectRoot: root,
    analyzerName: 'eslint-errors',
  });
  return findings.map(({ rule, message }) => ({ rule, message }));
}

describe('ESLint messages without a rule id', () => {
  it('reports a stray eslint-enable comment as an unused enable directive', () => {
    expect(
      normalized([{ ruleId: null, message: ENABLE, line: 1, column: 1, severity: 2 }]),
    ).toEqual([{ rule: 'eslint/unused-enable-directive', message: ENABLE }]);
  });

  it('keeps an unknown message as a finding instead of failing the analyzer', () => {
    const unknown = { ruleId: null, message: 'Something new.', line: 1, column: 1, severity: 2 };
    const rule = {
      ruleId: 'no-debugger',
      message: 'Unexpected debugger.',
      line: 2,
      column: 1,
      severity: 2,
    };

    expect(normalized([unknown, rule]).map(({ rule: id }) => id)).toEqual([
      'eslint/unattributed-message',
      'no-debugger',
    ]);
  });
});
