import { expect } from 'vitest';
export function expectedOutput87_34() {
  return [
    {
      tool: 'dependency-architecture',
      rule: 'features-do-not-import-bootstrap',
      path: 'src/main/auth/logic.ts',
      identity: 'target:src/main/server.ts|occurrence:1',
      message: 'src/main/auth/logic.ts must not depend on src/main/server.ts',
      classification: 'enforceable',
    },
    {
      tool: 'prettier-format',
      rule: 'prettier/prettier',
      path: 'src/main/auth/drift.ts',
      identity: 'format-diff:9f7a98502a664a32843099ca',
      message: 'Format these lines with Prettier',
      classification: 'enforceable',
      location: { line: 1, endLine: 2 },
    },
    {
      tool: 'prettier-format',
      rule: 'prettier/prettier',
      path: 'src/main/auth/logic.ts',
      identity: 'format-diff:30a09f8cdd43aeffcc325cbc',
      message: 'Format these lines with Prettier',
      classification: 'enforceable',
      location: { line: 1, endLine: 3 },
    },
    {
      tool: 'typescript-typecheck',
      rule: 'TS2322',
      path: 'src/main/auth/logic.ts',
      identity: 'diagnostic:2322|message:f4d9667471f422b62248edc2|symbol:valid|occurrence:1',
      message: "Type 'string' is not assignable to type 'number'.",
      classification: 'enforceable',
      symbol: 'valid',
      location: { line: 2, column: 14 },
    },
  ];
}

export function expectedOutput119_53({ driftPath }) {
  return [
    {
      tool: 'prettier-format',
      rule: 'prettier/prettier',
      path: driftPath,
      identity: 'format-diff:9f7a98502a664a32843099ca',
      message: 'Format these lines with Prettier',
      classification: 'enforceable',
      location: { line: 1, endLine: 2 },
    },
  ];
}

export function expectedOutput166_40() {
  return [
    {
      tool: 'prettier-format',
      rule: 'prettier/prettier',
      path: 'src/main/legacy.ts',
      identity: 'format-diff:21be5318beb85c3a6ff3440b',
      message: 'Format these lines with Prettier',
      classification: 'enforceable',
      location: { line: 1, endLine: 1 },
    },
  ];
}

export function expectedOutput177_34() {
  return [
    {
      tool: 'prettier-format',
      rule: 'prettier/prettier',
      path: 'src/main/legacy.ts',
      identity: 'format-diff:8a051786838f18724e9c186e',
      message: 'Format these lines with Prettier',
      classification: 'enforceable',
      location: { line: 1, endLine: 1 },
    },
  ];
}

export function expectedOutput201_34() {
  return [
    {
      tool: 'prettier-format',
      rule: 'prettier/prettier',
      path: 'src/main/fresh.ts',
      identity: 'format-diff:fb042a0e28721a451f393e30',
      message: 'Format these lines with Prettier',
      classification: 'enforceable',
      location: { line: 1, endLine: 1 },
    },
  ];
}

export function expectedOutput213_34() {
  return [
    {
      tool: 'prettier-format',
      rule: 'prettier/prettier',
      path: 'src/main/ok.ts',
      identity: 'format-diff:f56d25669f365e5afd0ac8af',
      message: 'Format these lines with Prettier',
      classification: 'enforceable',
      location: { line: 2, endLine: 2 },
    },
  ];
}

export function expectedOutput261_34() {
  return [
    {
      tool: 'prettier-format',
      rule: 'prettier/prettier',
      path: 'src/main/fresh.ts',
      identity: 'format-diff:046e36fb31cb6cd60107aae3',
      message: 'Format these lines with Prettier',
      classification: 'enforceable',
      location: { line: 1, endLine: 1 },
    },
  ];
}

export function expectedOutput275_68() {
  return [
    {
      tool: 'prettier-format',
      rule: 'prettier/prettier',
      path: 'src/main/fresh.ts',
      identity: 'format-diff:b2a1d02d8759b56690983826',
      message: 'Format these lines with Prettier',
      classification: 'enforceable',
      location: { line: 1, endLine: 1 },
    },
  ];
}

export function expectedOutput471_27() {
  return 'Static quality adapter failed: --project-root must be inside a generated quality-diff worktree\n';
}

export function expectedOutput477_49() {
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
