import { describe, expect, it } from 'vitest';
import { applyRecipes } from '../../source/test-support/apply-recipes.mts';
import { createPythonRecipes } from '../python-recipes.mts';
import { localRunScript } from '../../source/script-edits.mts';
import {
  PATH,
  align,
  extractAll,
  extracted,
  module,
  note,
  totals,
} from './test-support/extract-sources.mts';

const TOP = align('top', 'alignTop');
const BOTTOM = align('bottom', 'alignBottom');

type Case = {
  readonly name: string;
  readonly source: string;
  readonly reason: string;
  readonly line?: number;
};

const SCOPE =
  'the code declares a function or class, imports, deletes, yields or reads its own scope';

function both(change: (text: string) => string): string {
  return module(change(TOP), change(BOTTOM));
}

function methodsOf(header: string, first: string, second: string): string {
  const members = [totals(first, 'scale', '2'), totals(second, 'factor', '3')];
  return `${header}\n${members.join('\n')}`;
}

function inside(text: string, line: string): string {
  return text.replace('    label =', `${line}\n    label =`);
}

function formatted(text: string, word: string): string {
  return text.replace('"labels.', `f"${word}.{selected}.`);
}

function calling(name: string, scale: string, value: string): string {
  return totals(name, scale, value, '        super().prepare(items)');
}

const CASES: readonly Case[] = [
  {
    name: 'decorated copies',
    source: both((text) => `@cache\n${text}`),
    reason: 'a function has decorators',
    line: 2,
  },
  {
    name: 'parameters other than plain positional ones',
    source: both((text) => text.replace('translate)', 'translate, *rest)')),
    reason: 'a function has positional-only, keyword-only or variadic parameters',
  },
  {
    name: 'copies that declare a nested function',
    source: both((text) => inside(text, '    def pick(e):\n        return e')),
    reason: SCOPE,
  },
  {
    name: 'copies that declare a global name',
    source: both((text) => inside(text, '    global CACHE')),
    reason: SCOPE,
  },
  {
    name: 'generators',
    source: both((text) => inside(text, '    yield selected')),
    reason: SCOPE,
  },
  {
    name: 'code that reads its own scope',
    source: both((text) => inside(text, '    seen = locals()')),
    reason: SCOPE,
  },
  {
    name: 'copies that call differently named functions',
    source: module(TOP, BOTTOM.replace('render(', 'draw(')),
    reason: 'the copies read differently named outer values',
  },
  {
    name: 'a literal that sits in an f-string',
    source: module(formatted(TOP, 'top'), formatted(BOTTOM, 'bottom')),
    reason: 'the copies differ in code that is not a plain value',
  },
  {
    name: 'a second copy with a comment the shared function would drop',
    source: module(TOP, inside(BOTTOM, '    # only here')),
    reason: 'the second copy has comments the shared function would drop',
  },
  {
    name: 'copies in different classes',
    source: `class One:\n${totals('sum_weights', 'scale', '2')}\n\nclass Two:\n${totals('add_weights', 'factor', '3')}`,
    reason: 'the copies are not in one class or module',
    line: 11,
  },
  {
    name: 'a method that reads super',
    source: `class Totals:\n${calling('sum_weights', 'scale', '2')}\n${calling('add_weights', 'factor', '3')}`,
    reason: SCOPE,
    line: 2,
  },
  {
    name: 'a pair where only one copy is async',
    source: module(TOP.replace('def', 'async def'), BOTTOM),
    reason: 'only one copy is async',
  },
  {
    name: 'a method whose first parameter is not self',
    source: methodsOf('class Totals:', 'sum_weights', 'add_weights').replaceAll('self', 'owner'),
    reason: 'the first parameter of a method is not self',
    line: 2,
  },
  {
    name: 'an implicitly static method',
    source: methodsOf('class Totals:', '__new__', 'add_weights'),
    reason: 'a method is implicitly static or a class method',
    line: 9,
  },
  {
    name: 'a method of a protocol',
    source: methodsOf('class Totals(Protocol):', 'sum_weights', 'add_weights'),
    reason: 'the class is a protocol',
    line: 2,
  },
];

describe('python-extract-near-duplicate declines', () => {
  it.each(CASES)('declines $name', ({ source, reason, line = 1 }) => {
    const { after, notes } = extracted(source);
    expect([after, notes]).toEqual([source, [note(line, reason)]]);
  });

  it('declines a method when a subclass in another file defines the shared name', () => {
    const source = methodsOf('class Totals:', 'sum_weights', 'add_weights');
    const child = 'class Child(Totals):\n    def _shared_sum_weights(self):\n        return 1\n';
    const { read, outcome } = extractAll({ [PATH]: source, 'src/child.py': child });
    expect([read(PATH), read('src/child.py'), outcome.notes]).toEqual([
      source,
      child,
      [note(2, 'a subclass defines a member with the name of the shared function')],
    ]);
  });

  it('leaves copies in different files alone', () => {
    const { read, outcome } = extractAll({ 'src/top.py': TOP, 'src/bottom.py': BOTTOM });
    expect([read('src/top.py'), read('src/bottom.py'), outcome.notes]).toEqual([
      TOP,
      BOTTOM,
      [note(1, 'the copies are in different files', 'src/top.py')],
    ]);
  });

  it('skips test files', () => {
    const recipes = createPythonRecipes({
      runScript: localRunScript,
      optionsFor: () => ({ testFiles: [PATH] }),
    });
    const { read } = applyRecipes(
      { [PATH]: module(TOP, BOTTOM) },
      { selectedRules: ['structure/near-duplicate'], recipes },
    );
    expect(read(PATH)).toBe(module(TOP, BOTTOM));
  });
});
