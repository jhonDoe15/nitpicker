const NO_SHELL =
  'Pass the command as a list and leave `shell=True` out: `subprocess.run(["git", "status"], check=True)`.';
const SAFE_XML =
  'Parse untrusted XML with `defusedxml` (`from defusedxml import ElementTree`); add `defusedxml` and `types-defusedxml` to the dependencies.';
const SECURE_TLS =
  'Use `ssl.create_default_context()` and keep its certificate and hostname checks and its TLS version defaults.';
const TEMPORARY_FILE =
  'Create temporary files with `tempfile.NamedTemporaryFile`, `tempfile.mkstemp` or `tempfile.TemporaryDirectory`, not a fixed path.';

export const SECURITY_HINTS = [
  { tool: 'ruff', rules: ['S602', 'S604', 'S605'], allowed: NO_SHELL },
  {
    tool: 'ruff',
    rules: ['S609'],
    allowed:
      'Expand the files in Python, `sorted(Path(directory).glob("*.log"))`, and pass them as separate list items.',
  },
  {
    tool: 'ruff',
    rules: ['S608'],
    allowed:
      'Pass the values as query parameters: `cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))`.',
  },
  {
    tool: 'ruff',
    rules: ['S610', 'S611'],
    allowed:
      'Use the ORM query API, or pass the values as parameters: `Model.objects.raw("SELECT ... WHERE id = %s", [value])`.',
  },
  {
    tool: 'ruff',
    rules: ['S324', 'S303'],
    allowed:
      'Hash with `hashlib.sha256(...)` or stronger; a digest that is no security measure (a cache key, a checksum) passes `usedforsecurity=False`.',
  },
  {
    tool: 'ruff',
    rules: ['S304', 'S305'],
    allowed:
      'Encrypt with an authenticated mode from `cryptography`: `AESGCM(key)` or `ChaCha20Poly1305(key)`.',
  },
  {
    tool: 'ruff',
    rules: ['S501'],
    allowed:
      'Keep certificate verification on, the default; for a private CA pass its bundle: `requests.get(url, verify="/path/ca.pem", timeout=10)`.',
  },
  { tool: 'ruff', rules: ['S502', 'S503', 'S504', 'S323'], allowed: SECURE_TLS },
  {
    tool: 'ruff',
    rules: ['S505'],
    allowed:
      'Use keys of at least 2048 bits for RSA and DSA: `rsa.generate_private_key(65537, 3072)`.',
  },
  {
    tool: 'ruff',
    rules: ['S507'],
    allowed:
      'Verify the host key: `client.load_system_host_keys()` and `client.set_missing_host_key_policy(paramiko.RejectPolicy())`.',
  },
  {
    tool: 'ruff',
    rules: ['S508', 'S509'],
    allowed: 'Use SNMPv3 with authentication and privacy: `UsmUserData(user, authKey, privKey)`.',
  },
  {
    tool: 'ruff',
    rules: ['S113'],
    allowed: 'Pass a timeout in seconds: `requests.get(url, timeout=10)`.',
  },
  {
    tool: 'ruff',
    rules: ['S301', 'S302'],
    allowed:
      'Exchange data in a format that cannot run code, such as JSON: `json.loads(text)`, and validate it at the boundary.',
  },
  {
    tool: 'ruff',
    rules: ['S506'],
    allowed: 'Load YAML with `yaml.safe_load(text)`.',
  },
  {
    tool: 'ruff',
    rules: ['S102', 'S307'],
    allowed:
      'Parse literals with `ast.literal_eval(text)` and call code by name, `getattr(module, name)()`; do not run strings as code.',
  },
  { tool: 'ruff', rules: ['S108', 'S306'], allowed: TEMPORARY_FILE },
  {
    tool: 'ruff',
    rules: ['S313', 'S314', 'S315', 'S316', 'S317', 'S318', 'S319'],
    allowed: SAFE_XML,
  },
  {
    tool: 'ruff',
    rules: ['S201'],
    allowed:
      'Leave `debug` off in code and start the debugger through configuration: `flask --debug run`.',
  },
  {
    tool: 'ruff',
    rules: ['S202'],
    allowed: 'Extract with a filter: `tar.extractall(path, filter="data")`.',
  },
  {
    tool: 'ruff',
    rules: ['S308', 'S704'],
    allowed:
      'Escape the value: `django.utils.html.format_html("<b>{}</b>", value)` or `markupsafe.escape(value)`; mark only literals as safe.',
  },
  {
    tool: 'ruff',
    rules: ['S312', 'S321'],
    allowed: 'Use SSH or SFTP (`paramiko`), or HTTPS, which encrypt the connection.',
  },
  {
    tool: 'ruff',
    rules: ['S612'],
    allowed:
      'Configure logging with `logging.config.dictConfig(...)` and do not open the `listen` socket.',
  },
  {
    tool: 'ruff',
    rules: ['S701', 'S702'],
    allowed:
      'Render with Jinja2 and escape by default: `jinja2.Environment(autoescape=jinja2.select_autoescape())`.',
  },
];
