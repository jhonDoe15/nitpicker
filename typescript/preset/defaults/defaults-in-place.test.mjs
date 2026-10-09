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
import { createEntryPointAnalyzer } from '../../adapters/diff/entry-points.mjs';
import { createEslintAnalyzer } from '../../adapters/diff/eslint.mjs';
import { createStaticCheckAnalyzer } from '../../adapters/diff/static-checks.mjs';
import { createQualityAreaAnalyzer } from '../../adapters/diff/quality-areas.mjs';
import { runAnalyzers } from '../../core/diff/run-analyzers.mjs';
import {
  entryPointsCheck,
  eslintChecks,
  staticChecks,
  qualityAreaChecks,
} from '../quality-checks.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../..');
const POLICY_PATHS = [
  'adapters/policy-links.mjs',
  'adapters/temporary-files.mjs',
  'preset/defaults',
  'preset/layout.mjs',
  'preset/head-policy.mjs',
  'preset/tool-configs.mjs',
  'preset/architecture/strict-boundary-rules.mjs',
  'preset/architecture/strict-layout.mjs',
  'preset/dependency-graph',
  'preset/entry-points/analyze.mjs',
  'preset/test-runtime/analyze.mjs',
  'preset/eslint-config',
  'preset/eslint-plugin/index.mjs',
  'preset/eslint-plugin/rules',
  'shared/policy.mjs',
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

  it('reports no error for every file-driven quality analyzer with no source or tests', () => {
    const projectRoot = createProject({});
    const checks = qualityAreaChecks.filter(({ kind }) => kind !== 'policy-tests');
    const run = runAnalyzers({
      analyzers: checks.map((check) =>
        createQualityAreaAnalyzer({ ...check, configurationHash: 'fixture' }),
      ),
      projectRoot,
      policyRoot: projectRoot,
      toolRoot: packageRoot,
      liveProjectRoot: packageRoot,
      snapshot: 'head',
    });
    expect(run.toolErrors).toEqual([]);
    for (const check of checks)
      expect(run.reports.get(check.name)?.findings, check.name).toEqual([]);
  });

  it('reports no error for entry points and ESLint when both layouts are absent', () => {
    const projectRoot = createProject({});
    const entry = runInPlace(
      createEntryPointAnalyzer({
        version: 'fixture',
        configurationHash: 'fixture',
        exclusions: entryPointsCheck.exclusions,
        sourceRoot: entryPointsCheck.sourceRoot,
      }),
      projectRoot,
    );
    expect(entry.toolErrors).toEqual([]);
    expect(entry.reports.get('entry-points')?.findings).toEqual([]);
    const check = eslintChecks.find(({ name }) => name === 'eslint-lint');
    const lint = runInPlace(
      createEslintAnalyzer({ ...check, version: 'fixture', configurationHash: 'fixture' }),
      projectRoot,
    );
    expect(lint.toolErrors).toEqual([]);
    expect(lint.reports.get('eslint-lint')?.findings).toEqual([]);
  });

  it('reports no error when source and test directories are absent', () => {
    const projectRoot = createProject({});
    for (const name of ['prettier-format', 'typescript-typecheck', 'dependency-architecture']) {
      const check = staticChecks.find((entry) => entry.name === name);
      const run = runInPlace(
        createStaticCheckAnalyzer({ ...check, configurationHash: 'fixture' }),
        projectRoot,
      );
      expect(run.toolErrors).toEqual([]);
      expect(run.reports.get(name)?.findings).toEqual([]);
    }
  });
  it('lint a project with the default ESLint config without parse or tool errors', () => {
    const projectRoot = createProject({
      ...oldLayoutFiles(),
      'src/service.js': 'export const service = 1;\n',
      'test/service.test.js': "import { service } from '../src/service.js';\nvoid service;\n",
    });
    const check = eslintChecks.find(({ name }) => name === 'eslint-lint');
    const analyzer = createEslintAnalyzer({
      name: check.name,
      version: 'fixture',
      configurationHash: 'fixture',
      exclusions: check.exclusions,
      configRelativePath: check.configRelativePath,
      patterns: check.patterns,
      policyFiles: check.policyFiles,
    });

    const run = runInPlace(analyzer, projectRoot);

    expect(run.toolErrors).toEqual([]);
    expect(run.reports.get('eslint-lint')?.findings).toEqual([]);
    expect(
      run.reports.get('eslint-lint')?.findings.every(({ rule }) => rule !== 'eslint/parser-error'),
    ).toBe(true);
    expect(temporaryPolicyLinks(projectRoot)).toEqual([]);
  });

  it('cruise a project with the default dependency-cruiser config without tool errors', () => {
    const projectRoot = createProject();
    const check = staticChecks.find(({ name }) => name === 'dependency-architecture');
    const analyzer = createStaticCheckAnalyzer({ ...check, configurationHash: 'fixture' });

    const run = runInPlace(analyzer, projectRoot);

    expect(run.toolErrors).toEqual([]);
    expect(run.reports.get('dependency-architecture')?.findings).toEqual([]);
    expect(temporaryPolicyLinks(projectRoot)).toEqual([]);
  });

  it('builds the dependency graph with the policy TypeScript config without tool errors', () => {
    const projectRoot = createProject();
    const analyzer = createEntryPointAnalyzer({
      version: 'fixture',
      configurationHash: 'fixture',
      exclusions: entryPointsCheck.exclusions,
      sourceRoot: entryPointsCheck.sourceRoot,
    });

    const run = runInPlace(analyzer, projectRoot);

    expect(run.toolErrors).toEqual([]);
    expect(run.reports.get('entry-points')?.findings).toEqual([]);
    expect(temporaryPolicyLinks(projectRoot)).toEqual([]);
  });
});

function runInPlace(analyzers, projectRoot) {
  return runAnalyzers({
    analyzers: Array.isArray(analyzers) ? analyzers : [analyzers],
    projectRoot,
    policyRoot: projectRoot,
    toolRoot: packageRoot,
    liveProjectRoot: packageRoot,
    snapshot: 'head',
  });
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
    'src/main/greeting.ts': [
      'export function greeting(name: string): string {',
      '  return `Hello, ${name}`;',
      '}',
      '',
    ].join('\n'),
    'src/main/index.ts': [
      "import { greeting } from './greeting.js';",
      '',
      "export const message = greeting('world');",
      '',
    ].join('\n'),
    'tests/unit/greeting.test.ts': [
      "import { describe, expect, it } from 'vitest';",
      "import { greeting } from '../../src/main/greeting.js';",
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
