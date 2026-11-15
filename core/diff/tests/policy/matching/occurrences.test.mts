import { describe, expect, it } from 'vitest';
import { fieldOf, numberOr } from '../../../../../shared/values/readers.mts';
import {
  type Comparison,
  compareFindings,
} from '../../../comparison/test-support/typed-compare.mts';

type Hunk = {
  readonly oldStart: number;
  readonly oldCount: number;
  readonly newStart: number;
  readonly newCount: number;
};

function finding(tool: string, identity: string, line: number) {
  return {
    tool,
    rule: tool === 'javac' ? 'rawtypes' : 'legacy-date-time',
    path: 'src/main/java/demo/Legacy.java',
    identity,
    message: 'Raw use of a generic type.',
    classification: 'enforceable',
    location: { line },
  };
}

function lineOf(entry: unknown): number {
  return numberOr(fieldOf(fieldOf(entry, 'location'), 'line'), 0);
}

function lines(result: Comparison) {
  return {
    added: result.newFindings.map((entry) => lineOf(entry)),
    kept: result.unchangedFindings.map((entry) => lineOf(entry)).sort((a, b) => a - b),
    resolved: result.resolvedFindings.map((entry) => lineOf(entry)),
  };
}

function touchedBy(hunks: readonly Hunk[]) {
  return {
    changedLines: new Map([
      [
        'src/main/java/demo/Legacy.java',
        {
          added: false,
          ranges: hunks
            .filter(({ newCount }) => newCount > 0)
            .map(({ newStart, newCount }) => [newStart, newStart + newCount - 1]),
          inserted: [],
          hunks: hunks.map(({ oldStart, oldCount, newStart, newCount }) => [
            oldStart,
            oldCount,
            newStart,
            newCount,
          ]),
          carried: [],
        },
      ],
    ]),
    isStrictRule: () => false,
  };
}

describe('findings with the same identity hash in one file', () => {
  it('reports a javac warning on an identical line inserted above the legacy one as the new one', () => {
    const result = compareFindings({
      baseFindings: [finding('javac', 'javac:0f3a', 10)],
      headFindings: [finding('javac', 'javac:0f3a', 10), finding('javac', 'javac:0f3a#2', 11)],
      touchedCode: touchedBy([{ oldStart: 9, oldCount: 0, newStart: 10, newCount: 1 }]),
    });

    expect(lines(result)).toEqual({ added: [10], kept: [11], resolved: [] });
  });

  it('matches forbiddenapis uses on unchanged lines first, wherever the added one sits', () => {
    const result = compareFindings({
      baseFindings: [
        finding('forbiddenapis', 'forbidden:9c1d', 5),
        finding('forbiddenapis', 'forbidden:9c1d#2', 8),
      ],
      headFindings: [
        finding('forbiddenapis', 'forbidden:9c1d', 5),
        finding('forbiddenapis', 'forbidden:9c1d#2', 7),
        finding('forbiddenapis', 'forbidden:9c1d#3', 9),
      ],
      touchedCode: touchedBy([{ oldStart: 6, oldCount: 0, newStart: 7, newCount: 1 }]),
    });

    expect(lines(result)).toEqual({ added: [7], kept: [5, 9], resolved: [] });
  });

  it('resolves the legacy finding whose line the change deleted, not a later one', () => {
    const result = compareFindings({
      baseFindings: [finding('javac', 'javac:0f3a', 4), finding('javac', 'javac:0f3a#2', 6)],
      headFindings: [finding('javac', 'javac:0f3a', 5)],
      touchedCode: touchedBy([{ oldStart: 4, oldCount: 1, newStart: 3, newCount: 0 }]),
    });

    expect(lines(result)).toEqual({ added: [], kept: [5], resolved: [4] });
  });
});
