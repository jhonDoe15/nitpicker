export const CONFIGURATION_READ_RULE = 'ConfigurationReadOutsideCompositionRoot';
const SPRING_RULE = 'SpringTypedConfiguration';

function spot({ path, location }) {
  return `${path}\0${String(location?.line)}`;
}

export function withoutSpringCoveredReads(findings) {
  const spring = new Set(findings.filter(({ rule }) => rule === SPRING_RULE).map(spot));
  return findings.filter(
    (finding) => finding.rule !== CONFIGURATION_READ_RULE || !spring.has(spot(finding)),
  );
}
