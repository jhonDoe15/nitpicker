import { createGitTemplate, copyGitTemplate } from '../../fixtures/git-repository.mjs';

import {
  expectedOutput87_34,
  expectedOutput119_53,
  expectedOutput166_40,
  expectedOutput177_34,
  expectedOutput201_34,
  expectedOutput213_34,
  expectedOutput261_34,
  expectedOutput275_68,
} from '../../fixtures/expected-output/core-diff-static-checks-diff-policy.mjs';

import { execFileSync, spawnSync } from 'node:child_process';

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';

import { tmpdir } from 'node:os';

import path from 'node:path';

import { beforeAll, afterEach, describe, expect, it } from 'vitest';

import { createStaticCheckAnalyzer } from '../../../../languages/typescript/adapters/static-checks/analyzer.mjs';

import { normalizeArchitectureViolations } from '../../../../languages/typescript/adapters/static-checks-runner.mjs';

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

function filler(count) {
  return Array.from(
    { length: count },
    (_, index) => `export const f${String(index)} = ${String(index)};`,
  );
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
  function runStaticDifference() {
    if (difference !== undefined) {
      return difference;
    }
    const repository = createRepository({
      ...policyFiles(),
      'src/main/server.ts': 'export const server = true;\n',
      'src/main/auth/logic.ts': 'export const valid: number = 1;\n',
      'src/main/auth/drift.ts': 'export const first={value:1}\n',
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
      'src/main/auth/drift.ts': [
        'export const first={value:1}',
        'export const second={value:2}',
        '',
      ].join('\n'),
    });
    commit(repository.root, 'introduce static findings');

    difference = withDefaultAnalyzerParallelism(() =>
      runQualityDiff({
        repositoryRoot: repository.root,
        projectRelativePath: '.',
        headProjectRoot: toolRoot,
        requestedBaseRef: repository.baseRef,
        outputRoot: path.join(repository.root, 'reports/quality/diff'),
        analyzers: fixtureAnalyzers(),
      }),
    );
    return difference;
  }
  const atPath = (findings, filePath) => findings.filter((finding) => finding.path === filePath);
  it(
    'reports new formatting, type, and architecture findings',
    {
      timeout: 120_000,
    },
    () => {
      const report = runStaticDifference();

      expect(report.toolErrors).toEqual([]);
      expect(report.summary.overallStatus).toBe('completed');
      expect(new Set(report.newFindings.map((finding) => finding.tool))).toEqual(
        new Set(['prettier-format', 'typescript-typecheck', 'dependency-architecture']),
      );
      expect(report.newFindings).toEqual(expectedOutput87_34());
    },
  );
  it(
    'reports added formatting drift in an already unformatted file',
    {
      timeout: 120_000,
    },
    () => {
      const report = runStaticDifference();
      const driftPath = 'src/main/auth/drift.ts';

      expect(report.toolErrors).toEqual([]);
      expect(atPath(report.newFindings, driftPath)).toEqual(expectedOutput119_53({ driftPath }));
      expect(atPath(report.resolvedFindings, driftPath)).toHaveLength(1);
      expect(atPath(report.unchangedFindings, driftPath)).toEqual([]);
    },
  );
  describe('prettier findings by touched lines', () => {
    const legacy = ['export const a={value:1}', ...filler(20), 'export const z = 1;', ''].join(
      '\n',
    );
    function prettierDiff(initialFiles, changedFiles) {
      const repository = createRepository({
        ...policyFiles(),
        'tests/placeholder.ts': 'export const placeholder = true;\n',
        ...initialFiles,
      });
      writeFiles(repository.root, changedFiles);
      commit(repository.root, 'change');
      return runQualityDiff({
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
    }
    it('keeps a legacy unformatted region baselined when the edit is far away', () => {
      const report = prettierDiff(
        { 'src/main/legacy.ts': legacy },
        { 'src/main/legacy.ts': legacy.replace('export const z = 1;', 'export const z = 2;') },
      );

      expect(report.toolErrors).toEqual([]);
      expect(report.newFindings).toEqual([]);
      expect(report.unchangedFindings).toEqual(expectedOutput166_40());
    });
    it('fails when the edit lands inside the unformatted region', () => {
      const report = prettierDiff(
        { 'src/main/legacy.ts': legacy },
        { 'src/main/legacy.ts': legacy.replace('value:1', 'value:2') },
      );

      expect(report.newFindings).toEqual(expectedOutput177_34());
    });
    it('keeps the finding identity stable when lines shift above the region', () => {
      const base = ['export const top = 1;', legacy].join('\n');
      const report = prettierDiff(
        { 'src/main/legacy.ts': base },
        {
          'src/main/legacy.ts': ['export const top = 1;', 'export const more = 1;', legacy].join(
            '\n',
          ),
        },
      );

      expect(report.newFindings).toEqual([]);
      expect(report.resolvedFindings).toEqual([]);
      expect(report.unchangedFindings).toHaveLength(1);
    });
    it('fails a new unformatted file', () => {
      const report = prettierDiff({}, { 'src/main/fresh.ts': 'export const fresh={a:1}\n' });

      expect(report.newFindings).toEqual(expectedOutput201_34());
    });
    it('fails a newly unformatted line in a formatted file', () => {
      const formatted = 'export const a = 1;\n';
      const report = prettierDiff(
        { 'src/main/ok.ts': formatted },
        { 'src/main/ok.ts': `${formatted}export const b={v:1}\n` },
      );

      expect(report.newFindings).toEqual(expectedOutput213_34());
    });
    it('keeps a formatted file clean', () => {
      const report = prettierDiff(
        { 'src/main/ok.ts': 'export const a = 1;\n' },
        { 'src/main/ok.ts': 'export const a = 2;\n' },
      );

      expect(report.newFindings).toEqual([]);
      expect(report.unchangedFindings).toEqual([]);
    });
  });
  describe('prettier precedence between the project and nitpicker configs', () => {
    function precedenceDiff(precedence) {
      const repository = createRepository({
        ...policyFiles(),
        '.prettierrc': '{ "semi": false, "singleQuote": false }\n',
        'tests/placeholder.ts': 'export const placeholder = true;\n',
      });
      writeFiles(repository.root, { 'src/main/fresh.ts': 'export const fresh = "a"\n' });
      commit(repository.root, 'change');
      return runQualityDiff({
        repositoryRoot: repository.root,
        projectRelativePath: '.',
        headProjectRoot: repository.root,
        requestedBaseRef: repository.baseRef,
        outputRoot: path.join(repository.root, 'reports/quality/diff'),
        headPolicy: precedence === undefined ? {} : { tools: { prettier: { precedence } } },
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
    }
    it('formats with the nitpicker config by default', () => {
      const report = precedenceDiff(undefined);

      expect(report.toolErrors).toEqual([]);
      expect(report.newFindings).toEqual(expectedOutput261_34());
    });
    it('formats with the project config when it alone is listed', () => {
      const report = precedenceDiff(['project']);

      expect(report.toolErrors).toEqual([]);
      expect(report.newFindings).toEqual([]);
    });
    it('merges both configs and lets the first listed win', () => {
      expect(precedenceDiff(['project', 'nitpicker']).newFindings).toEqual([]);
      expect(precedenceDiff(['nitpicker', 'project']).newFindings).toEqual(expectedOutput275_68());
    });
  });
  it('ignores generated quality-diff files during formatting checks', () => {
    const projectRoot = generatedSnapshot();
    writeFiles(projectRoot, {
      '.nitpicker-diff-dependency-cruiser.config.mjs': 'export default{temporary:true}\n',
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
      'languages/typescript/preset/defaults/.prettierrc.json',
      '--ignore-path',
      'languages/typescript/preset/defaults/.prettierignore',
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
});
