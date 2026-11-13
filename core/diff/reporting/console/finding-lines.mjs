import { metricSuffix } from './metric-values.mjs';

function findingLine(finding) {
  const location = finding.location === undefined ? '' : `:${String(finding.location.line)}`;
  return `${finding.tool}/${finding.rule} ${finding.path}${location} ${finding.message}${metricSuffix(finding)}`;
}

export function appendFindingSection(lines, heading, findings) {
  if (findings.length === 0) {
    return;
  }
  lines.push('', `${heading}:`, ...findings.map(findingLine));
}

export function appendFailingFirst(lines, noun, findings) {
  const failing = findings.filter(({ classification }) => classification === 'enforceable');
  const reportOnly = findings.filter(({ classification }) => classification !== 'enforceable');
  appendFindingSection(lines, `${noun} failing findings`, failing);
  appendFindingSection(lines, `${noun} report-only findings`, reportOnly);
}
