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

export const GATE_PACKAGES = ['coverage', 'mutmut', 'pytest', 'mypy'];
