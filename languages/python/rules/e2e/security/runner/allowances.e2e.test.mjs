import { afterEach, describe, expect, it } from 'vitest';
import { createProjects, rowsOf } from './run-project.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { analyse, cleanup } = createProjects();
afterEach(cleanup);

const SECURITY = /^S\d/u;
const ruffRows = (found) =>
  found
    .filter(({ rule }) => SECURITY.test(rule))
    .map(({ rule, path: file, location }) => `${rule} ${file}:${String(location?.line)}`);

const TLS_CLIENT =
  'import requests\n\n\ndef fetch(url):\n    return requests.get(url, verify=False, timeout=5)\n';

describe.skipIf(!enabled)('ruff security findings the rules script allows', () => {
  it('drops HMAC-SHA1 through an alias or a variable and SHA-1 in OAEP and MGF1, and keeps a plain hash', () => {
    const { ruff, sidecar } = analyse(
      {
        'crypto.py':
          'from cryptography.hazmat.primitives import hashes\nfrom cryptography.hazmat.primitives.asymmetric import padding\nfrom cryptography.hazmat.primitives.hmac import HMAC as SIGNING_HMAC\n\n\ndef sign(key: bytes, body: bytes) -> bytes:\n    algorithm = hashes.SHA1()\n    signer = SIGNING_HMAC(key, algorithm)\n    signer.update(body)\n    return signer.finalize()\n\n\ndef wrap(public_key, key: bytes) -> bytes:\n    return public_key.encrypt(\n        key,\n        padding.OAEP(\n            mgf=padding.MGF1(algorithm=hashes.SHA1()),\n            algorithm=hashes.SHA1(),\n            label=None,\n        ),\n    )\n\n\ndef fingerprint(data: bytes) -> bytes:\n    digest = hashes.Hash(hashes.SHA1())\n    digest.update(data)\n    return digest.finalize()\n',
      },
      { ruff: true },
    );

    expect(ruffRows(ruff)).toEqual(['S303 crypto.py:25']);
    expect(sidecar.allowed).toEqual([
      { rule: 'S303', path: 'crypto.py', line: 7 },
      { rule: 'S303', path: 'crypto.py', line: 17 },
      { rule: 'S303', path: 'crypto.py', line: 18 },
    ]);
  });

  it('reports HMAC-MD5 once, as weak-hmac', () => {
    const { ruff, rules } = analyse(
      {
        'sign.py':
          'from cryptography.hazmat.primitives import hashes, hmac\n\n\ndef sign(key: bytes, body: bytes) -> bytes:\n    signer = hmac.HMAC(key, hashes.MD5())\n    signer.update(body)\n    return signer.finalize()\n',
      },
      { ruff: true },
    );

    expect(ruffRows(ruff)).toEqual([]);
    expect(rowsOf(rules, ['weak-hmac'])).toEqual(['weak-hmac sign.py:5 hmac.HMAC(md5)']);
  });

  it('drops S506 for yaml.load with a SafeLoader subclass at any depth', () => {
    const { ruff } = analyse(
      {
        'config.py':
          'import yaml\n\n\nclass EnvLoader(yaml.SafeLoader):\n    pass\n\n\nclass StrictLoader(EnvLoader):\n    pass\n\n\ndef read(text: str) -> object:\n    yaml.load(text, Loader=StrictLoader)\n    return yaml.load(text, Loader=yaml.Loader)\n',
      },
      { ruff: true },
    );

    expect(ruffRows(ruff)).toEqual(['S506 config.py:14']);
  });
});

describe.skipIf(!enabled)('test support', () => {
  it('lists support files under the configured testpaths and unimported fixed folders', () => {
    const { ruff, sidecar } = analyse(
      {
        'pyproject.toml': '[tool.pytest.ini_options]\ntestpaths = ["checks"]\n',
        'checks/servers/tls_client.py': TLS_CLIENT,
        'mocks/tls_client.py': TLS_CLIENT,
        'shop/fixtures/tls_client.py': TLS_CLIENT,
        'shop/api.py':
          'from shop.fixtures import tls_client\n\n\ndef get(url):\n    return tls_client.fetch(url)\n',
      },
      { ruff: true },
    );

    expect(sidecar.supportFiles).toEqual(['checks/servers/tls_client.py', 'mocks/tls_client.py']);
    expect(ruffRows(ruff)).toEqual(['S501 shop/fixtures/tls_client.py:5']);
  });
});
