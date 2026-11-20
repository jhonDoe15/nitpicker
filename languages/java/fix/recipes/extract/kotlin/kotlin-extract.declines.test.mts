import { describe, expect, it } from 'vitest';
import { javaExtractNearDuplicateRecipe as recipe } from '../near-duplicate-extract.mts';
import { PATH, classOf, copy, note, planned } from './test-support/kotlin-sources.mts';

const TOP = copy('top');
const BOTTOM = copy('bottom', { prefix: 'bottom:' });
const PLAIN = 'the copies differ in code that is not a plain value';

type Case = {
  readonly name: string;
  readonly source: string;
  readonly reason: string;
  readonly line?: number;
};

const LOCAL_TYPE = 'the code declares a local function or type, or calls super or contract';
const MODIFIER = 'a function has an annotation or a modifier the shared function cannot repeat';
const RECEIVER = 'a function has type parameters or a receiver';

function both(change: (text: string) => string): string {
  return classOf(change(TOP), change(BOTTOM));
}

function leading(text: string, line: string): string {
  return text.replace('val label', `${line}\n        val label`);
}

function starting(text: string, line: string): string {
  return text.replace('val selected', `${line}\n        val selected`);
}

function inferred(name: string, word: string): string {
  return `    fun ${name}(items: List<String>, limit: Int) =
        items.filter { it.isNotEmpty() && it.length < limit }
            .map { it.trim().lowercase() + "${word}" }
            .sortedBy { it.length }
            .distinct()
            .joinToString(",")
`;
}

function reading(text: string, name: string): string {
  return text.replace('< limit', `< limit + ${name}`);
}

function shadowing(text: string, member: string): string {
  return reading(starting(text, `val first = ${member}\n        val ${member} = 5`), 'first');
}

const CASES: readonly Case[] = [
  {
    name: 'copies that read differently named outer values',
    source: classOf(
      '    private val floorTop = 1\n    private val floorBottom = 2\n',
      reading(TOP, 'floorTop'),
      reading(BOTTOM, 'floorBottom'),
    ),
    reason: 'the copies read differently named outer values',
    line: 7,
  },
  {
    name: 'a value that is a literal in one copy only',
    source: classOf(TOP, BOTTOM.replace('< limit', '< 5')),
    reason: PLAIN,
  },
  {
    name: 'a differing number that is not assigned to a local',
    source: classOf(
      TOP.replace('selected.add(element)', 'selected.add(element.take(1))'),
      BOTTOM.replace('selected.add(element)', 'selected.add(element.take(2))'),
    ),
    reason: PLAIN,
  },
  {
    name: 'a differing literal in an annotation argument',
    source: classOf(
      TOP.replace('val label', '@Suppress("unused") val label'),
      BOTTOM.replace('val label', '@Suppress("unchecked") val label'),
    ),
    reason: PLAIN,
  },
  {
    name: 'a number the Long range cannot hold',
    source: classOf(
      starting(TOP, 'val timeout = 99999999999999999999'),
      starting(BOTTOM, 'val timeout = 99999999999999999998'),
    ),
    reason: 'the copies differ in a token',
  },
  {
    name: 'a hex number',
    source: classOf(starting(TOP, 'val timeout = 0xFF'), starting(BOTTOM, 'val timeout = 0xAA')),
    reason: 'the copies differ in a token',
  },
  {
    name: 'a local that shadows a member the copy reads first',
    source: classOf(
      '    private val count: Int = 1\n    private val other: Int = 2\n',
      shadowing(TOP, 'count'),
      shadowing(BOTTOM, 'other'),
    ),
    reason: 'a name is read before a local of the same name is declared',
    line: 7,
  },
  {
    name: 'a number whose local is declared with another type',
    source: classOf(starting(TOP, 'val cap: Any = 1'), starting(BOTTOM, 'val cap: Any = 2')),
    reason: PLAIN,
  },
  {
    name: 'a string whose local is declared with another type',
    source: classOf(
      starting(TOP, 'val tag: CharSequence = "a"'),
      starting(BOTTOM, 'val tag: CharSequence = "b"'),
    ),
    reason: PLAIN,
  },
  {
    name: 'copies that call contract',
    source: both((text) => leading(text, 'contract { }')),
    reason: LOCAL_TYPE,
  },
  {
    name: 'copies that declare a local function',
    source: both((text) => leading(text, 'fun pick(): Int = 1')),
    reason: LOCAL_TYPE,
  },
  {
    name: 'copies that call super',
    source: both((text) => leading(text, 'super.hashCode()')),
    reason: LOCAL_TYPE,
  },
  {
    name: 'annotated copies',
    source: both((text) => `    @Synchronized\n${text}`),
    reason: MODIFIER,
  },
  {
    name: 'inline copies',
    source: both((text) => text.replace('    fun', '    inline fun')),
    reason: MODIFIER,
  },
  {
    name: 'generic copies',
    source: both((text) => text.replace('fun ', 'fun <T> ')),
    reason: RECEIVER,
  },
  {
    name: 'extension functions',
    source: both((text) => text.replace(/fun (\w+)/u, 'fun String.$1')),
    reason: RECEIVER,
  },
  {
    name: 'parameters with default values',
    source: both((text) => text.replace('limit: Int)', 'limit: Int = 3)')),
    reason: 'a function has default values, varargs or annotated parameters',
  },
  {
    name: 'a copy that is the only suspending one',
    source: classOf(TOP.replace('    fun', '    suspend fun'), BOTTOM),
    reason: 'only one copy is suspending',
  },
  {
    name: 'expression bodies without a declared return type',
    source: classOf(inferred('first', '-a'), inferred('second', '-b')),
    reason: 'a function has no declared return type',
    line: 11,
  },
  {
    name: 'members of an interface',
    source: classOf(TOP, BOTTOM).replace('class Align', 'interface Align'),
    reason: 'the copies are members of an interface',
  },
  {
    name: 'copies in different classes',
    source: `${classOf(TOP)}\nclass Other {\n${BOTTOM}}\n`,
    reason: 'the copies are not in one class or file',
    line: 17,
  },
  {
    name: 'a shared function whose name is taken',
    source: classOf(TOP, BOTTOM, '    fun sharedTop() {\n    }\n'),
    reason: 'the name of the shared function would collide',
  },
];

describe('javaExtractNearDuplicateRecipe declines for Kotlin', () => {
  it.each(CASES)('declines $name', ({ source, reason, line = 4 }) => {
    const { fixes, notes } = planned(recipe, source);
    expect([fixes.length, notes]).toEqual([0, note(line, reason)]);
  });

  it('declines a copy that belongs to more than one pair', () => {
    const { fixes, notes } = planned(
      recipe,
      classOf(TOP, BOTTOM, copy('left', { prefix: 'left:' })),
    );
    const crowded = 'a copy belongs to more than one pair of near-duplicates';
    expect([fixes.length, notes]).toEqual([
      0,
      [...note(26, crowded), ...note(4, crowded), ...note(4, crowded)],
    ]);
  });

  it('declines copies in different files', () => {
    const second = 'src/main/kotlin/demo/Other.kt';
    const { fixes, notes = [] } = recipe.plan({
      files: [
        { path: PATH, text: classOf(TOP) },
        { path: second, text: classOf(BOTTOM) },
      ],
      projectRoot: '/nonexistent',
    });
    expect([fixes.length, notes]).toEqual([
      0,
      note(4, 'the copies are in different files', second),
    ]);
  });

  it('skips files outside the main source set', () => {
    const path = 'src/test/kotlin/demo/AlignTest.kt';
    expect(planned(recipe, classOf(TOP, BOTTOM), path)).toEqual({
      fixes: [],
      notes: [],
      after: classOf(TOP, BOTTOM),
    });
  });
});
