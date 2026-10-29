import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TROUBLESHOOTING_ANCHORS,
  TROUBLESHOOTING_FILE,
  testsFailAnchor,
  troubleshootingError,
  troubleshootingLinkOf,
  troubleshootingSentence,
  troubleshootingUrl,
  usageError,
  withTroubleshooting,
  withUsageLink,
  withoutTroubleshooting,
} from './troubleshooting.mjs';
import { docsRef } from './docs-url.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const DOC_URL = 'https://github.com/jhonDoe15/nitpicker/blob/main/docs/troubleshooting.md';
const SOURCE_FOLDERS = ['core', 'shared', 'languages'];
const SKIPPED_FOLDERS = new Set(['node_modules', 'fixtures', 'test-support', '__tests__']);
const ANCHOR_LINK = /troubleshooting\.md#([a-z0-9-]+)/gu;

function read(relative) {
  return readFileSync(path.join(root, relative), 'utf8');
}

function files(directory, accepts) {
  return readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      return SKIPPED_FOLDERS.has(entry.name) ? [] : files(relative, accepts);
    }
    return accepts(entry.name) ? [relative] : [];
  });
}

function productionSources() {
  return SOURCE_FOLDERS.flatMap((folder) =>
    files(folder, (name) => name.endsWith('.mjs') && !name.endsWith('.test.mjs')),
  );
}

function slugOf(heading) {
  return heading
    .replaceAll('`', '')
    .trim()
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N} _-]/gu, '')
    .replaceAll(' ', '-');
}

function headingsOf(markdown) {
  let fenced = false;
  const headings = [];
  for (const line of markdown.split('\n')) {
    if (line.startsWith('```')) {
      fenced = !fenced;
    }
    const match = fenced ? null : /^(#{1,6}) (.+)$/u.exec(line);
    if (match !== null) {
      headings.push({ level: match[1].length, text: match[2], slug: slugOf(match[2]) });
    }
  }
  return headings;
}

function anchorsLinkedFrom(files_) {
  return files_.flatMap((file) =>
    [...read(file).matchAll(ANCHOR_LINK)].map((match) => ({ file, anchor: match[1] })),
  );
}

const headings = headingsOf(read(TROUBLESHOOTING_FILE));
const entrySlugs = headings.filter(({ level }) => level === 3).map(({ slug }) => slug);
const registered = Object.entries(TROUBLESHOOTING_ANCHORS);

describe('the troubleshooting page', () => {
  it('has no two headings with the same anchor', () => {
    const slugs = headings.map(({ slug }) => slug);

    expect(slugs.filter((slug, index) => slugs.indexOf(slug) !== index)).toEqual([]);
  });

  it.each(registered)('has an entry for the anchor %s', (_key, anchor) => {
    expect(entrySlugs).toContain(anchor);
  });

  it('has no entry that no message links to', () => {
    expect(
      entrySlugs.filter((slug) => !Object.values(TROUBLESHOOTING_ANCHORS).includes(slug)),
    ).toEqual([]);
  });

  it('gives every entry a symptom, a cause and a fix', () => {
    const text = read(TROUBLESHOOTING_FILE);
    const entries = text.split(/^### /mu).slice(1);

    const missing = entries.flatMap((entry) =>
      ['Symptom', 'Cause', 'Fix']
        .filter((label) => !entry.includes(`**${label}.**`))
        .map((label) => `${entry.split('\n')[0]}: ${label}`),
    );

    expect(entries).toHaveLength(entrySlugs.length);
    expect(missing).toEqual([]);
  });

  it('registers unique, well-formed anchors', () => {
    expect(new Set(Object.values(TROUBLESHOOTING_ANCHORS)).size).toBe(registered.length);
    for (const [, anchor] of registered) {
      expect(anchor).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
    }
  });
});

describe('the anchors that the code links to', () => {
  const sources = productionSources();
  const text = sources.map(read).join('\n');

  it('uses every anchor in a message', () => {
    const unused = registered
      .map(([key]) => key)
      .filter((key) => !text.includes(`TROUBLESHOOTING_ANCHORS.${key}`));

    expect(unused).toEqual([]);
  });

  it('names the page in one module only, so every link goes through the helpers', () => {
    const naming = sources.filter((file) => read(file).includes('troubleshooting.md'));

    expect(naming).toEqual(['shared/messages/troubleshooting.mjs']);
  });
});

describe('the links to the page from the documentation', () => {
  const documents = [
    'README.md',
    'CHANGELOG.md',
    ...files('docs', (name) => name.endsWith('.md')),
    ...files('skills', (name) => name.endsWith('.md')),
  ];

  it('point at headings that exist', () => {
    const linked = anchorsLinkedFrom(documents);

    expect(linked.length).toBeGreaterThan(20);
    expect(linked.filter(({ anchor }) => !entrySlugs.includes(anchor))).toEqual([]);
  });

  it('is linked from the README, the usage guide, the agent snippet and the changelog', () => {
    const unlinked = [
      'README.md',
      'docs/usage.md',
      'docs/agents-snippet.md',
      'CHANGELOG.md',
    ].filter((file) => !read(file).includes('troubleshooting.md'));

    expect(unlinked).toEqual([]);
  });

  it('is linked from a troubleshooting section of every preset guide', () => {
    const guides = [
      'docs/typescript-strict-preset.md',
      'docs/python-preset.md',
      'docs/java-preset.md',
      'docs/kotlin-preset.md',
    ];
    const unlinked = guides.filter((file) => {
      const section = read(file).split(/^## Troubleshooting$/mu)[1] ?? '';
      return !section.includes('](troubleshooting.md#');
    });

    expect(unlinked).toEqual([]);
  });

  it('is linked by its full URL from every skill', () => {
    const unlinked = readdirSync(path.join(root, 'skills')).filter(
      (skill) => !read(`skills/${skill}/SKILL.md`).includes(`(${DOC_URL})`),
    );

    expect(unlinked).toEqual([]);
  });
});

describe('the message helpers', () => {
  it('builds the link from the repository URL and the registered anchor', () => {
    expect(TROUBLESHOOTING_FILE).toBe('docs/troubleshooting.md');
    expect(troubleshootingUrl('no-merge-base')).toBe(`${DOC_URL}#no-merge-base`);
    expect(troubleshootingSentence('no-merge-base')).toBe(`See ${DOC_URL}#no-merge-base`);
  });

  it('links an installed package to the page at its release tag and a checkout to main', () => {
    expect(docsRef({ version: '1.4.0', checkout: false })).toBe('v1.4.0');
    expect(docsRef({ version: '1.5.0-rc.2', checkout: false })).toBe('v1.5.0-rc.2');
    expect(docsRef({ version: '1.4.0', checkout: true })).toBe('main');
  });

  it('adds the link after the sentence of a one-line message', () => {
    expect(withTroubleshooting('Tests fail.', 'tests-fail')).toBe(
      `Tests fail. See ${DOC_URL}#tests-fail`,
    );
    expect(withTroubleshooting('Tests fail', 'tests-fail')).toBe(
      `Tests fail. See ${DOC_URL}#tests-fail`,
    );
  });

  it('puts the link on its own last line of a message with several lines', () => {
    expect(withTroubleshooting('Tests fail:\n  a\n  b\n', 'tests-fail')).toBe(
      `Tests fail:\n  a\n  b\nSee ${DOC_URL}#tests-fail`,
    );
  });

  it('keeps the link a message already has', () => {
    const linked = withTroubleshooting('Tests fail', 'tests-fail');

    expect(withTroubleshooting(linked, 'no-merge-base')).toBe(linked);
    expect(troubleshootingLinkOf(linked)).toBe(`See ${DOC_URL}#tests-fail`);
    expect(troubleshootingLinkOf('Tests fail')).toBeUndefined();
  });

  it('takes the link off a message that is quoted inside another', () => {
    expect(withoutTroubleshooting(withTroubleshooting('Tests fail', 'tests-fail'))).toBe(
      'Tests fail',
    );
    expect(withoutTroubleshooting(withTroubleshooting('Tests fail:\n  a', 'tests-fail'))).toBe(
      'Tests fail:\n  a',
    );
    expect(withoutTroubleshooting('Tests fail.')).toBe('Tests fail.');
  });

  it('wraps a message in an error that keeps its cause', () => {
    const cause = new Error('inner');
    const error = troubleshootingError('Cannot go on', 'no-base-could-be-determined', { cause });

    expect(error.message).toBe(`Cannot go on. See ${DOC_URL}#no-base-could-be-determined`);
    expect(error.cause).toBe(cause);
  });

  it('links invalid usage to the arguments entry', () => {
    expect(usageError('Unknown argument: --x').message).toBe(
      `Unknown argument: --x. See ${DOC_URL}#invalid-arguments`,
    );
    expect(withUsageLink('--x requires a value')).toBe(
      `--x requires a value. See ${DOC_URL}#invalid-arguments`,
    );
  });

  it('tells a failure of the base from a failure of the head', () => {
    expect(testsFailAnchor('base')).toBe('tests-fail-on-the-base');
    expect(testsFailAnchor('head')).toBe('tests-fail');
    expect(testsFailAnchor(undefined)).toBe('tests-fail');
  });
});
