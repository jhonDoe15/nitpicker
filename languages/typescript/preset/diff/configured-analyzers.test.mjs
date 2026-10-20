import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { importClosure } from '../../../../shared/import-closure.mjs';
import { configuredAnalyzers, javascriptAnalyzers } from './configured-analyzers.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../../..');

function packageFile(candidate) {
  const relative = path.relative(packageRoot, candidate).split(path.sep).join('/');
  const inside = !relative.startsWith('../') && !path.isAbsolute(relative);
  return inside && existsSync(candidate) && statSync(candidate).isFile() ? relative : undefined;
}

function invocationEntries(analyzer) {
  const { args } = analyzer.createInvocation({
    projectRoot: packageRoot,
    policyRoot: packageRoot,
    toolRoot: packageRoot,
    liveProjectRoot: packageRoot,
    snapshot: 'head',
  });
  return args
    .map((argument) => packageFile(path.resolve(packageRoot, argument)))
    .filter((file) => file?.endsWith('.mjs'));
}

const analyzers = [
  ...configuredAnalyzers().map((analyzer) => ['typescript', analyzer]),
  ...javascriptAnalyzers().map((analyzer) => ['javascript', analyzer]),
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
    const hashedBy = (name) =>
      importClosure(
        analyzers.find(([, analyzer]) => analyzer.name === name)[1].cacheKeyFiles,
        packageRoot,
      );

    const missing = (name, files) => files.filter((file) => !hashedBy(name).has(file));

    expect(
      missing('eslint-lint', [
        'languages/typescript/preset/architecture/strict-boundary-rules.mjs',
        'languages/typescript/preset/architecture/strict-layout.mjs',
        'languages/typescript/preset/eslint-plugin/rules/analysis/constant-resolution.mjs',
        ...['no-dev-dependency-in-production.mjs', 'package-manifest.mjs', 'test-support.mjs'].map(
          (file) => `languages/typescript/preset/eslint-plugin/rules/dependencies/${file}`,
        ),
      ]),
    ).toEqual([]);
    expect(missing('dependency-architecture', ['shared/glob.mjs'])).toEqual([]);
    expect(
      missing('dead-code', [
        'languages/typescript/adapters/quality-areas/reporting/dead-code.mjs',
        'shared/hygiene/rules.mjs',
      ]),
    ).toEqual([]);
  });
});
