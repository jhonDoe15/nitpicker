import { describe, expect, it } from 'vitest';
import { CONFIGURATION_READ_RULE, withoutSpringCoveredReads } from './covered-reads.mjs';

function finding(tool, rule, file, line) {
  return { tool, rule, path: file, location: { line } };
}

describe('withoutSpringCoveredReads', () => {
  it('keeps the Spring finding where both rules report one read', () => {
    const spring = finding('pmd', 'SpringTypedConfiguration', 'src/Orders.java', 12);

    expect(
      withoutSpringCoveredReads([
        spring,
        finding('pmd', CONFIGURATION_READ_RULE, 'src/Orders.java', 12),
      ]),
    ).toEqual([spring]);
  });

  it('drops a Kotlin source finding on a line the Kotlin Spring rule reports', () => {
    const spring = finding('pmd', 'SpringTypedConfiguration', 'src/Orders.kt', 7);

    expect(
      withoutSpringCoveredReads([
        finding('kotlin-source', CONFIGURATION_READ_RULE, 'src/Orders.kt', 7),
        spring,
      ]),
    ).toEqual([spring]);
  });

  it('keeps reads the Spring rule does not report, on other lines or in other files', () => {
    const findings = [
      finding('pmd', 'SpringTypedConfiguration', 'src/Orders.java', 12),
      finding('pmd', CONFIGURATION_READ_RULE, 'src/Orders.java', 13),
      finding('pmd', CONFIGURATION_READ_RULE, 'src/Flags.java', 12),
      finding('pmd', 'UriCreateDynamic', 'src/Orders.java', 12),
    ];

    expect(withoutSpringCoveredReads(findings)).toEqual(findings);
  });
});
