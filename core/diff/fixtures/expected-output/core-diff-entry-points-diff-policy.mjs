import { expect } from 'vitest';
export function expectedOutput26_42() {
  return [
    {
      tool: 'entry-points',
      rule: 'public-alternative-bypass',
      path: 'src/main/alpha/existing.ts',
      identity: 'target:src/main/beta/internal.ts',
      message: 'Import src/main/beta/internal.ts through src/main/beta/index.ts (runtime)',
      classification: 'enforceable',
    },
  ];
}

export function expectedOutput32_36() {
  return [
    {
      tool: 'entry-points',
      rule: 'public-alternative-bypass',
      path: 'src/main/gamma/introduced.ts',
      identity: 'target:src/main/beta/internal.ts',
      message: 'Import src/main/beta/internal.ts through src/main/beta/index.ts (runtime)',
      classification: 'enforceable',
    },
  ];
}

export function expectedOutput104_57() {
  return [
    'coding-standards',
    'coupling',
    'coverage',
    'crap',
    'dead-code',
    'dependency-architecture',
    'duplicates',
    'entry-points',
    'eslint-errors',
    'eslint-lint',
    'eslint-logging',
    'eslint-module-effects',
    'mutation',
    'prettier-format',
    'structure',
    'test-runtime',
    'typescript-typecheck',
  ];
}
