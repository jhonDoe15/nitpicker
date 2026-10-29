import {
  createGitTemplate,
  copyGitTemplate,
} from '../../../core/diff/git/test-support/git-repository.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runCli } from '../../../core/cli.mjs';
import { withDefaultAnalyzerParallelism } from '../../../core/diff/execution/test-support/analyzer-parallelism.mjs';
import { runAnalyzers } from '../../../core/diff/execution/run-analyzers.mjs';
import { applyLayout, configuredAnalyzers } from '../preset/diff/configured-analyzers.mjs';
import { resolveHeadPolicy, withHeadPolicyFile } from '../preset/head-policy.mjs';

const packageAnalyzers = configuredAnalyzers();
// Every runner and tool is pointed at a project whose sources live in `lib/` and whose tests live
// in `spec/`, and told to leave `lib/legacy/` and `spec/legacy/` alone. Each analyzer must report
// the violation planted in `lib/live/` (the custom root is analyzed) and none from the excluded
// copies of the same violation (the exclusion is honored).

const packageRoot = path.resolve(import.meta.dirname, '../../..');
const TOOL_TIMEOUT_MS = 60_000;
const temporaryRoots = [];

const customConfig = {
  exclude: ['lib/legacy/**', 'spec/legacy/**'],
  layout: { sourceRoots: ['lib'], testRoots: ['spec'] },
};
const customPolicy = resolveHeadPolicy(customConfig);
const customAnalyzers = applyLayout(packageAnalyzers, customPolicy);

const ANALYZER_NAMES = [
  'eslint-lint',
  'prettier-format',
  'typescript-typecheck',
  'dependency-architecture',
  'entry-points',
  'coding-standards',
  'coupling',
  'structure',
  'duplicates',
  'test-runtime',
];

afterAll(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('custom layout and exclude across runners and tools', () => {
  let run;

  beforeAll(() => {
    run = analyze(ANALYZER_NAMES, fixtureFiles());
  }, TOOL_TIMEOUT_MS);

  it('runs every analyzer without a tool error', () => {
    expect(run.toolErrors).toEqual([]);
    expect([...run.reports.keys()].sort()).toEqual([...ANALYZER_NAMES].sort());
  });

  it.each([
    ['eslint-lint', 'lib/live/lint.ts'],
    ['prettier-format', 'lib/live/format.ts'],
    ['typescript-typecheck', 'lib/live/types.ts'],
    ['dependency-architecture', 'lib/live/uses-spec.ts'],
    ['entry-points', 'lib/live/bypass.ts'],
    ['coding-standards', 'lib/live/assertion.ts'],
    ['structure', 'lib/live/dup-a.ts'],
    ['duplicates', 'lib/live/dup-a.ts'],
    ['duplicates', 'spec/live/copy-a.test.ts'],
    ['test-runtime', 'spec/live.test.ts'],
  ])('%s analyzes the custom lib/ and spec/ roots', (name, expectedPath) => {
    expect(findingPaths(run, name)).toContain(expectedPath);
  });

  it.each(ANALYZER_NAMES)('%s reports nothing from excluded paths', (name) => {
    expect(findingPaths(run, name).filter(isExcludedPath)).toEqual([]);
  });

  it('reports coupling metrics for the custom root only', () => {
    const paths = findingPaths(run, 'coupling', { includeDescriptive: true }).filter(
      (findingPath) => findingPath !== '.',
    );
    expect([...new Set(paths)].sort()).toEqual([
      'lib/alpha/index.ts',
      'lib/alpha/internal.ts',
      'lib/live/assertion.ts',
      'lib/live/bypass.ts',
      'lib/live/dup-a.ts',
      'lib/live/dup-b.ts',
      'lib/live/format.ts',
      'lib/live/lint.ts',
      'lib/live/types.ts',
      'lib/live/unused.ts',
      'lib/live/uses-spec.ts',
    ]);
    expect(paths.filter(isExcludedPath)).toEqual([]);
    expect(paths.filter((findingPath) => findingPath.startsWith('src/'))).toEqual([]);
  });

  it('finds nothing in lib/ and spec/ when the config does not change the layout', () => {
    const defaultRun = analyze(
      ['dependency-architecture', 'typescript-typecheck', 'entry-points', 'test-runtime'],
      fixtureFiles(),
      resolveHeadPolicy({}),
      packageAnalyzers,
    );
    expect(defaultRun.toolErrors).toEqual([]);
    for (const name of [
      'dependency-architecture',
      'typescript-typecheck',
      'entry-points',
      'test-runtime',
    ]) {
      expect(findingPaths(defaultRun, name)).toEqual([]);
    }
  });
});

describe('with many exclude globs', () => {
  it('keeps the dependency-cruiser exclude pattern short enough for its safety check', () => {
    const exclude = Array.from({ length: 14 }, (_, index) => `lib/generated-${String(index)}/**`);
    const policy = resolveHeadPolicy({ ...customConfig, exclude });
    const run = analyze(
      ['dependency-architecture'],
      fixtureFiles(),
      policy,
      applyLayout(packageAnalyzers, policy),
    );
    expect(run.toolErrors).toEqual([]);
  });
});

describe('without exclude', () => {
  it.each(['dependency-architecture', 'typescript-typecheck', 'entry-points', 'prettier-format'])(
    'reports the same %s violations from lib/legacy, so the exclusions above are what hides them',
    (name) => {
      const layoutOnly = resolveHeadPolicy({ layout: customConfig.layout });
      const withoutExclude = analyze(
        [name],
        fixtureFiles(),
        layoutOnly,
        applyLayout(packageAnalyzers, layoutOnly),
      );

      expect(withoutExclude.toolErrors).toEqual([]);
      expect(findingPaths(withoutExclude, name).filter(isExcludedPath)).not.toEqual([]);
    },
  );
});

describe('custom layout and exclude for tools that need project dependencies', () => {
  it('limits knip dead-code analysis to the custom roots and skips excluded files', () => {
    const run = analyze(['dead-code'], {
      ...fixtureFiles(),
      'package.json': readPackageFile('package.json'),
      'package-lock.json': readPackageFile('package-lock.json'),
    });
    expect(run.toolErrors).toEqual([]);
    const paths = findingPaths(run, 'dead-code');
    expect([...new Set(paths)].sort()).toEqual([
      'lib/alpha/index.ts',
      'lib/alpha/internal.ts',
      'lib/live/assertion.ts',
      'lib/live/bypass.ts',
      'lib/live/dup-a.ts',
      'lib/live/dup-b.ts',
      'lib/live/format.ts',
      'lib/live/lint.ts',
      'lib/live/types.ts',
      'lib/live/unused.ts',
      'lib/live/uses-spec.ts',
      'package.json',
      'spec/helper.ts',
    ]);
    expect(paths.filter(isExcludedPath)).toEqual([]);
  });

  it('measures coverage and CRAP over the custom roots without running excluded tests', () => {
    const run = analyze(['coverage', 'crap'], {
      'lib/greet.ts':
        'export function greet(name: string): string {\n  return name.length > 0 ? `Hello, ${name}` : "Hello";\n}\n',
      'spec/greet.test.ts':
        "import { beforeAll, expect, it } from 'vitest';\nimport { greet } from '../lib/greet.js';\n\nit('greets', () => {\n  expect(greet('world')).toBe('Hello, world');\n});\n",
      'lib/legacy/old.ts': 'export const old = 1;\n',
      'spec/legacy/old.test.ts':
        "import { beforeAll, expect, it } from 'vitest';\nimport { old } from '../../lib/legacy/old.js';\n\nit('is broken on purpose', () => {\n  expect(old).toBe(2);\n});\n",
      'package.json': readPackageFile('package.json'),
      'package-lock.json': readPackageFile('package-lock.json'),
    });
    expect(run.toolErrors).toEqual([]);
    const coveragePaths = findingPaths(run, 'coverage', { includeDescriptive: true });
    expect([...new Set(coveragePaths)].sort()).toEqual(['.', 'lib/greet.ts']);
    expect(coveragePaths.filter(isExcludedPath)).toEqual([]);
    // CRAP selects files from the layout roots: only lib/greet.ts, not lib/legacy/old.ts.
    expect(metricValue(run, 'crap', 'summary:files')).toBe(1);
    expect(metricValue(run, 'crap', 'summary:functions')).toBe(1);
  });
});

describe('custom layout through the command line', () => {
  let gitTemplateRoot;

  beforeAll(() => {
    gitTemplateRoot = createGitTemplate();
  });

  it('reads layout and exclude from nitpicker.config.json for a full snapshot run', () => {
    const projectRoot = createGitProject(
      {
        ...fixtureFiles(),
        'nitpicker.config.json': `${JSON.stringify(customConfig)}\n`,
      },
      gitTemplateRoot,
    );
    const chunks = [];
    const exitCode = runCli({
      arguments_: ['--all', '--analyzer', 'dependency-architecture', '--output', 'out'],
      currentProjectRoot: projectRoot,
      stdout: { write: (text) => chunks.push(text) },
      stderr: { write: (text) => chunks.push(text) },
    });
    const output = chunks.join('');
    expect(exitCode).toBe(1);
    expect(output).toEqual(
      'nitpicker: head: running 1 analyzer\nNitpicker quality snapshot\nStatus: violations\nEnforceable findings: 1\nDescriptive findings: 0\nTool errors: 0\n\nPer-tool counts:\ndependency-architecture: total=1 enforceable=1 descriptive=0\n\nEnforceable findings:\ndependency-architecture/no-production-to-test lib/live/uses-spec.ts lib/live/uses-spec.ts must not depend on spec/helper.ts. If this is intended, add {"rule":"no-production-to-test","paths":["lib/live/uses-spec.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.\n',
    );
    expect(output).not.toContain('lib/legacy');
  });
});

describe('applyLayout', () => {
  it('rebuilds the preset analyzers with the config roots and exclusions', () => {
    const eslint = customAnalyzers.find(({ name }) => name === 'eslint-lint');
    const invocation = eslint.createInvocation({
      projectRoot: '/p',
      policyRoot: '/p',
      toolRoot: packageRoot,
    });
    expect(new Set(invocation.args)).toEqual(
      new Set([
        '--analyzer-name',
        '--config',
        '--pattern',
        '--policy-file',
        '--policy-root',
        '--project-root',
        '--tool-root',
        '/p',
        packageRoot,
        `${packageRoot}/languages/typescript/adapters/eslint-runner.mjs`,
        'eslint-lint',
        'languages/typescript/preset/defaults/eslint.config.mjs',
        'languages/typescript/preset/defaults/tsconfig.quality.json',
        'lib/**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
        'lib/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
        'spec/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      ]),
    );
    expect(invocation.args).not.toContain('src/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}');
    expect([...new Set(eslint.exclusions)].sort()).toEqual([
      '**/node_modules/**',
      '.stryker-tmp/**',
      'build/**',
      'coverage/**',
      'dist/**',
      'generated/**',
      'lib/legacy/**',
      'reports/quality/**',
      'spec/legacy/**',
      'target/**',
    ]);
    const entryPoints = customAnalyzers
      .find(({ name }) => name === 'entry-points')
      .createInvocation({ projectRoot: '/p', policyRoot: '/p', toolRoot: packageRoot });
    expect(entryPoints.args.slice(entryPoints.args.indexOf('--source-root'))).toEqual([
      '--source-root',
      'lib',
    ]);
  });

  it('keeps the shared default analyzers when the config changes neither', () => {
    expect(applyLayout(packageAnalyzers, resolveHeadPolicy({}))).toBe(packageAnalyzers);
    expect(applyLayout(packageAnalyzers, resolveHeadPolicy({ layout: {} }))).toBe(packageAnalyzers);
  });

  it('leaves custom and injected analyzers alone', () => {
    const custom = { name: 'custom', createInvocation() {} };
    const [kept] = applyLayout([custom], customPolicy);
    expect(kept).toBe(custom);
  });
});

function isExcludedPath(findingPath) {
  return findingPath.startsWith('lib/legacy/') || findingPath.startsWith('spec/legacy/');
}

function findingPaths(run, name, { includeDescriptive = false } = {}) {
  return (run.reports.get(name)?.findings ?? [])
    .filter((finding) => includeDescriptive || finding.classification === 'enforceable')
    .map((finding) => finding.path);
}

function metricValue(run, name, identity) {
  const finding = run.reports.get(name)?.findings.find((entry) => entry.identity === identity);
  return finding?.metric?.value;
}

function readPackageFile(name) {
  return readFileSync(path.join(packageRoot, name), 'utf8');
}

function fixtureFiles() {
  return {
    ...violations('live'),
    ...violations('legacy'),
    'lib/alpha/index.ts': "export { internal } from './internal.js';\n",
    'lib/alpha/internal.ts': 'export const internal = 1;\n',
    'spec/helper.ts': 'export const helper = 1;\n',
    'spec/live.test.ts': passingTest(),
    'spec/legacy/old.test.ts': passingTest(),
    'spec/live/copy-a.test.ts': cloneSource(5),
    'spec/live/copy-b.test.ts': cloneSource(5),
    'spec/legacy/copy-a.test.ts': cloneSource(7),
    'spec/legacy/copy-b.test.ts': cloneSource(7),
  };
}

function passingTest() {
  return "import { beforeAll, expect, it } from 'vitest';\n\nit('checks', () => {\n  expect(1).toBe(1);\n});\n";
}

// One file per tool, planted in `lib/<directory>/`: formatting, a type error, a lint error, a
// production-to-test import, a clone pair, an unused file, a type assertion and a bypass of a
// component's public entry point.
function cloneSource(factor) {
  const statements = Array.from(
    { length: 12 },
    (_, index) =>
      `  const value${String(index)} = input * ${String(index + factor)} + offset(${String(index)});\n  total += value${String(index)} % 7;`,
  ).join('\n');
  return `export function compute(input: number, offset: (n: number) => number): number {\n  let total = 0;\n${statements}\n  return total;\n}\n`;
}

function violations(directory) {
  const clone = cloneSource(3);
  return {
    [`lib/${directory}/format.ts`]: 'export const   ugly  =  1;\n',
    [`lib/${directory}/types.ts`]: "export const wrong: number = 'text';\n",
    [`lib/${directory}/lint.ts`]: 'export function lint(value: any): any {\n  return value;\n}\n',
    [`lib/${directory}/uses-spec.ts`]:
      "import { helper } from '../../spec/helper.js';\n\nexport const used = helper;\n",
    [`lib/${directory}/dup-a.ts`]: clone,
    [`lib/${directory}/dup-b.ts`]: clone,
    [`lib/${directory}/unused.ts`]: 'export const unused = 1;\n',
    [`lib/${directory}/assertion.ts`]:
      'export function asserted() {\n  try {\n    run();\n  } catch (error) {\n    throw new Error(String(error));\n  }\n}\n',
    [`lib/${directory}/bypass.ts`]:
      "import { internal } from '../alpha/internal.js';\n\nexport const bypass = internal;\n",
  };
}

function analyze(names, files, policy = customPolicy, analyzers = customAnalyzers) {
  const projectRoot = createProject(files);
  // The tools are independent, so they run side by side as they do for a user.
  return withDefaultAnalyzerParallelism(() =>
    withHeadPolicyFile(policy, (headPolicyFile) =>
      runAnalyzers({
        analyzers: analyzers.filter((analyzer) => names.includes(analyzer.name)),
        projectRoot,
        policyRoot: projectRoot,
        toolRoot: packageRoot,
        liveProjectRoot: packageRoot,
        snapshot: 'head',
        headPolicyFile,
      }),
    ),
  );
}

function createProject(files) {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-diff-'));
  temporaryRoots.push(temporaryRoot);
  const projectRoot = path.join(temporaryRoot, 'base');
  writeFiles(projectRoot, files);
  if (files['package.json'] !== undefined) {
    symlinkSync(
      path.join(packageRoot, 'node_modules'),
      path.join(projectRoot, 'node_modules'),
      'dir',
    );
  }
  return projectRoot;
}

function createGitProject(files, templateRoot) {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-layout-cli-'));
  temporaryRoots.push(temporaryRoot);
  const projectRoot = path.join(temporaryRoot, 'repo');
  writeFiles(projectRoot, files);
  const git = (...arguments_) =>
    execFileSync('git', arguments_, {
      cwd: projectRoot,
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
    });
  copyGitTemplate(templateRoot, projectRoot);
  git('config', 'user.name', 'Layout Fixture');
  git('config', 'user.email', 'layout@example.invalid');
  git('add', '-A');
  git('commit', '-q', '-m', 'fixture');
  return projectRoot;
}

function writeFiles(root, files) {
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }
}
