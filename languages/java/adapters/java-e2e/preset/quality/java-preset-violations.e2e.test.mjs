import { describe, it, expect } from 'vitest';
import { repeated } from '../../test-support/java-preset-data.mjs';
import { GRADLE_STEP_TIMEOUT_MS, summarize } from '../../../test-support/gradle-e2e.mjs';
import {
  useJavaPresetProject,
  enabled,
  BASELINED_FINDINGS,
} from '../../__tests__/java-preset-project.mjs';

describe.skipIf(!enabled)('Java preset end to end', () => {
  const fixture = useJavaPresetProject();
  it(
    'fails new Error Prone and formatter violations, and untested code, as new, each issue once',
    () => {
      const result = fixture.diffOf('violation');

      expect(result.failed).toBe(true);
      expect(summarize(result.newEnforceable)).toEqual([
        'errorprone DefaultCharset Bad.java',
        'errorprone EmptyCatch Bad.java',
        'google-java-format format Bad.java',
        'pit mutant-nocoverage Bad.java', // Bad.decode has no test
      ]);
      expect([...new Set(summarize(result.unchangedFindings))].sort()).toEqual(BASELINED_FINDINGS);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );
  it(
    'fails a new ArchUnit violation, once per rule and offending class',
    () => {
      const result = fixture.diffOf('architecture');

      expect(result.failed).toBe(true);
      expect(summarize(result.newEnforceable)).toEqual([
        ...repeated(2, 'archunit no_classes_use_legacy_date Stamp.java'),
        ...repeated(4, 'errorprone JavaUtilDate Stamp.java'),
        ...repeated(3, 'pit mutant-nocoverage Stamp.java'),
      ]);
      expect(
        result.newEnforceable
          .filter((finding) => finding.tool === 'archunit')
          .map((finding) => finding.identity)
          .sort(),
      ).toEqual(['demo.Stamp', 'demo.Stamp$Inner']);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );
});
