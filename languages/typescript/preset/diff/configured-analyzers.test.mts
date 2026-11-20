import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { importClosure as untypedImportClosure } from '../../../../shared/import-closure.mjs';
import {
  configuredAnalyzers as untypedConfiguredAnalyzers,
  javascriptAnalyzers as untypedJavascriptAnalyzers,
} from './configured-analyzers.mjs';

type Analyzer = {
  readonly name: string;
  readonly cacheKeyFiles: string[];
  createInvocation(request: {
    readonly projectRoot: string;
    readonly policyRoot: string;
    readonly toolRoot: string;
    readonly liveProjectRoot: string;
    readonly snapshot: string;
  }): { readonly args: string[] };
};

const importClosure: (files: readonly string[], root: string) => Map<string, unknown> =
  untypedImportClosure;
const configuredAnalyzers: () => Analyzer[] = untypedConfiguredAnalyzers;
const javascriptAnalyzers: () => Analyzer[] = untypedJavascriptAnalyzers;

const packageRoot = path.resolve(import.meta.dirname, '../../../..');

function packageFile(candidate: string): string | undefined {
  const relative = path.relative(packageRoot, candidate).split(path.sep).join('/');
  const inside = !relative.startsWith('../') && !path.isAbsolute(relative);
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
        'languages/typescript/preset/architecture/strict-boundary-rules.mjs',
        'languages/typescript/preset/architecture/strict-layout.mjs',
        'languages/typescript/preset/eslint-plugin/rules/analysis/constant-resolution.mts',
        ...['no-dev-dependency-in-production.mts', 'package-manifest.mts', 'test-support.mts'].map(
          (file) => `languages/typescript/preset/eslint-plugin/rules/dependencies/${file}`,
        ),
      ]),
    ).toEqual([]);
    expect(missing('dependency-architecture', ['shared/paths/glob.mjs'])).toEqual([]);
    expect(
      missing('dead-code', [
        'languages/typescript/adapters/quality-areas/reporting/dead-code.mts',
        'shared/hygiene/rules.mjs',
      ]),
    ).toEqual([]);
  });
});

describe('the type check on a large project', () => {
  it('has a deadline that grows with the files and a memory estimate over what its tsconfig reaches', () => {
    const typecheck: unknown = configuredAnalyzers().find(
      ({ name }) => name === 'typescript-typecheck',
    );
    const scales = Object.assign({ timeoutMs: 0, timeoutScale: {}, memoryScale: {} }, typecheck);

    expect([scales.timeoutMs, scales.timeoutScale]).toEqual([
      300_000,
      { perThousandFilesMs: 120_000, extensions: expect.arrayContaining(['ts', 'tsx']) },
    ]);
    expect(scales.memoryScale).toEqual({
      perThousandFilesMegabytes: 640,
      extensions: expect.arrayContaining(['ts', 'tsx']),
      roots: expect.any(Function),
    });
  });
});
