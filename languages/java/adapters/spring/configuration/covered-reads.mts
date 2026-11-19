import type { JavaFinding } from '../../typed/java-values.mts';

export const CONFIGURATION_READ_RULE = 'ConfigurationReadOutsideCompositionRoot';
const SPRING_RULE = 'SpringTypedConfiguration';

function spot({ path, location }: JavaFinding): string {
  return `${path}\0${String(location?.line)}`;
}

export function withoutSpringCoveredReads<T extends JavaFinding>(findings: readonly T[]): T[] {
  const spring = new Set(findings.filter(({ rule }) => rule === SPRING_RULE).map(spot));
  return findings.filter(
    (finding) => finding.rule !== CONFIGURATION_READ_RULE || !spring.has(spot(finding)),
  );
}
