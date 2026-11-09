import { describe, expect, it } from 'vitest';
import { newerToolchain } from './go-tools.mjs';

describe('the toolchain the lint program builds with', () => {
  it.each([
    ['go1.26.3', undefined],
    ['go1.27.0', undefined],
    ['go1.27rc1', undefined],
    ['go1.28', 'go1.28'],
    ['go1.28.0', 'go1.28.0'],
    ['go1.28rc1', 'go1.28rc1'],
    ['go1.28.0 X:nocoverageredesign', 'go1.28.0'],
    ['go2.0.1', 'go2.0.1'],
    ['devel go1.29-0123abcd Mon Jan 1 00:00:00 2027 +0000', undefined],
    ['', undefined],
  ])('reads %j as %j', (version, toolchain) => {
    expect(newerToolchain(version)).toBe(toolchain);
  });
});
