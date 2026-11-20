import { describe, expect, it } from 'vitest';
import { javaExtractPartialRunRecipe as recipe } from '../partial/partial-run-extract.mts';
import {
  headerClass,
  headerPair,
  note,
  planned,
  printPair,
} from './test-support/kotlin-sources.mts';

type Sides = Parameters<typeof printPair>;

function printed(...sides: Sides): string {
  return headerClass(...printPair(...sides));
}

type Case = {
  readonly name: string;
  readonly source: string;
  readonly reason: string;
  readonly line?: number;
};

const UNTYPED = 'a value the run reads has no plain declared type';

function updated(tail: string, ticks: string): Sides[0] {
  return {
    before: `        var total = 0\n        println(${ticks})\n`,
    inLoop: '            total += 1\n',
    after: `        println(total)${tail}`,
  };
}

function bound(list: string, ticks: string): Sides[0] {
  return {
    before: `        val bound = ${list}.size\n        println(${ticks})\n`,
    inLoop: '            println(bound)\n',
  };
}

function checked(check: string, println: string): Sides[0] {
  return { before: `        ${check}\n        println(${println})\n` };
}

function untypedMember(): string {
  const members =
    '    private val marker: String? = null\n    private val store: List<String> = listOf()\n';
  return printed(
    checked('if (marker == null) return', '"a"'),
    checked('if (marker == null) return', '"a", "b"'),
  )
    .replaceAll(/(in |= )(?:raw|lines)\b/gu, '$1store')
    .replaceAll(/([<>] )(?:limit|cap)\b/gu, '$15')
    .replace('class Align {', `class Align {\n${members}`);
}

function untypedValues(): string {
  const [first, second] = headerPair();
  return headerClass(
    first.replace('val names: List<String>', 'val names'),
    second.replace('val keys: List<String>', 'val keys'),
  );
}

const CHECKS = [
  'if (raw.isNullOrEmpty()) return',
  'requireNotNull(raw)',
  'val seen = raw ?: return',
];

const CASES: readonly Case[] = [
  {
    name: 'runs that assign to a variable declared before them',
    source: printed(updated('', '"a"'), updated('\n        audit("again")', '"a", "b"')),
    reason: 'a run assigns to a variable declared outside it',
  },
  {
    name: 'a run that reads a local whose type is not written out',
    source: printed(bound('raw', '"a"'), bound('lines', '"a", "b"')),
    reason: UNTYPED,
  },
  {
    name: 'a run that reads a nullable value',
    source: printed().replace('limit: Int', 'limit: Int?').replace('cap: Int', 'cap: Int?'),
    reason: UNTYPED,
  },
  {
    name: 'when the second copy has a comment the shared function would drop',
    source: printed({}, { inLoop: '            // walk the lines\n' }),
    reason: 'the second copy has comments the shared function would drop',
  },
  {
    name: 'a run whose value used after it has no written type',
    source: untypedValues(),
    reason: 'the type of the value the run defines is not written out',
  },
  {
    name: 'a run that reads only a member the function checked for null before it',
    source: untypedMember(),
    reason: UNTYPED,
    line: 9,
  },
  ...CHECKS.map((check): Case => ({
    name: `a run after the null check ${check}`,
    source: printed(checked(check, '"a"'), checked(check.replaceAll('raw', 'lines'), '"a", "b"')),
    reason: UNTYPED,
  })),
];

describe('javaExtractPartialRunRecipe declines for Kotlin', () => {
  it('extracts a run that defines no value as a statement call', () => {
    expect(planned(recipe, printed()).after).toMatchInlineSnapshot(`
      "package demo

      import java.util.TreeMap

      class Align {
          fun showNames(raw: List<String>, limit: Int) {
              println("a")
              sharedShowNamesSteps(raw, limit)
          }

          private fun sharedShowNamesSteps(raw: List<String>, limit: Int) {
              for (line in raw) {
                  if (line.isNotEmpty() && line.length < limit) {
                      println(line.trim().lowercase())
                      println(line.length)
                      println(line.reversed())
                  }
              }
              val shown = raw.filter { it.isNotEmpty() }.map { it.trim() }.distinct()
              for (name in shown) {
                  if (name.length > limit) {
                      println("long " + name)
                  } else {
                      println("short " + name)
                  }
              }
              println("done")
          }

          fun showCount(lines: List<String>, cap: Int) {
              println("a", "b")
              sharedShowNamesSteps(lines, cap)
              audit("again")
          }
      }
      "
    `);
  });

  it.each(CASES)('declines $name', ({ source, reason, line = 6 }) => {
    const { fixes, notes } = planned(recipe, source);
    expect([fixes.length, notes]).toEqual([0, note(line, reason)]);
  });
});
