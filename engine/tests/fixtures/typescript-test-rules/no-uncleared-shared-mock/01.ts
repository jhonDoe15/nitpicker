import { describe, expect, it, vi, beforeEach } from 'vitest';
const send = vi.fn();
it('sends once', () => { notify(send); expect(send).toHaveBeenCalledTimes(1); });
it('stays quiet when muted', () => { notify(send, { muted: true }); expect(send).not.toHaveBeenCalled(); });
