import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { prepareTask } from '../../../../core/diff/execution/preparation/prepare-task.mts';
import {
  ANALYZER_TIMEOUT_VARIABLE,
  SIZE_ALLOWANCE_VARIABLE,
  withConfiguredTimeout,
} from '../../../../shared/analyzer-timeouts/analyzer-timeouts.mts';
import { fieldOf } from '../../../../shared/values/readers.mts';
import { importClosure as untypedImportClosure } from '../../../../shared/import-closure.mts';
import { parseArguments } from '../../adapters/eslint/arguments.mts';
import { configuredAnalyzers, javascriptAnalyzers } from './configured-analyzers.mts';
import type { PackageAnalyzer as Analyzer } from './typed/analyzer-types.mts';

const importClosure: (files: readonly string[], root: string) => Map<string, unknown> =
  untypedImportClosure;

const packageRoot = path.resolve(import.meta.dirname, '../../../..');

function packageFile(candidate: string): string | undefined {
  const relative = path.relative(packageRoot, candidate).split(path.sep).join('/');
  const inside = !(relative.startsWith('../') || path.isAbsolute(relative));
  return inside && existsSync(candidate) && statSync(candidate).isFile() ? relative : undefined;
}

function invocationEntries(analyzer: Analyzer): string[] {
  const { args } = analyzer.createInvocation({
    projectRoot: packageRoot,
    policyRoot: packageRoot,
    toolRoot: packageRoot,
    liveProjectRoot: packageRoot,
    snapshot: 'head',
  });
  return args
    .map((argument) => packageFile(path.resolve(packageRoot, argument)))
    .filter((file): file is string => file !== undefined && /\.m[jt]s$/u.test(file))
    .map((file) => file.replace(/\.mts$/u, '.mjs'));
}

const analyzers: [string, Analyzer][] = [
  ...configuredAnalyzers().map((analyzer): [string, Analyzer] => ['typescript', analyzer]),
  ...javascriptAnalyzers().map((analyzer): [string, Analyzer] => ['javascript', analyzer]),
];

describe('analyzer cache keys', () => {
  it.each(analyzers.map(([preset, analyzer]) => [`${preset} ${analyzer.name}`, analyzer]))(
    '%s hashes every repository module its run loads',
    (_name, analyzer) => {
      const hashed = new Set(importClosure(analyzer.cacheKeyFiles, packageRoot).keys());
      const entries = invocationEntries(analyzer);
      const loaded = importClosure(entries, packageRoot).keys();

      expect(entries.length).toBeGreaterThan(0);
      expect([...loaded].filter((file) => !hashed.has(file)).sort()).toEqual([]);
    },
  );

  it('hashes the modules the lint rules and boundary rules import', () => {
    function hashedBy(name: string): Map<string, unknown> {
      return importClosure(
        analyzers.find(([, analyzer]) => analyzer.name === name)?.[1].cacheKeyFiles ?? [],
        packageRoot,
      );
    }

    function missing(name: string, files: string[]): string[] {
      return files.filter((file) => !hashedBy(name).has(file));
    }

    expect(
      missing('eslint-lint', [
        'languages/typescript/preset/architecture/strict-boundary-rules.mts',
        'languages/typescript/preset/architecture/strict-layout.mts',
        'languages/typescript/preset/eslint-plugin/rules/analysis/constant-resolution.mts',
        ...['no-dev-dependency-in-production.mts', 'package-manifest.mts', 'test-support.mts'].map(
          (file) => `languages/typescript/preset/eslint-plugin/rules/dependencies/${file}`,
        ),
      ]),
    ).toEqual([]);
    expect(missing('dependency-architecture', ['shared/paths/glob.mts'])).toEqual([]);
    expect(
      missing('dead-code', [
        'languages/typescript/adapters/quality-areas/reporting/dead-code.mts',
        'shared/hygiene/rules.mts',
      ]),
    ).toEqual([]);
  });
});

const extensions = ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs'];

describe('the type check on a large project', () => {
  it('has a deadline that grows with the files and a memory estimate over what its tsconfig reaches', () => {
    const typecheck: unknown = configuredAnalyzers().find(
      ({ name }) => name === 'typescript-typecheck',
    );
    const deadline = fieldOf(typecheck, 'timeoutScale');
    const memory = fieldOf(typecheck, 'memoryScale');

    expect([
      fieldOf(typecheck, 'timeoutMs'),
      fieldOf(deadline, 'perThousandFilesMs'),
      fieldOf(deadline, 'extensions'),
      typeof fieldOf(deadline, 'roots'),
    ]).toEqual([300_000, 120_000, extensions, 'function']);
    expect([
      fieldOf(memory, 'perThousandFilesMegabytes'),
      fieldOf(memory, 'extensions'),
      typeof fieldOf(memory, 'roots'),
    ]).toEqual([640, extensions, 'function']);
  });

  it('gives eslint-lint a size-scaled deadline that analyzerTimeoutMinutes can still override', () => {
    const eslintLint = configuredAnalyzers().find(({ name }) => name === 'eslint-lint');
    const deadline = fieldOf(eslintLint, 'timeoutScale');

    expect([
      fieldOf(eslintLint, 'timeoutMs'),
      fieldOf(deadline, 'perThousandFilesMs'),
      fieldOf(deadline, 'extensions'),
    ]).toEqual([300_000, 120_000, extensions]);

    const taskContext = {
      projectRoot: packageRoot,
      policyRoot: packageRoot,
      toolRoot: packageRoot,
      snapshot: 'head',
      baselineRoot: undefined,
      baselineMovesFile: undefined,
      liveProjectRoot: packageRoot,
      mutationScope: undefined,
      logRoot: undefined,
      countFiles: () => 4_400,
    };
    const scaled = prepareTask(eslintLint, taskContext, undefined);
    const configured =
      eslintLint === undefined
        ? undefined
        : prepareTask(
            withConfiguredTimeout(eslintLint, { 'eslint-lint': 20 }),
            taskContext,
            undefined,
          );

    expect(
      scaled.kind === 'ready' ? [scaled.task.timeoutMs, scaled.task.sizeAllowanceMs] : [],
    ).toEqual([900_000, 600_000]);
    expect(
      configured?.kind === 'ready'
        ? [configured.task.timeoutMs, configured.task.sizeAllowanceMs]
        : [],
    ).toEqual([1_200_000, 0]);
  });

  it('passes size allowance through to the ESLint runner timeout unless overridden', () => {
    const worktree = mkdtempSync(path.join(tmpdir(), 'nitpicker-diff-'));
    const snapshotRoot = path.join(worktree, 'head');
    mkdirSync(snapshotRoot);
    try {
      const args = [
        '--analyzer-name',
        'eslint-lint',
        '--project-root',
        snapshotRoot,
        '--policy-root',
        packageRoot,
        '--tool-root',
        packageRoot,
        '--config',
        'languages/typescript/preset/defaults/eslint.config.mjs',
        '--pattern',
        'src/**/*.ts',
      ];

      expect(parseArguments(args, {}).timeoutMs).toBe(240_000);
      expect(parseArguments(args, { [SIZE_ALLOWANCE_VARIABLE]: '600000' }).timeoutMs).toBe(840_000);
      expect(
        parseArguments(args, {
          [SIZE_ALLOWANCE_VARIABLE]: '600000',
          [ANALYZER_TIMEOUT_VARIABLE]: '1200000',
        }).timeoutMs,
      ).toBe(1_200_000);
    } finally {
      rmSync(worktree, { recursive: true, force: true });
    }
  });
});
