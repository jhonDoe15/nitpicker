import { expect } from 'vitest';
export function expectedOutput84_25({ FILE }) {
  return {
    tool: 'structure',
    rule: 'function-lines-limit',
    path: FILE,
    identity: 'function:Big.big:occurrence:1:source:796ab01f9eb19cf455b6cda2',
    message: 'Big.big has 51 lines; limit is 50',
    classification: 'enforceable',
    symbol: 'Big.big',
    ratchet: {
      key: 'function:Big.big:occurrence:1:lines',
      value: 51,
      worseMessage:
        'Big.big grew from {base} to 51 lines (limit 50). Put new code in a new function.',
      heldMessage:
        'Big.big: 51 lines (limit 50), allowed because base was {base}; any increase fails.',
    },
    location: { line: 2 },
  };
}

export function expectedOutput114_27() {
  return 'function:Big.big:occurrence:1:source:796ab01f9eb19cf455b6cda2';
}

export function expectedOutput115_27() {
  return 'function:Big.big:occurrence:2:source:82386020526deefc6efbafdb';
}
