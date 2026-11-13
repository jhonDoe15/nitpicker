import type {
  Bounds,
  Contracts,
  Expectation,
  Inputs,
  Outcome,
  Status,
} from '../model/contract-types.mts';

export type Edit = readonly [string, string];

export type Fixture = {
  readonly name: string;
  readonly title: string;
  readonly file: string;
  readonly entry: string;
  readonly source: string;
  readonly bounds: Partial<Bounds> | undefined;
  readonly expect: Expectation;
};

type FixtureOptions = {
  readonly title: string;
  readonly entry?: string;
  readonly source: string;
  readonly expect: FixtureExpect;
  readonly bounds?: Partial<Bounds>;
};

export type FixtureExpect = {
  readonly status: Status;
  readonly reasons?: readonly string[];
  readonly violations?: readonly string[];
};

const SUCCESS: Outcome = { name: 'success', result: 'success' };
const FAILURE: Outcome = { name: 'failure', result: 'failure' };
const AMBIGUOUS: Outcome = { name: 'ambiguous', result: 'ambiguous' };

export const ORDER_CONTRACTS = Object.freeze({
  effects: {
    'db.commit': { entity: { arg: 0, field: 'id' }, outcomes: [SUCCESS, FAILURE, AMBIGUOUS] },
    'bus.publish': { entity: { arg: 1 }, event: { arg: 0 }, outcomes: [SUCCESS, FAILURE] },
  },
  constructs: ['Error'],
  transitions: [
    {
      id: 'order-status',
      effect: 'db.commit',
      from: { arg: 0, field: 'status' },
      to: { arg: 1 },
      allowed: [
        ['pending', 'paid'],
        ['pending', 'cancelled'],
        ['paid', 'refunded'],
      ],
    },
  ],
  prerequisites: [
    {
      id: 'paid-before-publish',
      effect: 'bus.publish',
      event: 'OrderPaid',
      requires: { effect: 'db.commit', to: 'paid' },
    },
  ],
} satisfies Contracts);

const STATUS = { oneOf: ['pending', 'paid', 'cancelled'] };
const FLAG = { oneOf: [true, false] };

export const ORDER_INPUTS = Object.freeze({
  order: { id: 'A', status: STATUS },
  other: { id: 'B', status: STATUS },
  flag: FLAG,
  retry: FLAG,
  method: { oneOf: ['commit'] },
  payment: { amount: { oneOf: [50, 150] } },
  count: { oneOf: [0, 1] },
  items: 'object',
  db: 'effects',
  bus: 'effects',
} satisfies Inputs);

export const PAID_A = 'paid-before-publish|bus.publish|A';
export const PAID_ANY = 'paid-before-publish|bus.publish|?';
export const ANY_EFFECT = [PAID_ANY, 'order-status|db.commit|?|?|?'];
export const UNKNOWN_CALL: FixtureExpect = {
  status: 'partial',
  reasons: ['unknown-call', 'unknown-entity', 'unknown-state'],
  violations: ['order-status|db.commit|?|?|paid', PAID_ANY],
};

export function transition(entity: string, from: string, to: string): string {
  return `order-status|db.commit|${entity}|${from}|${to}`;
}

export function code(strings: TemplateStringsArray, ...values: readonly unknown[]): string {
  const raw = strings.reduce((text, part, index) => `${text}${String(values[index - 1])}${part}`);
  const lines = raw
    .replace(/^\n/, '')
    .replace(/\n\s*$/, '')
    .split('\n');
  const indents = lines.filter((line) => line.trim() !== '').map((line) => line.search(/[^ ]|$/));
  const indent = Math.min(...indents);
  return `${lines.map((line) => line.slice(indent)).join('\n')}\n`;
}

export function fixture(
  name: string,
  { title, entry = 'payOrder', source, expect, bounds }: FixtureOptions,
): Fixture {
  return {
    name,
    title,
    file: `reports/flow-model/fixtures/${name}.ts`,
    entry,
    source,
    bounds,
    expect: { reasons: [], violations: [], ...expect },
  };
}

export function normalizedLines(text: string): string {
  return text.replaceAll('\r\n', '\n');
}

export function applyEdits(text: string, edits: readonly Edit[], hint = 'the edit list'): string {
  let result = normalizedLines(text);
  for (const [before, after] of edits) {
    const first = result.indexOf(before);
    if (first === -1 || result.indexOf(before, first + 1) !== -1) {
      const shown = JSON.stringify(before);
      throw new Error(`flow-model: seeded edit ${shown} does not match exactly once; ${hint}`);
    }
    result = result.replace(before, () => after);
  }
  return result;
}
