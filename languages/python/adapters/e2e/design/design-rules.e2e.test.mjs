import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DESIGN_RULES } from '../../../../../shared/project-rules/design/design-rules.mjs';
import {
  commitBranch,
  gate,
  initializeRepository,
  installPackages,
  pythonE2eEnabled,
  removeRepositories,
  repository,
  write,
} from '../test-support/python-e2e-support.mjs';

const CONFIG = JSON.stringify({
  preset: 'python',
  disable: ['mutation'],
  protocols: [{ type: 'Session', open: ['begin'], close: ['close'] }],
});

const BASE_FILES = {
  'nitpicker.config.json': `${CONFIG}\n`,
  '.gitignore': '.venv/\n__pycache__/\n',
  'src/shop/__init__.py': '',
  'src/shop/model.py':
    'from dataclasses import dataclass\n\n\n@dataclass(frozen=True)\nclass Order:\n    total: int\n\n\n@dataclass(frozen=True)\nclass Receipt:\n    total: int\n',
  'src/shop/session.py':
    'class Session:\n    def __init__(self) -> None:\n        self.rows: list[int] = []\n\n    def begin(self) -> None:\n        self.rows.clear()\n\n    def write(self, row: int) -> None:\n        self.rows.append(row)\n\n    def close(self) -> int:\n        return len(self.rows)\n',
  'src/shop/billing.py':
    'from shop.model import Order, Receipt\n\n\ndef charge(order: Order) -> Receipt:\n    return Receipt(order.total * 2)\n',
  'tests/test_billing.py':
    'from shop import billing\nfrom shop.model import Order\n\n\ndef test_charge():\n    assert billing.charge(Order(2)).total == 4\n',
};

const CHAIN_AND_LEAK = {
  'src/shop/orders.py':
    'from shop import billing\nfrom shop.model import Order, Receipt\n\n\ndef process(order: Order) -> Receipt:\n    return billing.charge(order)\n',
  'src/shop/api.py':
    'from shop import orders\nfrom shop.model import Order, Receipt\nfrom shop.session import Session\n\n\ndef handle(order: Order) -> Receipt:\n    return orders.process(order)\n\n\ndef save(session: Session) -> int:\n    session.begin()\n    session.write(1)\n    return session.close()\n',
  'tests/test_api.py':
    'from shop import api\nfrom shop.model import Order\nfrom shop.session import Session\n\n\ndef test_handle():\n    assert api.handle(Order(2)).total == 4\n\n\ndef test_save():\n    assert api.save(Session()) == 1\n',
};

const designFindings = (result) =>
  result
    .json('new-findings.json')
    .filter(({ rule }) => DESIGN_RULES.includes(rule))
    .map(({ tool, rule, path, identity, classification }) => ({
      tool,
      rule,
      path,
      identity,
      classification,
    }));

describe.skipIf(!pythonE2eEnabled)('Python design rules end to end', () => {
  let project;
  beforeAll(() => {
    project = repository();
    write(project, BASE_FILES);
    initializeRepository(project, 'shop base');
    installPackages(project, ['coverage', 'pytest']);
    commitBranch(project, 'chain-and-leak', CHAIN_AND_LEAK);
  });
  afterAll(removeRepositories);
  it('reports a new forwarding chain and fails a protocol opened without a close that always runs', () => {
    const result = gate(project, 'chain-and-leak');

    expect(result.exitCode, result.text).toBe(1);
    expect(designFindings(result)).toEqual([
      {
        tool: 'python',
        rule: 'forwarding-chain',
        path: 'src/shop/api.py',
        identity: 'src/shop/api.py#handle>src/shop/orders.py#process>src/shop/billing.py#charge',
        classification: 'descriptive',
      },
      {
        tool: 'python',
        rule: 'protocol-contract',
        path: 'src/shop/api.py',
        identity: 'src/shop/api.py#save|session|unclosed:begin',
        classification: 'enforceable',
      },
    ]);
  });
});
