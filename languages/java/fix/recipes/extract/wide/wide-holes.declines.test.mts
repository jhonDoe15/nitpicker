import { describe, expect, it } from 'vitest';
import { javaExtractNearDuplicateRecipe as recipe } from '../near-duplicate-extract.mts';
import {
  type PickerOptions,
  anonymous,
  floorMethod,
  picker,
  wideClass,
} from '../test-support/wide-sources.mts';

const PATH = 'src/main/java/demo/Wide.java';
const CONTEXT = 'a differing type is used where a type parameter cannot stand for it';
const VALUES = 'the code uses a value of the differing type in a way a type parameter cannot cover';
const PLAIN = 'the copies differ in code that is not a plain value';

function planned(text: string) {
  return recipe.plan({ files: [{ path: PATH, text }], projectRoot: '/nonexistent' });
}

function note(line: number, reason: string): string[] {
  return [`--fix left ${PATH}:${String(line)} near-duplicate: ${reason}`];
}

type Holes = (type: string) => PickerOptions;

function typed(options: Holes) {
  return wideClass(
    picker('top', { tail: 'null', element: 'String', ...options('String') }),
    picker('bottom', { tail: 'null', element: 'Integer', ...options('Integer') }),
  );
}

function members(first: string, second: string, options: { modifier?: string } = {}) {
  return wideClass(floorMethod('top', first, options), floorMethod('bottom', second, options));
}

const MEMBERS =
  '    private int minimum() { return 2; }\n    private int maximum() { return 9; }\n';

const HOLE_CASES: [string, Holes, string][] = [
  ['a cast', (type: string) => ({ tail: `(${type}) null` }), CONTEXT],
  [
    'a class literal',
    (type: string) => ({ step: `picked.add(item); seen += ${type}.class.getName().length();` }),
    CONTEXT,
  ],
  [
    'an instanceof test',
    (type: string) => ({
      step: `picked.add(item); if (new Object() instanceof ${type}) { seen++; }`,
    }),
    CONTEXT,
  ],
  [
    'a call on a value of the type',
    () => ({ step: 'picked.add(item); seen += item.hashCode();' }),
    VALUES,
  ],
  [
    'a call of a neutral name on a value of the type',
    () => ({ step: 'picked.add(item); if (item.isEmpty()) { seen++; }' }),
    VALUES,
  ],
  ['a value passed to a call', () => ({ step: 'System.out.println(item);' }), VALUES],
];

describe('javaExtractNearDuplicateRecipe declines type holes', () => {
  it.each(HOLE_CASES)('leaves the source alone for %s', (_name, options, reason) => {
    const source = typed(options);
    expect(planned(source)).toEqual({ fixes: [], notes: note(13, reason) });
  });

  it('leaves a static member of the differing type alone', () => {
    const source = typed((type: string) => ({
      step: `picked.add(item); seen += ${type}.valueOf(1).hashCode();`,
    }));
    expect(planned(source)).toEqual({ fixes: [], notes: note(13, PLAIN) });
  });
});

describe('javaExtractNearDuplicateRecipe declines expressions that differ', () => {
  it.each([
    [
      'a value passed to a call',
      wideClass(picker('top', { tail: 'first()' }), picker('bottom', { tail: 'last()' })),
    ],
    ['a local of the copied code', members('minimum(seen)', 'maximum(seen)')],
    [
      'a final local',
      wideClass(
        MEMBERS,
        floorMethod('top', 'minimum()', { modifier: 'final ' }),
        floorMethod('bottom', 'maximum()', { modifier: 'final ' }),
      ),
    ],
  ])('leaves the source alone for %s', (_name, source) => {
    const result = planned(source);
    expect([result.fixes, (result.notes ?? []).map((line) => line.split(': ').at(-1))]).toEqual([
      [],
      [PLAIN],
    ]);
  });
});

describe('javaExtractNearDuplicateRecipe declines anonymous classes', () => {
  it('leaves a pair that reads instance state of the enclosing class alone', () => {
    const before = '            int skipped = floor;\n';
    const source = wideClass(
      '    private int floor = 2;\n',
      anonymous('TOP', '"top"', { before }),
      anonymous('BOTTOM', '"bottom"', { before }),
    );
    expect(planned(source).fixes).toEqual([]);
    expect((planned(source).notes ?? []).map((line) => line.split(': ').at(-1))).toEqual([
      'an anonymous class reads instance state or sits where the shared method cannot be static',
    ]);
  });

  it('leaves anonymous classes of two classes alone', () => {
    const first = anonymous('TOP', '"top"');
    const second = anonymous('BOTTOM', '"bottom"');
    const selector =
      'interface Selector {\n        java.util.List<String> select(java.util.List<String> s, int n);\n    }';
    const source = [wideClass(first), 'class Other {', selector, second + '}', ''].join('\n');
    expect(planned(source).fixes).toEqual([]);
  });
});
