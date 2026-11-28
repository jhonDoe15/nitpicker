import { mock, it } from 'node:test';
const send = mock.fn();
it('a', () => { notify(send); assert.equal(send.mock.callCount(), 1); });
it('b', () => { notify(send); });
