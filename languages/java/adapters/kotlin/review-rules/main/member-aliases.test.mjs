import { expect, it } from 'vitest';
import { memberAliasFindings } from './member-aliases.mjs';
import { file, fn, klass, parameter, argument } from '../test-support/facts.mjs';
import { compareFindings } from '../../../../../../core/diff/comparison/compare.mjs';

const p = parameter('value', 'Int');
const target = fn('target', { owner: 'Owner', parameters: [p], returnType: 'Int' });
const alias = fn('alias', {
  owner: 'Owner',
  parameters: [p],
  returnType: 'Int',
  forward: {
    name: 'target',
    qualifier: 'this',
    typeArguments: false,
    arguments: [argument('value')],
  },
});

function findings(overrides = {}, targetOverrides = {}, ownerOverrides = {}) {
  return memberAliasFindings([
    file({
      classes: [klass('Owner', ownerOverrides)],
      functions: [
        { ...alias, ...overrides },
        { ...target, ...targetOverrides },
      ],
    }),
  ]);
}

it('reports explicit and implicit same-class targets, including inferred expression returns', () => {
  expect(findings().map(({ symbol, rule }) => [symbol, rule])).toEqual([
    ['Owner.alias', 'ForwardingMethodAlias'],
  ]);
  expect(findings({ forward: { ...alias.forward, qualifier: undefined } }).length).toBe(1);
  expect(findings({ returnType: undefined, expressionBody: true }).length).toBe(1);
});

it.each([
  [{ modifiers: ['override'] }, {}, {}],
  [{ annotations: ['Deprecated'] }, {}, {}],
  [{ returnType: 'Long' }, {}, {}],
  [{ returnType: undefined }, {}, {}],
  [{ context: true }, {}, {}],
  [{}, { modifiers: ['suspend'] }, {}],
  [{}, { returnType: undefined }, {}],
  [{}, { parameters: [parameter('value', 'Long')] }, {}],
  [{ parameters: [parameter('value', 'Int', { default: true })] }, {}, {}],
  [{ name: 'of' }, {}, {}],
  [{}, {}, { supers: ['Contract'] }],
  [{}, {}, { annotations: ['Service'] }],
  [{}, {}, { open: true }],
  [{ forward: { ...alias.forward, qualifier: 'other' } }, {}, {}],
])('preserves contracts and uncertain dispatch: %j', (own, other, owner) => {
  expect(findings(own, other, owner)).toEqual([]);
});

it('keeps identities when lines move and ignores test sources', () => {
  const baseFindings = findings();
  const headFindings = findings({ line: 20 });
  expect(compareFindings({ baseFindings, headFindings }).newFindings).toEqual([]);
  expect(
    memberAliasFindings([
      file({ test: true, functions: [alias, target], classes: [klass('Owner')] }),
    ]),
  ).toEqual([]);
});
