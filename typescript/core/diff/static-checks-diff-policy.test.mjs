import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createStaticCheckAnalyzer } from '../../adapters/diff/static-checks.mjs';
import {
  dependencyPreparationMode,
  normalizeArchitectureViolations,
} from '../../adapters/diff/static-checks-runner.mjs';
import { configuredAnalyzers } from '../../preset/diff/configured-analyzers.mjs';
import { runQualityDiff } from './run-diff.mjs';

const toolRoot = path.resolve(import.meta.dirname, '../..');
const staticCheckRunner = path.join(toolRoot, 'adapters/diff/static-checks-runner.mjs');
const temporaryRoots = [];

afterEach(() => {
  for (const temporaryRoot of temporaryRoots.splice(0)) {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

describe('static differential adapters', () => {
  it(
    'reports new formatting, type, and architecture findings',
    {
      timeout: 120_000,
    },
    () => {
      const repository = createRepository({
        ...policyFiles(),
        'src/main/server.ts': 'export const server = true;\n',
        'src/main/auth/logic.ts': 'export const valid: number = 1;\n',
        'src/main/ignored/ignored.ts': 'export const ignored=true\n',
        'tests/placeholder.ts': 'export const placeholder = true;\n',
      });
      writeFiles(repository.root, {
        'src/main/auth/logic.ts': [
          "import { server } from '../server.js'",
          "export const valid:number = 'broken'",
          'void server',
          '',
        ].join('\n'),
      });
      commit(repository.root, 'introduce static findings');

      const report = runQualityDiff({
        repositoryRoot: repository.root,
        projectRelativePath: '.',
        headProjectRoot: toolRoot,
        requestedBaseRef: repository.baseRef,
        outputRoot: path.join(repository.root, 'reports/quality/diff'),
        analyzers: fixtureAnalyzers(),
      });

      expect(report.toolErrors).toEqual([]);
      expect(report.summary.overallStatus).toBe('completed');
      expect(new Set(report.newFindings.map((finding) => finding.tool))).toEqual(
        new Set(['prettier-format', 'typescript-typecheck', 'dependency-architecture']),
      );
      expect(report.newFindings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            tool: 'prettier-format',
            path: 'src/main/auth/logic.ts',
            rule: 'prettier/prettier',
          }),
          expect.objectContaining({
            tool: 'typescript-typecheck',
            path: 'src/main/auth/logic.ts',
            rule: 'TS2322',
          }),
          expect.objectContaining({
            tool: 'dependency-architecture',
            path: 'src/main/auth/logic.ts',
            rule: 'features-do-not-import-bootstrap',
          }),
        ]),
      );
    },
  );

  it(
    'reports added formatting drift in an already unformatted file',
    {
      timeout: 120_000,
    },
    () => {
      const repository = createRepository({
        ...policyFiles(),
        'src/main/auth/logic.ts': 'export const first={value:1}\n',
        'tests/placeholder.ts': 'export const placeholder = true;\n',
      });
      writeFiles(repository.root, {
        'src/main/auth/logic.ts': [
          'export const first={value:1}',
          'export const second={value:2}',
          '',
        ].join('\n'),
      });
      commit(repository.root, 'add formatting drift');

      const report = runQualityDiff({
        repositoryRoot: repository.root,
        projectRelativePath: '.',
        headProjectRoot: toolRoot,
        requestedBaseRef: repository.baseRef,
        outputRoot: path.join(repository.root, 'reports/quality/diff'),
        analyzers: [
          analyzer({
            name: 'prettier-format',
            kind: 'prettier',
            configRelativePath: '.prettierrc.json',
            ignoreRelativePath: '.prettierignore',
            patterns: ['src/main/**/*.ts', 'tests/**/*.ts'],
          }),
        ],
      });

      expect(report.toolErrors).toEqual([]);
      expect(report.newFindings).toEqual([
        expect.objectContaining({
          tool: 'prettier-format',
          path: 'src/main/auth/logic.ts',
        }),
      ]);
      expect(report.resolvedFindings).toHaveLength(1);
      expect(report.unchangedFindings).toEqual([]);
    },
  );

  it('ignores generated quality-diff files during formatting checks', () => {
    const projectRoot = generatedSnapshot();
    writeFiles(projectRoot, {
      '.quality-diff-dependency-cruiser.config.mjs': 'export default{temporary:true}\n',
      'src/main/formatted.ts': 'export const formatted = true;\n',
    });

    const result = runStaticCheckAdapter([
      '--analyzer-name',
      'prettier-format',
      '--kind',
      'prettier',
      '--project-root',
      projectRoot,
      '--policy-root',
      toolRoot,
      '--config',
      'preset/defaults/.prettierrc.json',
      '--ignore-path',
      'preset/defaults/.prettierignore',
      '--pattern',
      '*.{ts,mts,mjs,json}',
      '--pattern',
      'src/main/**/*.ts',
    ]);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ findings: [] });
  });

  it('canonicalizes equivalent dependency cycle rotations', () => {
    const first = normalizeArchitectureViolations(
      architectureReport(['src/main/b.ts', 'src/main/c.ts', 'src/main/a.ts'], 'src/main/b.ts'),
      'dependency-architecture',
    );
    const second = normalizeArchitectureViolations(
      architectureReport(['src/main/a.ts', 'src/main/b.ts', 'src/main/c.ts'], 'src/main/a.ts'),
      'dependency-architecture',
    );

    expect(first[0].identity).toBe(second[0].identity);
    expect(first[0].path).toBe(second[0].path);
    expect(first[0].path).toBe('src/main/a.ts');
  });

  it('installs merge-base dependencies when dependency manifests differ', () => {
    const projectRoot = temporaryDirectory('base-dependencies-');
    const policyRoot = temporaryDirectory('head-dependencies-');
    writeFiles(projectRoot, {
      'package.json': '{"name":"fixture"}\n',
      'package-lock.json': '{"lockfileVersion":3}\n',
    });
    writeFiles(policyRoot, {
      'package.json': '{"name":"fixture"}\n',
      'package-lock.json': '{"lockfileVersion":3}\n',
    });

    expect(dependencyPreparationMode({ projectRoot, liveProjectRoot: policyRoot })).toBe('link');

    writeFiles(policyRoot, {
      'package-lock.json': '{"lockfileVersion":3,"packages":{"node_modules/example":{}}}\n',
    });

    expect(dependencyPreparationMode({ projectRoot, liveProjectRoot: policyRoot })).toBe('install');
    expect(
      dependencyPreparationMode({
        projectRoot: toolRoot,
        liveProjectRoot: toolRoot,
      }),
    ).toBe('existing');
  });

  it(
    'typechecks the merge base with its own dependency tree',
    {
      timeout: 120_000,
    },
    () => {
      const projectRoot = generatedSnapshot();
      const policyRoot = generatedSnapshot();
      const packageJson = {
        name: 'base-dependency-fixture',
        version: '1.0.0',
        private: true,
        dependencies: {
          'fixture-types': 'file:vendor/fixture-types',
        },
      };
      const typeScriptConfig = JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          strict: true,
          skipLibCheck: true,
        },
        include: ['src/**/*.ts'],
      });
      writeFiles(projectRoot, {
        'package.json': `${JSON.stringify(packageJson)}\n`,
        'vendor/fixture-types/package.json':
          '{"name":"fixture-types","version":"1.0.0","types":"index.d.ts"}\n',
        'vendor/fixture-types/index.d.ts':
          'export interface FixtureValue { readonly value: string }\n',
        'src/fixture.ts': [
          "import type { FixtureValue } from 'fixture-types';",
          "export const fixture: FixtureValue = { value: 'base' };",
          '',
        ].join('\n'),
        'tsconfig.quality.json': `${typeScriptConfig}\n`,
      });
      execFileSync(
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'],
        { cwd: projectRoot, encoding: 'utf8' },
      );
      const packageLock = readFileSync(path.join(projectRoot, 'package-lock.json'), 'utf8');
      const liveProjectRoot = temporaryDirectory('live-project-dependencies-');
      const livePackageJson = { ...packageJson, version: '2.0.0' };
      writeFiles(policyRoot, {
        'package.json': `${JSON.stringify(livePackageJson)}\n`,
        'package-lock.json': packageLock,
        'tsconfig.quality.json': `${typeScriptConfig}\n`,
      });
      writeFiles(liveProjectRoot, {
        'package.json': `${JSON.stringify(livePackageJson)}\n`,
        'package-lock.json': packageLock,
      });
      symlinkSync(
        path.join(toolRoot, 'node_modules'),
        path.join(liveProjectRoot, 'node_modules'),
        'dir',
      );
      expect(dependencyPreparationMode({ projectRoot, liveProjectRoot })).toBe('install');

      const result = runStaticCheckAdapter([
        '--analyzer-name',
        'typescript-typecheck',
        '--kind',
        'typecheck',
        '--project-root',
        projectRoot,
        '--live-project-root',
        liveProjectRoot,
        '--policy-root',
        policyRoot,
        '--config',
        'tsconfig.quality.json',
      ]);

      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ findings: [] });
      expect(existsSync(path.join(projectRoot, 'node_modules'))).toBe(false);
    },
  );

  it('rejects filesystem roots outside trusted or generated worktrees', () => {
    const untrustedRoot = temporaryDirectory('untrusted-static-root-');
    const result = runStaticCheckAdapter([
      '--analyzer-name',
      'prettier-format',
      '--kind',
      'prettier',
      '--project-root',
      untrustedRoot,
      '--policy-root',
      untrustedRoot,
      '--config',
      '.prettierrc.json',
      '--ignore-path',
      '.prettierignore',
      '--pattern',
      'src/main/**/*.ts',
    ]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('must be inside a generated quality-diff worktree');
  });

  it.each([['single-command', configuredAnalyzers]])(
    'includes all deterministic static checks in the %s analyzer catalog',
    (_dial, analyzers) => {
      expect(analyzers.map(({ name }) => name)).toEqual(
        expect.arrayContaining([
          'prettier-format',
          'typescript-typecheck',
          'dependency-architecture',
        ]),
      );
    },
  );
});

function fixtureAnalyzers() {
  return [
    analyzer({
      name: 'prettier-format',
      kind: 'prettier',
      configRelativePath: '.prettierrc.json',
      ignoreRelativePath: '.prettierignore',
      patterns: ['src/main/**/*.ts', 'tests/**/*.ts'],
    }),
    analyzer({
      name: 'typescript-typecheck',
      kind: 'typecheck',
      configRelativePath: 'tsconfig.quality.json',
    }),
    analyzer({
      name: 'dependency-architecture',
      kind: 'architecture',
      configRelativePath: 'dependency-cruiser.config.mjs',
      patterns: ['src/main', 'tests'],
      includeOnly: '^(src/main|tests)',
    }),
  ];
}

function analyzer(options) {
  return createStaticCheckAnalyzer({
    version: 'fixture',
    configurationHash: 'fixture',
    exclusions: [],
    ...options,
  });
}

function policyFiles() {
  return {
    '.prettierrc.json': '{"singleQuote":true}\n',
    '.prettierignore': 'src/main/ignored/\n',
    'tsconfig.quality.json': `${JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        skipLibCheck: true,
      },
      include: ['src/main/**/*.ts', 'tests/**/*.ts'],
    })}\n`,
    'dependency-cruiser.config.mjs': [
      'export default {',
      '  forbidden: [',
      '    {',
      "      name: 'features-do-not-import-bootstrap',",
      "      severity: 'error',",
      "      from: { path: '(?:^|/)src/main/auth/' },",
      "      to: { path: '(?:^|/)src/main/server\\\\.ts$' },",
      '    },',
      '  ],',
      '  required: [],',
      '  options: {',
      "    tsConfig: { fileName: 'tsconfig.quality.json' },",
      "    tsPreCompilationDeps: 'specify',",
      "    enhancedResolveOptions: { extensions: ['.ts', '.js'] },",
      '  },',
      '};',
      '',
    ].join('\n'),
  };
}

function architectureReport(cycle, from = 'src/main/a.ts') {
  return {
    summary: {
      violations: [
        {
          type: 'cycle',
          from,
          to: 'src/main/b.ts',
          rule: { name: 'no-production-cycles', severity: 'error' },
          cycle: cycle.map((name) => ({ name })),
        },
      ],
    },
  };
}

function createRepository(initialFiles) {
  const root = mkdtempSync(path.join(tmpdir(), 'static-quality-diff-'));
  temporaryRoots.push(root);
  git(root, ['init', '-q', '--initial-branch=main']);
  git(root, ['config', 'user.name', 'Static Diff Fixture']);
  git(root, ['config', 'user.email', 'static-diff@example.invalid']);
  writeFiles(root, initialFiles);
  commit(root, 'base');
  const baseRef = 'comparison-base';
  git(root, ['branch', baseRef, 'HEAD']);
  return { root, baseRef };
}

function temporaryDirectory(prefix) {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

function generatedSnapshot() {
  const temporaryRoot = temporaryDirectory('nitpicker-diff-');
  const root = path.join(temporaryRoot, 'base');
  mkdirSync(root);
  return root;
}

function writeFiles(repositoryRoot, files) {
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(repositoryRoot, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }
}

function commit(repositoryRoot, message) {
  git(repositoryRoot, ['add', '-A']);
  git(repositoryRoot, ['commit', '-q', '-m', message]);
}

function runStaticCheckAdapter(arguments_) {
  return spawnSync(process.execPath, [staticCheckRunner, ...arguments_, '--tool-root', toolRoot], {
    encoding: 'utf8',
  });
}

function git(repositoryRoot, arguments_) {
  return execFileSync('git', arguments_, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
}
