import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { importClosure } from '../../../../shared/modules/import-closure.mjs';
import { ESLINT_ADAPTER_FILES, QUALITY_AREA_ADAPTER_FILES } from './configured-analyzers.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../../..');

function missingFrom(hashedFiles, entry) {
  return importClosure(path.join(packageRoot, entry))
    .map((file) => path.relative(packageRoot, file).split(path.sep).join('/'))
    .filter((file) => !hashedFiles.includes(file));
}

describe('analyzer configuration hashes', () => {
  it('cover every module the dependency rules load', () => {
    const rule =
      'languages/typescript/preset/eslint-plugin/rules/dependencies/no-dev-dependency-in-production.mjs';

    expect(missingFrom(ESLINT_ADAPTER_FILES, rule)).toEqual([]);
    expect(
      missingFrom(
        QUALITY_AREA_ADAPTER_FILES,
        'languages/typescript/adapters/dead-code/normalize.mjs',
      ),
    ).toEqual([]);
    expect(QUALITY_AREA_ADAPTER_FILES.includes('shared/glob.mjs')).toBe(true);
  });
});
