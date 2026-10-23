import { afterEach, describe, expect, it } from 'vitest';
import { SECRET_VALUE_CASES } from '../../../../../shared/naming/test-support/secret-value-cases.mjs';
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

  it('flags the other ways a secret gets its value', () => {
    const [actual, expected] = outcomes([
      [
        'a walrus',
        'if (password := "hunter2hunter2"):\n    pass\n',
        ['hardcoded-secret:1 password'],
      ],
      [
        'an unpacked tuple',
        'user, password = "admin", "hunter2hunter2"\n',
        ['hardcoded-secret:1 password'],
      ],
      [
        'a setattr',
        'setattr(cfg, "password", "hunter2hunter2")\n',
        ['hardcoded-secret:1 password'],
      ],
      ['a method on the literal', 'TOKEN = "a1b2c3d4e5".strip()\n', ['hardcoded-secret:1 TOKEN']],
      ['a literal and an operand', 'TOKEN = "a1b2c3d4e5" + suffix\n', ['hardcoded-secret:1 TOKEN']],
      [
        'a function that returns it',
        'def token():\n    return "a1b2c3d4e5"\n',
        ['hardcoded-secret:2 token'],
      ],
      [
        'a property',
        'class C:\n    @property\n    def api_key(self):\n        return "a1b2c3d4e5"\n',
        ['hardcoded-secret:4 api_key'],
      ],
      [
        'an option default',
        'parser.add_argument("--secret", default="dev-s3cret-1")\n',
        ['hardcoded-secret:1 secret'],
      ],
      [
        'a default of an environment get',
        inFile('main.py', 'import os\n\nTOKEN = os.environ.get("T", "a1b2c3d4e5")\n'),
        ['hardcoded-secret:3 TOKEN'],
      ],
      [
        'a SecretBytes literal',
        inFile(
          'adapters/m.py',
          'from pydantic import SecretBytes\n\nX = make(SecretBytes(b"Abc123Xyz789Qwe"))\n',
        ),
        ['hardcoded-secret:3 SecretBytes'],
      ],
      [
        'a Django development key',
        'SECRET_KEY = "django-insecure-abcdef"\n',
        ['credential-shape:1 credential'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('passes values that are not secrets', () => {
    const [actual, expected] = outcomes([
      [
        'enum members',
        'import enum\n\n\nclass Kind(enum.Enum):\n    PASSWORD = "pass-word1"\n    TOKEN = "tok_v21"\n',
        [],
      ],
      [
        'calls that do not read settings',
        'p = os.path.join("credentials", "sa-01.json")\nv = cfg.get("credentials", "region_us1")\nk = headers.get("X-Api-Key", "anon-123")\ns = s.replace("password", "pass_word1")\n',
        [],
      ],
      ['a positional option argument', 'parser.add_argument("password", "foo123bar")\n', []],
      [
        'placeholders',
        'TOKEN = "%(token)s"\nPASSWORD = "{{secrets.DB_PASSWORD}}"\nMASKED_TOKEN = "****1234"\nNIL_TOKEN = "00000000-0000-0000-0000-000000000000"\n',
        [],
      ],
      [
        'paths and message keys',
        'DB_SECRET = "prod/db-creds-v2"\nVAULT_SECRET = "secret/data/app1"\nCREDENTIALS = "/etc/app/creds.json"\nTOKEN = "errors.token.expired_v2"\n',
        [],
      ],
      [
        'single words',
        'PASSWORD = "Elephantine"\nTOKEN = "Authorization"\nLABELS = {"password": "Passwort"}\n',
        [],
      ],
      ['a pattern', 'PASSWORD = r"^(?=.*\\d).{8,}$"\n', []],
    ]);
    expect(actual).toEqual(expected);
  });

  it('reads values with the rules every preset shares', () => {
    const verdicts = {
      secret: (name) => [`hardcoded-secret:1 ${name}`],
      credential: () => ['credential-shape:1 credential'],
      none: () => [],
    };
    const [actual, expected] = outcomes(
      SECRET_VALUE_CASES.map(([name, value, verdict]) => [
        `${name} = ${value}`,
        `${name} = ${JSON.stringify(value)}\n`,
        verdicts[verdict](name),
      ]),
    );
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
      [
        'a pretty print',
        'import pprint\n\n\ndef f(credentials):\n    pprint.pprint(credentials)\n',
        ['secret-in-log:5 credentials'],
      ],
      [
        'a click echo',
        'import click\n\n\ndef f(token):\n    click.echo(token)\n',
        ['secret-in-log:5 token'],
      ],
      [
        'a warning',
        'import warnings\n\n\ndef f(token):\n    warnings.warn(f"bad {token}")\n',
        ['secret-in-log:5 token'],
      ],
      [
        'an exception message',
        'def f(token):\n    raise ValueError(f"bad token {token}")\n',
        ['secret-in-log:2 token'],
      ],
      [
        'an environment read',
        inFile(
          'main.py',
          'import logging\nimport os\n\nlogging.info("t %s", os.getenv("API_TOKEN"))\n',
        ),
        ['secret-in-log:4 API_TOKEN'],
      ],
      [
        'an environment entry',
        inFile('main.py', 'import os\n\nprint(os.environ["API_TOKEN"])\n'),
        ['secret-in-log:3 API_TOKEN'],
      ],
      [
        'marker tokens of a tokenizer',
        'def f(tokenizer, vocab):\n    print(tokenizer.token, vocab.eos_token, vocab.pad_token)\n',
        [],
      ],
      [
        'a key whose value is a status',
        'import structlog\n\nlog = structlog.get_logger()\n\n\ndef f(self):\n    log.info("x", token=self.has_token)\n',
        [],
      ],
      ['an exception without the secret', 'def f():\n    raise ValueError("token missing")\n', []],
    ]);
    expect(actual).toEqual(expected);
  });
});
