import { RULES_TOOL } from '../tool.mjs';

const SQL_ALLOWED =
  'Pass the values as query parameters: `cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))`, `session.execute(text("SELECT * FROM users WHERE id = :id"), {"id": user_id})` in SQLAlchemy, `Model.objects.raw("... WHERE id = %s", [user_id])` in Django. Build placeholder lists from placeholders alone (`", ".join(["%s"] * len(ids))`) and optional filters as `conditions.append("name = %s")` joined with `" AND "`. A table or column name comes from a fixed lookup (`COLUMNS[key]` over a dict of constant names), a `Literal[...]` or `Enum` value, or `psycopg.sql.Identifier(name)`.';

const TLS_ALLOWED =
  'Keep verification on in every environment and trust the certificate authority instead: `requests.get(url, verify="/etc/ssl/private-ca.pem", timeout=10)`, `ssl.create_default_context(cafile=ca_path)`, `tlsCAFile=ca_path` for MongoDB, or `REQUESTS_CA_BUNDLE` and `SSL_CERT_FILE` pointing at the bundle. A server that asks for optional client certificates uses `ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)` with `verify_mode = ssl.CERT_OPTIONAL`.';

const TIMEOUT_ALLOWED =
  'Pass a timeout in seconds: `urllib.request.urlopen(url, timeout=10)`, `session.get(url, timeout=10)`, or set `socket.setdefaulttimeout(10)` once at startup for `urllib`; an `httpx` client keeps its 5 second default unless you pass another number (`httpx.Client(timeout=10)`), never `timeout=None`.';

const LOADING = [
  [
    'torch.',
    'can unpickle arbitrary objects from the file',
    'Load tensors with `torch.load(path, weights_only=True)`, or store them with `safetensors` (`safetensors.torch.load_file(path)`).',
  ],
  [
    'numpy.',
    'unpickles object arrays with `allow_pickle=True`',
    'Load plain arrays with `numpy.load(path)` (the default `allow_pickle=False`), and store objects as JSON.',
  ],
  [
    'ruamel.yaml.YAML',
    'builds arbitrary Python objects from the document',
    'Load YAML with `YAML(typ="safe")`, or the default round-trip `YAML()`.',
  ],
  [
    '',
    'can build arbitrary Python objects from the document',
    'Load YAML with `yaml.safe_load(text)`, `yaml.safe_load_all(text)` for several documents, or `Loader=yaml.SafeLoader`.',
  ],
];

function loadingAdvice(subject = '') {
  return LOADING.find(([prefix]) => subject.startsWith(prefix)) ?? LOADING.at(-1);
}

export const RULES_SECURITY_HINTS = [
  {
    tool: RULES_TOOL,
    rules: ['sql-string-formatting'],
    describe: (subject) => `\`${subject}\` runs a query built by formatting a string`,
    allowed: SQL_ALLOWED,
  },
  {
    tool: RULES_TOOL,
    rules: ['tls-verification-off'],
    describe: (subject) =>
      `\`${subject}\` turns off TLS certificate verification, or lets the environment turn it off`,
    allowed: TLS_ALLOWED,
  },
  {
    tool: RULES_TOOL,
    rules: ['weak-hmac'],
    describe: (subject) =>
      `\`${subject}\` signs with HMAC-MD5, which is no longer approved for message authentication`,
    allowed:
      'Sign with `hmac.new(key, message, hashlib.sha256)` and compare with `hmac.compare_digest`; HMAC-SHA1 is accepted where a protocol fixes it (TOTP, OAuth 1.0a).',
  },
  {
    tool: RULES_TOOL,
    rules: ['http-without-timeout'],
    describe: (subject) => `\`${subject}\` can wait forever: it has no timeout`,
    allowed: TIMEOUT_ALLOWED,
  },
  {
    tool: RULES_TOOL,
    rules: ['unsafe-deserialization'],
    describe: (subject) => `\`${subject}\` ${loadingAdvice(subject)[1]}`,
    allowed: (subject) => loadingAdvice(subject)[2],
  },
];
