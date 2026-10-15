import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { importClosure } from '../../../../shared/modules/import-closure.mjs';
import { QUALITY_AREA_ADAPTER_FILES } from './configured-analyzers.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../../..');

describe('the quality-area configuration hash', () => {
  it('covers every module the quality-area runner loads', () => {
    const loaded = importClosure(
      path.join(packageRoot, 'languages/typescript/adapters/quality-areas-runner.mjs'),
    ).map((file) => path.relative(packageRoot, file).split(path.sep).join('/'));

    expect(loaded.filter((file) => !QUALITY_AREA_ADAPTER_FILES.includes(file))).toEqual([]);
    expect(
      [
        'shared/rules/mutation.mjs',
        'shared/rules/finding-helpers.mjs',
        'languages/typescript/adapters/mutation-scope.mjs',
        'languages/typescript/adapters/test-weakening/scoped-mutation.mjs',
        'core/diff/git.mjs',
      ].filter((file) => !QUALITY_AREA_ADAPTER_FILES.includes(file)),
    ).toEqual([]);
  });
});
