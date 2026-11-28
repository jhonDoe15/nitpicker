import { describe, expect, it, vi } from 'vitest';
describe('panel', () => {
  const onClick = jest.fn();
  it('a', () => { render(onClick); expect(onClick).toBeCalledTimes(1); });
  it('b', () => { render(onClick); expect(onClick).toBeCalledTimes(2); });
});
