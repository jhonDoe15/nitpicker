import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes, findingsOf } = createScripts();
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

describe.skipIf(!enabled)('io-in-loop', () => {
  const loop = (call, head = 'import requests\n') =>
    `${head}\n\ndef f(items):\n    for item in items:\n        ${call}\n`;

  it('flags a database, HTTP or file call once per item', () => {
    const [actual, expected] = outcomes([
      ['requests.get', loop('requests.get(item)'), ['io-in-loop:6 requests.get()']],
      ['a repository', loop('repo.find_by_id(item)', ''), ['io-in-loop:5 repo.find_by_id()']],
      [
        'a session execute',
        loop('session.execute(statement, item)', ''),
        ['io-in-loop:5 session.execute()'],
      ],
      [
        'a comprehension',
        'import requests\n\n\ndef f(items):\n    return [requests.get(i) for i in items]\n',
        ['io-in-loop:5 requests.get()'],
      ],
      [
        'a while loop',
        'import requests\n\n\ndef f(items):\n    while items:\n        requests.get(items.pop())\n',
        ['io-in-loop:6 requests.get()'],
      ],
      [
        'asyncio.gather over a comprehension',
        'import asyncio\n\n\nasync def f(items, client):\n    return await asyncio.gather(*[client.fetch(i) for i in items])\n',
        [],
      ],
      [
        'the iterable of the first loop',
        'import requests\n\n\ndef f(url):\n    for item in requests.get(url).json():\n        print(item)\n',
        [],
      ],
      [
        'a call outside a loop',
        'import requests\n\n\ndef f(url):\n    return requests.get(url)\n',
        [],
      ],
      [
        'a call in a function defined in the loop',
        'import requests\n\n\ndef f(items):\n    for item in items:\n        def g():\n            return requests.get(item)\n',
        [],
      ],
      [
        'a retry loop',
        'import requests\n\n\ndef f(url):\n    for attempt in range(3):\n        try:\n            return requests.get(url)\n        except OSError as error:\n            last = error\n    raise last\n',
        [],
      ],
      [
        'a paging loop',
        'def f(repo):\n    cursor = ""\n    while cursor is not None:\n        page = repo.find_page(cursor)\n        cursor = page.next\n',
        [],
      ],
      ['a test file', inFile('tests/test_a.py', loop('repo.find_by_id(item)', '')), []],
    ]);
    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('io-in-loop through wrappers', () => {
  it('follows project helpers, methods, sessions, partials and map', () => {
    const files = {
      'src/shop/orders.py':
        'import requests\n\n\ndef fetch_order(ident):\n    return requests.get(f"https://x/{ident}", timeout=5)\n',
      'src/shop/loops.py':
        'import functools\nimport requests\n\nfrom shop.orders import fetch_order\n\nget = functools.partial(requests.get, timeout=5)\n\n\nclass Store:\n    def load(self, ident):\n        return requests.get(ident, timeout=5)\n\n\nclass Sync:\n    def __init__(self, store):\n        self._store = store\n\n    def via_attribute(self, ids):\n        return [self._store.load(i) for i in ids]\n\n    def via_method(self, ids):\n        return [self.load_one(i) for i in ids]\n\n    def load_one(self, ident):\n        return self._store.load(ident)\n\n\ndef via_helper(ids):\n    return [fetch_order(i) for i in ids]\n\n\ndef via_partial(urls):\n    return [get(u) for u in urls]\n\n\ndef via_map(urls):\n    return list(map(requests.get, urls))\n\n\ndef via_session(urls):\n    with requests.Session() as s:\n        return [s.get(u, timeout=5) for u in urls]\n',
    };

    expect(findingsOf(files, { sourceRoots: ['src'] })).toEqual([
      'io-in-loop src/shop/loops.py:19 self._store.load()',
      'io-in-loop src/shop/loops.py:22 self.load_one()',
      'io-in-loop src/shop/loops.py:29 fetch_order()',
      'io-in-loop src/shop/loops.py:33 get()',
      'io-in-loop src/shop/loops.py:37 requests.get()',
      'io-in-loop src/shop/loops.py:42 s.get()',
    ]);
  });

  it('counts paging only when the tested name comes from the input and output call', () => {
    const [actual, expected] = outcomes([
      [
        'a loop that shrinks a list',
        'import requests\n\n\ndef f(ids):\n    remaining = ids\n    while remaining:\n        requests.post("https://x", json=remaining[0])\n        remaining = remaining[1:]\n',
        ['io-in-loop:7 requests.post()'],
      ],
      [
        'a cursor read from the response',
        'import requests\n\n\ndef f(url):\n    cursor = None\n    while True:\n        page = requests.get(url, params={"c": cursor})\n        cursor = page.json()["next"]\n        if not cursor:\n            break\n',
        [],
      ],
      [
        'distinct statements',
        'def migrate(cursor, statements):\n    for statement in statements:\n        cursor.execute(statement)\n',
        [],
      ],
      [
        'a statement with parameters for each item',
        'def load(cursor, ids):\n    for ident in ids:\n        cursor.execute("select 1 where id = ?", (ident,))\n',
        ['io-in-loop:3 cursor.execute()'],
      ],
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
        'def f():\n    \"\"\"TODO: implement this properly.\"\"\"\n    return 1\n',
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
