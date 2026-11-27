import { expect, it } from 'vitest';
it.each([[1, 2]])('x', (a, b, done) => { setTimeout(() => { expect(a).toBe(1); done(); }); });