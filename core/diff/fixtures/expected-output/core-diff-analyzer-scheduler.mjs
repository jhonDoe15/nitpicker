import { expect } from 'vitest';
export function expectedOutput71_78() {
  return {
    findings: [
      {
        tool: 'inner',
        rule: 'r',
        path: 'a',
        identity: 'i',
        message: 'm',
        classification: 'enforceable',
      },
    ],
  };
}

export function expectedOutput93_55() {
  return {
    findings: [
      {
        tool: 'probe',
        rule: 'r',
        path: 'a',
        identity: 'i',
        message: 'unset kept',
        classification: 'enforceable',
      },
    ],
  };
}

export function expectedOutput320_38() {
  return {
    reports: [
      ['eslint-a', { findings: [] }],
      ['eslint-b', { findings: [] }],
    ],
    errors: [],
    timings: [
      { name: 'eslint-a', elapsedMs: expect.any(Number) },
      { name: 'eslint-b', elapsedMs: expect.any(Number) },
    ],
  };
}

export function expectedOutput382_56() {
  return { name: 'crap', status: 'skipped', elapsedMs: expect.any(Number), because: 'coverage' };
}
