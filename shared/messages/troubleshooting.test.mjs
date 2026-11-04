import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  TROUBLESHOOTING_ANCHORS,
  TROUBLESHOOTING_FILE,
  explainedError,
  failureText,
  isExplainedError,
  testsFailAnchor,
  toolErrorHelpLine,
  troubleshootingError,
  troubleshootingLinkOf,
  troubleshootingSentence,
  troubleshootingUrl,
  withTroubleshooting,
  withoutTroubleshooting,
} from './troubleshooting.mjs';
import {
  anchorsLinkedFrom,
  files,
  headingsOf,
  pageEntries,
  productionSources,
  read,
  root,
} from './test-support/troubleshooting-page.mjs';

const DOC_URL = 'https://github.com/jhonDoe15/nitpicker/blob/main/docs/troubleshooting.md';
const ANCHOR_REFERENCE = /TROUBLESHOOTING_ANCHORS\.([A-Za-z0-9]+)/gu;
const DOCS_INDEX = [
  'docs/usage.md',
  ...files('docs', (name) => name.endsWith('-preset.md') || name.endsWith('-strict-preset.md')),
];

const headings = headingsOf(read(TROUBLESHOOTING_FILE));
const entrySlugs = pageEntries().map(({ slug }) => slug);
const registered = Object.entries(TROUBLESHOOTING_ANCHORS);

async function helpersWithoutRepository() {
  const copy = mkdtempSync(path.join(tmpdir(), 'troubleshooting-'));
  for (const file of ['messages/troubleshooting.mjs', 'messages/docs-url.mjs', 'paths/glob.mjs']) {
    mkdirSync(path.dirname(path.join(copy, 'shared', file)), { recursive: true });
    copyFileSync(path.join(root, 'shared', file), path.join(copy, 'shared', file));
  }
  writeFileSync(path.join(copy, 'package.json'), JSON.stringify({ version: '1.0.0' }));
  try {
    return await import(pathToFileURL(path.join(copy, 'shared/messages/troubleshooting.mjs')).href);
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
}

describe('the troubleshooting page', () => {
  it('has no two headings with the same anchor', () => {
    const slugs = headings.map(({ slug }) => slug);

    expect(slugs.filter((slug, index) => slugs.indexOf(slug) !== index)).toEqual([]);
  });

  it.each(registered)('has an entry for the anchor %s', (_key, anchor) => {
    expect(entrySlugs).toContain(anchor);
  });

  it('reaches every entry from a message or from the usage guide and the preset guides', () => {
    const linked = new Set([
      ...Object.values(TROUBLESHOOTING_ANCHORS),
      ...anchorsLinkedFrom(DOCS_INDEX).map(({ anchor }) => anchor),
    ]);

    expect(entrySlugs.filter((slug) => !linked.has(slug))).toEqual([]);
  });

  it('gives every entry a symptom, a cause and a fix', () => {
    const missing = pageEntries().flatMap((entry) =>
      ['Symptom', 'Cause', 'Fix']
        .filter((label) => !entry.text.includes(`**${label}.**`))
        .map((label) => `${entry.slug}: ${label}`),
    );

    expect(entrySlugs).toHaveLength(headings.filter(({ level }) => level === 3).length);
    expect(missing).toEqual([]);
  });

  it('registers unique, well-formed anchors', () => {
    const anchors = Object.values(TROUBLESHOOTING_ANCHORS);

    expect(new Set(anchors).size).toBe(registered.length);
    expect(anchors.filter((anchor) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(anchor))).toEqual([]);
  });
});

describe('the anchors that the code links to', () => {
  const sources = productionSources();
  const named = sources.flatMap((file) =>
    [...read(file).matchAll(ANCHOR_REFERENCE)].map(([, key]) => ({ file, key })),
  );

  it('uses every anchor in a message', () => {
    const used = new Set(named.map(({ key }) => key));

    expect(registered.map(([key]) => key).filter((key) => !used.has(key))).toEqual([]);
  });

  it('names only registered anchors, so no link is lost to a missing key', () => {
    expect(named.filter(({ key }) => TROUBLESHOOTING_ANCHORS[key] === undefined)).toEqual([]);
  });

  it('names the page in one module only, so every link goes through the helpers', () => {
    const naming = sources.filter((file) => read(file).includes('troubleshooting.md'));

    expect(naming).toEqual(['shared/messages/troubleshooting.mjs']);
  });
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
    expect(withTroubleshooting('The base install failed:', 'tests-fail')).toBe(
      `The base install failed. See ${DOC_URL}#tests-fail`,
    );
  });

  it('puts the link on its own last line of a message with several lines', () => {
    expect(withTroubleshooting('Tests fail:\n  a\n  b\n', 'tests-fail')).toBe(
      `Tests fail:\n  a\n  b\nSee ${DOC_URL}#tests-fail`,
    );
  });

  it('keeps the message as it is without an anchor or with a link it already has', () => {
    const linked = withTroubleshooting('Tests fail', 'tests-fail');

    expect(withTroubleshooting('Run `npm install` first.', undefined)).toBe(
      'Run `npm install` first.',
    );
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
    const error = troubleshootingError('Cannot go on', 'an-analyzer-crashes', { cause });

    expect(error.message).toBe(`Cannot go on. See ${DOC_URL}#an-analyzer-crashes`);
    expect(error.cause).toBe(cause);
  });

  it('leaves an error that explains itself without the link of a catch-all', () => {
    const explained = explainedError('Gradle did not finish within 15 minutes', { cause: 'x' });

    expect(isExplainedError(explained)).toBe(true);
    expect(isExplainedError(new Error('x'))).toBe(false);
    expect(explained.cause).toBe('x');
    expect(explained).toEqual(new Error('Gradle did not finish within 15 minutes'));
    expect(failureText(explained, 'the-gradle-build-fails')).toBe(
      'Gradle did not finish within 15 minutes',
    );
    expect(failureText(new Error('Build failed'), 'the-gradle-build-fails')).toBe(
      `Build failed. See ${DOC_URL}#the-gradle-build-fails`,
    );
    expect(failureText('Build failed', undefined)).toBe('Build failed');
  });

  it('links a test failure on the base only, since a head failure names its own fix', () => {
    expect(testsFailAnchor('base')).toBe('tests-fail-on-the-base');
    expect(testsFailAnchor('head')).toBeUndefined();
    expect(testsFailAnchor(undefined)).toBeUndefined();
  });

  it('points at the tool errors entry once when a listed tool error has no link', () => {
    const linked = withTroubleshooting('Build failed', 'the-gradle-build-fails');

    expect(toolErrorHelpLine([linked, 'Run `npm install` first.'])).toBe(
      `Help with tool errors: ${DOC_URL}#exit-code-2-and-tool-errors`,
    );
    expect(toolErrorHelpLine([linked])).toBeUndefined();
    expect(toolErrorHelpLine([])).toBeUndefined();
  });

  it('prints messages without links when package.json names no repository', async () => {
    const helpers = await helpersWithoutRepository();

    expect(helpers.withTroubleshooting('Tests fail', 'tests-fail')).toBe('Tests fail');
    expect(helpers.troubleshootingError('Build failed', 'the-gradle-build-fails').message).toBe(
      'Build failed',
    );
    expect(helpers.troubleshootingSentence('tests-fail')).toBeUndefined();
    expect(helpers.toolErrorHelpLine(['Build failed'])).toBeUndefined();
  });
});
