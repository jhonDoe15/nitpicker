import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createGitRepository,
  fixtureGit,
  removeGitRepositories,
} from '../../../../core/diff/fixtures/git-repository.mjs';
import { defaultResolvedLayout as layout } from '../../preset/layout.mjs';
import { normalizeMutation, strykerRunConfig } from '../quality-areas-runner.mjs';
import { runScopedMutation } from './scoped-mutation.mjs';
import { testedSourceModules } from './tested-modules.mjs';

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

function tested(modules, skipped = []) {
  return { modules, skipped };
}

function escaped(status, line) {
  return {
    status,
    mutatorName: 'ConditionalExpression',
    replacement: 'true',
    location: { start: { line, column: 7 } },
  };
}

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

    expect(testedSourceModules(options, layout)).toEqual(
      tested(['src/classify.ts', 'src/format/index.ts']),
    );
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

    expect(testedSourceModules(options, layout)).toEqual(
      tested(['src/classify.ts', 'src/unrelated.ts']),
    );
  });

  it('follow the re-exports of a barrel the test imports, and stop at a re-export cycle', () => {
    const options = snapshots({
      baseFiles: {
        'src/feature/index.ts':
          "export * from './domain/index.js';\nexport { format } from '../format';\n",
        'src/feature/domain/index.ts':
          "export { classify } from '../../classify';\nexport * from '../index.js';\n",
      },
      headChanges: {
        'test/unrelated.test.ts': "import { classify } from '../src/feature/index.js';\n",
      },
    });

    expect(testedSourceModules(options, layout)).toEqual(
      tested([
        'src/classify.ts',
        'src/feature/domain/index.ts',
        'src/feature/index.ts',
        'src/format/index.ts',
        'src/unrelated.ts',
      ]),
    );
  });

  it('follow re-export chains only three modules deep, not every import', () => {
    const options = snapshots({
      baseFiles: {
        'src/chain/a.ts': "export * from './b';\n",
        'src/chain/b.ts': "export * from './c';\nimport { format } from '../format';\n",
        'src/chain/c.ts': "export * from './d';\n",
        'src/chain/d.ts': "export * from '../classify';\n",
      },
      headChanges: { 'test/unrelated.test.ts': "import { a } from '../src/chain/a';\n" },
    });

    expect(testedSourceModules(options, layout)).toEqual(
      tested([
        'src/chain/a.ts',
        'src/chain/b.ts',
        'src/chain/c.ts',
        'src/chain/d.ts',
        'src/unrelated.ts',
      ]),
    );
  });

  it('leave out packages, even one an alias points into', () => {
    const options = snapshots({
      baseFiles: {
        'tsconfig.json': '{ "compilerOptions": { "paths": { "lib": ["./node_modules/lib"] } } }\n',
        'node_modules/lib/index.ts': 'export const lib = 1;\n',
      },
      headChanges: { 'test/unrelated.test.ts': "import { lib } from 'lib';\n" },
    });

    expect(testedSourceModules(options, layout)).toEqual(tested(['src/unrelated.ts']));
  });

  it('include the modules a deleted test imported', () => {
    const options = snapshots({ removed: ['test/unrelated.test.ts'] });

    expect(testedSourceModules(options, layout)).toEqual(tested(['src/unrelated.ts']));
  });

  it('skip modules the head deleted, since they have no mutants to compare', () => {
    const options = snapshots({
      removed: ['src/unrelated.ts'],
      headChanges: { 'test/unrelated.test.ts': 'export {};\n' },
    });

    expect(testedSourceModules(options, layout)).toEqual(tested([]));
  });

  it('include the modules of the tests that use a changed test helper', () => {
    const options = snapshots({
      baseFiles: { 'test/support/assert.ts': "export * from './helper.js';\n" },
      headChanges: { 'test/support/helper.ts': 'export const helper = 2;\n' },
    });

    expect(testedSourceModules(options, layout)).toEqual(
      tested(['src/classify.ts', 'src/format/index.ts']),
    );
  });

  it('are none when a test was only renamed', () => {
    const options = snapshots({
      removed: ['test/unrelated.test.ts'],
      headChanges: {
        'test/renamed.test.ts': "import { unrelated } from '../src/unrelated.js';\n",
      },
    });

    expect(testedSourceModules(options, layout)).toEqual(tested([]));
  });

  it('stop at ten modules, the ones the tests import directly first', () => {
    const modules = Array.from({ length: 11 }, (_, index) => `src/many/m${String(index)}.ts`);
    const options = snapshots({
      baseFiles: {
        ...Object.fromEntries(modules.map((modulePath) => [modulePath, 'export const m = 1;\n'])),
        'src/many/index.ts': modules
          .map((_, index) => `export * from './m${String(index)}';`)
          .join('\n'),
      },
      headChanges: {
        'test/unrelated.test.ts':
          "import { m } from '../src/many/index';\nimport '../src/classify';\n",
      },
    });

    expect(testedSourceModules(options, layout)).toEqual(
      tested(
        ['src/classify.ts', 'src/many/index.ts', 'src/unrelated.ts', ...modules.slice(0, 7)].sort(),
        modules.slice(7),
      ),
    );
  });

  it('are none when no test changed', () => {
    const options = snapshots({
      headChanges: { 'src/classify.ts': 'export const classify = 1;\n' },
    });

    expect(testedSourceModules(options, layout)).toEqual(tested([]));
  });

  it('are none on the base side and in a whole-project run', () => {
    const options = snapshots({ removed: ['test/unrelated.test.ts'] });

    expect(testedSourceModules({ ...options, snapshot: 'base' }, layout)).toEqual(tested([]));
    expect(
      testedSourceModules({ snapshot: 'head', projectRoot: options.projectRoot }, layout),
    ).toEqual(tested([]));
  });
});

describe('the mutation run of a change', () => {
  function fakeStryker(reports) {
    const calls = [];
    return {
      calls,
      mutationReport: (options, targets) => {
        calls.push({ snapshot: options.snapshot, projectRoot: options.projectRoot, targets });
        return Promise.resolve({ report: reports[options.snapshot] });
      },
    };
  }

  function run(options, stryker, exceptions = []) {
    return runScopedMutation(options, {
      layout,
      exceptions,
      mutationReport: stryker.mutationReport,
      normalize: normalizeMutation,
    });
  }

  it('reruns the escaped mutants of the tested modules on the base checkout', async () => {
    const options = {
      ...snapshots({
        headChanges: {
          'test/unrelated.test.ts': "import { classify } from '../src/classify.js';\n",
          'src/unrelated.ts': 'export const unrelated = 2;\n',
        },
      }),
      analyzerName: 'mutation',
    };
    const stryker = fakeStryker({
      head: {
        files: {
          'src/classify.ts': { mutants: [escaped('Survived', 1)] },
          'src/unrelated.ts': { mutants: [escaped('Ignored', 1)] },
        },
      },
      base: { files: { 'src/classify.ts': { mutants: [escaped('Killed', 1)] } } },
    });

    const findings = await run(options, stryker, [
      { rule: 'mutant-ignored', paths: ['src/unrelated.ts'], reason: 'Generated' },
    ]);

    expect(stryker.calls).toEqual([
      {
        snapshot: 'head',
        projectRoot: options.projectRoot,
        targets: ['src/classify.ts', 'src/unrelated.ts'],
      },
      { snapshot: 'base', projectRoot: options.baselineRoot, targets: ['src/classify.ts:1-1'] },
    ]);
    expect(findings.map(({ rule, path: file }) => [rule, file])).toEqual([
      ['mutation-summary', '.'],
      ['mutant-survived', 'src/classify.ts'],
    ]);
  });

  it('lifts weakened mutants with an exception and names the modules over the cap', async () => {
    const many = Array.from({ length: 11 }, (_, index) => `src/m${String(index)}.ts`);
    const options = {
      ...snapshots({
        baseFiles: Object.fromEntries(many.map((modulePath) => [modulePath, 'export {};\n'])),
        headChanges: {
          'test/unrelated.test.ts': many
            .map((modulePath) => `import '../${modulePath}';`)
            .join('\n'),
        },
      }),
      analyzerName: 'mutation',
    };
    const stryker = fakeStryker({
      head: { files: { 'src/m0.ts': { mutants: [escaped('Survived', 1)] } } },
      base: { files: { 'src/m0.ts': { mutants: [escaped('Killed', 1)] } } },
    });

    const findings = await run(options, stryker, [
      { rule: 'mutant-survived', paths: ['src/m0.ts'], reason: 'Behaviour removed' },
    ]);

    expect(
      findings.map(({ rule, path: file, classification }) => [rule, file, classification]),
    ).toEqual([['tested-modules-capped', 'src/m10.ts', 'descriptive']]);
    expect(findings[0].message).toBe(
      'The changed tests reach more than 10 production modules, so weaker tests were not checked in src/m10.ts, src/unrelated.ts. Run `nitpicker --all` to mutate every module.',
    );
  });

  it('runs no mutants when neither a source file nor a test changed', async () => {
    const stryker = fakeStryker({});

    expect(await run(snapshots({ headChanges: { 'package.json': '{"a":1}\n' } }), stryker)).toEqual(
      [],
    );
    expect(stryker.calls).toEqual([]);
  });

  it('runs the base without the type checker, whose head run already accepted the mutants', () => {
    const sourceConfig = { checkers: ['typescript'], vitest: { configFile: 'v.ts' } };
    const files = { tsconfigFile: undefined, vitestConfigFile: '.v.ts' };

    expect(
      strykerRunConfig(sourceConfig, { snapshot: 'base', targets: ['src/a.ts:1-1'], ...files }),
    ).toEqual({
      checkers: [],
      tsconfigFile: undefined,
      vitest: { configFile: '.v.ts' },
      mutate: ['src/a.ts:1-1'],
      reporters: ['json'],
      jsonReporter: { fileName: 'reports/quality/mutation/mutation.json' },
    });
    expect(
      strykerRunConfig(sourceConfig, { snapshot: 'head', targets: undefined, ...files }).checkers,
    ).toEqual(['typescript']);
  });
});
