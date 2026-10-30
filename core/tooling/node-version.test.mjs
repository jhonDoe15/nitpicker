import { describe, expect, it } from 'vitest';
import { minimumNodeVersion, unsupportedNodeMessage } from './node-version.mjs';

describe('unsupportedNodeMessage', () => {
  it.each([
    ['22.14.0', '>=22.14'],
    ['22.14.1', '>=22.14'],
    ['22.20.0', '>=22.14'],
    ['24.0.0', '>=22.14'],
    ['v22.14.0', '>= 22.14'],
    ['20.18.0', '^22.14'],
    ['23.0.0-pre', '>=22.14'],
  ])('accepts Node.js %s for engines %s', (version, range) => {
    expect(unsupportedNodeMessage(version, range)).toBeUndefined();
  });

  it.each([
    ['22.13.9', '>=22.14', '22.13.9'],
    ['20.18.0', '>=22.14', '20.18.0'],
    ['v18.20.4', '>=22.14', '18.20.4'],
  ])('rejects Node.js %s for engines %s', (version, range, shown) => {
    expect(unsupportedNodeMessage(version, range)).toBe(
      `nitpicker needs Node.js 22.14 or newer, and this is Node.js ${shown}. Install a newer Node.js (for example with nvm install 22).`,
    );
  });
});

describe('minimumNodeVersion', () => {
  it('reads the floor of a >= range and nothing else', () => {
    expect([minimumNodeVersion('>=22.14'), minimumNodeVersion('^22.14')]).toEqual([
      '22.14',
      undefined,
    ]);
  });
});
