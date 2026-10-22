import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { docsUrl } from './docs-url.mjs';

const REPOSITORY = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
  .repository.url;

describe('docsUrl', () => {
  it('points a file of the repository at its page on GitHub, derived from package.json', () => {
    const base = REPOSITORY.replace(/^git\+/u, '').replace(/\.git$/u, '');

    expect(docsUrl('docs/usage.md')).toBe(`${base}/blob/main/docs/usage.md`);
    expect(docsUrl('docs/usage.md')).toMatch(
      /^https:\/\/github\.com\/[^/]+\/nitpicker\/blob\/main\//u,
    );
  });

  it('adds the anchor as the fragment when there is one', () => {
    expect(docsUrl('docs/rules/checks.md', 'structure-function-lines-limit')).toBe(
      `${docsUrl('docs/rules/checks.md')}#structure-function-lines-limit`,
    );
  });

  it('adds no fragment for an empty anchor', () => {
    expect(docsUrl('docs/usage.md', '')).toBe(docsUrl('docs/usage.md'));
  });
});
