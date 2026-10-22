const COVERING_RULES = new Set([
  'detekt/detekt.potential-bugs.CastNullableToNonNullableType',
  'detekt/detekt.potential-bugs.CastToNullableType',
  'detekt/detekt.potential-bugs.DontDowncastCollectionTypes',
  'detekt/detekt.potential-bugs.UnsafeCast',
  'kotlinc/unchecked',
  'kotlinc/cast',
]);

function lineKey({ path, location }) {
  return `${path}:${String(location?.line)}`;
}

export function withoutCoveredCasts(findings) {
  const covered = new Set(
    findings.filter(({ tool, rule }) => COVERING_RULES.has(`${tool}/${rule}`)).map(lineKey),
  );
  return findings.filter(
    (finding) =>
      !(
        finding.tool === 'kotlin-source' &&
        finding.rule === 'UnsafeCastOperator' &&
        covered.has(lineKey(finding))
      ),
  );
}
