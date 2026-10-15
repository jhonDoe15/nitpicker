import { expect } from 'vitest';
export function expectedOutput47_29() {
  return [
    {
      tool: 'fake-quality-analyzer',
      rule: 'fixture-rule',
      path: 'src/main/existing.ts',
      identity: 'existing',
      message: 'Fixture finding',
      classification: 'enforceable',
      location: { line: 1, column: 4 },
    },
  ];
}

export function expectedOutput50_34() {
  return [
    {
      name: 'fake-quality-analyzer',
      version: '1.0.0',
      configurationHash: 'fixture-policy',
      total: 1,
      enforceable: 1,
      descriptive: 0,
    },
  ];
}

export function expectedOutput91_31() {
  return [
    {
      tool: 'fake-quality-analyzer',
      snapshot: 'head',
      rule: 'fixture-rule',
      path: 'src/main/broken.ts',
      message: 'partial analysis',
    },
  ];
}
