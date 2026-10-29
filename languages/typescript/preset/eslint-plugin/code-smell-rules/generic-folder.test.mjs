import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Linter } from 'eslint';
import { afterAll, describe, expect, it } from 'vitest';
import { compareFindings } from '../../../../../core/diff/comparison/compare.mjs';
import { exceptionSentence } from '../../../../../shared/messages/exception-sentence.mjs';
import { normalizeEslintResults } from '../../../adapters/eslint/normalize.mjs';
import { rule as genericNames } from '../rules/code-smells/generic-names.mjs';

const RULE = 'nitpicker/no-generic-names';
const SOURCE = 'export const total = 1;\n';
const roots = [];

afterAll(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-generic-folder-'));
  roots.push(root);
  for (const file of files) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), SOURCE);
  }
  return root;
}

function findingsOf(root, files) {
  const linter = new Linter({ cwd: root });
  const config = [
    {
      files: ['**/*.ts'],
      plugins: { nitpicker: { rules: { 'no-generic-names': genericNames } } },
      rules: { [RULE]: 'error' },
    },
  ];
  const value = files.map((file) => ({
    filePath: path.join(root, file),
    messages: linter.verify(SOURCE, config, { filename: path.join(root, file) }),
  }));
  return normalizeEslintResults({ value, projectRoot: root, analyzerName: 'eslint-lint' });
}

const BASE = ['src/main/utils/b.ts', 'src/main/utils/a.ts', 'src/main/utils/a.test.ts'];
const LINTED = BASE.slice(0, 2);

describe('no-generic-names on a generic folder', () => {
  it('reports the folder once, on its first source file in path order', () => {
    expect(
      findingsOf(project(BASE), LINTED).map(({ path: file, identity }) => `${file} ${identity}`),
    ).toEqual(['src/main/utils/a.ts folder:src/main/utils/|occurrence:1']);
  });

  it('keeps the finding when a new file sorts first and takes the anchor', () => {
    const added = 'src/main/utils/0.ts';
    const baseFindings = findingsOf(project(BASE), LINTED);
    const headFindings = findingsOf(project([...BASE, added]), [added, ...LINTED]);

    expect({
      anchor: headFindings.map(({ path: file }) => file),
      added: compareFindings({ baseFindings, headFindings }).newFindings,
    }).toEqual({ anchor: [added], added: [] });
  });

  it('ends the final message with the shared exception route exactly once', () => {
    const [finding] = findingsOf(project(BASE), ['src/main/utils/a.ts']);
    const route = exceptionSentence(
      `{"rule":"${RULE}","paths":["src/main/utils/a.ts"],"reason":"..."}`,
    );

    expect({
      endsWithRoute: finding.message.endsWith(route),
      routes: finding.message.split('to "exceptions" in nitpicker.config.json').length - 1,
    }).toEqual({ endsWithRoute: true, routes: 1 });
  });
});
