import { describe, expect, it } from 'vitest';
import { machineMemory, toolHeapFlags, toolSlots, withToolHeap } from './tool-slots.mts';

const GIB = 1024 ** 3;

describe('machineMemory', () => {
  it('takes the container limit when it is below the machine memory', () => {
    expect(machineMemory(4 * GIB, 16 * GIB)).toBe(4 * GIB);
  });

  it('takes the machine memory when there is no container limit', () => {
    expect(machineMemory(0, 16 * GIB)).toBe(16 * GIB);
  });

  it('takes the machine memory when the limit is above it', () => {
    expect(machineMemory(64 * GIB, 16 * GIB)).toBe(16 * GIB);
  });
});

describe('toolSlots', () => {
  it('runs one tool per core when memory is plenty', () => {
    expect(toolSlots(4, 16 * GIB)).toBe(4);
  });

  it('runs fewer tools than cores when memory is short', () => {
    expect(toolSlots(16, 8 * GIB)).toBe(4);
  });

  it('runs at least one tool', () => {
    expect(toolSlots(4, GIB)).toBe(1);
  });
});

describe('toolHeapFlags', () => {
  it('splits three quarters of the memory between the slots', () => {
    expect(toolHeapFlags(4)).toEqual(['-XX:MaxRAMPercentage=18.8']);
    expect(toolHeapFlags(1)).toEqual(['-XX:MaxRAMPercentage=75.0']);
  });
});

describe('withToolHeap', () => {
  it('puts the slot heap before the flags already set', () => {
    expect(withToolHeap(['-Dfile.encoding=UTF-8'], 2)).toEqual([
      '-XX:MaxRAMPercentage=37.5',
      '-Dfile.encoding=UTF-8',
    ]);
  });

  it.each([['-Xmx2g'], ['-XX:MaxRAMPercentage=50'], ['-XX:InitialRAMPercentage=10']])(
    'keeps the heap the user sized with %s',
    (flag) => {
      expect(withToolHeap([flag], 4)).toEqual([flag]);
    },
  );
});
