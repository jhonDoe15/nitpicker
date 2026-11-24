import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findEngine } from '../../../../../shared/engine/engine-binary.mts';
import {
  engineLayoutConfig,
  typescriptLintArguments,
  writeEngineConfig,
  type EngineLintConfig,
} from '../../../../../shared/engine/engine-config.mts';
import { runEngineSync } from '../../../../../shared/engine/engine-run.mts';
import { resolveLayout } from '../../layout.mts';
import { rootOf } from './root-paths.mts';
import {
  defaultTestFiles,
  testFilePatterns,
} from '../../test-runner/test-files/test-file-patterns.mts';
import type { ResolvedLayout } from '../../typed/layout-types.mts';

type DumpedFile = {
  readonly file: string;
  readonly isSourceFile: boolean;
  readonly isTestFile: boolean;
  readonly isTestPath: boolean;
  readonly isRunnerTestFile: boolean;
  readonly isRunnableTestFile: boolean;
  readonly isExcluded: boolean;
  readonly isGeneratedPath: boolean;
  readonly isEndToEndTest: boolean;
  readonly sourceRoot: string | null;
};

type DumpedConfig = {
  readonly projectRoot: string | null;
  readonly layout: {
    readonly sourceRoots: readonly string[];
    readonly testRoots: readonly string[];
  };
  readonly rules: Readonly<Record<string, unknown>>;
  readonly files: readonly DumpedFile[];
};

const engineBinary = findEngine(process.env);

function runDumpConfig(config: EngineLintConfig, files: readonly string[]): DumpedConfig {
  const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-engine-layout-'));
  try {
    const configPath = writeEngineConfig(path.join(directory, 'config.json'), config);
    const listPath = path.join(directory, 'files.tsv');
    const lines = files.map((file) => `${path.join(directory, file)}\t${file}\n`).join('');
    writeFileSync(listPath, lines);
    const args = typescriptLintArguments({
      files: listPath,
      config: configPath,
      extra: ['--dump-config'],
    });
    const run = runEngineSync(args, { binary: engineBinary });
    expect(run.status, run.stderr).toBe(0);
    return JSON.parse(run.stdout) as DumpedConfig;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function jsClassification(layout: ResolvedLayout, file: string): DumpedFile {
  const normalized = file.replaceAll('\\', '/').replace(/^(?:\.\/)+/u, '');
  return {
    file: normalized,
    isSourceFile: layout.isSourceFile(normalized),
    isTestFile: layout.isTestFile(normalized),
    isTestPath: layout.isTestPath(normalized),
    isRunnerTestFile: layout.isRunnerTestFile(normalized),
    isRunnableTestFile: layout.isRunnableTestFile(normalized),
    isExcluded: layout.isExcluded(normalized),
    isGeneratedPath: layout.isGeneratedPath(normalized),
    isEndToEndTest: layout.isEndToEndTest(normalized),
    sourceRoot: rootOf(layout.sourceRoots, normalized) ?? null,
  };
}

describe.runIf(engineBinary !== undefined)('engine layout parity with JavaScript layout', () => {
  it('matches JS classification across several source and test roots and passes rule options', () => {
    const generatedFiles = ['shared/generated-schema.ts'];
    const layout = resolveLayout(
      {
        sourceRoots: ['./packages/api/src/', 'packages\\web\\src', 'shared'],
        testRoots: ['test', 'integration', 'e2e'],
        colocatedTests: true,
      },
      ['packages/api/src/legacy/**'],
      {
        generatedFiles,
        testFiles: testFilePatterns({
          include: ['**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}', 'integration/**/*.ts'],
          exclude: ['**/*.fixture.ts'],
        }),
      },
    );
    const candidates = [
      'packages/api/src/server.ts',
      './packages\\web\\src\\App.tsx',
      'shared/math.mts',
      'packages/api/src/server.test.ts',
      'packages/web/src/__tests__/App.tsx',
      'packages/web/src/test-support/render.tsx',
      'packages/api/src/legacy/old.ts',
      'packages/api/src/types.d.ts',
      'shared/generated-schema.ts',
      'test/smoke.ts',
      'integration/api.ts',
      'integration/helper.fixture.ts',
      'e2e/login.spec.ts',
      'scripts/release.ts',
    ];
    const rules = {
      'report-module-load-effects': { commonJsExports: true },
      'test-must-use-production-runtime': { runner: 'vitest', exemptPattern: 'contract/' },
      'no-copied-constant': {},
    };
    const dumped = runDumpConfig(
      {
        projectRoot: '/workspace/monorepo',
        layout: engineLayoutConfig({ ...layout, generatedFiles }),
        rules,
      },
      candidates,
    );
    expect(dumped.layout.sourceRoots).toEqual(layout.sourceRoots);
    expect(dumped.layout.testRoots).toEqual(layout.testRoots);
    expect(dumped.rules).toEqual(rules);
    expect(dumped.files).toEqual(candidates.map((file) => jsClassification(layout, file)));
  });

  it('matches JS classification for project-root source and Jest test patterns', () => {
    const layout = resolveLayout({ sourceRoots: ['.'], testRoots: ['tests'] }, [], {
      testFiles: defaultTestFiles('jest'),
    });
    const candidates = [
      'index.ts',
      'lib/helper.ts',
      'lib/__tests__/helper.ts',
      'lib/helper.spec.tsx',
      'tests/smoke.ts',
      'dist/index.js',
      'vitest.config.ts',
    ];
    const dumped = runDumpConfig({ layout: engineLayoutConfig(layout) }, candidates);
    expect(dumped.files).toEqual(candidates.map((file) => jsClassification(layout, file)));
  });
});
