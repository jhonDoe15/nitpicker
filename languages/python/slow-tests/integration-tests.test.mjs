import { describe, expect, it } from 'vitest';
import { isIntegrationTest } from './integration-tests.mjs';

const unit = { file: 'tests/test_orders.py', classes: ['TestOrders'], markers: [] };

describe('integration tests by marker, folder, file and class name', () => {
  it('counts a test as integration by what the project already says about it', () => {
    const cases = [
      { ...unit, markers: ['integration'] },
      { ...unit, markers: ['e2e', 'slow'] },
      { ...unit, file: 'tests/integration/test_orders.py' },
      { ...unit, file: 'src/shop/tests/end_to_end/test_orders.py' },
      { ...unit, file: 'tests/functional_tests/test_orders.py' },
      { ...unit, file: 'tests/test_orders_integration.py' },
      { ...unit, file: 'tests/test_e2e_orders.py' },
      { ...unit, classes: ['TestOrdersIntegration'] },
      { ...unit, classes: ['TestIntegrationOrders'] },
      { ...unit, classes: ['OrdersE2ETests'] },
    ];
    expect(cases.map(isIntegrationTest)).toEqual(cases.map(() => true));
  });

  it('keeps every other test a unit test', () => {
    const cases = [
      unit,
      { ...unit, markers: ['parametrize', 'slow'] },
      { ...unit, file: 'tests/test_integrity.py' },
      { ...unit, file: 'tests/unit/test_orders.py', classes: [] },
      { ...unit, file: 'app/integrations/slack/test_client.py' },
      { ...unit, file: 'app/system/test_clock.py' },
      { ...unit, classes: ['TestIntegerConfig'] },
      { ...unit, classes: ['TestSubIntegrationConfig'] },
    ];
    expect(cases.map(isIntegrationTest)).toEqual(cases.map(() => false));
  });
});
