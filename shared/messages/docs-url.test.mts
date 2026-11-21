import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { fieldOf, textOf } from '../values/readers.mts';
import { docsRef, docsRootUrl, docsUrl } from './docs-url.mts';

function repositoryUrl(): string {
  try {
    const manifest: unknown = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    );
    return textOf(fieldOf(fieldOf(manifest, 'repository'), 'url'));
  } catch (error) {
    throw new Error('Cannot read package.json', { cause: error });
  }
}

const REPOSITORY = repositoryUrl();
const roots: string[] = [];

function packageRoot({
  manifest,
  checkout = false,
}: {
  manifest?: string | undefined;
  checkout?: boolean;
}): URL {
  const root = mkdtempSync(path.join(tmpdir(), 'docs-url-'));
  roots.push(root);
  if (manifest !== undefined) {
    writeFileSync(path.join(root, 'package.json'), manifest);
  }
  if (checkout) {
    mkdirSync(path.join(root, '.git'));
  }
  return pathToFileURL(`${root}/`);
}

function manifestOf(fields: unknown): string {
  return JSON.stringify(fields);
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('docsUrl', () => {
  it('points a file of the repository at its page on GitHub, derived from package.json', () => {
    const base = REPOSITORY.replace(/^git\+/u, '').replace(/\.git$/u, '');

    expect(docsUrl('docs/usage.md')).toBe(`${base}/blob/main/docs/usage.md`);
    expect(docsUrl('docs/usage.md')).toMatch(
      /^https:\/\/github\.com\/[^/]+\/nitpicker\/blob\/main\/docs\/usage\.md$/u,
    );
  });

  it('points a rule page at the latest release from a checkout, since main does not commit the pages', () => {
    const main = 'https://github.com/owner/nitpicker/blob/main';
    const tag = 'https://github.com/owner/nitpicker/blob/v1.2.0';

    expect(docsUrl('docs/rules/README.md', undefined, main)).toBe(
      'https://github.com/owner/nitpicker/blob/latest/docs/rules/README.md',
    );
    expect(docsUrl('docs/rules/checks.md', 'structure', tag)).toBe(
      `${tag}/docs/rules/checks.md#structure`,
    );
    expect(docsUrl('docs/usage.md', undefined, main)).toBe(`${main}/docs/usage.md`);
  });

  it('adds the anchor as the fragment when there is one', () => {
    expect(docsUrl('docs/rules/checks.md', 'structure-function-lines-limit')).toBe(
      `${String(docsUrl('docs/rules/checks.md'))}#structure-function-lines-limit`,
    );
  });

  it('adds no fragment for an empty anchor', () => {
    expect(docsUrl('docs/usage.md', '')).toBe(docsUrl('docs/usage.md'));
  });

  it('builds the link on a root that the caller computed once', () => {
    const root = 'https://github.com/owner/nitpicker/blob/v1.2.0';

    expect(docsUrl('docs/usage.md', 'exit-codes', root)).toBe(`${root}/docs/usage.md#exit-codes`);
  });
});

describe('docsRootUrl', () => {
  const repository = { type: 'git', url: 'git+https://github.com/owner/nitpicker.git' };

  it('points an installed package at its release tag and a checkout at main', () => {
    const manifest = manifestOf({ version: '1.2.0-rc.3', repository });

    expect(docsRootUrl(packageRoot({ manifest }))).toBe(
      'https://github.com/owner/nitpicker/blob/v1.2.0-rc.3',
    );
    expect(docsRootUrl(packageRoot({ manifest, checkout: true }))).toBe(
      'https://github.com/owner/nitpicker/blob/main',
    );
    expect(docsRef({ version: '1.2.0', checkout: false })).toBe('v1.2.0');
    expect(docsRef({ version: '1.2.0', checkout: true })).toBe('main');
  });

  it.each([
    ['there is no package.json', undefined],
    ['package.json is not JSON', '{"version": '],
    ['package.json names no repository', manifestOf({ version: '1.2.0' })],
    ['the repository is not an https URL', manifestOf({ version: '1.2.0', repository: 'owner/x' })],
    ['an installed package has no version', manifestOf({ repository })],
  ])('gives no root, and so no link, when %s', (_case, manifest) => {
    expect(docsRootUrl(packageRoot({ manifest }))).toBeUndefined();
  });
});
