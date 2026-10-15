import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createGitRepository,
  fixtureGit,
  removeGitRepositories,
} from '../../../../core/diff/fixtures/git-repository.mjs';
import { isSourceFile, isTestFile } from '../../preset/layout.mjs';
import { testedSourceModules } from './tested-modules.mjs';
import {
  baseMutationTargets,
  changedCodeMutants,
  hasWeakeningCandidates,
  mutationTargetsWithTestedModules,
  weakenedTestFindings,
} from './weakened-mutants.mjs';

const layout = { isSourceFile, isTestFile };
const CLASSIFY_TEST = [
  "import { expect, it } from 'vitest';",
  "import { classify } from '../src/classify.js';",
  "import { format } from '../src/format';",
  "import { helper } from './support/helper.js';",
  "import { z } from 'zod';",
  "it('classifies', () => { expect(classify(1)).toBe('low'); });",
  '',
].join('\n');

afterEach(removeGitRepositories);

function snapshots({ headChanges = {}, removed = [], baseFiles = {} }) {
  const { root } = createGitRepository({
    ...baseFiles,
    'src/classify.ts': "export const classify = (n: number) => (n < 5 ? 'low' : 'high');\n",
    'src/format/index.ts': 'export const format = String;\n',
    'src/unrelated.ts': 'export const unrelated = 1;\n',
    'test/classify.test.ts': CLASSIFY_TEST,
    'test/unrelated.test.ts': "import { unrelated } from '../src/unrelated.js';\n",
    'test/support/helper.ts': 'export const helper = 1;\n',
    'package.json': '{}\n',
  });
  const baselineRoot = path.join(root, '.base-worktree');
  fixtureGit(root, ['worktree', 'add', '-q', '--detach', '.base-worktree', 'HEAD']);
  for (const relativePath of removed) {
    rmSync(path.join(root, relativePath));
  }
  for (const [relativePath, contents] of Object.entries(headChanges)) {
    const filePath = path.join(root, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }
  fixtureGit(root, ['add', '-A', '--', ':!.base-worktree']);
  fixtureGit(root, ['-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', 'head']);
  return { snapshot: 'head', baselineRoot, projectRoot: root };
}

describe('production modules of the changed tests', () => {
  it('are the source modules a changed test imports by a relative path', () => {
    const options = snapshots({
      headChanges: { 'test/classify.test.ts': CLASSIFY_TEST.replace("toBe('low')", 'toBeTypeOf') },
    });

    expect(testedSourceModules(options, layout)).toEqual([
      'src/classify.ts',
      'src/format/index.ts',
    ]);
  });

  it.each([
    [
      'a paths alias from an extended config',
      {
        'tsconfig.base.json': '{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }\n',
        'tsconfig.json': '{ "extends": "./tsconfig.base.json" }\n',
      },
      "import { classify } from '@/classify';\n",
    ],
    [
      'a baseUrl import',
      { 'tsconfig.json': '{ "compilerOptions": { "baseUrl": "." } }\n' },
      "import { classify } from 'src/classify.js';\n",
    ],
    [
      'an alias in a referenced config of a Vite project',
      {
        'tsconfig.json': '{ "files": [], "references": [{ "path": "./tsconfig.app.json" }] }\n',
        'tsconfig.app.json':
          '{ "compilerOptions": { "composite": true, "paths": { "@/*": ["./src/*"] } } }\n',
      },
      "import { classify } from '@/classify';\n",
    ],
  ])('follow %s', (_name, baseFiles, test) => {
    const options = snapshots({ baseFiles, headChanges: { 'test/unrelated.test.ts': test } });

    expect(testedSourceModules(options, layout)).toEqual(['src/classify.ts', 'src/unrelated.ts']);
  });

  it('leave out packages, even one an alias points into', () => {
    const options = snapshots({
      baseFiles: {
        'tsconfig.json': '{ "compilerOptions": { "paths": { "lib": ["./node_modules/lib"] } } }\n',
        'node_modules/lib/index.ts': 'export const lib = 1;\n',
      },
      headChanges: { 'test/unrelated.test.ts': "import { lib } from 'lib';\n" },
    });

    expect(testedSourceModules(options, layout)).toEqual(['src/unrelated.ts']);
  });

  it('include the modules a deleted test imported', () => {
    const options = snapshots({ removed: ['test/unrelated.test.ts'] });

    expect(testedSourceModules(options, layout)).toEqual(['src/unrelated.ts']);
  });

  it('skip modules the head deleted, since they have no mutants to compare', () => {
    const options = snapshots({
      removed: ['src/unrelated.ts'],
      headChanges: { 'test/unrelated.test.ts': 'export {};\n' },
    });

    expect(testedSourceModules(options, layout)).toEqual([]);
  });

  it('are none when no test changed', () => {
    const options = snapshots({
      headChanges: { 'src/classify.ts': 'export const classify = 1;\n' },
    });

    expect(testedSourceModules(options, layout)).toEqual([]);
  });

  it('are none on the base side and in a whole-project run', () => {
    const options = snapshots({ removed: ['test/unrelated.test.ts'] });

    expect(testedSourceModules({ ...options, snapshot: 'base' }, layout)).toEqual([]);
    expect(
      testedSourceModules({ snapshot: 'head', projectRoot: options.projectRoot }, layout),
    ).toEqual([]);
  });
});

function mutant(status, line, overrides = {}) {
  return {
    status,
    mutatorName: 'ConditionalExpression',
    replacement: 'true',
    sourceHash: `hash-${String(line)}`,
    original: 'n < 5',
    location: { start: { line, column: 7 } },
    ...overrides,
  };
}

const mutationScope = {
  targets: ['src/classify.ts:2-2', 'src/other.ts:1-1'],
  testedModules: ['src/classify.ts'],
};

describe('mutation scope with the tested modules', () => {
  it('mutates a tested module whole instead of its changed lines', () => {
    expect(mutationTargetsWithTestedModules(mutationScope.targets, ['src/classify.ts'])).toEqual([
      'src/other.ts:1-1',
      'src/classify.ts',
    ]);
  });

  it('keeps the usual findings to the changed lines and to the other changed files', () => {
    const report = {
      files: {
        'src/classify.ts': { mutants: [mutant('Survived', 1), mutant('Survived', 2)] },
        'src/other.ts': { mutants: [mutant('Survived', 1)] },
      },
    };

    expect(changedCodeMutants(report, mutationScope)).toEqual({
      files: {
        'src/classify.ts': { mutants: [mutant('Survived', 2)] },
        'src/other.ts': { mutants: [mutant('Survived', 1)] },
      },
    });
  });
});

describe('mutants the changed tests let escape', () => {
  const headReport = {
    files: {
      'src/classify.ts': {
        mutants: [
          mutant('Survived', 1),
          mutant('NoCoverage', 3, {
            mutatorName: 'StringLiteral',
            replacement: '""',
            original: "'low'",
          }),
          mutant('Survived', 4),
          mutant('Killed', 5),
          mutant('Survived', 2),
        ],
      },
    },
  };
  const baseReport = {
    files: {
      'src/classify.ts': {
        mutants: [
          mutant('Killed', 1),
          mutant('Timeout', 3, {
            mutatorName: 'StringLiteral',
            replacement: '""',
            original: "'low'",
          }),
          mutant('Survived', 4),
          mutant('Killed', 5),
        ],
      },
    },
  };

  it('need a base run only when a tested module has an escaped mutant off the changed lines', () => {
    expect(hasWeakeningCandidates(headReport, mutationScope)).toBe(true);
    expect(
      hasWeakeningCandidates(
        { files: { 'src/classify.ts': { mutants: [mutant('Killed', 1), mutant('Survived', 2)] } } },
        mutationScope,
      ),
    ).toBe(false);
  });

  it('fail when the base tests caught them, and name the weakened tests', () => {
    const findings = weakenedTestFindings({
      headReport,
      baseReport,
      mutationScope,
      analyzerName: 'mutation',
    });

    expect(findings).toEqual([
      {
        tool: 'mutation',
        rule: 'mutant-survived',
        path: 'src/classify.ts',
        message:
          'This change weakened the tests of src/classify.ts: the base tests caught this ConditionalExpression mutant (`n < 5` replaced with `true`), but it survives now. Restore the assertion that caught it, or add one.',
        identity: expect.any(String),
        classification: 'enforceable',
        location: { line: 1, column: 7 },
      },
      {
        tool: 'mutation',
        rule: 'mutant-nocoverage',
        path: 'src/classify.ts',
        message:
          'This change weakened the tests of src/classify.ts: the base tests caught this StringLiteral mutant (`\'low\'` replaced with `""`), but no test runs it now. Restore the assertion that caught it, or add one.',
        identity: expect.any(String),
        classification: 'enforceable',
        location: { line: 3, column: 7 },
      },
    ]);
    expect(new Set(findings.map(({ identity }) => identity)).size).toBe(2);
  });

  it('match mutants by their code, not their line, when the module moved lines', () => {
    const moved = {
      files: { 'src/classify.ts': { mutants: [mutant('Survived', 9, { sourceHash: 'hash-1' })] } },
    };

    expect(
      weakenedTestFindings({
        headReport: moved,
        baseReport,
        mutationScope,
        analyzerName: 'mutation',
      }).map(({ location }) => location),
    ).toEqual([{ line: 9, column: 7 }]);
  });

  it('rerun only the escaped mutants on the base when the module is unchanged', () => {
    const unchangedModule = { targets: ['src/other.ts:1-1'], testedModules: ['src/classify.ts'] };
    const multiLine = {
      files: {
        'src/classify.ts': {
          mutants: [
            mutant('Survived', 4, {
              location: { start: { line: 4, column: 1 }, end: { line: 6 } },
            }),
            mutant('Survived', 8),
            mutant('Killed', 9),
          ],
        },
      },
    };

    expect(baseMutationTargets(multiLine, unchangedModule)).toEqual([
      'src/classify.ts:4-6',
      'src/classify.ts:8-8',
    ]);
    expect(baseMutationTargets(headReport, mutationScope)).toEqual(['src/classify.ts']);
  });

  it('match mutants of an unchanged module by position against the partial base run', () => {
    const unchangedModule = { targets: [], testedModules: ['src/classify.ts'] };
    const partialBase = {
      files: {
        'src/classify.ts': {
          mutants: [mutant('Killed', 2, { sourceHash: 'other' }), mutant('Survived', 4)],
        },
      },
    };

    expect(
      weakenedTestFindings({
        headReport,
        baseReport: partialBase,
        mutationScope: unchangedModule,
        analyzerName: 'mutation',
      }).map(({ location }) => location),
    ).toEqual([{ line: 2, column: 7 }]);
  });
});
