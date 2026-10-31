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
    [
      'mutators',
      SINGLE,
      [
        ['either', 'lines', 'add'],
        ['filled', 'lines', 'fill'],
        ['iterated', 'lines', 'remove'],
        ['ordered', 'codes', 'sort'],
        ['sliced', 'lines', 'clear'],
        ['sorted', 'lines', 'sort'],
      ].map(([caller, accessor, how]) =>
        escape(
          ref('store/Sorting.java', `Sorting.${caller}`),
          ref('store/Basket.java', `Basket.${accessor}`),
          how,
        ),
      ),
    ],
    ['hierarchy', SINGLE, []],
    ['lifecycle', SINGLE, []],
    ['resolution', SINGLE, []],
    ['entries', SINGLE, []],
    ['syntax', SINGLE, []],
    ['references', SINGLE, []],
    [
      'contract',
      SINGLE,
      [escape(ref('zoo/Zoo.java', 'Zoo.teach'), ref('zoo/Animal.java', 'Animal.noises'))],
    ],
  ])('reports exactly these findings for the %s fixture', (name, modules, expected) => {
    const findings = designFindings({
      projectRoot: fixtureRoot(name),
      listModules: () => modules,
      policy: {},
    });

    expect(
      findings.map(({ rule, identity, classification }) => [rule, identity, classification]),
    ).toEqual(expected);
  });

  it('reports a protocols contract breach under protocol-contract, at the open of each unclosed session it does not return and at a step before the open on the same path', () => {
    const protocols = [
      {
        type: 'Session',
        open: ['begin'],
        close: ['commit', 'rollback', 'close'],
        steps: ['write'],
      },
    ];

    const findings = designFindings({
      projectRoot: fixtureRoot('lifecycle'),
      listModules: () => SINGLE,
      policy: { protocols },
    });

    expect(
      findings.map(({ rule, identity, classification, location }) => [
        rule,
        identity,
        classification,
        location.line,
      ]),
    ).toEqual(
      [
        ['Client.chosen', 'unclosed:begin', 135],
        ['Client.deferred', 'unclosed:begin', 47],
        ['Client.leaked', 'unclosed:begin', 32],
        ['Client.premature', 'early:write', 123],
        ['Client.siblings', 'unclosed:begin', 96],
      ].map(([member, violation, line]) => [
        'protocol-contract',
        `${ref('life/Client.java', member)}|session|${violation}`,
        'enforceable',
        line,
      ]),
    );
  });

  it.each(['Pool', 'AbstractRes'])(
    'matches a contract on %s through the supertypes and accepts the inherited close of a resource',
    (type) => {
      const findings = designFindings({
        projectRoot: fixtureRoot('hierarchy'),
        listModules: () => SINGLE,
        policy: { protocols: [{ type, open: ['acquire'], close: ['close'] }] },
      });

      expect(
        findings.map(({ rule, identity, location }) => [rule, identity, location.line]),
      ).toEqual([
        [
          'protocol-contract',
          `${ref('kin/call/Users.java', 'Users.leaked')}|pool|unclosed:acquire`,
          14,
        ],
      ]);
    },
  );
});
