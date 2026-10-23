import { beforeAll, describe, expect, it } from 'vitest';
import {
  enabled,
  ofFile,
  useEscapeHatchProject,
} from '../java-e2e/__tests__/escape-hatches-project.mjs';

describe.skipIf(!enabled)('Java preset escape hatches without an opt-in', () => {
  const project = useEscapeHatchProject();
  let result;
  beforeAll(() => {
    result = project.diffOf();
  }, 180_000);

  it("ignores inline Checkstyle suppressions and the project's configs without an opt-in", () => {
    expect(result.failed).toBe(true);
    expect(ofFile(result, 'Bad.java')).toEqual([
      'errorprone DefaultCharset Bad.java',
      'errorprone EmptyCatch Bad.java',
      'google-java-format format Bad.java',
      'pit mutant-nocoverage Bad.java',
    ]);
  });

  it('lints test sources with PMD, Error Prone, the formatter and the line length, without the assertion-style rules', () => {
    expect(ofFile(result, 'SwallowingTest.java')).toEqual([
      'errorprone EmptyCatch SwallowingTest.java',
      'google-java-format format SwallowingTest.java',
      'pmd AvoidCatchingGenericException SwallowingTest.java',
      'pmd UnitTestShouldIncludeAssert SwallowingTest.java',
      'structure line-length-limit SwallowingTest.java',
    ]);
  });
});
