import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DESIGN_FAILED_RULE,
  DESIGN_REPORT,
  designFindings,
  readDesignFacts,
} from './python-design.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function scratch(files = {}) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-design-')));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

function reportWith(report) {
  return scratch({ [DESIGN_REPORT]: JSON.stringify(report) });
}

const REJECTED_MESSAGE =
  'The design facts of the Python sources were rejected: facts.callables[0].owner is "a.py#Missing", which is not an id in facts.types: only list references the producer resolved; see "Facts schema" in docs/internals.md';

const EMPTY_FACTS = { modules: [], types: [], callables: [] };

function factsWithoutOwner() {
  return {
    modules: [{ file: 'a.py', role: 'production' }],
    types: [],
    callables: [
      {
        id: 'a.py#f',
        file: 'a.py',
        name: 'f',
        line: 1,
        kind: 'function',
        exported: true,
        owner: 'a.py#Missing',
        params: [],
        calls: [],
      },
    ],
  };
}

describe('reading the design facts of the Python rules script', () => {
  it('returns nothing when the script wrote no design report', () => {
    const reportRoot = scratch();

    expect(readDesignFacts({ reportRoot })).toBeUndefined();
    expect(designFindings({ reportRoot, analyzerName: 'python' })).toEqual([]);
  });

  it('returns the facts the script wrote', () => {
    const facts = { ...EMPTY_FACTS, modules: [{ file: 'app.py', role: 'production' }] };

    expect(readDesignFacts({ reportRoot: reportWith({ facts }) })).toEqual(facts);
  });

  it('turns an error the script reported into a design-failed error', () => {
    const reportRoot = reportWith({ error: 'RecursionError (calls.py:12)' });

    expect(() => designFindings({ reportRoot, analyzerName: 'python' })).toThrow(
      expect.objectContaining({
        rule: DESIGN_FAILED_RULE,
        message: 'The design facts producer failed: RecursionError (calls.py:12)',
      }),
    );
  });

  it('turns facts the shared schema rejects into a design-failed error', () => {
    const reportRoot = reportWith({ facts: factsWithoutOwner() });

    expect(() => designFindings({ reportRoot, analyzerName: 'python' })).toThrow(
      expect.objectContaining({
        rule: DESIGN_FAILED_RULE,
        message: REJECTED_MESSAGE,
      }),
    );
  });

  it('returns the findings of valid facts', () => {
    const reportRoot = reportWith({ facts: EMPTY_FACTS });

    expect(designFindings({ reportRoot, analyzerName: 'python' })).toEqual([]);
  });
});
