import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { buildFixPlans } from '../../build-fix-plans.mjs';
import { enforceable, filesEnvironment } from '../../test-support/env.mjs';
import { indexEntries } from '../../../reference/store.mjs';
import { ruleEntry } from '../../../reference/entry.mjs';
import { declineReason } from './decline.mjs';
import { declaredParameters } from './declaration.mjs';
import { parameterNames, sharedName } from './names.mjs';

const INDEX = indexEntries([
  ruleEntry({
    tool: 'structure',
    rule: 'near-duplicate',
    page: 'p',
    analyzers: { java: ['java'] },
    summary: 's',
  }),
]);
const SCHEMA = JSON.parse(
  readFileSync(new URL('../../../../spec/fix-plans.schema.json', import.meta.url), 'utf8'),
);
const OPENING = [
  'Compare the copies: src/a/load-orders.ts:2-6 and src/b/load-invoices.ts:2-6.',
  'Why a recipe did not make this change: the copies are in different files, and no recipe rewrites a pair across files.',
];
const SHARED_PLACE = [
  'Put load in a module in src/shared/: two features use it.',
  'A shared module must not import a feature (shared-imports-feature): pass what it needs from a feature as parameters.',
];
const CLOSING = 'Keep the behavior of both callers: run their tests.';
const PLACE = { folder: 'src/shared', kind: 'shared', reason: 'two features use it' };

function copy(path, symbol, extra = {}) {
  return { path, symbol, startLine: 2, endLine: 6, ...extra };
}

function finding(facts, fields = {}) {
  return enforceable({
    tool: 'structure',
    rule: 'near-duplicate',
    path: 'src/a/load-orders.ts',
    symbol: 'loadOrders',
    location: { line: 2 },
    allowedForm: 'Extract one function.',
    planFacts: facts,
    ...fields,
  });
}

const FILES = {
  'src/a/load-orders.ts':
    'import x;\nexport function loadOrders(store: Store, limit: number) {\n}\n',
};

function planOf(facts, files = FILES) {
  return buildFixPlans([finding(facts)], { index: INDEX, env: filesEnvironment(files) });
}

const PARAMETERIZABLE = {
  verdict: 'parameterizable',
  copies: [
    copy('src/a/load-orders.ts', 'loadOrders'),
    copy('src/b/load-invoices.ts', 'loadInvoices'),
  ],
  parameters: [
    { kind: 'value', deferred: false, literal: 'string', values: ['"orders"', '"invoices"'] },
    { kind: 'value', deferred: false, literal: 'number', values: ['10', '20'] },
  ],
  place: PLACE,
};

describe('the near-duplicate plan', () => {
  it('names the signature, both calls, the location and why no recipe applied', () => {
    const [plan] = planOf(PARAMETERIZABLE);

    expect(plan.kind).toBe('extract-shared-function');
    expect(plan.target).toEqual({
      path: 'src/a/load-orders.ts',
      symbol: 'loadOrders',
      startLine: 2,
      endLine: 6,
    });
    expect(plan.context.signature.text).toBe('load(store: Store, limit: number, text, amount)');
    expect(plan.context.copies.map(({ arguments: args }) => args)).toEqual([
      [
        { parameter: 'text', value: '"orders"' },
        { parameter: 'amount', value: '10' },
      ],
      [
        { parameter: 'text', value: '"invoices"' },
        { parameter: 'amount', value: '20' },
      ],
    ]);
    expect(plan.context.location).toEqual(PLACE);
    expect(plan.context.declined).toEqual({
      reason: 'the copies are in different files, and no recipe rewrites a pair across files',
    });
    expect(plan.steps).toEqual([
      'Compare the copies: src/a/load-orders.ts:2-6 and src/b/load-invoices.ts:2-6.',
      'Why a recipe did not make this change: the copies are in different files, and no recipe rewrites a pair across files.',
      'Put load in a module in src/shared/: two features use it.',
      'A shared module must not import a feature (shared-imports-feature): pass what it needs from a feature as parameters.',
      'Move the body of loadOrders into load(store: Store, limit: number, text, amount), and use the new parameters where the copies differ.',
      'In src/a/load-orders.ts:2-6, replace the body with a call: load(..., "orders", 10).',
      'In src/b/load-invoices.ts:2-6, replace the body with a call: load(..., "invoices", 20).',
      'Keep the behavior of both callers: run their tests.',
    ]);
    expect(plan.doneWhen).toBe(
      'nitpicker reports no structure/near-duplicate finding for loadOrders (src/a/load-orders.ts:2-6).',
    );
  });

  it('fits the fix plan schema', () => {
    const validate = new Ajv2020({ strict: false, allErrors: true }).compile(SCHEMA);

    expect(validate(planOf(PARAMETERIZABLE)), JSON.stringify(validate.errors)).toBe(true);
  });

  it('asks for the whole body when the copies are the same apart from names', () => {
    const [plan] = planOf({ ...PARAMETERIZABLE, verdict: 'same', parameters: [] });

    expect(plan.steps).toEqual([
      ...OPENING,
      ...SHARED_PLACE,
      'Move the body of loadOrders into load(store: Store, limit: number): the copies do the same, so it needs no extra parameter.',
      'In src/a/load-orders.ts:2-6, replace the body with a call: load(...).',
      'In src/b/load-invoices.ts:2-6, replace the body with a call: load(...).',
      CLOSING,
    ]);
  });

  it('asks for the shared statements only when the copies share a run', () => {
    const copies = [
      copy('src/a/load-orders.ts', 'loadOrders', { run: { startLine: 3, endLine: 5 } }),
      copy('src/b/load-invoices.ts', 'loadInvoices', { run: { startLine: 4, endLine: 6 } }),
    ];
    const [plan] = planOf({ ...PARAMETERIZABLE, verdict: 'partial-run', parameters: [], copies });

    expect(plan.steps).toEqual([
      ...OPENING,
      ...SHARED_PLACE,
      'Extract only the shared statements, lines 3-5 of src/a/load-orders.ts and the matching lines of src/b/load-invoices.ts, as load(store: Store, limit: number).',
      'In src/a/load-orders.ts:2-6, replace the body with a call: load(...).',
      'In src/b/load-invoices.ts:2-6, replace the body with a call: load(...).',
      CLOSING,
    ]);
  });

  it('keeps the function in a feature without the shared-module warning', () => {
    const place = { folder: 'src/features/cart', kind: 'feature', reason: 'one feature' };
    const [plan] = planOf({ ...PARAMETERIZABLE, parameters: [], place });

    expect(plan.steps).toEqual([
      ...OPENING,
      'Put load in a module in src/features/cart/: one feature.',
      'Move the body of loadOrders into load(store: Store, limit: number), and use the new parameters where the copies differ.',
      'In src/a/load-orders.ts:2-6, replace the body with a call: load(...).',
      'In src/b/load-invoices.ts:2-6, replace the body with a call: load(...).',
      CLOSING,
    ]);
  });

  it('says what to do with a differing expression, a type and a missing part', () => {
    const [plan] = planOf({
      ...PARAMETERIZABLE,
      parameters: [
        { kind: 'value', deferred: true, values: ['store.read()', undefined] },
        { kind: 'type', deferred: false, values: ['Order', 'Invoice'] },
      ],
    });

    expect(plan.context.signature.text).toBe(
      'load(store: Store, limit: number, expression, type typeArgument)',
    );
    expect(plan.context.copies[1].arguments).toEqual([
      { parameter: 'expression', value: 'nothing' },
      { parameter: 'typeArgument', value: 'Invoice' },
    ]);
    expect(plan.steps).toEqual([
      ...OPENING,
      ...SHARED_PLACE,
      'Move the body of loadOrders into load(store: Store, limit: number, expression, type typeArgument), and use the new parameters where the copies differ.',
      'In src/a/load-orders.ts:2-6, replace the body with a call: load(..., store.read(), Order).',
      'In src/b/load-invoices.ts:2-6, replace the body with a call: load(..., nothing, Invoice).',
      'A parameter that is not a literal holds code that differs: evaluate it in the caller, or pass a function when order or side effects matter.',
      CLOSING,
    ]);
  });

  it('does not reuse a name that the first copy already declares or uses', () => {
    const files = {
      'src/a/load-orders.ts':
        'import x;\nexport function loadOrders(text: string, limit: number) {\n  const load = text;\n  return load + limit;\n}\n',
      'src/b/load-invoices.ts':
        'import x;\nexport function loadInvoices(text: string, limit: number) {\n  return text + limit;\n}\n',
    };
    const [plan] = planOf(PARAMETERIZABLE, files);

    expect(plan.context.signature.text).toBe(
      'sharedLoad(text: string, limit: number, text2, amount)',
    );
  });

  it('names a recipe and the command when the copies are in one file', () => {
    const copies = [
      copy('src/a/load.ts', 'loadOrders'),
      copy('src/a/load.ts', 'loadInvoices', { startLine: 8, endLine: 12 }),
    ];
    const [plan] = planOf({ ...PARAMETERIZABLE, copies });

    expect(plan.steps[1]).toBe(
      'A recipe may make this change: typescript-extract-near-duplicate. Run `nitpicker --fix --rule structure/near-duplicate`; if it leaves the pair, its Fix notes say why.',
    );
    expect([plan.context.declined, plan.context.recipe]).toEqual([
      undefined,
      {
        recipe: 'typescript-extract-near-duplicate',
        command: 'nitpicker --fix --rule structure/near-duplicate',
      },
    ]);
  });

  it('writes the plan of a finding without facts from its message', () => {
    const [plan] = buildFixPlans([finding(undefined)], {
      index: INDEX,
      env: filesEnvironment({}),
    });

    expect(plan.kind).toBe('extract-shared-function');
    expect(plan.steps).toEqual([
      'Compare loadOrders with the copy the finding names.',
      'Extract one function in a module both callers may import, with the values that differ as parameters.',
      'Make both places call it.',
      'Extract one function.',
      CLOSING,
    ]);
  });

  it('gives a snake case name to a Python function', () => {
    const facts = {
      ...PARAMETERIZABLE,
      copies: [
        copy('src/a/orders.py', 'load_orders', { startLine: 1 }),
        copy('src/b/invoices.py', 'load_invoices'),
      ],
    };
    const [plan] = planOf(facts, { 'src/a/orders.py': 'def load_orders(store, limit):\n  pass\n' });

    expect(plan.context.signature).toEqual({
      name: 'load',
      ownParameters: 'store, limit',
      addedParameters: [
        { name: 'text', kind: 'value', deferred: false },
        { name: 'amount', kind: 'value', deferred: false },
      ],
      text: 'load(store, limit, text, amount)',
    });
  });
});

describe('declineReason', () => {
  const facts = { copies: [copy('a.ts', 'f'), copy('a.ts', 'g')] };
  const sameFile = (path, symbols, extra = {}) => ({
    verdict: 'parameterizable',
    parameters: [],
    copies: symbols.map((symbol) => copy(path, symbol)),
    ...extra,
  });

  it('says no recipe applies when none left a note', () => {
    expect(declineReason(facts).reason).toBe('no recipe applies to this pair');
  });

  it.each([
    ['a.ts', ['f', 'g'], {}, 'typescript-extract-near-duplicate'],
    ['a.ts', ['f', 'g'], { verdict: 'partial-run' }, 'typescript-extract-partial-run'],
    ['A.java', ['A.f', 'A.g'], {}, 'java-extract-near-duplicate'],
    ['A.java', ['A.f', 'A.g'], { verdict: 'partial-run' }, 'java-extract-partial-run'],
  ])('points a pair in one file of %s at its recipe', (path, symbols, extra, recipe) => {
    expect(declineReason(sameFile(path, symbols, extra))).toEqual({
      recipe,
      command: 'nitpicker --fix --rule structure/near-duplicate',
    });
  });

  it.each([
    [
      'a type that differs',
      sameFile('a.ts', ['f', 'g'], { parameters: [{ kind: 'type', values: ['A', 'B'] }] }),
      'typescript-extract-near-duplicate',
      'the copies differ in a type, which a parameter of the extracted function cannot carry',
    ],
    [
      'an expression that differs in Java',
      sameFile('A.java', ['A.f', 'A.g'], { parameters: [{ kind: 'value', deferred: true }] }),
      'java-extract-near-duplicate',
      'a differing expression cannot be passed in Java, because the parameter needs its type written',
    ],
    [
      'two classes',
      sameFile('A.java', ['A.f', 'B.g']),
      'java-extract-near-duplicate',
      'the copies are in different classes',
    ],
    [
      'a language without a recipe',
      sameFile('a.py', ['f', 'g']),
      undefined,
      'no recipe extracts near-duplicate copies in Python',
    ],
  ])('gives the reason of %s', (_name, pair, recipe, reason) => {
    expect(declineReason(pair)).toEqual(recipe === undefined ? { reason } : { recipe, reason });
  });

  it('uses the note of the first recipe that declined the pair', () => {
    const declines = [
      { recipe: 'quiet', note: () => undefined },
      { recipe: 'extract-demo', note: () => 'it reads a closure variable' },
      { recipe: 'late', note: () => 'ignored' },
    ];

    expect(declineReason(facts, declines)).toEqual({
      recipe: 'extract-demo',
      reason: 'it reads a closure variable',
    });
  });
});

describe('names', () => {
  it.each([
    [['alignTop', 'alignBottom'], false, 'align'],
    [['align_top', 'align_bottom'], true, 'align'],
    [['Orders.send(Request,int)', 'Invoices.send(Request,int)'], false, 'send'],
    [['sendOrder', 'send'], false, 'send'],
    [['sendOrder', 'sendInvoice'], false, 'send'],
    [['load', 'load#2'], false, 'load'],
    [['render', 'draw'], false, 'sharedRender'],
  ])('%j becomes %s', (symbols, snake, expected) => {
    expect(sharedName(symbols, { snake })).toBe(
      snake ? expected.replaceAll(/[A-Z]/gu, (c) => `_${c.toLowerCase()}`) : expected,
    );
  });

  it('numbers a repeated parameter name', () => {
    expect(
      parameterNames(
        [
          { kind: 'value', literal: 'string', values: [] },
          { kind: 'value', literal: 'string', values: [] },
          { kind: 'type', values: [] },
        ],
        { snake: false },
      ),
    ).toEqual(['text1', 'text2', 'typeArgument']);
  });
});

describe('declaredParameters', () => {
  it.each([
    [
      'a decorator',
      '@Component({ selector: "x" })\nexport function f(a: number, b: string) {\n}\n',
      'a: number, b: string',
    ],
    [
      'an annotation',
      '@Override\n@SuppressWarnings("unchecked")\npublic String f(int a, String b) {\n}\n',
      'int a, String b',
    ],
    [
      'a function expression in a call',
      'const f = useCallback((a: number, b: string) => {\n  return a;\n}, []);\n',
      'a: number, b: string',
    ],
    [
      'an arrow with a return type',
      'export const f = async (a: number, b: string): Promise<void> => {\n};\n',
      'a: number, b: string',
    ],
    [
      'a function expression',
      'const f = function (a: number, b: string) {\n};\n',
      'a: number, b: string',
    ],
  ])('reads the parameters of %s', (_name, text, expected) => {
    expect(declaredParameters(text, 1)).toBe(expected);
  });

  it('reads the one parameter of an arrow without parentheses', () => {
    expect(declaredParameters('export const f = value => value + 1;\n', 1)).toBe('value');
  });

  it('skips a comment and a string with parentheses in the list', () => {
    const text = 'function f(a = "(", /* ) */ b) {\n}\n';

    expect(declaredParameters(text, 1)).toBe('a = "(", b');
  });

  it('reads a parameter list that spans lines and nests parentheses', () => {
    const text = 'x\nfun f(a: (Int) -> Int,\n  b: String): Int {\n}\n';

    expect(declaredParameters(text, 2)).toBe('a: (Int) -> Int, b: String');
  });

  it('gives nothing for a missing file or an unbalanced list', () => {
    expect(declaredParameters(undefined, 1)).toBeUndefined();
    expect(declaredParameters('f(a,\n', 1)).toBeUndefined();
    expect(declaredParameters('const f = 1;\n', 1)).toBeUndefined();
  });
});
