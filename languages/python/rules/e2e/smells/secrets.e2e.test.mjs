import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts();
afterEach(cleanup);

const inFile = (file, code) => ({ file, code });

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
      [
        'an entry assigned by key',
        'config["api_key"] = "a1b2c3d4e5f6"\n',
        ['hardcoded-secret:1 api_key'],
      ],
      [
        'an environment entry assigned by key',
        inFile('main.py', 'import os\n\nos.environ["DB_PASSWORD"] = "Hunter22xyz"\n'),
        ['hardcoded-secret:3 DB_PASSWORD'],
      ],
      ['a bytes literal', 'SECRET = b"s3cr3t-key-9"\n', ['hardcoded-secret:1 SECRET']],
      ['an encoded literal', 'TOKEN = "abc12345xy".encode()\n', ['hardcoded-secret:1 TOKEN']],
      [
        'a default of an environment reader that names the secret',
        'API_URL = env.str("SERVICE_TOKEN", default="a1b2c3d4e5f6")\n',
        ['hardcoded-secret:1 SERVICE_TOKEN'],
      ],
      [
        'a setdefault',
        inFile('main.py', 'import os\n\nos.environ.setdefault("API_KEY", "a1b2c3d4e5f6")\n'),
        ['hardcoded-secret:3 API_KEY'],
      ],
      ['an empty default', inFile('main.py', 'import os\n\nTOKEN = os.getenv("TOKEN", "")\n'), []],
      [
        'a read that names the secret',
        inFile('main.py', 'import os\n\nPASSWORD = os.environ["DB_PASSWORD"]\n'),
        [],
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
      ['a print', 'def f(token):\n    print("using", token)\n', ['secret-in-log:2 token']],
      [
        'a write to stderr',
        'import sys\n\n\ndef f(token):\n    sys.stderr.write(f"token={token}")\n',
        ['secret-in-log:5 token'],
      ],
      [
        'a keyword argument named for the secret',
        'import logging\n\nlogger = logging.getLogger(__name__)\n\n\ndef f(pw):\n    logger.info("login", password=pw)\n',
        ['secret-in-log:7 password'],
      ],
      [
        'a percent format',
        'import logging\n\nlogger = logging.getLogger(__name__)\n\n\ndef f(token):\n    logger.info("token=%s" % token)\n',
        ['secret-in-log:7 token'],
      ],
      ['a print of a length', 'def f(token):\n    print(len(token))\n', []],
      ['a call that is no log', 'def f(token):\n    print_value("x %s", token)\n', []],
    ]);
    expect(actual).toEqual(expected);
  });
});
