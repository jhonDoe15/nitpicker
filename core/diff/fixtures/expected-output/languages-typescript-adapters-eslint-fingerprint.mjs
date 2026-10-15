import { expect } from 'vitest';
export function expectedOutput166_38({ SILENT }) {
  return [
    {
      tool: 'eslint-strict',
      rule: SILENT,
      path: 'src/legacy.ts',
      identity:
        'message:Reported text.|node:CatchClause|syntax:1aa86ed9695b52439cb90d7f|occurrence:1',
      message: 'Reported text.',
      location: { line: 4, column: 5 },
      classification: 'enforceable',
      symbol: 'load',
      ratchet: { key: 'count:Reported text.', value: 1, existingCodeOnly: true },
      heldAtBase: 1,
    },
  ];
}

export function expectedOutput173_38({ SILENT }) {
  return [
    {
      tool: 'eslint-strict',
      rule: SILENT,
      path: 'src/legacy.ts',
      identity:
        'message:Reported text.|node:CatchClause|syntax:1aa86ed9695b52439cb90d7f|occurrence:1',
      message: 'Reported text.',
      location: { line: 4, column: 5 },
      classification: 'enforceable',
      symbol: 'load',
      ratchet: { key: 'count:Reported text.', value: 1, existingCodeOnly: true },
      heldAtBase: 1,
    },
  ];
}

export function expectedOutput207_32() {
  return [
    {
      tool: 'eslint-strict',
      rule: 'nitpicker/no-silent-catch',
      path: 'src/legacy.ts',
      identity:
        'message:Reported text.|node:CatchClause|syntax:1aa86ed9695b52439cb90d7f|occurrence:1',
      message: 'Reported text.',
      location: { line: 13, column: 5 },
      classification: 'enforceable',
      symbol: 'fetchValue',
      ratchet: { key: 'count:Reported text.', value: 1, existingCodeOnly: true },
    },
  ];
}

export function expectedOutput262_41() {
  return {
    key: 'count:noThrow',
    value: 1,
    existingCodeOnly: true,
    growthAdvice:
      'This function had {base} of these at base and the count may not grow: a throw on a new line counts as new even when the count holds, so edit an existing throw line in place to throw a reason a new helper returns, or return a union from a new helper function.',
  };
}
