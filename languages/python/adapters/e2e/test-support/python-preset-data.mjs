import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fixture } from './python-e2e-support.mjs';

export const VIOLATION = 'import sys\n\n\ndef f( a,b ):\n    return a+b\n';

export const GREETER_HI = 'def greet(name):\n    return f"Hi, {name}!"\n';

export const GREETER_HI_TEST =
  'from demo.greeter import greet\nfrom demo.legacy import clamp, value\n\n\ndef test_greet():\n    assert greet("Ada") == "Hi, Ada!"\n\n\ndef test_value():\n    assert value() == 1\n\n\ndef test_clamp():\n    assert clamp(3) == 3\n';

export const TYPE_ERROR = 'def double(value: int) -> str:\n    return value * 2\n';

export const ONE_WAY_VIOLATIONS = [
  'import os',
  'from dataclasses import dataclass',
  '',
  '',
  '@dataclass',
  'class Order:',
  '    identifier: str',
  '',
  '',
  'def home() -> str:',
  '    return os.path.join("a", "b")',
  '',
  '',
  'LIMIT: int = 3  # noqa: E501',
  '',
].join('\n');

export const HIDDEN_ERROR =
  'from typing import no_type_check\n\n\n@no_type_check\ndef hidden(value: int) -> str:\n    return value * 2\n';

export const WEAKENED_MYPY = `${readFileSync(path.join(fixture, 'pyproject.toml'), 'utf8')}\n[tool.mypy]\nignore_errors = true\ndisable_error_code = ["return-value"]\nexclude = ["src/demo/typed.py"]\n`;

export const WEAKENED_PYRIGHT = JSON.stringify({
  ignore: ['src/demo/typed.py'],
  exclude: ['src/demo/typed.py'],
  typeCheckingMode: 'off',
});

const CLAMP = 'def clamp(number):\n    return number if number < 10 else 10\n';

export const LEGACY_MOVED = `"""Legacy module."""\n\nimport os\n\n\ndef value():\n    return 1\n\n\n${CLAMP}`;

export const LEGACY_WEAKER = `import os\n\n\ndef value():\n    return 1 + 0\n\n\n${CLAMP}`;

export const PRICING =
  'def discount(price: int) -> int:\n    return price - 5 if price > 100 else price\n';

export const PRICING_WITH_UNUSED = `${PRICING}\n\ndef unused() -> int:\n    return 3\n`;

export const PRICING_TEST =
  'from demo.pricing import discount\n\n\ndef test_discount():\n    assert discount(50) == 50\n';

export const PRICING_FULL_TEST =
  'from demo.pricing import discount\n\n\ndef test_discount():\n    assert discount(50) == 50\n    assert discount(101) == 96\n    assert discount(100) == 100\n';

export const SAME_NAME_SOURCES = {
  'src/demo/account.py':
    'from functools import singledispatch\n\n\nclass Account:\n    def __init__(self):\n        self._balance = 0\n\n    @property\n    def balance(self):\n        return self._balance\n\n    @balance.setter\n    def balance(self, value):\n        self._balance = value\n\n\n@singledispatch\ndef show(value):\n    return str(value)\n\n\n@show.register\ndef _(value: int):\n    return f"int {value}"\n\n\n@show.register\ndef _(value: str):\n    return value\n',
  'tests/test_account.py':
    'from demo.account import Account, show\n\n\ndef test_balance():\n    account = Account()\n    account.balance = 5\n    assert account.balance == 5\n\n\ndef test_show():\n    assert show(1) == "int 1"\n    assert show("a") == "a"\n    assert show(1.5) == "1.5"\n',
};

export const NO_MUTATION = {
  'nitpicker.config.json': '{ "preset": "python", "disable": ["mutation"] }\n',
};

export const ORDER_TOTAL = [
  'def order_total(lines: list[tuple[int, int]], discount: int) -> int:',
  '    total = 0',
  '    for line in lines:',
  '        if line[0] > 0 and line[1] > 0:',
  '            total += line[0] * line[1]',
  '        else:',
  '            total -= discount',
  '    if total < 0 and discount > 0:',
  '        total = 0',
  '    return total',
  '',
].join('\n');

export const LAYERED_FILES = {
  'nitpicker.config.json': '{ "preset": "python", "disable": ["mutation"] }\n',
  '.gitignore': '.venv/\n__pycache__/\n',
  '.importlinter':
    '[importlinter]\nroot_package = shop\n\n[importlinter:contract:pure]\nname = Domain is pure\ntype = forbidden\nsource_modules = shop.domain\nforbidden_modules =\n    shop.web\n    shop.infra\n',
  'src/shop/__init__.py': '',
  'src/shop/domain/__init__.py': '',
  'src/shop/domain/pricing.py': `def price_with_tax(amount: float, rate: float) -> float:\n    return round(amount * (1 + rate), 2)\n\n\n${ORDER_TOTAL}`,
  'src/shop/infra/__init__.py': '',
  'src/shop/infra/store.py':
    'from shop.domain import pricing\n\n\ndef total(amounts: list[float]) -> float:\n    return sum(pricing.price_with_tax(amount, 0.1) for amount in amounts)\n',
  'src/shop/web/__init__.py': '',
  'src/shop/web/views.py':
    'from shop.domain import pricing\nfrom shop.infra import store\n\n\ndef show(amounts: list[float]) -> str:\n    return f"{store.total(amounts)} {pricing.price_with_tax(1, 0)}"\n',
  'tests/test_shop.py':
    'from shop.domain import pricing\nfrom shop.web import views\n\n\ndef test_show():\n    assert views.show([10]) == "11.0 1"\n\n\ndef test_total():\n    assert pricing.order_total([(2, 3), (2, 3)], 0) == 12\n',
};

export const SIGNS = 'def sign(x):\n    if x < 0:\n        return -1\n    return 1\n';

export const BRANCH_CLAMP =
  'def clamp(x: int) -> int:\n    if x > 10:\n        return 10\n    return x\n';

export function signsTest(...assertions) {
  const tests = assertions.map(([name, body]) => `def test_${name}():\n    assert ${body}\n`);
  return `from demo import signs\n\n\n${tests.join('\n\n')}`;
}

export const PRAGMAS = [
  'import sys',
  '',
  '',
  'def hidden(x):  # pragma: no cover',
  '    if x:',
  '        return 1',
  '    return 2',
  '',
  '',
  'if __name__ == "__main__":',
  '    sys.exit(hidden(1))',
  '',
].join('\n');

export const SIGN_POSITIVE = ['sign_positive', 'signs.sign(5) == 1'];

export const SIGN_NEGATIVE = ['sign_negative', 'signs.sign(-5) == -1'];

export const CLAMP_LOW = ['clamp_low', 'signs.clamp(1) == 1'];

export const CLAMP_HIGH = ['clamp_high', 'signs.clamp(50) == 10'];

export const RUNTIME_TEST = [
  'import logging',
  'import time',
  '',
  'from demo.legacy import value',
  '',
  '',
  'def test_value_is_cached():',
  '    logging.getLogger("demo").warning("cache is cold for key %s", 42)',
  '    time.sleep(0.3)',
  '    assert value() == 1',
  '',
].join('\n');

export const NOISY_TEST = [
  'import sys',
  '',
  'from demo.legacy import clamp',
  '',
  '',
  'def test_clamp_limits():',
  '    sys.stderr.write("clamping above the limit\\n")',
  '    assert clamp(30) == 10',
  '',
].join('\n');
