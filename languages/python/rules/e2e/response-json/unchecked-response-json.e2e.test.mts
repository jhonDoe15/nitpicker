import { useRuleScripts } from '../../test-support/python-rule-scripts.mts';

const { itOutcomes, describeRules } = useRuleScripts('unchecked-response-json', {
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
});

describeRules('unchecked-response-json', () => {
  itOutcomes('flags a body read as JSON before the status is checked', [
    [
      'requests.get then json',
      'import requests\n\n\ndef load(url):\n    response = requests.get(url)\n    return response.json()\n',
      ['unchecked-response-json:6 response'],
    ],
    [
      'an aliased import',
      'import requests as http\n\n\ndef load(url):\n    r = http.post(url, json={})\n    return r.json()["id"]\n',
      ['unchecked-response-json:6 r'],
    ],
    [
      'a status check after the read',
      'import httpx\n\n\ndef load(url):\n    r = httpx.get(url)\n    data = ' +
        'r.json()\n    r.raise_for_status()\n    return data\n',
      ['unchecked-response-json:6 r'],
    ],
    [
      'a requests session',
      'import requests\n\n\ndef load(url):\n    session = requests.Session()\n    r ' +
        '= session.get(url)\n    return r.json()\n',
      ['unchecked-response-json:7 r'],
    ],
    [
      'an httpx async client',
      'import httpx\n\n\nasync def load(url):\n    async with httpx.AsyncClient() as ' +
        'client:\n        r = await client.get(url)\n        return r.json()\n',
      ['unchecked-response-json:7 r'],
    ],
    [
      'a chained call',
      'import requests\n\n\ndef load(url):\n    return requests.get(url).json()\n',
      ['unchecked-response-json:5 response'],
    ],
    [
      'the body text read first',
      'import requests\n\n\ndef load(url):\n    r = requests.get(url)\n    print(r.text)\n    return r.json()\n',
      ['unchecked-response-json:7 r'],
    ],
  ]);

  itOutcomes('leaves a response whose status is looked at first', [
    [
      'raise_for_status first',
      'import requests\n\n\ndef load(url):\n    r = requests.get(url)\n    r.raise_for_status()\n    return r.json()\n',
      [],
    ],
    [
      'a status_code test',
      'import requests\n\n\ndef load(url):\n    r = requests.get(url)\n    if ' +
        'r.status_code != 200:\n        return None\n    return r.json()\n',
      [],
    ],
    [
      'the ok flag',
      'import requests\n\n\ndef load(url):\n    r = requests.get(url)\n    if not ' +
        'r.ok:\n        return None\n    return r.json()\n',
      [],
    ],
    [
      'the response passed to a checker',
      'import requests\n\n\ndef load(url):\n    r = requests.get(url)\n    check(r)\n    return r.json()\n',
      [],
    ],
    [
      'the read inside a try with a handler',
      'import requests\n\n\ndef load(url):\n    r = requests.get(url)\n    try:\n    ' +
        '    return r.json()\n    except ValueError:\n        return None\n',
      [],
    ],
    [
      'a chained call inside a try with a handler',
      'import requests\n\n\ndef load(url):\n    try:\n        return ' +
        'requests.get(url).json()\n    except ValueError:\n        return None\n',
      [],
    ],
    [
      'another object with a json method',
      'def load(model):\n    r = model.get()\n    return r.json()\n',
      [],
    ],
    [
      'a test file',
      {
        file: 'tests/test_mod.py',
        code: 'import requests\n\n\ndef test_it(url):\n    r = requests.get(url)\n    assert r.json()\n',
      },
      [],
    ],
  ]);
});
