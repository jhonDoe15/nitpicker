const BROKEN_ON_HEAD = 'The base produced this {tool} report, so the change broke it.';
const NOT_COMPARED = 'Not enforced: no base {tool} report shows whether the change added it.';

const NOT_RUN_FIELDS = new Set(['toolNotRun', 'notRunScope']);

function reclassified(finding, classification, sentence) {
  return {
    ...Object.fromEntries(Object.entries(finding).filter(([field]) => !NOT_RUN_FIELDS.has(field))),
    classification,
    message: `${finding.message} ${sentence.replace('{tool}', finding.tool)}`,
  };
}

function inNotRunScope(notRun, finding) {
  return (
    notRun.tool === finding.tool &&
    (notRun.notRunScope === undefined ||
      notRun.notRunScope.some((prefix) => finding.identity.startsWith(prefix)))
  );
}

function alsoNotRun(baseNotRun, headNotRun) {
  return (
    baseNotRun.tool === headNotRun.tool &&
    (headNotRun.notRunScope === undefined || baseNotRun.identity === headNotRun.identity)
  );
}

export function againstMissingReports(headFindings, baseFindings) {
  const notRunOnBase = baseFindings.filter((finding) => finding.toolNotRun === true);
  return headFindings.map((finding) => {
    if (finding.toolNotRun === true) {
      return notRunOnBase.some((base) => alsoNotRun(base, finding))
        ? finding
        : reclassified(finding, 'tool-error', BROKEN_ON_HEAD);
    }
    return finding.classification === 'enforceable' &&
      notRunOnBase.some((base) => inNotRunScope(base, finding))
      ? reclassified(finding, 'descriptive', NOT_COMPARED)
      : finding;
  });
}
