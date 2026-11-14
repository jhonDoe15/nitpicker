import { describe, expect, it } from 'vitest';
import { markdownTableLines } from './table.mts';

describe('markdown tables', () => {
  it('pads every column to its widest cell, header included', () => {
    expect(
      markdownTableLines(
        ['Rule', 'Tool'],
        [
          ['curly', 'eslint'],
          ['a-longer-rule', 'pmd'],
        ],
      ),
    ).toEqual([
      '| Rule          | Tool   |',
      '| ------------- | ------ |',
      '| curly         | eslint |',
      '| a-longer-rule | pmd    |',
    ]);
  });

  it('pads a cell that a short row leaves out', () => {
    expect(markdownTableLines(['Where', 'Why'], [['Linux']])).toEqual([
      '| Where | Why |',
      '| ----- | --- |',
      '| Linux |',
    ]);
  });
});
