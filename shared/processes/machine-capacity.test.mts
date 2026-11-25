import { describe, expect, it } from 'vitest';
import { MEMORY_LIMIT_VARIABLE, machineMemory } from './machine-capacity.mts';

const GIB = 1024 ** 3;

describe('machineMemory', () => {
  it('takes the container limit when it is below the machine memory', () => {
    expect(machineMemory(4 * GIB, 16 * GIB, {})).toBe(4 * GIB);
  });

  it('takes the machine memory when there is no container limit', () => {
    expect(machineMemory(0, 16 * GIB, {})).toBe(16 * GIB);
  });

  it('takes the machine memory when the limit is above it', () => {
    expect(machineMemory(64 * GIB, 16 * GIB, {})).toBe(16 * GIB);
  });

  it('respects NITPICKER_MEMORY_LIMIT_BYTES when below the container or machine limit', () => {
    expect(machineMemory(14.5 * GIB, 15 * GIB, { [MEMORY_LIMIT_VARIABLE]: String(7 * GIB) })).toBe(
      7 * GIB,
    );
    expect(machineMemory(14.5 * GIB, 15 * GIB, { [MEMORY_LIMIT_VARIABLE]: String(20 * GIB) })).toBe(
      14.5 * GIB,
    );
    expect(machineMemory(14.5 * GIB, 15 * GIB, { [MEMORY_LIMIT_VARIABLE]: 'not-a-number' })).toBe(
      14.5 * GIB,
    );
  });
});
