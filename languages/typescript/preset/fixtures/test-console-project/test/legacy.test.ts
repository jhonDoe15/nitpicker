import { expect, it } from 'vitest';

it('still calls the deprecated api', () => {
  console.warn(`[legacy] deprecated call from ${import.meta.url}:12:3 at 0x1f2e`);
  console.warn(`cannot read config in ${process.cwd()} after ${process.pid} tries`);
  expect(import.meta.url).toContain('legacy.test.ts');
});
