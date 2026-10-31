import { describe, expect, it } from 'vitest';
import { pythonUsable } from '../../metrics/python-helpers.mjs';
import { DESIGN_RULES } from '../../../../shared/project-rules/design/design-rules.mjs';
import { sharedFactFindings } from '../../../../shared/rules/facts/evaluate.mjs';
import { designFacts } from './test-support/design-harness.mjs';

const DESCRIPTIVE = 'descriptive';
const PROTOCOL = {
  type: 'Session',
  open: ['begin'],
  close: ['commit', 'rollback'],
  steps: ['write'],
};

function findingRows(fixture, policy = {}) {
  const findings = sharedFactFindings(designFacts(fixture), {
    language: 'python',
    analyzerName: 'python',
    policy,
    rules: DESIGN_RULES,
  });
  return findings.map(({ rule, path, identity, classification }) => [
    rule,
    path,
    identity,
    classification,
  ]);
}

describe.skipIf(!pythonUsable())('the shared design rules over Python facts', () => {
  it('reports each report-only design signal of a small multi-module project', () => {
    expect(findingRows('rules')).toEqual([
      ['context-threading', 'shop/api.py', 'shop/api.py#submit#ctx', DESCRIPTIVE],
      [
        'forwarding-chain',
        'shop/api.py',
        'shop/api.py#handle>shop/orders.py#process>shop/billing.py#charge',
        DESCRIPTIVE,
      ],
      ['data-clump', 'shop/billing.py', 'city: str, street: str, zip_code: str', DESCRIPTIVE],
      ['disjoint-consumer-groups', 'shop/model.py', 'shop/model.py#Catalog', DESCRIPTIVE],
      [
        'foreign-state-decision',
        'shop/model.py',
        'shop/model.py#Account|balance,tier',
        DESCRIPTIVE,
      ],
      ['repeated-policy-decision', 'shop/model.py', 'shop/model.py#Status|OPEN,PAID', DESCRIPTIVE],
    ]);
  });

  it('fails each caller that mutates a private field through a returned value', () => {
    expect(findingRows('mutation')).toEqual(
      [
        ['aliased', 'Inventory.lines', 'extend'],
        ['attribute_assignment', 'Inventory.lines', 'assign'],
        ['augmented', 'Inventory.lines', '+='],
        ['awaited', 'Inventory.fetch', 'append'],
        ['class_state', 'Registry.known', 'append', 'registry.py'],
        ['defaulted', 'Inventory.lines', 'append'],
        ['direct', 'Inventory.lines', 'append'],
        ['first_change_wins', 'Inventory.lines', 'sort'],
        ['module_state', 'cache', 'append', 'cache.py'],
        ['module_state', 'peek', 'append', 'cache.py'],
        ['property_mutation', 'Inventory.view', 'append'],
        ['subscript_assignment', 'Inventory.index', 'assign'],
        ['walrus', 'Inventory.lines', 'append'],
      ].map(([caller, member, change, file = 'inventory.py']) => [
        'mutable-state-escape',
        'client.py',
        `client.py#${caller}>${file}#${member}:${change}`,
        'enforceable',
      ]),
    );
  });

  it('fails an unclosed protocol and an early step, not a step on the other arm of the open', () => {
    expect(findingRows('lifecycle', { protocols: [PROTOCOL] })).toEqual(
      [
        ['early', 'early:write'],
        ['manual', 'unclosed:begin'],
        ['never_called', 'unclosed:begin'],
        ['not_cleanup', 'unclosed:begin'],
        ['unstacked', 'unclosed:begin'],
      ].map(([caller, violation]) => [
        'protocol-contract',
        'db/usage.py',
        `db/usage.py#${caller}|session|${violation}`,
        'enforceable',
      ]),
    );
  });

  it('applies a contract on a Protocol to a subclass that inherits the open and overrides the close', () => {
    const closer = { type: 'Closer', open: ['open'], close: ['close'] };
    expect(findingRows('hierarchy', { protocols: [closer] })).toEqual([
      [
        'protocol-contract',
        'store/impl.py',
        'store/impl.py#leak|target|unclosed:open',
        'enforceable',
      ],
    ]);
  });
});
