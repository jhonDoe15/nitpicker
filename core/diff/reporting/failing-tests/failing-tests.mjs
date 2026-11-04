import { TESTS_FAILED_RULE } from '../../../../shared/rules/finding-helpers.mjs';

export function failingHeadTests(toolErrors) {
  return toolErrors.filter(
    ({ rule, snapshot }) => rule === TESTS_FAILED_RULE && (snapshot ?? 'head') === 'head',
  );
}

export function comparisonExitCode(report) {
  if (report.summary.newEnforceableFindings > 0) {
    return 1;
  }
  if (failingHeadTests(report.toolErrors).length > 0) {
    return 1;
  }
  return report.summary.overallStatus === 'completed' ? 0 : 2;
}

export function failingTestLines(errors, { headline, label }) {
  return errors.flatMap((error) => {
    const [first, ...rest] = String(error.message).split('\n');
    const owner = errors.length === 1 ? '' : `${label(error.tool)}: `;
    return [headline(`✖ ${owner}${first}`), ...rest];
  });
}
