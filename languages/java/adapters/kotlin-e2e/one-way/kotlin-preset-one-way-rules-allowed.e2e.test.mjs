import { describe, expect, it } from 'vitest';
import { fromTool, kotlinE2eEnabled } from '../test-support/kotlin-e2e-project.mjs';
import { useKotlinOneWayProject } from '../__tests__/kotlin-one-way-project.mjs';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset one-way rules end to end', () => {
  const fixture = useKotlinOneWayProject('allowed');
  it('lets the allowed form of every case through detekt', () => {
    const result = fixture.allowedResult;

    expect(fromTool(result.newEnforceable, 'detekt')).toEqual([]);
  });
});
