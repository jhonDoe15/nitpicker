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
} from './troubleshooting.mjs';

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

    expect(entries).toHaveLength(entrySlugs.length);
    for (const entry of entries) {
      const title = entry.split('\n')[0];
      expect(entry, title).toMatch(/\*\*Symptom\.\*\*/u);
      expect(entry, title).toMatch(/\*\*Cause\.\*\*/u);
      expect(entry, title).toMatch(/\*\*Fix\.\*\*/u);
    }
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

  it.each(registered)('uses the anchor %s in a message', (key) => {
    expect(text).toContain(`TROUBLESHOOTING_ANCHORS.${key}`);
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

  it.each(['README.md', 'docs/usage.md', 'docs/agents-snippet.md', 'CHANGELOG.md'])(
    '%s links the page',
    (file) => {
      expect(read(file)).toMatch(/troubleshooting\.md/u);
    },
  );

  it.each([
    'docs/typescript-strict-preset.md',
    'docs/python-preset.md',
    'docs/java-preset.md',
    'docs/kotlin-preset.md',
  ])('%s has a troubleshooting section that links the page', (file) => {
    const section = read(file).split(/^## Troubleshooting$/mu)[1];

    expect(section, `${file} has no Troubleshooting section`).toBeDefined();
    expect(section).toMatch(/\]\(troubleshooting\.md#/u);
  });

  it.each(readdirSync(path.join(root, 'skills')))(
    'the %s skill links the page by its full URL',
    (skill) => {
      expect(read(`skills/${skill}/SKILL.md`)).toContain(`(${DOC_URL})`);
    },
  );
});

describe('the message helpers', () => {
  it('builds the link from the repository URL and the registered anchor', () => {
    expect(TROUBLESHOOTING_FILE).toBe('docs/troubleshooting.md');
    expect(troubleshootingUrl('no-merge-base')).toBe(`${DOC_URL}#no-merge-base`);
    expect(troubleshootingSentence('no-merge-base')).toBe(`See ${DOC_URL}#no-merge-base`);
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
    expect(withUsageLink('--x requires a value')).toContain('#invalid-arguments');
  });

  it('tells a failure of the base from a failure of the head', () => {
    expect(testsFailAnchor('base')).toBe('tests-fail-on-the-base');
    expect(testsFailAnchor('head')).toBe('tests-fail');
    expect(testsFailAnchor(undefined)).toBe('tests-fail');
  });
});
