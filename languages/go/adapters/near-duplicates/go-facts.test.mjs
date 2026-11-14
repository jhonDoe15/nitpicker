import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { goFactFindings } from '../facts/go-fact-findings.mjs';
import { goFacts } from '../facts/go-facts.mjs';
import { goUnitFacts } from './go-unit-facts.mjs';

const GUARDED = [
  'package demo',
  '',
  'func Size(count int, err error, ready, done chan int) string {',
  '\tif err != nil {',
  '\t\treturn "failed"',
  '\t}',
  '\tif err != nil {',
  '\t\treturn "again"',
  '\t}',
  '\tif count > 1 {',
  '\t\tlog(count)',
  '\t\tlog(2)',
  '\t} else if count > 2 {',
  '\t\tlog(count)',
  '\t\tlog(4)',
  '\t} else {',
  '\t\tlog(3)',
  '\t}',
  '\tselect {',
  '\tcase <-ready:',
  '\t\tlog(count)',
  '\t\tlog(2)',
  '\tcase <-done:',
  '\t\tlog(count)',
  '\t\tlog(2)',
  '\t}',
  '\treturn "ok"',
  '}',
  '',
].join('\n');

const SIZE_LABEL = [
  'func sizeLabel(count, limit int) string {',
  '\tif count < 0 {',
  '\t\treturn "negative"',
  '\t}',
  '\tif count > limit*2 {',
  '\t\treturn "lots"',
  '\t}',
  '\tif count > limit {',
  '\t\treturn "many"',
  '\t}',
  '\tif count == 0 {',
  '\t\treturn "none"',
  '\t}',
  '\treturn "few"',
  '}',
].join('\n');

function sizeName(prefix) {
  return [
    `func ${prefix}Name(amount, max int) string {`,
    '\tif amount < 0 {',
    '\t\treturn "negative"',
    '\t}',
    '\tif amount > max && amount <= max*2 {',
    '\t\treturn "many"',
    '\t}',
    '\tif amount > max*2 {',
    '\t\treturn "lots"',
    '\t}',
    '\tif amount == 0 {',
    '\t\treturn "none"',
    '\t}',
    '\treturn "few"',
    '}',
  ].join('\n');
}

let root;

function reportOf(files) {
  return {
    files: files.map(({ path: file, constrained = false }) => ({
      path: file,
      package: 'demo',
      test: false,
      generated: false,
      constrained,
    })),
    definitions: [],
    usages: [],
    docComments: [],
    functions: [],
    types: [],
    design: { types: [], callables: [] },
  };
}

function findingsOf(files) {
  const report = reportOf(files);
  const facts = goFacts(report, { units: goUnitFacts(root, report) });
  return goFactFindings(facts, { policy: {} })
    .filter(({ rule }) =>
      ['decided-condition', 'duplicate-branch', 'near-duplicate'].includes(rule),
    )
    .map(({ tool, rule, path: file }) => `${tool}/${rule} ${file}`)
    .toSorted();
}

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'nitpicker-go-rules-'));
  mkdirSync(path.join(root, 'a'));
  mkdirSync(path.join(root, 'b'));
  writeFileSync(path.join(root, 'a/guarded.go'), GUARDED);
  writeFileSync(path.join(root, 'a/size.go'), `package demo\n\n${SIZE_LABEL}\n`);
  writeFileSync(path.join(root, 'b/size.go'), `package demo\n\n${sizeName('other')}\n`);
  writeFileSync(path.join(root, 'b/size_linux.go'), `package demo\n\n${sizeName('linux')}\n`);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('the Go preset on the shared logic rules', () => {
  it('reports a decided condition, a duplicate branch and a copy from the facts', () => {
    expect(
      findingsOf([{ path: 'a/guarded.go' }, { path: 'a/size.go' }, { path: 'b/size.go' }]),
    ).toEqual([
      'facts/decided-condition a/guarded.go',
      'facts/decided-condition a/guarded.go',
      'facts/duplicate-branch a/guarded.go',
      'facts/near-duplicate b/size.go',
    ]);
  });

  it('leaves a copy in a file with a build constraint to its platform sibling', () => {
    expect(findingsOf([{ path: 'a/size.go' }, { path: 'b/size.go', constrained: true }])).toEqual(
      [],
    );
  });
});
