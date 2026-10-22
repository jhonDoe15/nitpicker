import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SNAPSHOT_REPORT_FILE_NAMES } from '../../snapshot/reporters.mjs';
import { REPORT_FILE_NAMES } from './reporters.mjs';

const DOCS = path.join(import.meta.dirname, '../../../docs');
const REPORT_FILE_PATTERN = /`((?!nitpicker)[\w.-]+\.(?:json|txt|xml|sarif))`/gu;
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

describe('report files in the docs', () => {
  it('lists every file a comparison run and a full run write in the usage reports section', () => {
    expect(unnamedIn(reportsSection())).toEqual([]);
  });
  it('lists every file in the agent guidance', () => {
    expect(unnamedIn(readDoc('agents-snippet.md'))).toEqual([]);
  });
  it('names no report file that no run writes', () => {
    for (const text of [reportsSection(), readDoc('agents-snippet.md')]) {
      const named = [...text.matchAll(REPORT_FILE_PATTERN)].map(([, name]) => name);
      expect(named.filter((name) => !REPORT_FILES.has(name))).toEqual([]);
    }
  });
});
