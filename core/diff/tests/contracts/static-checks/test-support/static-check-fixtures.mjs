import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createStaticCheckAnalyzer } from '../../../../../../languages/typescript/adapters/static-checks/analyzer.mjs';
import { PACKAGE_ROOT } from '../../../../../tooling/tool-resolution.mjs';
import { useGitFixtures } from '../../../../git/test-support/git-repository.mjs';

export const toolRoot = PACKAGE_ROOT;

const COMPARISON_BASE_REF = 'comparison-base';

export function useStaticCheckFixtures() {
  const git = useGitFixtures();

  function createRepository(initialFiles) {
    const { root, baseRef } = git.createGitRepository(initialFiles, {
      prefix: 'static-quality-diff-',
      baseRef: COMPARISON_BASE_REF,
    });
    return { root, baseRef };
  }

  function generatedSnapshot() {
    const root = path.join(git.temporaryRoot('nitpicker-diff-'), 'base');
    mkdirSync(root);
    return root;
  }

  return { temporaryDirectory: git.temporaryRoot, createRepository, generatedSnapshot };
}

export function fixtureAnalyzers() {
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

export function analyzer(options) {
  return createStaticCheckAnalyzer({
    version: 'fixture',
    configurationHash: 'fixture',
    exclusions: [],
    ...options,
  });
}

export function policyFiles() {
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

export function filler(count) {
  return Array.from(
    { length: count },
    (_, index) => `export const f${String(index)} = ${String(index)};`,
  );
}

export function architectureReport(cycle, from = 'src/main/a.ts') {
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
