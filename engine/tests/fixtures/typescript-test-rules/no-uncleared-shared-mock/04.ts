import { expect, it, vi } from 'vitest';
const { send } = vi.hoisted(() => ({ send: vi.fn() }));
const setup = () => notify(send);
it('a', () => { setup(); expect(send.mock.calls[0]).toEqual([1]); });
it('b', () => { setup(); });
