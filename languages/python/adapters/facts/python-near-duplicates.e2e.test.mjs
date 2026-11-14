import { afterEach, describe, expect, it } from 'vitest';
import { exceptionHint } from '../../../../shared/rules/exceptions.mjs';
import { pythonE2eEnabled } from '../e2e/test-support/python-e2e-support.mjs';
import { createFactsProjects } from './test-support/facts-projects.mjs';

const { factsOf, cleanup } = createFactsProjects();

afterEach(cleanup);

const ALIGN = (edge, key) =>
  [
    `def align_${edge}(elements, state, translate):`,
    '    selected = [e for e in state.selection if not e.locked]',
    `    label = translate("labels.${key}")`,
    `    return render(selected, icon="${edge}", label=label)`,
    '',
  ].join('\n');

const TOTALS = [
  'class Totals:',
  '    def sum_weights(self, items, scale):',
  '        total = 0',
  '        for index in range(len(items)):',
  '            total = total + weigh(items[index], scale)',
  '        record(total, items, scale)',
  '        return total',
  '',
  '    def add_weights(self, values, factor):',
  '        result = 0',
  '        for position in range(len(values)):',
  '            result = result + weigh(values[position], factor)',
  '        record(result, values, factor)',
  '        return result',
  '',
].join('\n');

function nearDuplicates(files) {
  return factsOf(files)
    .findings()
    .filter(({ rule }) => rule === 'near-duplicate');
}

describe.skipIf(!pythonE2eEnabled)('near-duplicate over Python functions', () => {
  it('reports a function copied into another module with changed literals', () => {
    const top = 'src/shop/top.py';
    const bottom = 'src/shop/bottom.py';
    const header = 'from shop.render import render\n\n\n';
    const found = nearDuplicates({
      [top]: `${header}${ALIGN('top', 'alignTop')}`,
      [bottom]: `${header}${ALIGN('bottom', 'alignBottom')}`,
    });

    expect(found.map(({ path, identity }) => [path, identity])).toEqual([
      [top, `near-duplicate:${bottom}#align_bottom|${top}#align_top`],
    ]);
    expect(found[0].message).toBe(
      [
        `align_top is a copy of align_bottom (${bottom}:4) apart from 2 values`,
        "('labels.alignTop' / 'labels.alignBottom' and 'top' / 'bottom'). Extract one function that",
        'takes the differing values as parameters, and call it from both places.',
        exceptionHint('near-duplicate', top),
      ].join(' '),
    );
  });

  it('reports a renamed copy of a method, and leaves test modules alone', () => {
    const found = nearDuplicates({
      'src/shop/totals.py': TOTALS,
      'tests/test_totals.py': TOTALS.replace('class Totals', 'class TestTotals'),
    });

    expect(found.map(({ path, identity }) => [path, identity])).toEqual([
      [
        'src/shop/totals.py',
        'near-duplicate:src/shop/totals.py#Totals.add_weights|src/shop/totals.py#Totals.sum_weights',
      ],
    ]);
  });

  it('proves a loop equal to the any call that replaces it, and inlines a module helper', () => {
    const file = 'src/shop/checks.py';
    const source = [
      'def has_overdue_loop(loans, today):',
      '    audit.record("overdue", len(loans), today)',
      '    metrics.count("overdue-check", len(loans))',
      '    for loan in loans:',
      '        if loan.due < today and not loan.returned:',
      '            return True',
      '    return False',
      '',
      '',
      'def has_overdue_any(loans, today):',
      '    audit.record("overdue", len(loans), today)',
      '    metrics.count("overdue-check", len(loans))',
      '    return any(loan.due < today and not loan.returned for loan in loans)',
      '',
      '',
      'def trimmed(text, limit):',
      '    if len(text) > limit:',
      '        return text[:limit].strip()',
      '    return text.strip()',
      '',
      '',
      'def via_helper(text, limit):',
      '    if text is None:',
      '        raise ValueError("missing text for the label")',
      '    return trimmed(text, limit)',
      '',
      '',
      'def spelled_out(value, most):',
      '    if value is None:',
      '        raise ValueError("missing text for the label")',
      '    if len(value) > most:',
      '        return value[:most].strip()',
      '    return value.strip()',
      '',
    ].join('\n');

    expect(nearDuplicates({ [file]: source }).map(({ identity }) => identity)).toEqual([
      `near-duplicate:${file}#has_overdue_any|${file}#has_overdue_loop`,
      `near-duplicate:${file}#spelled_out|${file}#via_helper`,
    ]);
  });
});
