import { describe, it, test, vi, beforeEach } from 'vitest';
describe('billing', { concurrent: true }, () => {
  describe('clock', { sequential: true }, () => { it('c', () => { vi.useFakeTimers(); }); });
  it('e', async () => { vi.useFakeTimers(); });
  it('f', async () => { await send(); });
});
