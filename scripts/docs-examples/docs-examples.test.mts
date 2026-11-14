import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyExamples, EXAMPLE_BLOCKS } from './render.mts';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file: string): string => readFileSync(path.join(root, file), 'utf8');
const markers = (text: string): string[] =>
  [...text.matchAll(/<!-- example:(?<name>[a-z-]+) -->/gu)].map(
    (match) => match.groups?.['name'] ?? '',
  );

const linksTo = (text: string): string[] =>
  [...text.matchAll(/\]\((?<target>[^)]*examples\.md)\)/gu)].map(
    (match) => match.groups?.['target'] ?? '',
  );

describe('the output blocks of the documentation', () => {
  it.each(['README.md', 'docs/examples.md'])(
    'match what the console renderer prints in %s',
    (file) => {
      const text = read(file);
      expect(applyExamples(text), `run npm run gen:checks to update ${file}`).toBe(text);
    },
  );

  it('shows the README sample in the grouped layout, once per rule', () => {
    const readme = read('README.md');
    expect(markers(readme)).toEqual(['typescript-failing']);
    expect(readme.split('\n').filter((line) => line.includes('by area:'))).toEqual([
      '  by area: lint 3 · mutation 1',
    ]);
    expect(readme.match(/If this is intended, add/gu)).toHaveLength(4);
  });

  it('renders every marker, so none is left unmatched', () => {
    const text = read('docs/examples.md');
    const rendered = text.match(/<!-- example:[a-z-]+ -->\n{1,2}```console\n\$ npx nitpicker/gu);
    expect(rendered).toHaveLength(markers(text).length);
  });

  it('uses every rendered block in the examples page', () => {
    expect(markers(read('docs/examples.md')).toSorted()).toEqual(
      Object.keys(EXAMPLE_BLOCKS).toSorted(),
    );
  });

  it('links the examples page from the README and the usage guide', () => {
    expect(linksTo(read('README.md'))).toEqual(['docs/examples.md', 'docs/examples.md']);
    expect(linksTo(read('docs/usage.md'))).toEqual(['examples.md']);
  });
});
