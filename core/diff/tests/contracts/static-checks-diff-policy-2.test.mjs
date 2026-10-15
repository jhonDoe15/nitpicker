import { createGitTemplate, copyGitTemplate } from '../../fixtures/git-repository.mjs';
import {
  expectedOutput471_27,
  expectedOutput477_49,
} from '../../fixtures/expected-output/core-diff-static-checks-diff-policy.mjs';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll, afterEach, describe, expect, it } from 'vitest';
import { createStaticCheckAnalyzer } from '../../../../languages/typescript/adapters/static-checks/analyzer.mjs';
import { dependencyPreparationMode } from '../../../../languages/typescript/adapters/static-checks/dependencies.mjs';
import { configuredAnalyzers } from '../../../../languages/typescript/preset/diff/configured-analyzers.mjs';
import { withDefaultAnalyzerParallelism } from '../../fixtures/analyzer-parallelism.mjs';
import { runQualityDiff } from '../../comparison/run-diff.mjs';

const toolRoot = path.resolve(new URL('../../', import.meta.url).pathname, '../..');

const staticCheckRunner = path.join(
  toolRoot,
  'languages/typescript/adapters/static-checks-runner.mjs',
);

const temporaryRoots = [];

afterEach(() => {
  for (const temporaryRoot of temporaryRoots.splice(0)) {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
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
        lib: ['ES2022'],
        types: [],
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

function createRepository(initialFiles) {
  const root = mkdtempSync(path.join(tmpdir(), 'static-quality-diff-'));
  temporaryRoots.push(root);
  copyGitTemplate(gitTemplate.root, root);
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
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  });
}

const gitTemplate = { root: undefined };

beforeAll(() => {
  gitTemplate.root = createGitTemplate();
});

describe('static differential adapters', () => {
  // One difference run (prettier, tsc and dependency-cruiser on the merge base and on the head)
  // answers both tests below: `logic.ts` gains a formatting, a type and an architecture finding,
  // and `drift.ts` is unformatted on both sides and gains another unformatted line.
  let difference;

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
          lib: ['ES2022'],
          types: [],
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
      // What `npm install --package-lock-only` writes for this package.json (checked in as a literal:
      // the fixture's setup, not the code under test, so it does not need its own npm process).
      const packageLock = `${JSON.stringify({
        name: packageJson.name,
        version: packageJson.version,
        lockfileVersion: 3,
        requires: true,
        packages: {
          '': {
            name: packageJson.name,
            version: packageJson.version,
            dependencies: packageJson.dependencies,
          },
          'node_modules/fixture-types': { resolved: 'vendor/fixture-types', link: true },
          'vendor/fixture-types': { version: '1.0.0' },
        },
      })}\n`;
      writeFiles(projectRoot, { 'package-lock.json': packageLock });
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
    expect(result.stderr).toEqual(expectedOutput471_27());
  });
  it.each([['single-command', configuredAnalyzers]])(
    'includes all deterministic static checks in the %s analyzer catalog',
    (_dial, analyzers) => {
      expect([...new Set(analyzers.map(({ name }) => name))].sort()).toEqual(
        expectedOutput477_49(),
      );
    },
  );
});
