import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createEntryPointAnalyzer } from '../../adapters/diff/entry-points.mjs';
import { createEslintAnalyzer } from '../../adapters/diff/eslint.mjs';
import { createStaticCheckAnalyzer } from '../../adapters/diff/static-checks.mjs';
import { runAnalyzers } from '../../core/diff/run-analyzers.mjs';
import { entryPointsCheck, eslintChecks, staticChecks } from '../quality-checks.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../..');
const POLICY_PATHS = [
  'adapters/policy-links.mjs',
  'preset/defaults',
  'preset/dependency-graph',
  'preset/entry-points/analyze.mjs',
  'preset/eslint-config',
  'preset/eslint-plugin/index.mjs',
  'preset/eslint-plugin/rules',
];
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('default configs used in place', () => {
  it('lint a project with the default ESLint config without parse or tool errors', () => {
    const projectRoot = createProject();
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

function runInPlace(analyzer, projectRoot) {
  return runAnalyzers({
    analyzers: [analyzer],
    projectRoot,
    policyRoot: projectRoot,
    toolRoot: packageRoot,
    snapshot: 'head',
  });
}

function createProject() {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-diff-'));
  temporaryRoots.push(temporaryRoot);
  const projectRoot = path.join(temporaryRoot, 'base');
  for (const relativePath of POLICY_PATHS) {
    cpSync(path.join(packageRoot, relativePath), path.join(projectRoot, relativePath), {
      recursive: true,
    });
  }
  writeFiles(projectRoot, {
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
  });
  return projectRoot;
}

function temporaryPolicyLinks(projectRoot) {
  return readdirSync(projectRoot).filter((entry) => entry.startsWith('.quality-'));
}

function writeFiles(root, files) {
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }
}
