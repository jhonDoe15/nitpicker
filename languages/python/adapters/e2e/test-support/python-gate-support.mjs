import { summarize } from './python-e2e-support.mjs';

export const enforceable = (result) =>
  summarize(
    result
      .json('new-findings.json')
      .filter(({ classification }) => classification === 'enforceable'),
  );

export const withoutMutants = (summaries) =>
  summaries.filter((summary) => !summary.startsWith('mutmut '));

export const GATE_PACKAGES = ['coverage', 'mutmut', 'pytest', 'mypy'];
