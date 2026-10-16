const SAME_LINE_SECONDARY = new Map([
  ['errorprone/NarrowCalculation', 'errorprone/IntLongMath'],
  [
    'checkstyle/com.puppycrawl.tools.checkstyle.checks.blocks.NeedBracesCheck',
    'errorprone/UnnecessarySemicolon',
  ],
  ['spotbugs/IS2_INCONSISTENT_SYNC', 'errorprone/DoubleCheckedLocking'],
  ['errorprone/FieldCanBeFinal', 'errorprone/NonFinalStaticField'],
]);
const SPOTBUGS_FIELD_RULES = new Set(['URF_UNREAD_FIELD', 'UUF_UNUSED_FIELD']);
const UNUSED_PRIVATE_FIELD = /\bsuch as '(\w+)'/u;

function ruleOf(finding) {
  return `${finding.tool}/${finding.rule}`;
}

function lineKey(rule, finding) {
  return JSON.stringify([rule, finding.path, finding.location?.line]);
}

function fieldKey(filePath, field) {
  return JSON.stringify([filePath, field]);
}

export function withoutOverlaps(findings) {
  const lines = new Set(findings.map((finding) => lineKey(ruleOf(finding), finding)));
  const pmdFields = new Set(
    findings
      .filter((finding) => ruleOf(finding) === 'pmd/UnusedPrivateField')
      .flatMap((finding) => {
        const field = UNUSED_PRIVATE_FIELD.exec(finding.message)?.[1];
        return field === undefined ? [] : [fieldKey(finding.path, field)];
      }),
  );
  return findings.filter((finding) => {
    const primary = SAME_LINE_SECONDARY.get(ruleOf(finding));
    if (primary !== undefined && finding.location?.line !== undefined) {
      return !lines.has(lineKey(primary, finding));
    }
    if (finding.tool === 'spotbugs' && SPOTBUGS_FIELD_RULES.has(finding.rule)) {
      const field =
        typeof finding.symbol === 'string' ? finding.symbol.split('.').at(-1) : undefined;
      return !pmdFields.has(fieldKey(finding.path, field));
    }
    return true;
  });
}
