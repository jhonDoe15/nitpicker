import { describe } from 'vitest';
import { useScripts, pythonLines as code } from '../../test-support/python-rule-scripts.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';
const { itOutcomes } = useScripts({
  enabled,
  hidden: ['test-without-assertion', 'module-level-mutable-state', 'falsy-default', 'explicit-any'],
});

const JSON = ['import json', '', ''];

describe.skipIf(!enabled)('null-valued-input-key', () => {
  itOutcomes('flags a default that an explicit null replaces', [
    [
      'a text default on a parsed body',
      code(
        ...JSON,
        'def read(raw):',
        '    body = json.loads(raw)',
        '    return body.get("alt", "")',
      ),
      ["null-valued-input-key:6 get|body.get('alt')"],
    ],
    [
      'a number default is marked as a number',
      code(
        'def total(response):',
        '    usage = response.json()',
        '    return usage.get("cache_tokens", 0) + 1',
      ),
      ["null-valued-input-key:3 get|usage.get('cache_tokens')|number"],
    ],
    [
      'a default read straight from the call',
      code('def hosts(response):', '    return response.json().get("policies", [])'),
      ["null-valued-input-key:2 get|response.json().get('policies')"],
    ],
    [
      'a default on request data',
      code('def view(request):', '    return request.data.get("name", "").lower()'),
      ["null-valued-input-key:2 get|request.data.get('name')"],
    ],
    [
      'a cleaned input of a mutation without annotation',
      code(
        'class Update:',
        '    def clean_input(self, info, instance, cleaned_input):',
        '        return cleaned_input.get("tracking_number", "")',
      ),
      ["null-valued-input-key:3 get|cleaned_input.get('tracking_number')"],
    ],
    [
      'a loose annotated parameter',
      code(
        'from typing import Any',
        '',
        '',
        'def handle(payload: dict[str, Any]):',
        '    return payload.get("tags", [])',
      ),
      ["null-valued-input-key:5 get|payload.get('tags')"],
    ],
    [
      'a model dump that keeps nulls',
      code('def dump(model):', '    data = model.model_dump()', '    return data.get("name", "")'),
      ["null-valued-input-key:3 get|data.get('name')"],
    ],
    [
      'a nested value of a parsed document',
      code(
        ...JSON,
        'def read(raw):',
        '    host = json.loads(raw)["host"]',
        '    return host.get("uuid", "").lower()',
      ),
      ["null-valued-input-key:6 get|host.get('uuid')"],
    ],
    [
      'setdefault on a parsed body',
      code(
        ...JSON,
        'def read(raw):',
        '    body = json.loads(raw)',
        '    body.setdefault("timeout", 30)',
      ),
      ["null-valued-input-key:6 setdefault|body.setdefault('timeout')|number"],
    ],
    [
      'setdefault on the keyword arguments of a mutation',
      code(
        'class Update:',
        '    def perform_mutation(self, root, info, **data):',
        '        data.setdefault("limit", 10)',
      ),
      ["null-valued-input-key:3 setdefault|data.setdefault('limit')|number"],
    ],
    [
      'keyword arguments of an ordinary function',
      code('def wrap(**kwargs):', '    kwargs.setdefault("timeout", 30)'),
      [],
    ],
    [
      'a membership test followed by a read',
      code(
        'def clean(cleaned_input):',
        '    if "permissions" in cleaned_input:',
        '        for item in cleaned_input["permissions"]:',
        '            print(item)',
      ),
      ["null-valued-input-key:2 in|'permissions' in cleaned_input"],
    ],
    [
      'a membership test in a conditional expression',
      code(
        'def clean(cleaned_input):',
        '    return cleaned_input["slug"] if "slug" in cleaned_input else ""',
      ),
      ["null-valued-input-key:2 in|'slug' in cleaned_input"],
    ],
    [
      'a membership test and a read in one condition',
      code(
        'def clean(cleaned_input):',
        '    return "slug" in cleaned_input and cleaned_input["slug"].strip()',
      ),
      ["null-valued-input-key:2 in|'slug' in cleaned_input"],
    ],
  ]);

  itOutcomes('stays quiet for null-safe reads and mappings the code controls', [
    [
      'an or default',
      code(
        ...JSON,
        'def read(raw):',
        '    body = json.loads(raw)',
        '    return body.get("alt") or ""',
      ),
      [],
    ],
    [
      'a get without a default',
      code(...JSON, 'def read(raw):', '    body = json.loads(raw)', '    return body.get("alt")'),
      [],
    ],
    [
      'an explicit None test',
      code(
        ...JSON,
        'def read(raw):',
        '    body = json.loads(raw)',
        '    return v if (v := body.get("n")) is not None else 0',
      ),
      [],
    ],
    [
      'an or applied to a default call',
      code(
        ...JSON,
        'def read(raw):',
        '    body = json.loads(raw)',
        '    return body.get("alt", "") or "x"',
      ),
      [],
    ],
    [
      'a default only compared for equality',
      code(
        ...JSON,
        'def read(raw):',
        '    body = json.loads(raw)',
        '    return body.get("kind", "") == "a"',
      ),
      [],
    ],
    [
      'a membership test with a None check',
      code(
        'def clean(cleaned_input):',
        '    if "permissions" in cleaned_input and cleaned_input["permissions"] is not None:',
        '        return list(cleaned_input["permissions"])',
      ),
      [],
    ],
    [
      'a membership test whose value is tested in the block',
      code(
        'def clean(cleaned_input):',
        '    if "permissions" in cleaned_input:',
        '        if cleaned_input["permissions"]:',
        '            return 1',
      ),
      [],
    ],
    [
      'a membership test followed by a get',
      code(
        'def clean(cleaned_input):',
        '    if "permissions" in cleaned_input:',
        '        return cleaned_input.get("permissions") or []',
      ),
      [],
    ],
    [
      'a read stored in a name that is tested for None',
      code(
        'def clean_input(data):',
        '    if "name" in data:',
        '        name = data["name"]',
        '        if name is None:',
        '            return None',
        '        return name.strip()',
      ),
      [],
    ],
    [
      'a read stored in a name that is replaced with or',
      code(
        'def clean(cleaned_input):',
        '    perms = cleaned_input["perm"]',
        '    for item in perms or []:',
        '        print(item)',
      ),
      [],
    ],
    [
      'a walrus read that is tested for None',
      code(
        'def clean(cleaned_input):',
        '    if "n" in cleaned_input and (n := cleaned_input["n"]) is not None:',
        '        return n',
      ),
      [],
    ],
    [
      'a default stored in a name that is tested for None or replaced',
      code(
        'import json',
        '',
        '',
        'def read(raw):',
        '    body = json.loads(raw)',
        '    value = body.get("a", 1)',
        '    if value is None:',
        '        value = 1',
        '    count = body.get("n", 0)',
        '    count = count or 0',
        '    return value, count',
      ),
      [],
    ],
    [
      'a dict the code builds itself',
      code('def read():', '    config = {"a": 1}', '    return config.get("alt", "")'),
      [],
    ],
    [
      'a plain dict parameter without input names',
      code('def read(options):', '    return options.get("alt", "")'),
      [],
    ],
    [
      'a typed dict parameter',
      code(
        'from typing import TypedDict',
        '',
        '',
        'class Body(TypedDict):',
        '    alt: str',
        '',
        '',
        'def handle(payload: Body):',
        '    return payload.get("alt", "")',
      ),
      [],
    ],
    [
      'a model dump without nulls',
      code(
        'def dump(model):',
        '    data = model.model_dump(exclude_none=True)',
        '    return data.get("name", "")',
      ),
      [],
    ],
    [
      'a name that is rebound to something else',
      code(
        ...JSON,
        'def read(raw):',
        '    body = json.loads(raw)',
        '    body = {"alt": "x"}',
        '    return body.get("alt", "")',
      ),
      [],
    ],
    [
      'a test file',
      {
        file: 'tests/test_mod.py',
        code: code(
          ...JSON,
          'def test_read(raw):',
          '    body = json.loads(raw)',
          '    assert body.get("alt", "") == ""',
        ),
      },
      [],
    ],
  ]);
});
