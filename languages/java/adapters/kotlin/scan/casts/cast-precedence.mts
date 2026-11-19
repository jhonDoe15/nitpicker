const COVERING_RULES = new Set([
  'detekt/detekt.potential-bugs.CastNullableToNonNullableType',
  'detekt/detekt.potential-bugs.CastToNullableType',
  'detekt/detekt.potential-bugs.DontDowncastCollectionTypes',
  'detekt/detekt.potential-bugs.UnsafeCast',
  'kotlinc/unchecked',
  'kotlinc/cast',
]);

type CastFinding = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly location?: { readonly line?: number | undefined } | undefined;
};

function lineKey({ path, location }: CastFinding): string {
  return `${path}:${String(location?.line)}`;
}

export function withoutCoveredCasts<Finding extends CastFinding>(findings: Finding[]): Finding[] {
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
