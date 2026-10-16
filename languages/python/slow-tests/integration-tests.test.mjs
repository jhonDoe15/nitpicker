import { describe, expect, it } from 'vitest';
import { isIntegrationTest } from './integration-tests.mjs';

const unit = { file: 'tests/test_orders.py', classes: ['TestOrders'], markers: [] };

describe('integration tests by marker, folder, file and class name', () => {
  it('counts a test as integration by what the project already says about it', () => {
    const cases = [
      { ...unit, markers: ['integration'] },
      { ...unit, markers: ['e2e', 'slow'] },
      { ...unit, file: 'tests/integration/test_orders.py' },
      { ...unit, file: 'tests/end_to_end/test_orders.py' },
      { ...unit, file: 'tests/functional_tests/test_orders.py' },
      { ...unit, file: 'tests/test_orders_integration.py' },
      { ...unit, file: 'tests/test_e2e_orders.py' },
      { ...unit, classes: ['TestOrdersIntegration'] },
    ];
    expect(cases.map(isIntegrationTest)).toEqual([true, true, true, true, true, true, true, true]);
  });

  it('keeps every other test a unit test', () => {
    const cases = [
      unit,
      { ...unit, markers: ['parametrize', 'slow'] },
      { ...unit, file: 'tests/test_integrity.py' },
      { ...unit, file: 'tests/unit/test_orders.py', classes: [] },
    ];
    expect(cases.map(isIntegrationTest)).toEqual([false, false, false, false]);
  });
});
