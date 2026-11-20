import { describe, expect, it } from 'vitest';
import { PYTHON_RECIPES } from '../python-recipes.mts';
import { PATH, align, extracted, module, totals } from './test-support/extract-sources.mts';

const PAIR = module(align('top', 'alignTop'), align('bottom', 'alignBottom'));
const DOCSTRING = (text: string) => `    """${text}"""\n    selected`;

function asynchronous(text: string): string {
  return text.replace('def ', 'async def ').replace('translate(', 'await translate(');
}

function annotated(text: string): string {
  return text.replace(
    '(elements, state, translate)',
    '(elements: list, state: State, translate: Callable) -> Result',
  );
}

function scaled(name: string, count: string, flag: string): string {
  return [
    `def ${name}(items, state):`,
    `    selected = [item for item in items if item.size > ${count}]`,
    `    state.update(selected, locked=${flag}, limit=${count} * 2)`,
    '    return len(selected) + state.count',
    '',
  ].join('\n');
}

function quiet(name: string, word: string): string {
  return [
    `def ${name}(items, log):`,
    '    for item in items:',
    '        if item.hidden:',
    `            log.write("${word}: hidden " + item.name)`,
    '        else:',
    `            log.write("${word}: " + item.name.strip())`,
    '    log.flush()',
    '',
  ].join('\n');
}

describe('python-extract-near-duplicate', () => {
  it('is a review recipe for structure/near-duplicate in the python preset', () => {
    const recipe = PYTHON_RECIPES.find(({ id }) => id === 'python-extract-near-duplicate');
    expect([recipe?.safety, recipe?.scope, recipe?.presets, recipe?.rules]).toEqual([
      'review',
      'file',
      ['python'],
      [{ tool: 'structure', rule: 'near-duplicate' }],
    ]);
  });

  it('extracts a module-level function after the first copy', () => {
    const { after, fixed } = extracted(PAIR);
    expect(fixed).toEqual([`${PATH}:1 structure/near-duplicate (python-extract-near-duplicate)`]);
    expect(after).toMatchInlineSnapshot(`
      "def align_top(elements, state, translate):
          return _shared_align_top(elements, state, translate, "labels.alignTop", "top")


      def _shared_align_top(elements, state, translate, text, text_value):
          selected = [e for e in state.selection if not e.locked]
          label = translate(text)
          return render(selected, icon=text_value, label=label)


      def align_bottom(elements, state, translate):
          return _shared_align_top(elements, state, translate, "labels.alignBottom", "bottom")
      "
    `);
  });

  it('extracts a private method when the copies are methods of one class', () => {
    const source = `class Totals:\n${totals('sum_weights', 'scale', '2')}\n${totals('add_weights', 'factor', '3')}`;
    expect(extracted(source).after).toMatchInlineSnapshot(`
      "class Totals:
          def sum_weights(self, items, scale):
              return self._shared_sum_weights(items, scale, 2)

          def _shared_sum_weights(self, items, scale, number):
              total = 0
              for index in range(len(items)):
                  total = total + self.weigh(items[index], scale) * number
              self.record(total, items)
              return total

          def add_weights(self, items, factor):
              return self._shared_sum_weights(items, factor, 3)
      "
    `);
  });

  it('keeps each docstring and the comments of the first copy', () => {
    const first = align('top', 'alignTop', { body: '    # keep the lock check' }).replace(
      '    selected',
      DOCSTRING('Align to the top.'),
    );
    const second = align('bottom', 'alignBottom').replace(
      '    selected',
      DOCSTRING('Align to the bottom.'),
    );
    expect(extracted(module(first, second)).after).toMatchInlineSnapshot(`
      "def align_top(elements, state, translate):
          """Align to the top."""
          return _shared_align_top(elements, state, translate, "labels.alignTop", "top")


      def _shared_align_top(elements, state, translate, text, text_value):
          selected = [e for e in state.selection if not e.locked]
          # keep the lock check
          label = translate(text)
          return render(selected, icon=text_value, label=label)


      def align_bottom(elements, state, translate):
          """Align to the bottom."""
          return _shared_align_top(elements, state, translate, "labels.alignBottom", "bottom")
      "
    `);
  });

  it('awaits the shared function of async copies', () => {
    const source = module(
      asynchronous(align('top', 'alignTop')),
      asynchronous(align('bottom', 'alignBottom')),
    );
    expect(extracted(source).after).toMatchInlineSnapshot(`
      "async def align_top(elements, state, translate):
          return await _shared_align_top(elements, state, translate, "labels.alignTop", "top")


      async def _shared_align_top(elements, state, translate, text, text_value):
          selected = [e for e in state.selection if not e.locked]
          label = await translate(text)
          return render(selected, icon=text_value, label=label)


      async def align_bottom(elements, state, translate):
          return await _shared_align_top(elements, state, translate, "labels.alignBottom", "bottom")
      "
    `);
  });

  it('annotates the new parameters when the copies are annotated', () => {
    const source = module(
      annotated(align('top', 'alignTop')),
      annotated(align('bottom', 'alignBottom')),
    );
    expect(extracted(source).after).toMatchInlineSnapshot(`
      "def align_top(elements: list, state: State, translate: Callable) -> Result:
          return _shared_align_top(elements, state, translate, "labels.alignTop", "top")


      def _shared_align_top(elements: list, state: State, translate: Callable, text: str, text_value: str) -> Result:
          selected = [e for e in state.selection if not e.locked]
          label = translate(text)
          return render(selected, icon=text_value, label=label)


      def align_bottom(elements: list, state: State, translate: Callable) -> Result:
          return _shared_align_top(elements, state, translate, "labels.alignBottom", "bottom")
      "
    `);
  });

  it('passes numbers and flags the copies differ in', () => {
    const source = module(scaled('shrink', '3', 'True'), scaled('grow', '5', 'False'));
    expect(extracted(source).after).toMatchInlineSnapshot(`
      "def shrink(items, state):
          return _shared_shrink(items, state, True, 3)


      def _shared_shrink(items, state, flag, number):
          selected = [item for item in items if item.size > number]
          state.update(selected, locked=flag, limit=number * 2)
          return len(selected) + state.count


      def grow(items, state):
          return _shared_shrink(items, state, False, 5)
      "
    `);
  });

  it('calls a function that returns nothing as a statement', () => {
    expect(extracted(module(quiet('first', 'one'), quiet('second', 'two'))).after)
      .toMatchInlineSnapshot(`
      "def first(items, log):
          _shared_first(items, log, "one: hidden ", "one: ")


      def _shared_first(items, log, text, text_value):
          for item in items:
              if item.hidden:
                  log.write(text + item.name)
              else:
                  log.write(text_value + item.name.strip())
          log.flush()


      def second(items, log):
          _shared_first(items, log, "two: hidden ", "two: ")
      "
    `);
  });

  it('keeps the line endings of a file that uses CRLF', () => {
    const { after } = extracted(PAIR.replaceAll('\n', '\r\n'));
    expect([
      after.includes('_shared_align_top'),
      after.replaceAll('\r\n', '').includes('\n'),
    ]).toEqual([true, false]);
  });
});
