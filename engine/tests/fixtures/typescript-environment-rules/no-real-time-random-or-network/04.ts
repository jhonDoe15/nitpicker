import { mock } from 'node:test';
it('reads the clock', () => {
  mock.timers.enable({ apis: ['Date'], now: 0 });
  expect(new Date(5)).toBeDefined();
  expect(Date.now()).toBe(0);
});
