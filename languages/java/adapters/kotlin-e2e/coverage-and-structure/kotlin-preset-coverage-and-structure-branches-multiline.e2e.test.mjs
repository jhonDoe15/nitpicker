import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { diffOf, kotlinE2eEnabled } from '../test-support/kotlin-e2e-project.mjs';
import { useKotlinCoverageProject } from '../__tests__/kotlin-coverage-project.mjs';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset multiline branch coverage end to end', () => {
  const fixture = useKotlinCoverageProject();
  it('fails the untested branches of a statement that spans lines and of a file outside its package directory', () => {
    const result = diffOf(fixture.project, 'multiline-branch');

    expect(result.failed).toBe(true);
    expect(
      result.newEnforceable
        .filter(({ tool }) => tool === 'jacoco')
        .map(({ path: file, location }) => `${path.basename(file)}:${String(location.line)}`)
        .sort(),
    ).toEqual(['Offset.kt:4', 'Spread.kt:10', 'Spread.kt:7']);
  });
});
