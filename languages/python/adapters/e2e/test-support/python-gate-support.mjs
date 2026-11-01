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

export function reportedGroups(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.startsWith('✖ '));
  const section = lines.slice(start + 1);
  const end = section.findIndex((line) => !line.startsWith('  '));
  const groups = [];
  for (const line of section.slice(0, end).filter((row) => !row.startsWith('  by area: '))) {
    if (line.startsWith('    ')) {
      groups.at(-1).push(line.trim());
    } else {
      groups.push([line.trim()]);
    }
  }
  return groups.filter(([label]) => !label.startsWith('mutmut/'));
}

export function pythonExceptionRoute(rule, file) {
  return (
    `If this is intended, add {"rule":"${rule}","paths":["${file}"],"reason":"..."} ` +
    'to "python.exceptions" in nitpicker.config.json.'
  );
}

export const GATE_PACKAGES = ['coverage', 'mutmut', 'pytest', 'mypy'];
