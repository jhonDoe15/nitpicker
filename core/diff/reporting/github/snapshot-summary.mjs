import {
  exceptionExample,
  exceptionRoute,
  code,
  findingList,
  pluralize,
  ruleTable,
  toolErrorList,
} from './markdown.mjs';
import { scopeLine } from '../../../scope/scope-findings.mjs';

function headline(enforceable, toolErrors) {
  if (enforceable.length > 0) {
    return `✖ ${pluralize(enforceable.length, 'enforceable finding')} in the checkout`;
  }
  return toolErrors.length > 0
    ? '✖ Incomplete: no enforceable findings, but a tool failed'
    : '✓ No enforceable findings';
}

export function renderSnapshotSummary(report, context) {
  const enforceable = report.findings.filter(
    ({ classification }) => classification === 'enforceable',
  );
  return [
    `## nitpicker full run${context.projectPrefix === '' ? '' : ` ${code(context.projectPrefix)}`}`,
    '',
    `**${headline(enforceable, report.toolErrors)}**`,
    '',
    ...scopeLine(report.summary).flatMap((line) => [line, '']),
    `${pluralize(report.findings.length, 'finding')} in all, ` +
      `${String(report.findings.length - enforceable.length)} descriptive.`,
    '',
    ...(report.findings.length === 0
      ? []
      : ['### Findings by tool and rule', '', ...ruleTable(report.findings)]),
    ...findingList(enforceable, context, 'Enforceable findings'),
    ...toolErrorList(report.toolErrors),
    ...exceptionRoute({
      hasFindings: enforceable.length > 0,
      example: exceptionExample(enforceable),
    }),
  ].join('\n');
}
