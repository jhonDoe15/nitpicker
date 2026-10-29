import { describe, expect, it } from 'vitest';
import {
  PINNED_SPRING_LINES,
  recordedFindings,
  springLines,
} from '../../../kotlin-e2e/__tests__/kotlin-spring-fixture.mjs';

describe('The pinned Kotlin Spring findings of the fixture', () => {
  it('are what the Spring rules report for the recorded facts, so the recording cannot drift', () => {
    expect(PINNED_SPRING_LINES).toHaveLength(96);
    expect(springLines(recordedFindings())).toEqual(PINNED_SPRING_LINES);
  });
});
