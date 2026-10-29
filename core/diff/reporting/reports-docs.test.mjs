import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SNAPSHOT_REPORT_FILE_NAMES } from '../../snapshot/reporters.mjs';
import { REPORT_FILE_NAMES } from './reporters.mjs';

const REPOSITORY = path.join(import.meta.dirname, '../../..');
const DOCS = path.join(REPOSITORY, 'docs');
const REPORT_FILE_PATTERN = /`((?!nitpicker)[\w.-]+\.(?:json|txt|xml|sarif))`/gu;
const REPORT_NAME_SOURCES = [
  String.raw`(?:[a-z]+-)*findings\.json`,
  String.raw`summary\.json`,
  String.raw`tool-errors\.json`,
  String.raw`changed-metrics\.json`,
  String.raw`report[\w.-]*\.(?:txt|xml|sarif)`,
];
const NITPICKER_REPORT_PATTERN = new RegExp(`\`(${REPORT_NAME_SOURCES.join('|')})\``, 'gu');
const REPORT_FILES = new Set([...REPORT_FILE_NAMES, ...SNAPSHOT_REPORT_FILE_NAMES]);

function readDoc(name) {
  return readFileSync(path.join(DOCS, name), 'utf8');
}

function reportsSection() {
  const usage = readDoc('usage.md');
  const start = usage.indexOf('### Reports');
  return usage.slice(start, usage.indexOf('\n## ', start));
}

function unnamedIn(text) {
  return [...REPORT_FILES].filter((name) => !text.includes(`\`${name}\``));
}

function guides() {
  return [
    ['README.md', readFileSync(path.join(REPOSITORY, 'README.md'), 'utf8')],
    ...readdirSync(DOCS)
      .filter((name) => name.endsWith('.md'))
      .map((name) => [`docs/${name}`, readDoc(name)]),
  ];
}

describe('report files in the docs', () => {
  it('lists every file a comparison run and a full run write in the usage reports section', () => {
    expect(unnamedIn(reportsSection())).toEqual([]);
  });
  it('lists every file in the agent guidance', () => {
    expect(unnamedIn(readDoc('agents-snippet.md'))).toEqual([]);
  });
  it('names no report file that no run writes', () => {
    const named = [reportsSection(), readDoc('agents-snippet.md')].flatMap((text) =>
      [...text.matchAll(REPORT_FILE_PATTERN)].map(([, name]) => name),
    );
    expect(named.filter((name) => !REPORT_FILES.has(name))).toEqual([]);
  });
  it('names only files the CLI writes wherever the README and the guides mention a report', () => {
    const unknown = guides().flatMap(([file, text]) =>
      [...text.matchAll(NITPICKER_REPORT_PATTERN)]
        .map(([, name]) => name)
        .filter((name) => !REPORT_FILES.has(name))
        .map((name) => `${file}: ${name}`),
    );

    const files = guides().map(([file]) => file);
    const covered = ['README.md', 'docs/java-preset.md', 'docs/kotlin-preset.md'];
    covered.push('docs/python-preset.md', 'docs/typescript-strict-preset.md', 'docs/usage.md');

    expect(covered.filter((file) => !files.includes(file))).toEqual([]);
    expect(unknown).toEqual([]);
  });
});
