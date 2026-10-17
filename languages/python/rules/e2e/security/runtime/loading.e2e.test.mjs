import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes: allOutcomes } = createScripts();
afterEach(cleanup);

const HMAC = 'weak-hmac';
const LOAD = 'unsafe-deserialization';

function outcomes(rows) {
  const [actual, expected] = allOutcomes(rows);
  const own = Object.fromEntries(
    Object.entries(actual).map(([name, found]) => [
      name,
      found.filter((f) => f.startsWith(HMAC) || f.startsWith(LOAD)),
    ]),
  );
  return [own, expected];
}

describe.skipIf(!enabled)('weak-hmac: where the digest comes from', () => {
  it('follows partial, lambdas, class attributes, defaults and module attributes', () => {
    const [actual, expected] = outcomes([
      [
        'partial, a lambda and hashlib.new through a constant',
        'import functools\nimport hashlib\nimport hmac\n\nALG = "md5"\nsign = functools.partial(hmac.new, digestmod=hashlib.md5)\n\n\ndef f(key, body):\n    hmac.new(key, body, lambda: hashlib.md5())\n    return hmac.new(key, body, lambda: hashlib.new(ALG))\n',
        [`${HMAC}:6 hmac.new(md5)`, `${HMAC}:10 hmac.new(md5)`, `${HMAC}:11 hmac.new(md5)`],
      ],
      [
        'a class attribute and a parameter default',
        'import hashlib\nimport hmac\n\n\nclass Signer:\n    DIGEST = hashlib.md5\n\n    def sign(self, key, body):\n        return hmac.new(key, body, self.DIGEST).hexdigest()\n\n\ndef sign(key, body, algorithm: str = "md5"):\n    return hmac.new(key, body, algorithm).hexdigest()\n',
        [`${HMAC}:9 hmac.new(md5)`, `${HMAC}:13 hmac.new(md5)`],
      ],
      [
        'a digest read as a module attribute',
        {
          files: {
            'digestmod/settings.py': 'import hashlib\n\nDIGEST = hashlib.md5\n',
            'digestmod/a.py':
              'import hmac\n\nfrom digestmod import settings\n\n\ndef sign(key, body):\n    return hmac.new(key, body, settings.DIGEST).hexdigest()\n',
          },
        },
        [`${HMAC}:7 hmac.new(md5)`],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('unsafe-deserialization: loaders ruff does not report', () => {
  it('flags pickle-based loaders, keras safe_mode=False and lxml entity expansion', () => {
    const [actual, expected] = outcomes([
      [
        'joblib and cloudpickle',
        'import cloudpickle\nimport joblib\n\n\ndef f(path, data):\n    joblib.load(path)\n    cloudpickle.load(open(path, "rb"))\n    return cloudpickle.loads(data)\n',
        [`${LOAD}:6 joblib.load`, `${LOAD}:7 cloudpickle.load`, `${LOAD}:8 cloudpickle.loads`],
      ],
      [
        'keras and lxml',
        'import keras\nfrom lxml import etree\n\n\ndef f(path, data):\n    keras.models.load_model(path, safe_mode=False)\n    keras.models.load_model(path)\n    etree.XMLParser(resolve_entities=True)\n    etree.XMLParser(no_network=False)\n    return etree.XMLParser(resolve_entities=False)\n',
        [
          `${LOAD}:6 keras.models.load_model`,
          `${LOAD}:8 lxml.etree.XMLParser`,
          `${LOAD}:9 lxml.etree.XMLParser`,
        ],
      ],
      [
        'partial, an options dict and a ruamel typ set afterwards',
        'import functools\n\nimport numpy as np\nimport torch\nfrom ruamel.yaml import YAML\n\nOPTIONS = {"allow_pickle": True}\nload_checkpoint = functools.partial(torch.load, map_location="cpu")\nload_weights = functools.partial(torch.load, weights_only=True)\n\n\ndef f(path, text):\n    np.load(path, **OPTIONS)\n    y = YAML()\n    y.typ = "unsafe"\n    return y.load(text)\n',
        [`${LOAD}:8 torch.load`, `${LOAD}:13 numpy.load`, `${LOAD}:15 ruamel.yaml.YAML`],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('passes safe loaders at any depth and weights_only bound to True', () => {
    const [actual, expected] = outcomes([
      [
        'a SafeLoader grandchild and a constant weights_only',
        'import torch\nimport yaml\n\nWEIGHTS_ONLY = True\n\n\nclass Base(yaml.SafeLoader):\n    pass\n\n\nclass Mine(Base):\n    pass\n\n\ndef f(path, text):\n    torch.load(path, weights_only=WEIGHTS_ONLY)\n    return list(yaml.load_all(text, Loader=Mine))\n',
        [],
      ],
      [
        'a FullLoader grandchild and a weights_only parameter',
        'import torch\nimport yaml\n\n\nclass Base(yaml.FullLoader):\n    pass\n\n\nclass Mine(Base):\n    pass\n\n\ndef f(path, text, weights=True):\n    torch.load(path, weights_only=weights)\n    return list(yaml.load_all(text, Loader=Mine))\n',
        [`${LOAD}:14 torch.load`, `${LOAD}:15 yaml.load_all`],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
