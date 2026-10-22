import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BASE_FACTS_REPORT, FACTS_REPORT, readFactFindings } from './python-facts.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function definition(file, name, line, body = ['1']) {
  const tokens = ['def', name, '(', ')', ':', 'return', ...body];
  return {
    file,
    name,
    kind: 'function',
    line,
    lines: 2,
    exported: true,
    tokens,
    literal: false,
    usedLocally: false,
    text: `function|${tokens.join(' ')}`,
    key: `key-${name}`,
    entry: false,
  };
}

const FACTS = {
  modules: [
    { file: 'src/shop/__init__.py', role: 'production', entry: false, module: 'shop' },
    { file: 'src/shop/helpers.py', role: 'production', entry: false, module: 'shop.helpers' },
    { file: 'tests/test_helpers.py', role: 'test', entry: false },
  ],
  packages: [{ root: '', published: false }],
  definitions: [
    definition('src/shop/helpers.py', 'helper', 1),
    definition('tests/test_helpers.py', 'test_helper', 4),
  ],
  imports: [
    {
      from: 'tests/test_helpers.py',
      to: 'src/shop/helpers.py',
      names: [{ name: 'helper' }],
      reexport: false,
    },
  ],
  docComments: [],
};

function reportRootWith(facts, baseFacts) {
  const reportRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-python-facts-'));
  roots.push(reportRoot);
  if (facts !== undefined) {
    writeFileSync(path.join(reportRoot, FACTS_REPORT), JSON.stringify(facts));
  }
  if (baseFacts !== undefined) {
    writeFileSync(path.join(reportRoot, BASE_FACTS_REPORT), JSON.stringify(baseFacts));
  }
  return reportRoot;
}

const SUM = Array.from({ length: 10 }, (_, index) => [String(index), '+']).flat();
const EDITED_SUM = SUM.with(0, '7');

function siblingFacts(sums) {
  return {
    ...FACTS,
    modules: Object.keys(sums).map((file) => ({ file, role: 'production', entry: false })),
    definitions: Object.entries(sums).map(([file, body]) => definition(file, 'total', 1, body)),
    imports: [],
  };
}

function rowsOf(findings) {
  return findings.map(({ rule, path: file, identity }) => [rule, file, identity]);
}

describe('the shared fact rules over the Python facts', () => {
  it('reports a module only the tests use', () => {
    const findings = readFactFindings(reportRootWith(FACTS));

    expect(findings.map(({ tool, rule, path: file }) => [tool, rule, file])).toEqual([
      ['facts', 'test-only-export', 'src/shop/helpers.py'],
    ]);
  });

  it('leaves out a finding a top-level exception lifts', () => {
    const exceptions = [{ rule: 'test-only-export', paths: ['src/shop/**'], reason: 'r' }];

    expect(readFactFindings(reportRootWith(FACTS), { exceptions })).toEqual([]);
  });

  it('reports a docstring that only restates its name unless its sections say more', () => {
    const comment = { file: 'src/shop/helpers.py', line: 2, name: 'helper', lines: ['Helper.'] };
    const exceptions = [{ rule: 'test-only-export', paths: ['src/shop/**'], reason: 'r' }];
    const findingsOf = (detailed) =>
      readFactFindings(reportRootWith({ ...FACTS, docComments: [{ ...comment, detailed }] }), {
        exceptions,
      });

    expect(rowsOf(findingsOf(false))).toEqual([
      ['doc-comment-content', 'src/shop/helpers.py', 'doc-comment:helper:restating'],
    ]);
    expect(findingsOf(true)).toEqual([]);
  });

  it('reads the base facts for an edit to one of two copies', () => {
    const base = siblingFacts({ 'src/shop/a.py': SUM, 'src/shop/b.py': SUM });
    const head = siblingFacts({ 'src/shop/a.py': EDITED_SUM, 'src/shop/b.py': SUM });

    expect(rowsOf(readFactFindings(reportRootWith(head, base)))).toEqual([
      ['sibling-copy-edit', 'src/shop/a.py', 'sibling-copy:total'],
    ]);
    expect(readFactFindings(reportRootWith(head))).toEqual([]);
  });

  it('follows the moves file to the base copy of a moved module', () => {
    const base = siblingFacts({ 'src/shop/old.py': SUM, 'src/shop/b.py': SUM });
    const head = siblingFacts({ 'src/shop/a.py': EDITED_SUM, 'src/shop/b.py': SUM });
    const reportRoot = reportRootWith(head, base);
    const baselineMovesFile = path.join(reportRoot, 'moves.json');
    writeFileSync(baselineMovesFile, JSON.stringify([['src/shop/old.py', 'src/shop/a.py']]));

    expect(readFactFindings(reportRoot)).toEqual([]);
    expect(rowsOf(readFactFindings(reportRoot, { baselineMovesFile }))).toEqual([
      ['sibling-copy-edit', 'src/shop/a.py', 'sibling-copy:total'],
    ]);
  });

  it('finds nothing when the facts step wrote no report', () => {
    expect(readFactFindings(reportRootWith(undefined))).toEqual([]);
  });
});
