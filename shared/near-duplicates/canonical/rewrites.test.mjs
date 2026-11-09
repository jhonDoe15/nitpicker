import { describe, expect, it } from 'vitest';
import { verdictOf } from '../test-support/prove.mjs';

const TAIL = `
  const report = format(total, 'summary', options.width);
  audit.record(report, total, options.user);
  return report;`;

function pair(first, second) {
  return [
    `function first(items, options, limit) {${first}${TAIL}\n}`,
    `function second(items, options, limit) {${second}${TAIL}\n}`,
  ].join('\n');
}

const SPLIT_GUARDS = `
  if (items === null) { return null; }
  if (options === null) { return null; }
  let total = 0; total = consume(items);`;

const JOINED_GUARDS = `
  if (options === null || items === null) { return null; }
  let total = 0; total = consume(items);`;

const RETURN_FORMS = [
  `if (options.strict) { return check(items, 'strict'); } return check(items, 'loose');`,
  `if (options.strict) { return check(items, 'strict'); } else { return check(items, 'loose'); }`,
  `return options.strict ? check(items, 'strict') : check(items, 'loose');`,
  `if (!options.strict) { return check(items, 'loose'); } else { return check(items, 'strict'); }`,
];

const RETURN_PREFIX = [
  'const total = measure(items, options.width, options.height);',
  'audit.record(total, items, options);',
].join(' ');

function returnPair(form) {
  return [
    `function first(items, options) { ${RETURN_PREFIX} ${RETURN_FORMS[0]} }`,
    `function second(items, options) { ${RETURN_PREFIX} ${form} }`,
  ].join('\n');
}

describe('canonical rewrites before alignment', () => {
  it.each([
    [
      'an independent statement moved',
      `const max = 10; const step = 2; let total = 0; total = consume(items, max, step);`,
      `const step = 2; const max = 10; let total = 0; total = consume(items, max, step);`,
    ],
    [
      'nested ifs merged into one condition',
      `let total = 0; if (items.length > 0) { if (options.enabled) { total = consume(items); } }`,
      `let total = 0; if (items.length > 0 && options.enabled) { total = consume(items); }`,
    ],
    ['split guards that return the same value, in either order', SPLIT_GUARDS, JOINED_GUARDS],
    [
      'a for loop and a while loop with the same init, condition and step',
      `let total = 0; for (let i = 0; i < items.length; i++) { total = total + weigh(items[i]); }`,
      `let total = 0; let i = 0; while (i < items.length) { total = total + weigh(items[i]); i++; }`,
    ],
    [
      'an if-else assignment and a ternary assignment',
      `let total; if (options.strict) { total = weigh(items, 2); } else { total = weigh(items, 1); }`,
      `let total = options.strict ? weigh(items, 2) : weigh(items, 1);`,
    ],
    [
      'side-effect-free commutative operands written in the other order',
      `let total = 0; if (items === limit && options) { total = consume(items, limit); }`,
      `let total = 0; if (options && limit === items) { total = consume(items, limit); }`,
    ],
  ])('proves %s as one form', (_, first, second) => {
    expect(verdictOf(pair(first, second))).toBe('same');
  });

  it.each([
    [
      'a statement in place when a later one reads what it writes',
      `let total = 0; const base = total + 1; total = consume(items, base);`,
      `const base = total + 1; let total = 0; total = consume(items, base);`,
    ],
    [
      'a declaration in place across a call when a lambda captures the name',
      `let total = 0; const seen = 1; run(() => seen); total = consume(items, seen);`,
      `let total = 0; run(() => seen); const seen = 1; total = consume(items, seen);`,
    ],
    [
      'two guards with different results apart',
      `if (items === null) { return null; } if (options === null) { return []; } let total = 0;`,
      `if (options === null) { return []; } if (items === null) { return null; } let total = 0;`,
    ],
    [
      'a for loop whose body continues apart, because the step would be skipped',
      [
        'let total = 0;',
        'for (let i = 0; i < items.length; i++) { if (skip(i)) { continue; } total = weigh(i); }',
      ].join(' '),
      [
        'let total = 0; let i = 0;',
        'while (i < items.length) { if (skip(i)) { continue; } total = weigh(i); i++; }',
      ].join(' '),
    ],
    [
      'the first operand of a logical chain',
      `let total = 0; if (ready && options.enabled) { total = consume(items); }`,
      `let total = 0; if (options.enabled) { total = consume(items); }`,
    ],
    [
      'a for loop whose closures capture the loop variable apart from a while loop',
      `let total = 0; for (let i = 0; i < items.length; i++) { total = keep(() => i); }`,
      `let total = 0; let i = 0; while (i < items.length) { total = keep(() => i); i++; }`,
    ],
    [
      'a declaration in place across a destructuring write of what it reads',
      `let total = 0; [limit, items] = [items, limit]; const max = limit + 1; total = consume(max);`,
      `let total = 0; const max = limit + 1; [limit, items] = [items, limit]; total = consume(max);`,
    ],
    [
      'operands with calls in their written order',
      `let total = 0; if (ready(items) && options.enabled) { total = consume(items); }`,
      `let total = 0; if (options.enabled && ready(items)) { total = consume(items); }`,
    ],
  ])('keeps %s', (_, first, second) => {
    expect(verdictOf(pair(first, second))).not.toBe('same');
  });

  it.each(RETURN_FORMS.slice(1))('proves the return form %s like an if-return', (form) => {
    expect(verdictOf(returnPair(form))).toBe('same');
  });

  it('puts numeric sums in order only when the producer marks them as numeric', () => {
    const first = `let total = 0; let size = 0; size = count + offset; total = consume(items, size);`;
    const second = `let total = 0; let size = 0; size = offset + count; total = consume(items, size);`;

    expect([
      verdictOf(pair(first, second), { commutes: true }),
      verdictOf(pair(first, second)),
    ]).toEqual(['same', 'parameterizable']);
  });
});
