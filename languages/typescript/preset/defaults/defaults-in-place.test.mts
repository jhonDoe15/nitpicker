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
import { fieldOf, textOf } from '../../../../shared/values/readers.mts';
import { checkoutModulePath } from '../../../../shared/paths/checkout-module.mjs';
import { createEntryPointAnalyzer } from '../../adapters/entry-points.mjs';
import { createEslintAnalyzer } from '../../adapters/eslint/analyzer.mjs';
import { createStaticCheckAnalyzer } from '../../adapters/static-checks/analyzer.mjs';
import { createQualityAreaAnalyzer } from '../../adapters/quality-areas/analyzer.mjs';
import { withDefaultAnalyzerParallelism as untypedParallelism } from '../../../../core/diff/execution/test-support/analyzer-parallelism.mjs';
import { runAnalyzers, type AnalyzerRun } from '../../../../core/diff/execution/run-analyzers.mts';
import {
  entryPointsCheck,
  eslintChecks,
  staticChecks,
  qualityAreaChecks,
} from '../quality-checks.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../../..');
const POLICY_PATHS = [
  'core/fix/common/contained-path.mjs',
  'core/tooling/host-environment.mjs',
  'core/tooling/policy-links.mjs',
  'core/tooling/temporary-files.mjs',
  'core/tooling/output-file/output-file.mjs',
  'core/tooling/jscpd/config.mjs',
  'core/tooling/jscpd/skipped-folders.mjs',
  'languages/typescript/preset/defaults',
  'languages/javascript/preset/javascript-preset.mjs',
  'languages/javascript/preset/documentation/jsdoc.mjs',
  'languages/javascript/preset/eslint-dialect.mjs',
  'languages/typescript/conventions/file-name-casing.mjs',
  'languages/typescript/conventions/layout-measures.mjs',
  'languages/typescript/conventions/measures',
  'languages/typescript/conventions/prettier-conventions.mjs',
  'languages/typescript/conventions/print-width.mjs',
  'languages/typescript/conventions/type-import-style.mjs',
  'languages/typescript/preset/layout.mjs',
  'languages/typescript/preset/layout/generated-files.mjs',
  'languages/typescript/preset/layout/path-patterns.mjs',
  'languages/typescript/preset/head-policy.mjs',
  'languages/typescript/preset/project-configs',
  'languages/typescript/preset/project-tools',
  'languages/typescript/preset/libraries',
  'languages/typescript/preset/tool-configs.mjs',
  'languages/typescript/preset/architecture/outside-roots/outside-roots.mjs',
  'languages/typescript/preset/architecture/strict-boundary-rules.mjs',
  'languages/typescript/preset/architecture/domain-packages.mjs',
  'languages/typescript/preset/architecture/strict-layout.mjs',
  'languages/typescript/preset/coupling/feature-layout.mjs',
  'languages/typescript/preset/dependency-graph',
  'languages/typescript/preset/entry-points/analyze.mjs',
  'languages/typescript/preset/test-runtime',
  'languages/typescript/preset/eslint-config',
  'languages/typescript/preset/eslint-project',
  'languages/typescript/preset/eslint-plugin/index.mjs',
  'languages/typescript/preset/eslint-plugin/rules.generated.mjs',
  'languages/typescript/preset/eslint-plugin/registry',
  'languages/typescript/preset/eslint-plugin/rules',
  'languages/typescript/preset/eslint-plugin/fixes',
  'languages/typescript/preset/eslint-plugin/test-assertions',
  'languages/typescript/preset/eslint-plugin/test-isolation',
  'languages/typescript/preset/eslint-plugin/test-placement',
  'languages/typescript/preset/eslint-plugin/test-quality',
  'languages/typescript/preset/eslint-plugin/type-identity',
  'languages/typescript/adapters/static-checks',
  'languages/typescript/adapters/quality-areas',
  'languages/typescript/adapters/eslint',
  'languages/typescript/adapters/immutable-types',
  'languages/typescript/adapters/typed',
  'languages/typescript/preset/structure/reuse/reuse-paths.mjs',
  'languages/typescript/preset/syntax',
  'languages/typescript/preset/modules',
  'languages/typescript/preset/test-environment',
  'languages/typescript/preset/test-runner',
  'languages/typescript/typescript-api',
  'shared',
];
const temporaryRoots: string[] = [];
const withDefaultAnalyzerParallelism: <T>(run: () => T) => T = untypedParallelism;

type Run = AnalyzerRun & { temporaryPolicyLinks?: string[] };

function analyzerFrom(create: (options: never) => unknown, options: object): unknown {
  return Reflect.apply(create, undefined, [options]);
}

function checkNamed<T extends { readonly name: string }>(checks: readonly T[], name: string): T {
  const check = checks.find((entry) => entry.name === name);
  if (check === undefined) {
    throw new RangeError(`No check named ${name}`);
  }
  return check;
}
const packagedPath: (file: string) => string = checkoutModulePath;

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
    const check = checkNamed(staticChecks, 'dependency-architecture');
    const runtime = checkNamed(qualityAreaChecks, 'test-runtime');
    const run = runInPlace(
      [
        analyzerFrom(createStaticCheckAnalyzer, { ...check, configurationHash: 'fixture' }),
        analyzerFrom(createQualityAreaAnalyzer, { ...runtime, configurationHash: 'fixture' }),
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
        analyzerFrom(createQualityAreaAnalyzer, {
          ...checkNamed(qualityAreaChecks, name),
          configurationHash: 'fixture',
        }),
      ),
      projectRoot,
    );
    expect(run.toolErrors).toEqual([]);
    expect(names.map((name) => run.reports.get(name)?.findings)).toEqual(names.map(() => []));
  });

  describe('with no source or tests', () => {
    let shared: Run | undefined;
    const fileDrivenChecks = qualityAreaChecks.filter(({ kind }) => kind !== 'policy-tests');
    const staticNames = ['prettier-format', 'typescript-typecheck', 'dependency-architecture'];
    const lintCheck = checkNamed(eslintChecks, 'eslint-lint');

    function runEmptyProject() {
      shared ??= runInPlace(
        [
          ...fileDrivenChecks.map((check) =>
            analyzerFrom(createQualityAreaAnalyzer, { ...check, configurationHash: 'fixture' }),
          ),
          analyzerFrom(createEntryPointAnalyzer, {
            version: 'fixture',
            configurationHash: 'fixture',
            exclusions: fieldOf(entryPointsCheck, 'exclusions'),
            sourceRoot: fieldOf(entryPointsCheck, 'sourceRoot'),
          }),
          analyzerFrom(createEslintAnalyzer, {
            ...lintCheck,
            version: 'fixture',
            configurationHash: 'fixture',
          }),
          ...staticNames.map((name) =>
            analyzerFrom(createStaticCheckAnalyzer, {
              ...checkNamed(staticChecks, name),
              configurationHash: 'fixture',
            }),
          ),
        ],
        createProject({}),
      );
      return shared;
    }

    const toolErrorsFor = (run: Run, names: readonly string[]) =>
      run.toolErrors.filter(({ tool }) => names.includes(textOf(tool)));

    it('reports no error for every file-driven quality analyzer with no source or tests', () => {
      const run = runEmptyProject();
      const names = fileDrivenChecks.map(({ name }) => name);
      expect(names).not.toHaveLength(0);
      expect(toolErrorsFor(run, names)).toEqual([]);
      expect(names.map((name) => run.reports.get(name)?.findings)).toEqual(names.map(() => []));
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
      expect(staticNames.map((name) => run.reports.get(name)?.findings)).toEqual(
        staticNames.map(() => []),
      );
    });
  });

  describe('with the old layout', () => {
    let shared: Run | undefined;

    function runOldLayoutProject() {
      if (shared === undefined) {
        const projectRoot = createProject({
          ...oldLayoutFiles(),
          'src/service.js': 'export const service = 1;\n',
          'test/service.test.js': "import { service } from '../src/service.js';\nvoid service;\n",
        });
        const lintCheck = checkNamed(eslintChecks, 'eslint-lint');
        const cruiseCheck = checkNamed(staticChecks, 'dependency-architecture');
        shared = runInPlace(
          [
            analyzerFrom(createEslintAnalyzer, {
              name: fieldOf(lintCheck, 'name'),
              version: 'fixture',
              configurationHash: 'fixture',
              exclusions: fieldOf(lintCheck, 'exclusions'),
              configRelativePath: fieldOf(lintCheck, 'configRelativePath'),
              patterns: fieldOf(lintCheck, 'patterns'),
              policyFiles: fieldOf(lintCheck, 'policyFiles'),
            }),
            analyzerFrom(createStaticCheckAnalyzer, {
              ...cruiseCheck,
              configurationHash: 'fixture',
            }),
            analyzerFrom(createEntryPointAnalyzer, {
              version: 'fixture',
              configurationHash: 'fixture',
              exclusions: fieldOf(entryPointsCheck, 'exclusions'),
              sourceRoot: fieldOf(entryPointsCheck, 'sourceRoot'),
            }),
          ],
          projectRoot,
        );
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
    const lintCheck = checkNamed(eslintChecks, 'eslint-lint');
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
      analyzerFrom(createEslintAnalyzer, {
        ...lintCheck,
        version: 'fixture',
        configurationHash: 'fixture',
      }),
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

function runInPlace(analyzers: unknown, projectRoot: string): Run {
  return withDefaultAnalyzerParallelism(() =>
    runAnalyzers({
      analyzers: Array.isArray(analyzers) ? analyzers : [analyzers],
      projectRoot,
      policyRoot: projectRoot,
      toolRoot: packageRoot,
      liveProjectRoot: packageRoot,
      snapshot: 'head',
      baselineRoot: undefined,
      baselineMovesFile: undefined,
      headPolicyFile: undefined,
      mutationScope: undefined,
      logRoot: undefined,
      runTasks: undefined,
    }),
  );
}

function createProject(files: Readonly<Record<string, string>> = oldLayoutFiles()) {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-diff-'));
  temporaryRoots.push(temporaryRoot);
  const projectRoot = path.join(temporaryRoot, 'base');
  for (const relativePath of POLICY_PATHS) {
    const source = packagedPath(path.join(packageRoot, relativePath));
    cpSync(source, path.join(projectRoot, path.relative(packageRoot, source)), {
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

function oldLayoutFiles(): Record<string, string> {
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

function temporaryPolicyLinks(projectRoot: string) {
  return readdirSync(projectRoot).filter((entry) => entry.startsWith('.nitpicker-'));
}

function writeFiles(root: string, files: Readonly<Record<string, string>>) {
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }
}
