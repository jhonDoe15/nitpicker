import { expect, it, vi } from 'vitest';
import { send } from './mail';
vi.mock('./mail');
it.each([1, 2])('sends %s', (count) => { notify(count); expect(send).toHaveBeenCalledTimes(1); });
