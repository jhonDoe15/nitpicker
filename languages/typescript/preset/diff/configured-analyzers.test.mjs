import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { importClosure } from '../../../../shared/import-closure.mjs';
import { ESLINT_ADAPTER_FILES, QUALITY_AREA_ADAPTER_FILES } from './configured-analyzers.mjs';
import { resolveLayout } from '../layout.mjs';
import { createQualityChecks } from '../quality-checks.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../../..');

function hashedFiles(files) {
  return [...importClosure(files, packageRoot).keys()];
}

describe('analyzer configuration hashes', () => {
  it('cover every module the dependency rules load', () => {
    const { eslintChecks } = createQualityChecks(resolveLayout());
    const eslintFiles = hashedFiles([
      ...ESLINT_ADAPTER_FILES,
      ...eslintChecks.flatMap(({ configurationFiles }) => configurationFiles),
    ]);
    const qualityAreaFiles = hashedFiles(QUALITY_AREA_ADAPTER_FILES);
    const ruleFolder = 'languages/typescript/preset/eslint-plugin/rules/dependencies';

    expect(
      ['no-dev-dependency-in-production.mjs', 'package-manifest.mjs', 'test-support.mjs']
        .map((file) => `${ruleFolder}/${file}`)
        .filter((file) => !eslintFiles.includes(file)),
    ).toEqual([]);
    expect(
      [
        'languages/typescript/adapters/quality-areas/reporting/dead-code.mjs',
        'shared/hygiene/rules.mjs',
      ].filter((file) => !qualityAreaFiles.includes(file)),
    ).toEqual([]);
  });
});
