import { beforeAll, describe, expect, it } from 'vitest';
import { KOTLIN_FILE, decidedRunner, type Decided } from '../../test-support/decided-runner.mts';

let decided: Decided;

beforeAll(async () => {
  decided = await decidedRunner();
});

const SIZE_GUARD =
  '  int f(Queue<String> q) { if (q.isEmpty()) { return 1; } if (q.size() == 0) { return 2; } return 3; }';

describe('decided-condition on collection types named like the library ones', () => {
  it('does not read a project Queue or Stack as the library collection', () => {
    const own = ['class Queue { boolean isEmpty() { return false; } int size() { return 1; } }'];
    const imported = ['import java.util.*;', ...own];

    expect(decided([...own, `class Rules {`, SIZE_GUARD, '}'].join('\n'))).toEqual([]);
    expect(decided([...imported, `class Rules {`, SIZE_GUARD, '}'].join('\n'))).toEqual([]);
  });

  it('reads an imported or qualified library Queue as the collection', () => {
    const byImport = ['import java.util.Queue;', 'class Rules {', SIZE_GUARD, '}'];
    const byStar = ['import java.util.*;', 'class Rules {', SIZE_GUARD, '}'];
    const qualified = [
      'class Rules {',
      '  int f(java.util.Queue<String> q) { if (q.isEmpty()) { return 1; } if (q.size() == 0) { return 2; } return 3; }',
      '}',
    ];
    const expected = [expect.stringContaining('`q.size() == 0` is always false here: line')];

    expect(decided(byImport.join('\n'))).toEqual(expected);
    expect(decided(byStar.join('\n'))).toEqual(expected);
    expect(decided(qualified.join('\n'))).toEqual(expected);
  });

  it('does not read a Kotlin project Stack as a list', () => {
    const text = [
      'class Stack { fun isEmpty(): Boolean = false; val size: Int = 1 }',
      'fun f(s: Stack): Int { if (s.isEmpty()) { return 1 }; if (s.size == 0) { return 2 }; return 3 }',
    ].join('\n');

    expect(decided(text, KOTLIN_FILE)).toEqual([]);
  });
});
