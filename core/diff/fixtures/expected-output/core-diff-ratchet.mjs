import { expect } from 'vitest';
export function expectedOutput31_38() {
  return [
    {
      tool: 'structure',
      rule: 'function-statements-limit',
      path: 'src/big.ts',
      identity: 'function:big:occurrence:1:source:after',
      message:
        'big has 78 statements; limit is 15. Split by responsibility and name each part for what it checks or does.',
      classification: 'enforceable',
      symbol: 'big',
      location: { line: 1 },
      ratchet: {
        key: 'function:big:occurrence:1:statements',
        value: 78,
        worseMessage:
          'big grew from {base} to 78 statements (limit 15). Put new code in a new function.',
        heldMessage:
          'big: 78 statements (limit 15), allowed because base was {base}; any increase fails.',
      },
      heldAtBase: 80,
    },
  ];
}

export function expectedOutput38_32() {
  return [
    {
      tool: 'structure',
      rule: 'function-statements-limit',
      path: 'src/big.ts',
      identity: 'function:big:occurrence:1:source:after',
      message: 'big grew from 80 to 81 statements (limit 15). Put new code in a new function.',
      classification: 'enforceable',
      symbol: 'big',
      location: { line: 1 },
      ratchet: {
        key: 'function:big:occurrence:1:statements',
        value: 81,
        worseMessage:
          'big grew from {base} to 81 statements (limit 15). Put new code in a new function.',
        heldMessage:
          'big: 81 statements (limit 15), allowed because base was {base}; any increase fails.',
      },
    },
  ];
}

export function expectedOutput142_40() {
  return [
    'crap',
    'fileLines',
    'folderFiles',
    'lineLength',
    'lines',
    'maxControlNesting',
    'parameters',
    'statements',
  ];
}

export function expectedOutput192_38() {
  return [
    {
      tool: 'crap',
      rule: 'crap-score-limit',
      path: 'src/price.ts',
      identity: 'function:priceOf:occurrence:1:source:after',
      message:
        'priceOf has CRAP 15.00; score must be below 9. Test its uncovered branches, or split a branchy part into its own function.',
      classification: 'enforceable',
      symbol: 'priceOf',
      ratchet: {
        key: 'function:priceOf:occurrence:1:crap',
        value: 15,
        worseMessage:
          'priceOf CRAP rose from {base} to 15 (limit 9). Put new code in a new function and cover it with tests.',
        heldMessage:
          'priceOf: CRAP 15.00 (limit 9), allowed because base was {base}; any increase fails.',
      },
      heldAtBase: 15,
    },
  ];
}

export function expectedOutput276_32() {
  return [
    {
      tool: 'crap',
      rule: 'crap-coverage-unknown',
      path: 'src/price.ts',
      identity: 'function:priceOf:occurrence:1:source:after',
      message:
        'priceOf has unknown coverage and no CRAP score: no test runs it. Add a test that calls it; for inline composition-root wiring, move it to a named function in adapters/ and test that.',
      classification: 'enforceable',
      symbol: 'priceOf',
    },
  ];
}

export function expectedOutput309_38() {
  return [
    {
      tool: 'eslint',
      rule: '@typescript-eslint/no-explicit-any',
      path: 'src/f.ts',
      identity: 'a2',
      message: 'Unexpected any.',
      classification: 'enforceable',
      symbol: 'f',
      location: { line: 3 },
      ratchet: { key: 'count:any', value: 2, existingCodeOnly: true },
      heldAtBase: 2,
    },
    {
      tool: 'eslint',
      rule: '@typescript-eslint/no-explicit-any',
      path: 'src/f.ts',
      identity: 'b2',
      message: 'Unexpected any.',
      classification: 'enforceable',
      symbol: 'f',
      location: { line: 5 },
      ratchet: { key: 'count:any', value: 2, existingCodeOnly: true },
      heldAtBase: 2,
    },
  ];
}
