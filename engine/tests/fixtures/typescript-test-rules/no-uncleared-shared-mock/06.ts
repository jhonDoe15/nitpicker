import { expect, it, vi, beforeEach } from 'vitest';
const send = vi.fn();
beforeEach(() => { send.mockClear(); });
it('a', () => { notify(send); expect(send).toHaveBeenCalledTimes(1); });
it('b', () => { notify(send); expect(send).toHaveBeenCalledTimes(1); });
