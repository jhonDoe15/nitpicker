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
    ]);
    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('hardcoded-secret, credential-shape and secret-in-log', () => {
  it('flags a secret-looking string assigned to a secret-named target', () => {
    const [actual, expected] = outcomes([
      ['a variable', 'API_TOKEN = "a1b2c3d4e5f6"\n', ['hardcoded-secret:1 API_TOKEN']],
      ['an attribute', 'self.password = "hunter2hunter2"\n', ['hardcoded-secret:1 password']],
      [
        'a parameter default',
        'def connect(secret="s3cretPassw0rd"):\n    return secret\n',
        ['hardcoded-secret:1 secret'],
      ],
      [
        'a keyword argument',
        'client = Client(api_key="a1b2c3d4e5f6")\n',
        ['hardcoded-secret:1 api_key'],
      ],
      [
        'a dictionary entry',
        'CONFIG = {"password": "a1b2c3d4e5f6"}\n',
        ['hardcoded-secret:1 password'],
      ],
      [
        'a fallback of an environment read',
        inFile('main.py', 'import os\n\nTOKEN = os.getenv("TOKEN", "a1b2c3d4e5f6")\n'),
        ['hardcoded-secret:3 TOKEN'],
      ],
      ['a key that signs', 'HMAC_KEY = "s3cr3t-hmac-2024"\n', ['hardcoded-secret:1 HMAC_KEY']],
      [
        'a name with a value suffix',
        'DB_PASSWORD_VALUE = "Pa55word2024"\n',
        ['hardcoded-secret:1 DB_PASSWORD_VALUE'],
      ],
      [
        'a passphrase of letters',
        'ADMIN_PASSWORD = "CorrectHorseBatteryStaple"\n',
        ['hardcoded-secret:1 ADMIN_PASSWORD'],
      ],
      [
        'a value built from parts',
        'SERVICE_TOKEN = "prod" + "Abc123Xyz789"\n',
        ['hardcoded-secret:1 SERVICE_TOKEN'],
      ],
      [
        'a dataclass field default',
        'from dataclasses import field\n\n\nclass C:\n    api_token: str = field(default="Abc123Xyz789Qwe")\n',
        ['hardcoded-secret:5 api_token'],
      ],
      [
        'a SecretStr literal',
        inFile(
          'adapters/m.py',
          'from pydantic import SecretStr\n\nX = make(SecretStr("Abc123Xyz789Qwe"))\n',
        ),
        ['hardcoded-secret:3 SecretStr'],
      ],
      ['a key that is no secret', 'SORT_KEY = "created_at_desc"\nCACHE_KEY = "orders-list"\n', []],
      ['an environment variable name', 'TOKEN = "MY_API_TOKEN"\n', []],
      ['a placeholder', 'TOKEN = "changeme"\nPASSWORD = "<password>"\nSECRET = "xxxxxxxx"\n', []],
      ['a plain word', 'PASSWORD = "password"\nTOKEN = "token"\n', []],
      ['a header name', 'TOKEN_HEADER = "X-Auth-Token"\nTOKEN = "auth_token"\n', []],
      ['a name that is no secret', 'LABEL = "a1b2c3d4e5f6"\n', []],
      ['a url', 'TOKEN_URL = "https://example.com/oauth/token"\n', []],
      ['a test file', inFile('tests/test_a.py', 'TOKEN = "a1b2c3d4e5f6"\n'), []],
    ]);
    expect(actual).toEqual(expected);
  });

  it('flags credential shapes anywhere', () => {
    const [actual, expected] = outcomes([
      [
        'a url with a password',
        'URL = "postgres://app:Pa55w0rdX9@db.internal/orders"\n',
        ['credential-shape:1 credential'],
      ],
      [
        'a password query parameter',
        'URL = "https://x.test/?password=Pa55w0rdX9"\n',
        ['credential-shape:1 credential'],
      ],
      [
        'a bearer header',
        'HEADER = "Bearer eyJhbGciOi.abc123"\n',
        ['credential-shape:1 credential'],
      ],
      ['a url without a password', 'URL = "postgres://app@db.internal/orders"\n', []],
      ['a url with a placeholder', 'URL = "postgres://app:changeme@db.internal/orders"\n', []],
      [
        'a url with an environment placeholder',
        'URL = "postgres://app:${DB_PASSWORD}@db/orders"\n',
        [],
      ],
      [
        'a test file',
        inFile('tests/test_a.py', 'URL = "postgres://app:Pa55w0rdX9@db/orders"\n'),
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('flags a secret passed to a log call', () => {
    const [actual, expected] = outcomes([
      [
        'an argument',
        'import logging\n\nlogger = logging.getLogger(__name__)\n\n\ndef f(token):\n    logger.info("using %s", token)\n',
        ['secret-in-log:7 token'],
      ],
      [
        'an f-string',
        'import logging\n\nlogger = logging.getLogger(__name__)\n\n\ndef f(password):\n    logger.debug(f"using {password}")\n',
        ['secret-in-log:7 password'],
      ],
      [
        'an extra',
        'import logging\n\nlogger = logging.getLogger(__name__)\n\n\ndef f(api_key):\n    logger.info("x", extra={"key": api_key})\n',
        ['secret-in-log:7 api_key'],
      ],
      [
        'an attribute',
        'import logging\n\nlogger = logging.getLogger(__name__)\n\n\ndef f(self):\n    logger.info("x %s", self.secret)\n',
        ['secret-in-log:7 secret'],
      ],
      [
        'that it is set',
        'import logging\n\nlogger = logging.getLogger(__name__)\n\n\ndef f(token):\n    logger.info("set: %s", token is not None)\n',
        [],
      ],
      [
        'a flag about the secret',
        'import logging\n\nlogger = logging.getLogger(__name__)\n\n\ndef f(has_token):\n    logger.info("set: %s", has_token)\n',
        [],
      ],
      [
        'a subscripted value',
        'import logging\n\nlogger = logging.getLogger(__name__)\n\n\ndef f(creds):\n    logger.info("creds %s", creds["token"])\n',
        ['secret-in-log:7 token'],
      ],
      [
        'a value wrapped in str',
        'import logging\n\nlogger = logging.getLogger(__name__)\n\n\ndef f(token):\n    logger.info("x %s", str(token))\n',
        ['secret-in-log:7 token'],
      ],
      [
        'a format call',
        'import logging\n\nlogger = logging.getLogger(__name__)\n\n\ndef f(token):\n    logger.info("x {}".format(token))\n',
        ['secret-in-log:7 token'],
      ],
      [
        'a logger with another name',
        'import logging\n\naudit = logging.getLogger("audit")\n\n\ndef f(token):\n    audit.info("x %s", token)\n',
        ['secret-in-log:7 token'],
      ],
      ['a call that is no log', 'def f(token):\n    print_value("x %s", token)\n', []],
    ]);
    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('todo-without-issue', () => {
  it('flags a task marker that names no issue', () => {
    const [actual, expected] = outcomes([
      ['TODO', 'X = 1  # TODO: later\n', ['todo-without-issue:1 TODO: later']],
      ['FIXME', '# FIXME this\nX = 1\n', ['todo-without-issue:1 FIXME this']],
      ['HACK', '# HACK: temporary\nX = 1\n', ['todo-without-issue:1 HACK: temporary']],
      ['XXX', '# XXX: check\nX = 1\n', ['todo-without-issue:1 XXX: check']],
      [
        'TODO with a name',
        '# TODO(alice): later\nX = 1\n',
        ['todo-without-issue:1 TODO(alice): later'],
      ],
      ['TODO(#123)', '# TODO(#123): later\nX = 1\n', []],
      ['TODO(PROJ-123)', '# TODO(PROJ-123): later\nX = 1\n', []],
      ['TODO PROJ-123', '# TODO PROJ-123 later\nX = 1\n', []],
      ['TODO with a link', '# TODO: https://example.com/issues/1\nX = 1\n', []],
      [
        'SHA-256 is no issue',
        '# TODO: SHA-256 later\nX = 1\n',
        ['todo-without-issue:1 TODO: SHA-256 later'],
      ],
      ['prose', '# the todo list is long\nX = 1\n', []],
      [
        'lowercase',
        '# todo: handle refunds\nX = 1\n',
        ['todo-without-issue:1 todo: handle refunds'],
      ],
      [
        'capitalized',
        '# Todo handle refunds\nX = 1\n',
        ['todo-without-issue:1 Todo handle refunds'],
      ],
      [
        'trailing',
        '# handle refunds later TODO\nX = 1\n',
        ['todo-without-issue:1 handle refunds later TODO'],
      ],
      [
        'issue zero',
        '# TODO(#0): handle refunds\nX = 1\n',
        ['todo-without-issue:1 TODO(#0): handle refunds'],
      ],
      [
        'a docstring',
        'def f():\n    """TODO: implement this properly."""\n    return 1\n',
        ['todo-without-issue:2 TODO: implement this properly.'],
      ],
      [
        'a NotImplementedError message',
        'def f():\n    raise NotImplementedError("TODO")\n',
        ['todo-without-issue:2 TODO'],
      ],
      ['a word that contains it', '# AUTODOC: later\nX = 1\n', []],
      ['a marker inside a string', 'X = "TODO: later"\n', []],
    ]);
    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('deeply nested expressions', () => {
  it('checks a string built from a thousand concatenated parts without running out of stack', () => {
    const parts = Array.from({ length: 1000 }, (_, index) => `"p${String(index)}"`).join(' + ');
    const [actual, expected] = outcomes([
      [
        'a long concatenation',
        `class Query:\n    def text(self) -> str:\n        return ${parts}\n`,
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
