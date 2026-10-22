import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FACTS_REPORT, readFactFindings } from './python-facts.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function definition(file, name, line) {
  const tokens = ['def', name, '(', ')', ':', 'return', '1'];
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

function reportRootWith(facts) {
  const reportRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-python-facts-'));
  roots.push(reportRoot);
  if (facts !== undefined) {
    writeFileSync(path.join(reportRoot, FACTS_REPORT), JSON.stringify(facts));
  }
  return reportRoot;
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

  it('finds nothing when the facts step wrote no report', () => {
    expect(readFactFindings(reportRootWith(undefined))).toEqual([]);
  });
});
