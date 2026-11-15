import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createStaticCheckAnalyzer } from '../../../../../../languages/typescript/adapters/static-checks/analyzer.mjs';
import type { ProfiledAnalyzer } from '../../../../../../shared/values/analyzers.mts';
import { createProfiledAnalyzer } from '../../../analysis/eslint/test-support/eslint-fixtures.mts';
import { PACKAGE_ROOT } from '../../../../../tooling/tool-resolution.mjs';
import type { FileMap } from '../../../../git/test-support/fixture-files.mts';
import { useGitFixtures } from '../../../../git/test-support/git-repository.mts';

export const toolRoot = PACKAGE_ROOT;

type StaticCheckOptions = {
  readonly name: string;
  readonly kind: string;
  readonly version: string;
  readonly configurationHash: string;
  readonly exclusions: string[];
  readonly configRelativePath: string;
  readonly ignoreRelativePath: string | undefined;
  readonly patterns: string[];
  readonly includeOnly: string | undefined;
  readonly exclude: string | undefined;
  readonly timeoutMs: number | undefined;
  readonly shardWeight: number;
};

type AnalyzerRequest = Pick<StaticCheckOptions, 'name' | 'kind' | 'configRelativePath'> &
  Partial<StaticCheckOptions>;

const COMPARISON_BASE_REF = 'comparison-base';

export function useStaticCheckFixtures(): {
  readonly temporaryDirectory: (prefix: string) => string;
  readonly createRepository: (initialFiles: FileMap) => {
    readonly root: string;
    readonly baseRef: string | undefined;
  };
  readonly generatedSnapshot: () => string;
} {
  const git = useGitFixtures();

  function createRepository(initialFiles: FileMap) {
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

export function fixtureAnalyzers(): ProfiledAnalyzer[] {
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

export function analyzer(options: AnalyzerRequest): ProfiledAnalyzer {
  return createProfiledAnalyzer(createStaticCheckAnalyzer, {
    version: 'fixture',
    configurationHash: 'fixture',
    exclusions: [],
    ignoreRelativePath: undefined,
    patterns: [],
    includeOnly: undefined,
    exclude: undefined,
    timeoutMs: undefined,
    shardWeight: 1,
    ...options,
  });
}

export function policyFiles(): FileMap {
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

export function filler(count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) => `export const f${String(index)} = ${String(index)};`,
  );
}

export function architectureReport(
  cycle: readonly string[],
  from = 'src/main/a.ts',
): { readonly summary: { readonly violations: readonly object[] } } {
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
