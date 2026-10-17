import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes: allOutcomes } = createScripts();
afterEach(cleanup);

const TLS = 'tls-verification-off';

function outcomes(rows) {
  const [actual, expected] = allOutcomes(rows);
  const own = Object.fromEntries(
    Object.entries(actual).map(([name, found]) => [name, found.filter((f) => f.startsWith(TLS))]),
  );
  return [own, expected];
}

describe.skipIf(!enabled)('tls-verification-off: values that cannot be False', () => {
  it('passes a CA bundle with a fallback', () => {
    const [actual, expected] = outcomes([
      [
        'x or True and env or certifi.where()',
        'import os\n\nimport certifi\nimport httpx\nimport requests\n\n\ndef f(url, ca, settings):\n    requests.get(url, verify=ca or True, timeout=10)\n    bundle = os.environ.get("REQUESTS_CA_BUNDLE") or certifi.where()\n    requests.get(url, verify=bundle, timeout=10)\n    s = requests.Session()\n    s.verify = ca or certifi.where()\n    s.verify = os.getenv("CA_BUNDLE") or True\n    httpx.Client(verify=settings.CA_BUNDLE or True)\n    return s\n',
        [],
      ],
      [
        'an or that can end in False, and an and',
        'import requests\n\n\ndef f(url, ca, strict):\n    requests.get(url, verify=ca or False, timeout=10)\n    return requests.get(url, verify=strict and ca, timeout=10)\n',
        [`${TLS}:5 requests.get`],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('passes server contexts on self and server option dicts', () => {
    const [actual, expected] = outcomes([
      [
        'a server context held on self',
        'import ssl\n\n\nclass Server:\n    def __init__(self):\n        self.context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)\n        self.context.load_cert_chain("c.pem", "k.pem")\n        self.context.verify_mode = ssl.CERT_NONE\n',
        [],
      ],
      [
        'server option dicts',
        'import ssl\n\n\ndef gunicorn_conf():\n    return {"cert_reqs": ssl.CERT_NONE, "certfile": "c.pem"}\n\n\ndef uvicorn_options():\n    options = {"ssl_certfile": "c.pem"}\n    options["ssl_cert_reqs"] = ssl.CERT_NONE\n    return options\n',
        [],
      ],
      [
        'a client context on self',
        'import ssl\n\n\nclass Client:\n    def __init__(self):\n        self.context = ssl.create_default_context()\n        self.context.verify_mode = ssl.CERT_NONE\n',
        [`${TLS}:7 verify_mode`],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('passes text that only names the switches', () => {
    const [actual, expected] = outcomes([
      [
        'comparisons and docstrings',
        'def f(argument):\n    """Never pass ?tlsInsecure=true or --ignore-certificate-errors."""\n    if argument == "--ignore-certificate-errors":\n        raise ValueError(argument)\n    return argument.startswith("--ignore-certificate-errors")\n',
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
