import { MAX_ITEMS, limit as cap, Paging } from './no-copied-constant-source';
import * as limits from './no-copied-constant-source';
import type { Role } from './no-copied-constant-source';
import { readFileSync } from 'node:fs';

describe('eu-west-1', () => {
  it('administrator', () => {
    expect(MAX_ITEMS).toBe(50);
    expect(limits.MAX_ITEMS).toEqual(50);
  });
  test('50', () => {
    expect(cap()).toBe(MAX_ITEMS);
  });
});

it('copies numbers and strings', () => {
  expect(cap()).toBe(50);
  expect(region()).toBe('eu-west-1');
  expect(region()).toBe(`eu-west-1`);
  expect(balance()).toBe(-25);
  expect(timeout()).toBe(5000);
  expect(page()).toHaveLength(20);
  expect(pages()).toBe(40);
  expect(new Paging().size()).toBe(40);
  const sorted = [3, 50, 7].sort();
});

it('does not copy', () => {
  expect(retries()).toBe(2);
  expect(code()).toBe('ab');
  expect(depth()).toBe(9);
  expect(hidden()).toBe(77);
  expect(items()).toBe(3);
  expect(key()).toBe('hidden-key');
  expect(other()).toEqual([41, 42]);
  const options = { 'eu-west-1': true, 50: 'fifty' };
  type Region = 'eu-west-1';
  vi.mock('eu-west-1');
  expect(cap()).toBe(`${MAX_ITEMS}`);
  expect(cap(MAX_ITEMS)).toBe(50);
  expect(readFileSync('50')).toBeDefined();
});
