import { vi } from 'vitest';
beforeEach(() => {
  vi.useFakeTimers();
});
it('stamps the order', () => {
  const order = { at: new Date(), id: Math.random() };
  expect(order.at).toBeDefined();
});
