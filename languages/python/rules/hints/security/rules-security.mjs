import { RULES_TOOL } from '../tool.mjs';

const PLACEHOLDERS = {
  asyncpg: {
    call: '`await conn.fetch("SELECT * FROM users WHERE id = $1", user_id)` in asyncpg',
    list: '`", ".join(f"${n}" for n in range(1, len(ids) + 1))`',
    condition: '`conditions.append(f"name = ${len(values)}")`',
  },
  sqlite: {
    call: '`cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))` in sqlite3',
    list: '`", ".join(["?"] * len(ids))`',
    condition: '`conditions.append("name = ?")`',
  },
  named: {
    call: '`await database.fetch_all("SELECT * FROM users WHERE id = :id", {"id": user_id})`',
    list: '`", ".join(f":id_{n}" for n in range(len(ids)))`',
    condition: '`conditions.append("name = :name")`',
  },
  format: {
    call: '`cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))`',
    list: '`", ".join(["%s"] * len(ids))`',
    condition: '`conditions.append("name = %s")`',
  },
};
const ASYNCPG_CALLS = /\.(?:fetchrow|fetchval)$/u;
const NAMED_CALLS = /\.(?:fetch_all|fetch_one|fetch_val)$/u;

function placeholderStyle(subject, database) {
  if (ASYNCPG_CALLS.test(subject)) {
    return 'asyncpg';
  }
  if (NAMED_CALLS.test(subject)) {
    return 'named';
  }
  return PLACEHOLDERS[database] === undefined ? 'format' : database;
}

function sqlAllowed(subject = '', libraries = {}) {
  const style = PLACEHOLDERS[placeholderStyle(subject, libraries.database)];
  return `Pass the values as query parameters: ${style.call}, \`session.execute(text("SELECT * FROM users WHERE id = :id"), {"id": user_id})\` in SQLAlchemy, \`Model.objects.raw("... WHERE id = %s", [user_id])\` in Django. Build placeholder lists from placeholders alone (${style.list}) and optional filters as ${style.condition} joined with \`" AND "\`. A table or column name comes from a fixed lookup (\`COLUMNS[key]\` over a dict of constant names), a check against a constant set that stops otherwise (\`if column not in ALLOWED: raise ValueError(column)\`), a \`Literal[...]\` or \`Enum\` value, the schema (\`table.name\`, \`model._meta.db_table\`), or a quoting call (\`psycopg.sql.Identifier(name)\`, \`dialect.identifier_preparer.quote(name)\`).`;
}

const TLS_ALLOWED =
  'Keep verification on in every environment and trust the certificate authority instead: `requests.get(url, verify="/etc/ssl/private-ca.pem", timeout=10)`, `ssl.create_default_context(cafile=ca_path)`, `tlsCAFile=ca_path` for MongoDB, or `REQUESTS_CA_BUNDLE` and `SSL_CERT_FILE` pointing at the bundle. A server that asks for optional client certificates uses `ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)` with `verify_mode = ssl.CERT_OPTIONAL`; a server context that loads its own certificate needs no `verify_mode = ssl.CERT_NONE` line: delete it.';

const TIMEOUT_ALLOWED =
  'Pass a timeout in seconds: `urllib.request.urlopen(url, timeout=10)`, `session.get(url, timeout=10)`, or set `socket.setdefaulttimeout(10)` once at startup for `urllib`; an `httpx` client keeps its 5 second default unless you pass another number (`httpx.Client(timeout=10)`), never `timeout=None`.';

const LOADING = [
  [
    'torch.',
    'unpickles arbitrary objects from the file on torch below 2.6, or with `weights_only=False`',
    'Load tensors with `torch.load(path, weights_only=True)`, which holds on every torch version, or store them with `safetensors` (`safetensors.torch.load_file(path)`).',
  ],
  [
    'joblib.',
    'unpickles arbitrary objects from the file',
    'Store models with `skops.io.dump` and load them with `skops.io.load(path, trusted=[...])`, store arrays with `safetensors`, and plain data as JSON.',
  ],
  [
    'cloudpickle.',
    'unpickles arbitrary objects from the data',
    'Exchange plain data as JSON (`json.loads(text)`), or validate it into a model (`Model.model_validate_json(text)`).',
  ],
  [
    'keras.',
    'with `safe_mode=False` runs arbitrary code stored in the model file',
    'Load models with the default `keras.models.load_model(path)` (`safe_mode=True`).',
  ],
  [
    'tensorflow.',
    'with `safe_mode=False` runs arbitrary code stored in the model file',
    'Load models with the default `tf.keras.models.load_model(path)` (`safe_mode=True`).',
  ],
  [
    'lxml.',
    'expands external entities or fetches them from the network',
    'Parse with `defusedxml.lxml`, or `etree.XMLParser(resolve_entities=False, no_network=True)` (the defaults keep the network off).',
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
    'Load YAML with `yaml.safe_load(text)`, `yaml.safe_load_all(text)` for several documents, or `Loader=yaml.SafeLoader` (or a subclass of it).',
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
    allowed: sqlAllowed,
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
