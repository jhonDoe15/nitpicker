import { describe, expect, it } from 'vitest';
import { javaExtractNearDuplicateRecipe as recipe } from './near-duplicate-extract.mjs';
import { classOf, method } from './test-support/sources.mjs';

const PATH = 'src/main/java/demo/Align.java';
const TOP = method('top');
const BOTTOM = method('bottom', { prefix: 'bottom:' });

function planned(text, path = PATH) {
  return recipe.plan({ files: [{ path, text }], projectRoot: '/nonexistent' });
}

function before(copy, anchor, code) {
  return copy.replace(anchor, `${code}\n        ${anchor}`);
}

function pairOf(change, values) {
  return classOf(...[TOP, BOTTOM].map((copy, index) => change(copy, values[index])));
}

function note(line, reason) {
  return [`--fix left ${PATH}:${line} near-duplicate: ${reason}`];
}

const generic = (copy) => copy.replace('String ', '<T> String ');
const varargs = (copy) => copy.replace('int limit', 'int... limit');
const interfaced = [TOP, BOTTOM].map((copy) => copy.replace('    String', '    default String'));
const thrown = BOTTOM.replace('int limit) {', 'int limit) throws java.io.IOException {');
const stripped = BOTTOM.replace('selected.add(element)', 'selected.add(element.strip())');
const switching = (copy, label) =>
  before(
    copy,
    'String label',
    `switch (limit) {\n            case ${label}: break;\n            default: break;\n        }`,
  );
const looping = (copy, value) =>
  before(copy, 'String label', `while (${value}) {\n            break;\n        }`);
const writing = (copy, limit) =>
  before(copy, 'List<String> selected', 'limit++;').replace('< limit', `< ${limit}`);
const narrowing = (copy, value) => before(copy, 'List<String> selected', `byte step = ${value};`);
const arrayed = (copy, value) =>
  before(copy, 'List<String> selected', `byte[] steps = {${value}};`);
const constant = (copy, value) =>
  before(copy, 'List<String> selected', `final int step = ${value};`);
const summed = (copy, value) => before(copy, 'List<String> selected', `byte step = ${value} + 1;`);
const charred = (copy, value) => before(copy, 'List<String> selected', `char step = ${value} + 1;`);
const inheriting = (copy) => before(copy, 'List<String> selected', 'int cap = LIMIT;');
const overloading = (copy) => before(copy, 'List<String> selected', 'int cap = pick(1);');
const other = `${classOf(TOP)}\nclass Other {\n${BOTTOM}}\n`;
const THREE = classOf(TOP, BOTTOM, method('left', { prefix: 'left:' }));
const PLAIN = 'the copies differ in code that is not a plain value';
const VARARGS = 'a method has varargs or a receiver parameter, or the parameter counts differ';
const AMBIGUOUS =
  'the code may use instance state of the class, which the shared function cannot tell';
const several = 'a copy belongs to more than one pair of near-duplicates';

const CASES = [
  ['different classes', other, note(20, 'the copies are not in one class')],
  [
    'a name in the file',
    classOf(TOP, BOTTOM, '    int sharedTop = 1;\n'),
    note(7, 'the name of the shared function would collide'),
  ],
  ['a call that is not a plain value', classOf(TOP, stripped), note(7, PLAIN)],
  ['a written parameter', pairOf(writing, ['limit', '10']), note(7, PLAIN)],
  [
    'different exceptions',
    classOf(TOP, thrown),
    note(7, 'the copies declare different exceptions'),
  ],
  [
    'one static copy',
    classOf(TOP, method('bottom', { prefix: 'bottom:', modifiers: 'static ' })),
    note(7, 'only one copy is static'),
  ],
  [
    'generic methods',
    classOf(generic(TOP), generic(BOTTOM)),
    note(7, 'a method has type parameters'),
  ],
  ['varargs', classOf(varargs(TOP), varargs(BOTTOM)), note(7, VARARGS)],
  ['a narrowing literal', pairOf(narrowing, ['1', '2']), note(7, PLAIN)],
  [
    'a comment only the second copy has',
    classOf(TOP, BOTTOM.replace('String label', '// keep the order\n        String label')),
    note(7, 'the second copy has comments the shared function would drop'),
  ],
  ['a final local', pairOf(constant, ['1', '2']), note(7, PLAIN)],
  ['a sum that narrows', pairOf(summed, ['1', '2']), note(7, PLAIN)],
  ['a char sum that narrows', pairOf(charred, ["'a'", "'b'"]), note(7, PLAIN)],
  [
    'a field the class may inherit',
    `${classOf(inheriting(TOP), inheriting(BOTTOM)).replace('class Align {', 'class Align extends Base {')}\nclass Base {\n    protected int LIMIT = 3;\n}\n`,
    note(7, AMBIGUOUS),
  ],
  [
    'a call with a static and an instance overload',
    classOf(
      '    static int pick(int value) {\n        return value;\n    }\n',
      '    int pick(String value) {\n        return value.length();\n    }\n',
      overloading(TOP),
      overloading(BOTTOM),
    ),
    note(15, AMBIGUOUS),
  ],
  ['a narrowing array element', pairOf(arrayed, ['1', '2']), note(7, PLAIN)],
  ['a case label', pairOf(switching, ['1', '2']), note(7, PLAIN)],
  ['a loop condition', pairOf(looping, ['true', 'false']), note(7, PLAIN)],
  [
    'an interface',
    `package demo;\n\ninterface Align {\n${interfaced.join('\n')}}\n`,
    note(4, 'the copies are not in one class'),
  ],
  ['three copies', THREE, [...note(29, several), ...note(7, several), ...note(7, several)]],
];

describe('javaExtractNearDuplicateRecipe declines', () => {
  it.each(CASES)('leaves the source untouched for %s', (_name, text, notes) => {
    expect(planned(text)).toEqual({ fixes: [], notes });
  });

  it('skips files outside the main source set', () => {
    expect(planned(classOf(TOP, BOTTOM), 'src/test/java/demo/Align.java')).toEqual({
      fixes: [],
      notes: [],
    });
  });
});
