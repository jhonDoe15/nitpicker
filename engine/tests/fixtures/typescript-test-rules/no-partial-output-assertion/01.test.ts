import { expect, it } from 'vitest';

it('checks fragments', () => {
  expect(output).toContain('fragment');
  expect(output).toMatch(/error/u);
  expect(output).toMatch(/^whole$/u);
  expect(output).not.toContain('secret');
  expect(list).toContain(item);
  expect(actual).toMatchObject({ id: 1 });
  expect(actual).toEqual({ nested: [expect.objectContaining({ id: 1 })] });
  expect(actual).toEqual({ id: expect.any(Number) });
});
