import { describe, expect, it } from 'vitest';
import { kotlinLintedRoots } from './kotlin-reports.mjs';

describe('the Kotlin directories whose inline suppressions are read', () => {
  it('lists the main and the test source roots once each', () => {
    expect(
      kotlinLintedRoots({
        kotlinSourceRoots: ['src/main/kotlin', 'shared/kotlin'],
        kotlinTestSourceRoots: ['src/test/kotlin', 'shared/kotlin'],
      }),
    ).toEqual(['src/main/kotlin', 'shared/kotlin', 'src/test/kotlin']);
  });

  it('lists the main roots only when the manifest has no test roots', () => {
    expect(kotlinLintedRoots({ kotlinSourceRoots: ['src/main/kotlin'] })).toEqual([
      'src/main/kotlin',
    ]);
  });
});
