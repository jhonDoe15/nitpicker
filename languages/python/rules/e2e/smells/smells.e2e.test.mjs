import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts();
afterEach(cleanup);

const inFile = (file, code) => ({ file, code });
const repeat = (literal, times = 3) =>
  Array.from({ length: times }, (_, index) => `A${String(index)} = ${literal}\n`).join('');

describe.skipIf(!enabled)('repeated-string-literal', () => {
  it('flags each use of a string of five characters or more after the second', () => {
    const [actual, expected] = outcomes([
      ['three uses', repeat('"pending"'), ['repeated-string-literal:3 pending']],
      [
        'four uses',
        repeat('"pending"', 4),
        ['repeated-string-literal:3 pending', 'repeated-string-literal:4 pending'],
      ],
      [
        'uses in calls and comparisons',
        'def f(x):\n    if x == "pending":\n        return g("pending")\n    return h("pending")\n',
        ['repeated-string-literal:4 pending'],
      ],
      [
        'a long literal is shortened',
        repeat('"a-very-long-literal-that-keeps-going-on-and-on"'),
        ['repeated-string-literal:3 a-very-long-literal-that-keeps...'],
      ],
      ['two uses', repeat('"pending"', 2), []],
      ['a short literal', repeat('"ok"'), []],
      ['a literal without letters or digits', repeat('"-----"'), []],
      ['f-string parts', 'A = f"pending {x}"\nB = f"pending {y}"\nC = f"pending {z}"\n', []],
      [
        'annotations',
        'from typing import Literal\n\n\ndef f(a: Literal["pending"], b: Literal["pending"], c: "pending") -> None:\n    pass\n',
        [],
      ],
      ['dictionary keys', 'A = {"pending": 1}\nB = {"pending": 2}\nC = {"pending": 3}\n', []],
      [
        'docstrings and bare strings',
        'def a():\n    "pending"\n\n\ndef b():\n    "pending"\n\n\ndef c():\n    "pending"\n',
        [],
      ],
      [
        'subscripts with a literal key',
        'def f(a, b, c):\n    return a["pending"], b["pending"], c["pending"]\n',
        [],
      ],
      ['keyword argument values', 'f(mode="pending")\ng(mode="pending")\nh(mode="pending")\n', []],
      [
        'encodings, mime types, time formats and actions',
        'A = f(x, "utf-8")\nB = f(y, "utf-8")\nC = f(z, "utf-8")\nD = g("application/json")\nE = g("application/json")\nF = g("application/json")\nH = h("%Y-%m-%d")\nI = h("%Y-%m-%d")\nJ = h("%Y-%m-%d")\nK = a("store_true")\nL = a("store_true")\nM = a("store_true")\n',
        [],
      ],
      [
        'names listed in __all__ and in a class body',
        '__all__ = ["pending", "shipped"]\nA = f(__all__, "pending")\n\n\nclass Admin:\n    list_display = ["pending", "shipped"]\n    search = ("pending",)\n',
        [],
      ],
      [
        'a Django migration',
        'from django.db import migrations\n\n\nclass Migration(migrations.Migration):\n    operations = [f("pending"), g("pending"), h("pending")]\n',
        [],
      ],
      [
        'an Alembic revision',
        'revision = "abc"\nA = f("pending")\nB = g("pending")\nC = h("pending")\n',
        [],
      ],
      ['translation calls', 'A = _("pending")\nB = _("pending")\nC = gettext("pending")\n', []],
      [
        'the translation calls of the other presets',
        'A = translate("pending")\nB = formatMessage("pending")\nC = getMessage("pending", x)\n',
        [],
      ],
      [
        'a translation call only for its first argument',
        'A = t("a", "pending")\nB = t("b", "pending")\nC = t("c", "pending")\n',
        ['repeated-string-literal:3 pending'],
      ],
      [
        'discriminant values',
        'A = {"type": "order-placed"}\nB = {"type": "order-placed"}\nC = {"kind": "order-placed"}\n',
        [],
      ],
      [
        'discriminant comparisons',
        'def f(n):\n    return n.type == "order-placed" or n.kind != "order-placed" or "order-placed" == n["tag"]\n',
        [],
      ],
      [
        'comparisons with other attributes',
        'def f(n):\n    return n.state == "order-placed" or n.name == "order-placed" or n.mode == "order-placed"\n',
        ['repeated-string-literal:2 order-placed'],
      ],
      [
        'other dictionary values',
        'A = {"state": "order-placed"}\nB = {"state": "order-placed"}\nC = {"state": "order-placed"}\n',
        ['repeated-string-literal:3 order-placed'],
      ],
      ['a test file', inFile('tests/test_a.py', repeat('"pending"')), []],
    ]);
    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('generic-name', () => {
  it('flags files, folders and classes named for what they are, not for their job', () => {
    const [actual, expected] = outcomes([
      ['utils.py', inFile('utils.py', 'X = 1\n'), ['generic-name:1 utils']],
      ['string_utils.py', inFile('string_utils.py', 'X = 1\n'), ['generic-name:1 string_utils']],
      ['helpers.py', inFile('pkg/helpers.py', 'X = 1\n'), ['generic-name:1 helpers']],
      ['common.py', inFile('common.py', 'X = 1\n'), ['generic-name:1 common']],
      ['a util folder', inFile('util/dates.py', 'X = 1\n'), ['generic-name:1 util/']],
      [
        'a class',
        inFile('orders.py', 'class OrderManager:\n    pass\n'),
        ['generic-name:1 OrderManager'],
      ],
      [
        'a class with a generic name',
        inFile('orders.py', 'class Helper:\n    pass\n'),
        ['generic-name:1 Helper'],
      ],
      ['a specific file', inFile('price_rounding.py', 'X = 1\n'), []],
      ['a specific class', inFile('orders.py', 'class OrderRepository:\n    pass\n'), []],
      ['a word inside a name', inFile('commonality.py', 'X = 1\n'), []],
      ['a version suffix', inFile('helpers_v2.py', 'X = 1\n'), ['generic-name:1 helpers_v2']],
      ['a digit suffix', inFile('order_utils2/a.py', 'X = 1\n'), ['generic-name:1 order_utils2/']],
      [
        'a generic word before a noun',
        inFile('util_functions.py', 'X = 1\n'),
        ['generic-name:1 util_functions'],
      ],
      [
        'a mixin',
        inFile('orders.py', 'class OrderHelperMixin:\n    pass\n'),
        ['generic-name:1 OrderHelperMixin'],
      ],
      [
        'a mixin of another mixin',
        inFile('views.py', 'class OrderHelperMixin(LoginRequiredMixin):\n    pass\n'),
        ['generic-name:1 OrderHelperMixin'],
      ],
      [
        'a generic base class',
        inFile('bases.py', 'class HelperBase:\n    pass\n'),
        ['generic-name:1 HelperBase'],
      ],
      [
        'mixins and bases named for their job',
        inFile(
          'models.py',
          'class LoggingMixin:\n    pass\n\n\nclass TimestampMixin:\n    pass\n\n\nclass ModelBase:\n    pass\n',
        ),
        [],
      ],
      ['a container word alone', inFile('module.py', 'X = 1\n'), []],
      [
        'a nested class',
        inFile('orders.py', 'class Order:\n    class InnerManager:\n        pass\n'),
        ['generic-name:2 InnerManager'],
      ],
      ['context managers are a language term', inFile('context_managers.py', 'X = 1\n'), []],
      [
        'a Django managers module',
        inFile(
          'managers.py',
          'from django.db import models\n\n\nclass OrderManager(models.Manager):\n    pass\n',
        ),
        [],
      ],
      [
        'a subclass of a framework type with the same ending',
        inFile('caches.py', 'class SessionManager(CacheManager):\n    pass\n'),
        [],
      ],
      ['a test helper', inFile('tests/helpers.py', 'X = 1\n'), []],
      [
        'a plural managers module',
        inFile('order_managers.py', 'X = 1\n'),
        ['generic-name:1 order_managers'],
      ],
      [
        'a miscellaneous module',
        inFile('miscellaneous.py', 'X = 1\n'),
        ['generic-name:1 miscellaneous'],
      ],
      ['a common word before a noun', inFile('common_prefix.py', 'X = 1\n'), []],
      [
        'a function named for its job',
        inFile('orders.py', 'def get_common_ancestor():\n    pass\n'),
        [],
      ],
      [
        'a generic word before a container noun',
        inFile('helper_module.py', 'X = 1\n'),
        ['generic-name:1 helper_module'],
      ],
      ['a lock manager', inFile('locks.py', 'class ModuleLockManager:\n    pass\n'), []],
      [
        'a plural framework role',
        inFile('sessions.py', 'class TransactionManagers:\n    pass\n'),
        [],
      ],
      ['a session manager', inFile('sessions.py', 'class SessionManager:\n    pass\n'), []],
      [
        'an order manager',
        inFile('orders.py', 'class OrderManager:\n    pass\n'),
        ['generic-name:1 OrderManager'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
