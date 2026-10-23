import { summarize } from './python-e2e-support.mjs';

export function enforceable(result) {
  return summarize(
    result
      .json('new-findings.json')
      .filter(({ classification }) => classification === 'enforceable'),
  );
}

export function withoutMutants(summaries) {
  return summaries.filter((summary) => !summary.startsWith('mutmut '));
}

export function reportedFindings(text) {
  const lines = text.split('\n');
  return lines.flatMap((line, index) =>
    line.startsWith('  ') && !line.startsWith('   ') && !line.startsWith('  mutmut/')
      ? [`${line.trim()}: ${lines[index + 1].trim()}`]
      : [],
  );
}

export function pythonExceptionRoute(rule, file) {
  return (
    `If this is intended, add {"rule":"${rule}","paths":["${file}"],"reason":"..."} ` +
    'to "python.exceptions" in nitpicker.config.json.'
  );
}

export const GATE_PACKAGES = ['coverage', 'mutmut', 'pytest', 'mypy'];
