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
      [
        'foreign-state-decision',
        'shop/billing.py',
        'shop/model.py#Account|balance,tier',
        DESCRIPTIVE,
      ],
      [
        'repeated-policy-decision',
        'shop/billing.py',
        'shop/model.py#Status|OPEN,PAID',
        DESCRIPTIVE,
      ],
      ['disjoint-consumer-groups', 'shop/model.py', 'shop/model.py#Catalog', DESCRIPTIVE],
    ]);
  });

  it('fails each caller that mutates a private field through a returned value', () => {
    expect(findingRows('mutation')).toEqual(
      [
        ['aliased', 'lines', 'extend'],
        ['attribute_assignment', 'lines', 'assign'],
        ['awaited', 'fetch', 'append'],
        ['direct', 'lines', 'append'],
        ['first_change_wins', 'lines', 'sort'],
        ['property_mutation', 'view', 'append'],
        ['subscript_assignment', 'index', 'assign'],
      ].map(([caller, member, change]) => [
        'mutable-state-escape',
        'client.py',
        `client.py#${caller}>inventory.py#Inventory.${member}:${change}`,
        'enforceable',
      ]),
    );
  });

  it('fails a protocol opened without a close that always runs, and passes with blocks', () => {
    expect(findingRows('lifecycle', { protocols: [PROTOCOL] })).toEqual(
      ['manual', 'not_cleanup'].map((caller) => [
        'caller-protocol',
        'db/usage.py',
        `db/usage.py#${caller}|session|unclosed:begin`,
        'enforceable',
      ]),
    );
  });
});
