import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterAll, describe, expect, it } from 'vitest';
import { compareFindings } from '../../../../core/diff/comparison/compare.mjs';
import { nitpickerRules } from '../../preset/eslint-plugin/index.mjs';
import { normalizeEslintResults } from './normalize.mjs';

const RULE = 'nitpicker/no-unused-dom-environment';
const directive = ['@vitest', 'environment'].join('-');
const logic = "it('adds', () => { expect(1 + 1).toBe(2); });\n";
const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-dom-fingerprint-')));
const linter = new Linter({ cwd: root });
const config = [
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    plugins: { nitpicker: nitpickerRules },
    rules: { [RULE]: ['error', { environment: 'jsdom' }] },
  },
];

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function findingFor(name, code) {
  const filePath = path.join(root, 'src', name);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, code);
  const messages = linter.verify(code, config, { filename: filePath });
  return normalizeEslintResults({
    value: [{ filePath, messages }],
    projectRoot: root,
    analyzerName: 'eslint-lint',
  }).map((finding) => ({ ...finding, path: 'src/subject.test.ts' }));
}

describe('a no-unused-dom-environment finding under the ESLint engine', () => {
  it.each([
    ['an import above', `import { sum } from './sum';\n${logic}`],
    ['a comment above', `// subject\n\n${logic}`],
    ['a changed first line', logic.replace('adds', 'sums')],
  ])('stays unchanged when the project-level finding gains %s', (_name, head) => {
    const base = findingFor('base.test.ts', logic);
    const result = compareFindings({
      baseFindings: base,
      headFindings: findingFor('head.test.ts', head),
    });
    expect(base).toHaveLength(1);
    expect(result.newFindings).toEqual([]);
    expect(result.unchangedFindings).toHaveLength(1);
  });

  it('stays unchanged when a directive finding gains an import above it', () => {
    const declared = `/** ${directive} jsdom */\n${logic}`;
    const result = compareFindings({
      baseFindings: findingFor('declared.test.ts', declared),
      headFindings: findingFor(
        'declared-head.test.ts',
        `import { sum } from './sum';\n${declared}`,
      ),
    });
    expect(result.newFindings).toEqual([]);
    expect(result.unchangedFindings).toHaveLength(1);
  });
});
