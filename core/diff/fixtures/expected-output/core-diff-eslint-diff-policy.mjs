import { expect } from 'vitest';
export function expectedOutput84_48() {
  return [
    {
      tool: 'eslint-lint',
      rule: 'no-debugger',
      path: 'src/main/source.ts',
      identity:
        'message:unexpected|node:LastStatement|syntax:c101e41c622a39ff619763e2|occurrence:1',
      message: "Unexpected 'debugger' statement.",
      location: { line: 2, column: 3 },
      classification: 'enforceable',
      symbol: 'baseline',
      ratchet: { key: 'count:unexpected', value: 1, existingCodeOnly: true },
    },
  ];
}

export function expectedOutput113_32() {
  return [
    {
      tool: 'eslint-lint',
      rule: 'no-debugger',
      path: 'src/main/added.ts',
      identity:
        'message:unexpected|node:LastStatement|syntax:c101e41c622a39ff619763e2|occurrence:1',
      message: "Unexpected 'debugger' statement.",
      classification: 'enforceable',
      symbol: 'added',
      location: { line: 2, column: 3 },
      ratchet: { key: 'count:unexpected', value: 1, existingCodeOnly: true },
    },
  ];
}

export function expectedOutput116_37() {
  return [
    {
      tool: 'eslint-lint',
      rule: 'no-debugger',
      path: 'src/main/resolved.ts',
      identity:
        'message:unexpected|node:LastStatement|syntax:c101e41c622a39ff619763e2|occurrence:1',
      message: "Unexpected 'debugger' statement.",
      classification: 'enforceable',
      symbol: 'resolved',
      location: { line: 2, column: 3 },
      ratchet: { key: 'count:unexpected', value: 1, existingCodeOnly: true },
    },
  ];
}

export function expectedOutput124_38() {
  return [
    {
      tool: 'eslint-lint',
      rule: 'no-debugger',
      path: 'src/main/moved.ts',
      identity:
        'message:unexpected|node:LastStatement|syntax:c101e41c622a39ff619763e2|occurrence:1',
      message: "Unexpected 'debugger' statement.",
      classification: 'enforceable',
      symbol: 'moved',
      location: { line: 5, column: 3 },
      ratchet: { key: 'count:unexpected', value: 1, existingCodeOnly: true },
    },
    {
      tool: 'eslint-lint',
      rule: 'no-debugger',
      path: 'src/main/new-name.ts',
      identity:
        'message:unexpected|node:LastStatement|syntax:c101e41c622a39ff619763e2|occurrence:1',
      message: "Unexpected 'debugger' statement.",
      classification: 'enforceable',
      symbol: 'renamed',
      location: { line: 2, column: 3 },
      ratchet: { key: 'count:unexpected', value: 1, existingCodeOnly: true },
    },
    {
      tool: 'eslint-lint',
      rule: 'no-debugger',
      path: 'src/main/stable.ts',
      identity:
        'message:unexpected|node:LastStatement|syntax:c101e41c622a39ff619763e2|occurrence:1',
      message: "Unexpected 'debugger' statement.",
      classification: 'enforceable',
      symbol: 'stable',
      location: { line: 2, column: 3 },
      ratchet: { key: 'count:unexpected', value: 1, existingCodeOnly: true },
    },
  ];
}

export function expectedOutput177_32() {
  return [
    {
      tool: 'eslint-errors',
      rule: 'no-empty-function',
      path: 'src/main/source.ts',
      identity: 'message:unexpected|node:Block|syntax:e09c6922783880b96df5adb1|occurrence:1',
      message: "Unexpected empty function 'empty'.",
      classification: 'enforceable',
      symbol: 'empty',
      location: { line: 2, column: 25 },
      ratchet: { key: 'count:unexpected', value: 1, existingCodeOnly: true },
    },
    {
      tool: 'eslint-lint',
      rule: 'no-debugger',
      path: 'src/main/source.ts',
      identity:
        'message:unexpected|node:LastStatement|syntax:c101e41c622a39ff619763e2|occurrence:1',
      message: "Unexpected 'debugger' statement.",
      classification: 'enforceable',
      location: { line: 1, column: 1 },
    },
    {
      tool: 'eslint-lint',
      rule: 'no-debugger',
      path: 'src/main/source.ts',
      identity:
        'message:unexpected|node:LastStatement|syntax:c101e41c622a39ff619763e2|occurrence:1',
      message: "Unexpected 'debugger' statement.",
      classification: 'enforceable',
      symbol: 'unreachable',
      location: { line: 6, column: 3 },
      ratchet: { key: 'count:unexpected', value: 1, existingCodeOnly: true },
    },
    {
      tool: 'eslint-logging',
      rule: 'no-console',
      path: 'src/main/source.ts',
      identity:
        'message:unexpected|node:PropertyAccessExpression|syntax:1f69dad8fea4eca83bc663c3|occurrence:1',
      message: 'Unexpected console statement.',
      classification: 'enforceable',
      location: { line: 3, column: 1 },
    },
    {
      tool: 'eslint-module-effects',
      rule: 'no-unreachable',
      path: 'src/main/source.ts',
      identity:
        'message:unreachableCode|node:LastStatement|syntax:c101e41c622a39ff619763e2|occurrence:1',
      message: 'Unreachable code.',
      classification: 'enforceable',
      symbol: 'unreachable',
      location: { line: 6, column: 3 },
      ratchet: { key: 'count:unreachableCode', value: 1, existingCodeOnly: true },
    },
  ];
}

export function expectedOutput217_32() {
  return [
    {
      tool: 'eslint-lint',
      rule: 'no-debugger',
      path: 'src/main/repeated.ts',
      identity:
        'message:unexpected|node:LastStatement|syntax:c101e41c622a39ff619763e2|occurrence:3',
      message: "Unexpected 'debugger' statement.",
      classification: 'enforceable',
      symbol: 'repeated',
      location: { line: 7, column: 3 },
      ratchet: { key: 'count:unexpected', value: 3, existingCodeOnly: true },
    },
  ];
}

export function expectedOutput256_38() {
  return [
    {
      tool: 'eslint-lint',
      rule: 'no-new',
      path: 'src/main/source.ts',
      identity:
        'message:noNewStatement|node:ExpressionStatement|syntax:17484e8c4ca8c94edcdbcabd|occurrence:1',
      message: "Do not use 'new' for side effects.",
      classification: 'enforceable',
      location: { line: 4, column: 1 },
    },
  ];
}

export function expectedOutput276_38() {
  return [
    {
      tool: 'eslint-lint',
      rule: 'eslint/unused-disable-directive',
      path: 'src/main/source.ts',
      identity:
        "message:Unused eslint-disable directive (no problems were reported from 'no-console').|node:Comment|syntax:d78e0da7309463e11508db15|occurrence:1",
      message: "Unused eslint-disable directive (no problems were reported from 'no-console').",
      classification: 'enforceable',
      location: { line: 1, column: 1 },
    },
  ];
}

export function expectedOutput298_38() {
  return [
    {
      tool: 'eslint-lint',
      rule: 'no-console',
      path: 'src/main/source.ts',
      identity:
        'message:unexpected|node:PropertyAccessExpression|syntax:1f69dad8fea4eca83bc663c3|occurrence:1',
      message: 'Unexpected console statement.',
      classification: 'enforceable',
      location: { line: 2, column: 1 },
    },
  ];
}

export function expectedOutput403_27() {
  return 'ESLint differential adapter failed: --project-root must be inside a generated quality-diff worktree\n';
}

export function expectedOutput423_42() {
  return 'eslint-lint crashed with exit 2: ESLint differential adapter failed: --pattern must stay within the analyzed snapshot';
}
