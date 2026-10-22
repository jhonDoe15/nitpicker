import { describe, expect, it } from 'vitest';
import { exceptionHint } from '../exceptions.mjs';
import {
  exception,
  factFixture,
  findingsOf,
  fixtureFindings,
  rows,
} from '../facts/test-support/fact-fixtures.mjs';
import { featureRoles } from './shared-usage.mjs';

const RULE = 'shared-used-by-one-feature';
const SHARED = 'src/main/java/com/acme/shared';

describe('shared-used-by-one-feature over facts', () => {
  it('reports a shared module one feature reaches, through other shared modules', () => {
    expect(rows(fixtureFindings('features', [RULE]))).toEqual([
      [RULE, `${SHARED}/Ids.java`, RULE],
      [RULE, `${SHARED}/InvoiceNumbers.java`, RULE],
    ]);
  });

  it('names the feature folder to move it into, and ignores test imports', () => {
    const [finding] = fixtureFindings('features', [RULE]);

    expect(finding.message).toBe(
      `${SHARED}/Ids.java is used only by feature billing. Move it into src/main/java/com/acme/features/billing/. ${exceptionHint(RULE, `${SHARED}/Ids.java`)}`,
    );
  });

  it('reads the shared and feature folders from layout', () => {
    const facts = factFixture('features');
    const policy = { layout: { sharedRoots: ['**/acme/common'], featureRoots: ['**/features'] } };

    expect(findingsOf(facts, [RULE], { policy })).toEqual([]);
  });

  it('stays silent with no feature folder', () => {
    const policy = { layout: { featureRoots: [] } };

    expect(fixtureFindings('features', [RULE], { policy })).toEqual([]);
  });

  it('honours an exception', () => {
    const policy = { exceptions: [exception(RULE, `${SHARED}/Ids.java`)] };

    expect(rows(fixtureFindings('features', [RULE], { policy })).map(([, file]) => file)).toEqual([
      `${SHARED}/InvoiceNumbers.java`,
    ]);
  });
});

describe('shared-used-by-one-feature import roles', () => {
  it('leaves out an import from a test module, taking its role from modules', () => {
    const facts = {
      modules: [
        { file: 'src/shared/money.py', role: 'production' },
        { file: 'src/features/billing/invoice.py', role: 'production' },
        { file: 'tests/test_money.py', role: 'test' },
      ],
      imports: [
        { from: 'src/features/billing/invoice.py', to: 'src/shared/money.py', names: [] },
        { from: 'tests/test_money.py', to: 'src/shared/money.py', names: [] },
      ],
    };

    expect(rows(findingsOf(facts, [RULE]))).toEqual([[RULE, 'src/shared/money.py', RULE]]);
  });
});

describe('feature roles', () => {
  const roleOf = featureRoles({ sharedRoots: ['**/shared'], featureRoots: ['app/features'] });

  it.each([
    ['app/shared/money.py', { kind: 'shared' }],
    ['app/features/billing/invoice.py', { kind: 'feature', directory: 'app/features/billing' }],
    ['app/features/readme.py', { kind: 'other' }],
    ['lib/features/billing/invoice.py', { kind: 'other' }],
    ['app/features/billing/shared/tax.py', { kind: 'shared' }],
  ])('%s is %j', (file, role) => {
    expect(roleOf(file)).toEqual(role);
  });
});
