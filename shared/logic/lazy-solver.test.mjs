import { describe, expect, it, vi } from 'vitest';

describe('loading the logic solver', () => {
  it('loads the solver only when a condition is decided', async () => {
    const loads = [];
    vi.doMock('z3-solver', async (importOriginal) => {
      loads.push('z3-solver');
      return importOriginal();
    });
    const { normalize } = await import('./normalize.mjs');
    const { decide } = await import('./decide.mjs');
    const ready = { kind: 'name', value: 'ready', children: [], range: undefined };

    normalize(ready);
    expect(loads).toEqual([]);

    await expect(decide([ready], ready)).resolves.toBe('true');
    expect(loads).toEqual(['z3-solver']);
  });
});
