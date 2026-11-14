import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixWorkingTree } from '../../../../core/fix/run-fix.mts';
import type { FixOptions } from '../../../../core/fix/run-fix.mts';
import { fixOptions, topicRepository, useGitFixtures } from '../test-support/fix-test-support.mts';

const { createGitRepository } = useGitFixtures();
const TESTS = "import { it } from 'vitest';\nit('works', () => {});\n";

function topic(
  committed: Readonly<Record<string, string>>,
  changed: Readonly<Record<string, string>>,
) {
  return topicRepository(createGitRepository, committed, changed);
}

function fix(
  repository: { readonly root: string },
  selectedRules: readonly string[],
  extra: Partial<FixOptions> = {},
) {
  return fixWorkingTree(
    fixOptions(repository.root, {
      selectedRules,
      ...extra,
      executeFixCommand: () => ({ status: 0, stdout: '[]', stderr: '' }),
    }),
  );
}

describe('project recipes in fixWorkingTree', () => {
  it('rename a changed test file and rewrite its importer when their rule is selected', () => {
    const repository = topic(
      { 'package.json': '{"type":"module"}', 'test/unit/other.test.ts': TESTS },
      {
        'test/unit/checks.ts': TESTS,
        'test/unit/other.test.ts': "import './checks.js';\n" + TESTS,
      },
    );
    const result = fix(repository, ['eslint/nitpicker/no-uncollected-tests']);
    const file = (name: string) => path.join(repository.root, name);
    expect(existsSync(file('test/unit/checks.ts'))).toBe(false);
    expect(readFileSync(file('test/unit/checks.test.ts'), 'utf8')).toBe(TESTS);
    expect(readFileSync(file('test/unit/other.test.ts'), 'utf8')).toBe(
      `import './checks.test.js';\n${TESTS}`,
    );
    expect(result.fixedFindings).toEqual([
      'test/unit/checks.ts:2 eslint/nitpicker/no-uncollected-tests (typescript-no-uncollected-tests)',
    ]);
  });

  it('do not run without their rule', () => {
    const repository = topic(
      { 'package.json': '{"type":"module"}' },
      { 'test/unit/checks.ts': TESTS },
    );
    fix(repository, []);
    expect(existsSync(path.join(repository.root, 'test/unit/checks.ts'))).toBe(true);
  });

  it('rename a file the branch did not change when the run covers every project file', () => {
    const repository = topic(
      { 'package.json': '{"type":"module"}', 'test/unit/checks.ts': TESTS },
      { 'README.md': 'x\n' },
    );
    const result = fix(repository, ['eslint/nitpicker/no-uncollected-tests'], { allFiles: true });
    const file = (name: string) => path.join(repository.root, name);
    expect([
      existsSync(file('test/unit/checks.ts')),
      existsSync(file('test/unit/checks.test.ts')),
    ]).toEqual([false, true]);
    expect(result.fixedFindings).toEqual([
      'test/unit/checks.ts:2 eslint/nitpicker/no-uncollected-tests (typescript-no-uncollected-tests)',
    ]);
  });

  it('roll back a recipe that adds a type error, and restore the old file and its importer', () => {
    const importer = "import './checks.js';\n" + TESTS;
    const repository = topic(
      { 'package.json': '{"type":"module"}', 'test/unit/other.test.ts': TESTS },
      { 'test/unit/checks.ts': TESTS, 'test/unit/other.test.ts': importer },
    );
    const result = fix(repository, ['eslint/nitpicker/no-uncollected-tests'], {
      analyzeFixes: () => ({
        findings: existsSync(path.join(repository.root, 'test/unit/checks.test.ts'))
          ? [
              {
                tool: 'typescript-typecheck',
                rule: 'TS2307',
                path: 'test/unit/other.test.ts',
                classification: 'enforceable',
              },
            ]
          : [],
      }),
    });
    const file = (name: string) => path.join(repository.root, name);
    expect({
      checks: existsSync(file('test/unit/checks.ts')),
      renamed: existsSync(file('test/unit/checks.test.ts')),
      importer: readFileSync(file('test/unit/other.test.ts'), 'utf8'),
      fixedFiles: result.fixedFiles,
    }).toEqual({ checks: true, renamed: false, importer, fixedFiles: [] });
    expect(result.notes).toEqual([
      '--fix rolled back typescript-no-uncollected-tests (test/unit/other.test.ts, test/unit/checks.ts, test/unit/checks.test.ts): breaks the compile or type check: new typescript-typecheck/TS2307 in test/unit/other.test.ts',
    ]);
  });
});
