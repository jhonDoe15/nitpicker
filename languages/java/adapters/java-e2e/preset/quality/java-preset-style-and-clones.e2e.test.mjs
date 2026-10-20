import { describe, it, expect } from 'vitest';
import { GRADLE_STEP_TIMEOUT_MS, summarize } from '../../../test-support/gradle-e2e.mjs';
import { useJavaPresetProject, enabled } from '../../__tests__/java-preset-project.mjs';

describe.skipIf(!enabled)('Java preset end to end', () => {
  const fixture = useJavaPresetProject();
  it(
    'with palantir declared, fails a new badly formatted file and lets a 108-column line pass',
    () => {
      const conventions = {
        'java.formatter': 'palantir',
        'java.indentation': '4',
        'java.lineLength': '120',
      };
      const result = fixture.diffOf('palantir', { javaStyle: 'palantir', conventions });
      const style = (findings) =>
        summarize(
          findings.filter(
            ({ tool, rule }) => tool === 'palantir-java-format' || rule === 'line-length-limit',
          ),
        );

      expect(style(result.newEnforceable)).toEqual(['palantir-java-format format Messy.java']);
      expect(style(result.newFindings)).toEqual(['palantir-java-format format Messy.java']);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );
  it(
    'fails a new clone found by jscpd',
    () => {
      const result = fixture.diffOf('clone');

      expect(result.failed).toBe(true);
      expect(
        summarize(result.newEnforceable.filter((finding) => finding.tool === 'duplicates')),
      ).toEqual(['duplicates duplicate-clone Left.java']);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );
});
