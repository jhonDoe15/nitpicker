import { describe, expect, it } from 'vitest';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import {
  DESIGN_FAILED_RULE,
  DESIGN_REPORT,
  designFindings,
  readDesignFacts,
} from './python-design.mts';
import { useGitFixtures } from '../../../../../core/diff/git/test-support/git-repository.mts';
import { writeFiles } from '../../../../../core/diff/git/test-support/fixture-files.mts';
import { failureOf } from '../../test-support/runs/failure-of.mts';

const { temporaryRoot } = useGitFixtures();

function scratch(files: Readonly<Record<string, string>> = {}) {
  const root = temporaryRoot('nitpicker-python-design-');
  writeFiles(root, files);
  return root;
}

function reportWith(report: unknown): string {
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

    const failure = failureOf(() => designFindings({ reportRoot, analyzerName: 'python' }));

    expect(fieldOf(failure, 'rule')).toBe(DESIGN_FAILED_RULE);
    expect(fieldOf(failure, 'message')).toBe(
      'The design facts producer failed: RecursionError (calls.py:12)',
    );
  });

  it('turns facts the shared schema rejects into a design-failed error', () => {
    const reportRoot = reportWith({ facts: factsWithoutOwner() });

    const failure = failureOf(() => designFindings({ reportRoot, analyzerName: 'python' }));

    expect(fieldOf(failure, 'rule')).toBe(DESIGN_FAILED_RULE);
    expect(fieldOf(failure, 'message')).toBe(REJECTED_MESSAGE);
  });

  it('returns the findings of valid facts', () => {
    const reportRoot = reportWith({ facts: EMPTY_FACTS });

    expect(designFindings({ reportRoot, analyzerName: 'python' })).toEqual([]);
  });
});
