import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createEntryPointAnalyzer } from '../../adapters/entry-points.mjs';
import { createEslintAnalyzer } from '../../adapters/eslint/analyzer.mjs';
import { createStaticCheckAnalyzer } from '../../adapters/static-checks/analyzer.mjs';
import { createQualityAreaAnalyzer } from '../../adapters/quality-areas/analyzer.mjs';
import { withDefaultAnalyzerParallelism } from '../../../../core/diff/execution/test-support/analyzer-parallelism.mjs';
import { runAnalyzers } from '../../../../core/diff/execution/run-analyzers.mjs';
import {
  entryPointsCheck,
  eslintChecks,
  staticChecks,
  qualityAreaChecks,
} from '../quality-checks.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../../..');
const POLICY_PATHS = [
  'core/tooling/policy-links.mjs',
  'core/tooling/temporary-files.mjs',
  'languages/typescript/preset/defaults',
  'languages/javascript/preset/javascript-preset.mjs',
  'languages/javascript/preset/documentation/jsdoc.mjs',
  'languages/javascript/preset/eslint-dialect.mjs',
  'languages/typescript/conventions/layout-measures.mjs',
  'languages/typescript/conventions/prettier-conventions.mjs',
  'languages/typescript/conventions/print-width.mjs',
  'languages/typescript/preset/layout.mjs',
  'languages/typescript/preset/layout/generated-files.mjs',
  'languages/typescript/preset/head-policy.mjs',
  'languages/typescript/preset/tool-configs.mjs',
  'languages/typescript/preset/architecture/outside-roots/outside-roots.mjs',
  'languages/typescript/preset/architecture/strict-boundary-rules.mjs',
  'languages/typescript/preset/architecture/domain-packages.mjs',
  'languages/typescript/preset/architecture/strict-layout.mjs',
  'languages/typescript/preset/dependency-graph',
  'languages/typescript/preset/entry-points/analyze.mjs',
  'languages/typescript/preset/test-runtime/analyze.mjs',
  'languages/typescript/preset/eslint-config',
  'languages/typescript/preset/eslint-plugin/index.mjs',
  'languages/typescript/preset/eslint-plugin/rules',
  'languages/typescript/preset/eslint-plugin/type-identity',
  'languages/typescript/adapters/static-checks',
  'languages/typescript/adapters/quality-areas',
  'languages/typescript/adapters/eslint',
  'languages/typescript/adapters/immutable-types',
  'languages/typescript/adapters/test-runners/jest',
  'languages/typescript/preset/syntax',
  'languages/typescript/preset/modules',
  'languages/typescript/preset/test-environment',
  'languages/typescript/preset/test-runner',
  'shared',
];
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('default configs used in place', () => {
  it('selects src and test without src/main or tests', () => {
    const projectRoot = createProject({
      'src/service.ts': 'export const service = 1;\n',
      'test/service.test.ts': "import { service } from '../src/service.js';\nvoid service;\n",
    });
    const check = staticChecks.find(({ name }) => name === 'dependency-architecture');
    const runtime = qualityAreaChecks.find(({ name }) => name === 'test-runtime');
    const run = runInPlace(
      [
        createStaticCheckAnalyzer({ ...check, configurationHash: 'fixture' }),
        createQualityAreaAnalyzer({ ...runtime, configurationHash: 'fixture' }),
      ],
      projectRoot,
    );
    expect(run.toolErrors).toEqual([]);
    expect(run.reports.get('dependency-architecture')?.findings).toEqual([]);
    expect(run.reports.get('test-runtime')?.findings).not.toContainEqual(
      expect.objectContaining({ path: 'test/service.test.ts', classification: 'enforceable' }),
    );
  });

  it('treats test helpers without runnable tests as no input to test execution', () => {
    const projectRoot = createProject({
      'src/service.ts': 'export const service = 1;\n',
      'test/helper.ts': 'export const helper = true;\n',
    });
    const names = ['test-runtime', 'coverage', 'mutation'];
    const run = runInPlace(
      names.map((name) =>
        createQualityAreaAnalyzer({
          ...qualityAreaChecks.find((entry) => entry.name === name),
          configurationHash: 'fixture',
        }),
      ),
      projectRoot,
    );
    expect(run.toolErrors).toEqual([]);
    for (const name of names) expect(run.reports.get(name)?.findings, name).toEqual([]);
  });

  // Tests that look at the same project share one run of all their analyzers, side by side, so the
  // slowest tool sets the time instead of the sum, and the project is copied once.
  describe('with no source or tests', () => {
    let shared;
    const fileDrivenChecks = qualityAreaChecks.filter(({ kind }) => kind !== 'policy-tests');
    const staticNames = ['prettier-format', 'typescript-typecheck', 'dependency-architecture'];
    const lintCheck = eslintChecks.find(({ name }) => name === 'eslint-lint');

    function runEmptyProject() {
      shared ??= runInPlace(
        [
          ...fileDrivenChecks.map((check) =>
            createQualityAreaAnalyzer({ ...check, configurationHash: 'fixture' }),
          ),
          createEntryPointAnalyzer({
            version: 'fixture',
            configurationHash: 'fixture',
            exclusions: entryPointsCheck.exclusions,
            sourceRoot: entryPointsCheck.sourceRoot,
          }),
          createEslintAnalyzer({ ...lintCheck, version: 'fixture', configurationHash: 'fixture' }),
          ...staticNames.map((name) =>
            createStaticCheckAnalyzer({
              ...staticChecks.find((entry) => entry.name === name),
              configurationHash: 'fixture',
            }),
          ),
        ],
        createProject({}),
      );
      return shared;
    }

    const toolErrorsFor = (run, names) => run.toolErrors.filter(({ tool }) => names.includes(tool));

    it('reports no error for every file-driven quality analyzer with no source or tests', () => {
      const run = runEmptyProject();
      const names = fileDrivenChecks.map(({ name }) => name);
      expect(toolErrorsFor(run, names)).toEqual([]);
      for (const name of names) expect(run.reports.get(name)?.findings, name).toEqual([]);
    });

    it('reports no error for entry points and ESLint when both layouts are absent', () => {
      const run = runEmptyProject();
      expect(toolErrorsFor(run, ['entry-points', 'eslint-lint'])).toEqual([]);
      expect(run.reports.get('entry-points')?.findings).toEqual([]);
      expect(run.reports.get('eslint-lint')?.findings).toEqual([]);
    });

    it('reports no error when source and test directories are absent', () => {
      const run = runEmptyProject();
      expect(toolErrorsFor(run, staticNames)).toEqual([]);
      for (const name of staticNames) expect(run.reports.get(name)?.findings, name).toEqual([]);
    });
  });

  // The old layout plus a JavaScript source and test: the files the ESLint test needs. The
  // dependency-cruiser and entry-point tests look at the same project (more files, same claim).
  describe('with the old layout', () => {
    let shared;

    function runOldLayoutProject() {
      if (shared === undefined) {
        const projectRoot = createProject({
          ...oldLayoutFiles(),
          'src/service.js': 'export const service = 1;\n',
          'test/service.test.js': "import { service } from '../src/service.js';\nvoid service;\n",
        });
        const lintCheck = eslintChecks.find(({ name }) => name === 'eslint-lint');
        const cruiseCheck = staticChecks.find(({ name }) => name === 'dependency-architecture');
        shared = runInPlace(
          [
            createEslintAnalyzer({
              name: lintCheck.name,
              version: 'fixture',
              configurationHash: 'fixture',
              exclusions: lintCheck.exclusions,
              configRelativePath: lintCheck.configRelativePath,
              patterns: lintCheck.patterns,
              policyFiles: lintCheck.policyFiles,
            }),
            createStaticCheckAnalyzer({ ...cruiseCheck, configurationHash: 'fixture' }),
            createEntryPointAnalyzer({
              version: 'fixture',
              configurationHash: 'fixture',
              exclusions: entryPointsCheck.exclusions,
              sourceRoot: entryPointsCheck.sourceRoot,
            }),
          ],
          projectRoot,
        );
        // Read now: the per-test cleanup removes the project after the first test.
        shared.temporaryPolicyLinks = temporaryPolicyLinks(projectRoot);
      }
      return shared;
    }

    it('lint a project with the default ESLint config without parse or tool errors', () => {
      const run = runOldLayoutProject();
      expect(run.toolErrors.filter(({ tool }) => tool === 'eslint-lint')).toEqual([]);
      expect(run.reports.get('eslint-lint')?.findings).toEqual([]);
      expect(
        run.reports
          .get('eslint-lint')
          ?.findings.every(({ rule }) => rule !== 'eslint/parser-error'),
      ).toBe(true);
      expect(run.temporaryPolicyLinks).toEqual([]);
    });

    it('cruise a project with the default dependency-cruiser config without tool errors', () => {
      const run = runOldLayoutProject();
      expect(run.toolErrors.filter(({ tool }) => tool === 'dependency-architecture')).toEqual([]);
      expect(run.reports.get('dependency-architecture')?.findings).toEqual([]);
      expect(run.temporaryPolicyLinks).toEqual([]);
    });

    it('builds the dependency graph with the policy TypeScript config without tool errors', () => {
      const run = runOldLayoutProject();
      expect(run.toolErrors.filter(({ tool }) => tool === 'entry-points')).toEqual([]);
      expect(run.reports.get('entry-points')?.findings).toEqual([]);
      expect(run.temporaryPolicyLinks).toEqual([]);
    });
  });
});

describe('with a noisy jsdom project config', () => {
  const noisyConfig = [
    "console.log('loading the test config');",
    "console.warn('Your Vite config uses features that are unsupported by configLoader');",
    "export default { test: { environment: 'jsdom' } };",
    '',
  ].join('\n');

  it('lints without tool errors and reports only the test that never uses the DOM', () => {
    const lintCheck = eslintChecks.find(({ name }) => name === 'eslint-lint');
    const projectRoot = createProject({
      ...oldLayoutFiles(),
      'vitest.config.mjs': noisyConfig,
      'tests/unit/page.test.ts': [
        "import { expect, it } from 'vitest';",
        '',
        "it('has a document', () => {",
        '  expect(globalThis.document).toBeDefined();',
        '});',
        '',
      ].join('\n'),
    });
    const run = runInPlace(
      createEslintAnalyzer({ ...lintCheck, version: 'fixture', configurationHash: 'fixture' }),
      projectRoot,
    );
    expect(run.toolErrors).toEqual([]);
    expect(
      run.reports
        .get('eslint-lint')
        ?.findings.filter(({ rule }) => rule === 'nitpicker/no-unused-dom-environment')
        .map(({ path: findingPath }) => findingPath),
    ).toEqual(['tests/unit/greeting.test.ts']);
  });
});

function runInPlace(analyzers, projectRoot) {
  return withDefaultAnalyzerParallelism(() =>
    runAnalyzers({
      analyzers: Array.isArray(analyzers) ? analyzers : [analyzers],
      projectRoot,
      policyRoot: projectRoot,
      toolRoot: packageRoot,
      liveProjectRoot: packageRoot,
      snapshot: 'head',
    }),
  );
}

function createProject(files = oldLayoutFiles()) {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-diff-'));
  temporaryRoots.push(temporaryRoot);
  const projectRoot = path.join(temporaryRoot, 'base');
  for (const relativePath of POLICY_PATHS) {
    cpSync(path.join(packageRoot, relativePath), path.join(projectRoot, relativePath), {
      recursive: true,
    });
  }
  writeFiles(projectRoot, files);
  symlinkSync(
    path.join(packageRoot, 'node_modules'),
    path.join(projectRoot, 'node_modules'),
    'dir',
  );
  return projectRoot;
}

function oldLayoutFiles() {
  return {
    'src/main/shared/greeting.ts': [
      'export function greeting(name: string): string {',
      '  return `Hello, ${name}`;',
      '}',
      '',
    ].join('\n'),
    'src/main/index.ts': [
      "import { greeting } from './shared/greeting.js';",
      '',
      "export const message = greeting('world');",
      '',
    ].join('\n'),
    'tests/unit/greeting.test.ts': [
      "import { describe, expect, it } from 'vitest';",
      "import { greeting } from '../../src/main/shared/greeting.js';",
      '',
      "describe('greeting', () => {",
      "  it('greets by name', () => {",
      "    expect(greeting('world')).toBe('Hello, world');",
      '  });',
      '});',
      '',
    ].join('\n'),
  };
}

function temporaryPolicyLinks(projectRoot) {
  return readdirSync(projectRoot).filter((entry) => entry.startsWith('.nitpicker-'));
}

function writeFiles(root, files) {
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }
}
