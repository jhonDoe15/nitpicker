import { describe, expect, it } from 'vitest';
import { designFindings } from '../../design-findings.mjs';
import { fixtureRoot, ref } from '../../test-support/design-facts-support.mjs';

const SINGLE = [{ dir: '', sourceRoots: ['src/main/java'], published: false }];
const SPLIT = [
  { dir: 'core', sourceRoots: ['core/src/main/java'], published: true },
  { dir: 'app', sourceRoots: ['app/src/main/java'], published: false },
];

function escape(caller, owner, how = 'add') {
  return ['mutable-state-escape', `${caller}>${owner}:${how}`, 'enforceable'];
}

describe('the shared design rules over the Java facts', () => {
  it.each([
    [
      'escape',
      SINGLE,
      [
        escape(
          ref('shop/service/Checkout.java', 'Checkout.aliased'),
          ref('shop/model/Cart.java', 'Cart.lines'),
        ),
        escape(
          ref('shop/service/Checkout.java', 'Checkout.direct'),
          ref('shop/model/Cart.java', 'Cart.lines'),
        ),
        escape(
          ref('shop/service/Checkout.java', 'Checkout.queued'),
          ref('shop/model/Cart.java', 'Cart.queued'),
        ),
      ],
    ],
    [
      'lombok',
      SINGLE,
      [
        escape(ref('sale/Till.java', 'Till.ring'), ref('sale/Basket.java', 'Basket.getLines')),
        escape(ref('sale/Till.java', 'Till.ring'), ref('sale/Receipt.java', 'Receipt.getEntries')),
      ],
    ],
    [
      'forwarding',
      SINGLE,
      [
        [
          'context-threading',
          `${ref('fwd/Gateway.java', 'Gateway.threaded')}#context`,
          'descriptive',
        ],
      ],
    ],
    [
      'decisions',
      SINGLE,
      [
        [
          'repeated-policy-decision',
          `${ref('rules/Kind.java', 'Kind')}|BASIC,TRIAL`,
          'descriptive',
        ],
      ],
    ],
    [
      'modules',
      SPLIT,
      [
        escape(
          ref('app/Report.java', 'Report.note', 'app/src/main/java'),
          ref('core/Ledger.java', 'Ledger.entries', 'core/src/main/java'),
        ),
      ],
    ],
    ['lifecycle', SINGLE, []],
    ['resolution', SINGLE, []],
    ['entries', SINGLE, []],
    ['syntax', SINGLE, []],
    ['references', SINGLE, []],
  ])('reports exactly these findings for the %s fixture', (name, modules, expected) => {
    const findings = designFindings({ projectRoot: fixtureRoot(name), modules, policy: {} });

    expect(
      findings.map(({ rule, identity, classification }) => [rule, identity, classification]),
    ).toEqual(expected);
  });
});
