import { describe, it, test, vi, beforeEach } from 'vitest';
const send = vi.fn();
describe.concurrent('billing', () => {
  beforeEach(() => { vi.spyOn(console, 'warn'); });
  it('renews', async () => { vi.useFakeTimers(); vi.setSystemTime(0); await renew(); });
  it('sends', async () => { process.env.MODE = 'x'; delete process.env.OTHER; send.mockResolvedValue(1); await run(); });
});
