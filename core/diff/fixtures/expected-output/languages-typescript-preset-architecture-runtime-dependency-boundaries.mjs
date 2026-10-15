import { expect } from 'vitest';
export function expectedOutput86_49() {
  return [
    {
      source: 'domain/decision-policy.ts',
      role: 'decision-policy',
      rule: 'unresolved-runtime-dependency',
      target: 'import',
      line: 1,
      column: 6,
    },
  ];
}

export function expectedOutput89_45() {
  return [
    {
      source: 'domain/decision-policy.ts',
      role: 'decision-policy',
      rule: 'unresolved-runtime-dependency',
      target: 'require',
      line: 1,
      column: 1,
    },
  ];
}
