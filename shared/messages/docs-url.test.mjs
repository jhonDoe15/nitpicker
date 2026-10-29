import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { docsRef, docsRootUrl, docsUrl } from './docs-url.mjs';

const REPOSITORY = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
  .repository.url;

describe('docsUrl', () => {
  it('points a file of the repository at its page on GitHub, derived from package.json', () => {
    const base = REPOSITORY.replace(/^git\+/u, '').replace(/\.git$/u, '');

    expect(docsUrl('docs/usage.md')).toBe(`${base}/blob/main/docs/usage.md`);
    expect(docsUrl('docs/usage.md')).toMatch(
      /^https:\/\/github\.com\/[^/]+\/nitpicker\/blob\/main\/docs\/usage\.md$/u,
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

describe('docsRef', () => {
  it('links an installed package to the release tag of its version and a checkout to main', () => {
    expect(docsRef({ version: '0.1.0-rc.1', checkout: false })).toBe('v0.1.0-rc.1');
    expect(docsRef({ version: '0.1.0-rc.1', checkout: true })).toBe('main');
  });
});

describe('docsUrl with a root', () => {
  it('builds the link under the root it is given, and none without a root', () => {
    const root = 'https://github.com/example/nitpicker/blob/v1.2.3';

    expect(docsUrl('docs/usage.md', 'rules', root)).toBe(`${root}/docs/usage.md#rules`);
    expect(docsUrl('docs/usage.md', undefined, docsRootUrl())).toBe(docsUrl('docs/usage.md'));
  });
});
