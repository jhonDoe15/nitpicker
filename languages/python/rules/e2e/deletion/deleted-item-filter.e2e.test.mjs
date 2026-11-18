import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-rule-scripts.mts';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts({
  hidden: ['test-without-assertion', 'frozen-dataclass', 'io-in-loop', 'linear-lookup-in-loop'],
});
afterEach(cleanup);

const code = (...lines) => `${lines.join('\n')}\n`;
const record = (name) => [
  'from dataclasses import dataclass',
  '',
  '',
  '@dataclass',
  `class ${name}:`,
  '    sku: str',
  '    is_deleted: bool = False',
  '',
  '',
];
const guarded = (name) => [
  `def a(items: list[${name}]):`,
  '    return [i for i in items if not i.is_deleted]',
  '',
  '',
  `def b(items: list[${name}]):`,
  '    for item in items:',
  '        if item.is_deleted:',
  '            continue',
  '        print(item)',
  '',
  '',
  `def c(items: list[${name}], sku):`,
  '    return any(i.sku == sku and not i.is_deleted for i in items)',
  '',
  '',
  `def d(items: list[${name}], sku):`,
  '    return next((i for i in items if i.sku == sku and not i.is_deleted), None)',
  '',
  '',
  `def e(items: list[${name}]):`,
  '    return [i.sku for i in items if not i.is_deleted]',
  '',
  '',
];

describe.skipIf(!enabled)('deleted-item-filter-missing', () => {
  it('reports an iteration that skips the flag most iterations check', () => {
    const [actual, expected] = outcomes([
      [
        'a comprehension that counts deleted items',
        code(
          ...record('Row'),
          ...guarded('Row'),
          'def f(items: list[Row], sku):',
          '    return len([i for i in items if i.sku == sku])',
        ),
        ['deleted-item-filter-missing:34 f|Row|is_deleted|is_deleted|5 of 6'],
      ],
      [
        'a loop over a sequence parameter',
        code(
          ...record('Line'),
          ...guarded('Line'),
          'from typing import Sequence',
          '',
          '',
          'def f(items: Sequence[Line]):',
          '    for item in items:',
          '        print(item)',
        ),
        ['deleted-item-filter-missing:37 f|Line|is_deleted|is_deleted|5 of 6'],
      ],
      [
        'a loop over an attribute that holds the items',
        code(
          ...record('Entry'),
          ...guarded('Entry'),
          'class Scene:',
          '    items: list[Entry]',
          '',
          '    def names(self):',
          '        return [i.sku for i in self.items]',
        ),
        ['deleted-item-filter-missing:37 Scene.names|Entry|is_deleted|is_deleted|5 of 6'],
      ],
      [
        'a project helper as the allowed form',
        code(
          ...record('Slot'),
          'def live(items: list[Slot]) -> list[Slot]:',
          '    return [i for i in items if not i.is_deleted]',
          '',
          '',
          'def a(items: list[Slot]):',
          '    return [i.sku for i in live(items)]',
          '',
          '',
          'def b(items: list[Slot]):',
          '    return [i.sku for i in live(items) if i.sku]',
          '',
          '',
          'def c(items: list[Slot]):',
          '    return [i for i in live(items) if i.sku]',
          '',
          '',
          'def d(items: list[Slot]):',
          '    return {i.sku for i in live(items)}',
          '',
          '',
          'def e(items: list[Slot]):',
          '    return [i.sku for i in items]',
        ),
        ['deleted-item-filter-missing:31 e|Slot|is_deleted|live()|5 of 6'],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('stays quiet below the threshold, on narrowed types and on undo code', () => {
    const [actual, expected] = outcomes([
      [
        'a project that mostly does not check the flag',
        code(
          ...record('Cell'),
          'def a(items: list[Cell]):',
          '    return [i for i in items if not i.is_deleted]',
          '',
          '',
          'def b(items: list[Cell]):',
          '    return [i.sku for i in items]',
          '',
          '',
          'def c(items: list[Cell]):',
          '    return [i.sku for i in items if i.sku]',
          '',
          '',
          'def d(items: list[Cell]):',
          '    return len([i for i in items])',
          '',
          '',
          'def e(items: list[Cell]):',
          '    return list(items)',
        ),
        [],
      ],
      [
        'a collection typed with the narrowed type',
        code(
          'from typing import NewType',
          ...record('Node'),
          'NonDeleted = NewType("NonDeleted", Node)',
          '',
          '',
          ...guarded('Node'),
          'def f(items: list[NonDeleted[Node]]):',
          '    return [i.sku for i in items]',
        ),
        [],
      ],
      [
        'an undo function',
        code(
          ...record('Step'),
          ...guarded('Step'),
          'def undo_all(items: list[Step]):',
          '    return [i.sku for i in items]',
        ),
        [],
      ],
      [
        'a collection of a type without the flag',
        code(
          'from dataclasses import dataclass',
          '',
          '',
          '@dataclass',
          'class Tag:',
          '    name: str',
          '',
          '',
          'def a(tags: list[Tag]):',
          '    return [t.name for t in tags]',
        ),
        [],
      ],
      [
        'a collection whose name says it is narrowed',
        code(
          ...record('Pane'),
          ...guarded('Pane'),
          'def f(visible_items: list[Pane]):',
          '    return [i.sku for i in visible_items]',
        ),
        [],
      ],
      [
        'a sorted copy, a plain copy and an index builder',
        code(
          ...record('Tile'),
          ...guarded('Tile'),
          'def f(items: list[Tile]):',
          '    ordered = sorted(items, key=lambda i: i.sku)',
          '    copy = [i for i in items]',
          '    index = {i.sku: i for i in items}',
          '    return ordered, copy, index',
        ),
        [],
      ],
      [
        'a collection whose name says it includes deleted items',
        code(
          ...record('Card'),
          ...guarded('Card'),
          'def f(items_including_deleted: list[Card]):',
          '    return [i.sku for i in items_including_deleted]',
        ),
        [],
      ],
      [
        'a list that the function reassigns',
        code(
          ...record('Part'),
          ...guarded('Part'),
          'def f(items: list[Part]):',
          '    items = [i for i in items if not i.is_deleted]',
          '    return [i.sku for i in items]',
        ),
        [],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('reports the plain collection when others include deleted items on purpose', () => {
    const [actual, expected] = outcomes([
      [
        'one loop over the plain collection among loops over an including-deleted one',
        code(
          ...record('Dot'),
          ...guarded('Dot'),
          'def g(all_including_deleted: list[Dot]):',
          '    return [i.sku for i in all_including_deleted]',
          '',
          '',
          'def h(with_deleted: list[Dot]):',
          '    return [i.sku for i in with_deleted]',
          '',
          '',
          'def i(items: list[Dot]):',
          '    return [x.sku for x in items]',
        ),
        ['deleted-item-filter-missing:42 i|Dot|is_deleted|is_deleted|5 of 6'],
      ],
      [
        'a collection whose name only starts like an including-deleted one',
        code(
          ...record('Bar'),
          ...guarded('Bar'),
          'def f(items_with_deleted_at: list[Bar]):',
          '    return [i.sku for i in items_with_deleted_at]',
        ),
        ['deleted-item-filter-missing:34 f|Bar|is_deleted|is_deleted|5 of 6'],
      ],
    ]);

    expect(actual).toEqual(expected);
  });
});
