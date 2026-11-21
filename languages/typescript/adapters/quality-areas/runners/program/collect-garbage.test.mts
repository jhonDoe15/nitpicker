import { describe, expect, it } from 'vitest';
import { collectGarbage } from './collect-garbage.mts';

describe('collectGarbage', () => {
  it('releases unreachable objects without exposing gc on the global object', async () => {
    let held: object | undefined = { payload: new Array(1000).fill(0) };
    const reference = new WeakRef(held);
    held = undefined;
    await new Promise((resolve) => setImmediate(resolve));
    collectGarbage();
    expect([held, reference.deref(), 'gc' in globalThis]).toEqual([undefined, undefined, false]);
  });
});
