import { useRuleScripts } from '../../../test-support/python-rule-scripts.mts';

const TLS = 'tls-verification-off';

const { itOutcomes, describeRules } = useRuleScripts(TLS, {
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
});

describeRules('tls-verification-off: values that cannot be False', () => {
  itOutcomes('passes a CA bundle with a fallback', [
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

  itOutcomes('passes server contexts on self and server option dicts', [
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

  itOutcomes('passes text that only names the switches', [
    [
      'comparisons and docstrings',
      'def f(argument):\n    """Never pass ?tlsInsecure=true or --ignore-certificate-errors."""\n    if argument == "--ignore-certificate-errors":\n        raise ValueError(argument)\n    return argument.startswith("--ignore-certificate-errors")\n',
      [],
    ],
  ]);
});
