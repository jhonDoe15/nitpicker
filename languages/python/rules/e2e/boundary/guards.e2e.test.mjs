import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes, findingsOf } = createScripts();
afterEach(cleanup);

const inFile = (file, code) => ({ file, code });
describe.skipIf(!enabled)('handwritten-boundary-guard', () => {
  it('flags isinstance checks on parsed data and predicates over Any', () => {
    const [actual, expected] = outcomes([
      [
        'json.loads',
        'import json\n\n\ndef parse(text):\n    data = json.loads(text)\n    if isinstance(data, dict):\n        return data\n    return {}\n',
        ['handwritten-boundary-guard:6 isinstance(data, dict)'],
      ],
      [
        'a nested access',
        'import json\n\n\ndef parse(text):\n    data = json.loads(text)\n    return isinstance(data["a"], str)\n',
        ['handwritten-boundary-guard:6 isinstance(data, str)'],
      ],
      [
        'request.json()',
        'def parse(request):\n    body = request.json()\n    return isinstance(body, list)\n',
        ['handwritten-boundary-guard:3 isinstance(body, list)'],
      ],
      [
        'an Any parameter',
        'from typing import Any\n\n\ndef parse(value: Any):\n    return isinstance(value, str)\n',
        ['no-explicit-any:4 parse', 'handwritten-boundary-guard:5 isinstance(value, str)'],
      ],
      [
        'yaml.safe_load',
        'import yaml\n\n\ndef parse(text):\n    data = yaml.safe_load(text)\n    return isinstance(data, dict)\n',
        ['handwritten-boundary-guard:6 isinstance(data, dict)'],
      ],
      [
        'a TypeGuard over Any',
        'from typing import Any, TypeGuard\n\n\ndef is_order(value: Any) -> TypeGuard[dict[str, int]]:\n    return True\n',
        ['handwritten-boundary-guard:4 is_order', 'no-explicit-any:4 is_order'],
      ],
      [
        'a TypeIs over object',
        'from typing import TypeIs\n\n\ndef is_name(value: object) -> TypeIs[str]:\n    return True\n',
        ['handwritten-boundary-guard:4 is_name'],
      ],
      [
        'isinstance on an ordinary value',
        'def f(value: int | str):\n    return isinstance(value, int)\n',
        [],
      ],
      [
        'isinstance on data that is not parsed',
        'def f(items):\n    return [i for i in items if isinstance(i, str)]\n',
        [],
      ],
      [
        'a TypeGuard over a union',
        'from typing import TypeGuard\n\n\ndef is_name(value: int | str) -> TypeGuard[str]:\n    return isinstance(value, str)\n',
        [],
      ],
      [
        'a test file',
        inFile(
          'tests/test_a.py',
          'import json\n\n\ndef t(text):\n    data = json.loads(text)\n    assert isinstance(data, dict)\n',
        ),
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('handwritten-boundary-guard through other forms', () => {
  it('follows parsed data through names, loops, helpers, patterns and annotations', () => {
    const files = {
      'src/shop/decode.py':
        'import json\nfrom typing import Any\n\n\ndef decode(text: str) -> Any:\n    return json.loads(text)\n\n\ndef decode_again(text):\n    return decode(text)\n',
      'src/shop/guards.py':
        'import json\nfrom collections.abc import Mapping\nfrom typing import Any, TypeGuard\n\nfrom shop.decode import decode, decode_again\n\nloads = json.loads\n\n\ndef alias(text):\n    data = json.loads(text)\n    payload = data\n    return isinstance(payload, dict)\n\n\ndef helper(text):\n    return isinstance(decode(text), dict)\n\n\ndef chained(text):\n    data = decode_again(text)\n    return isinstance(data, list)\n\n\ndef reference(text):\n    data = loads(text)\n    return isinstance(data, list)\n\n\ndef loop(text):\n    for item in json.loads(text):\n        return isinstance(item, dict)\n\n\ndef comprehension(text):\n    return [item for item in json.loads(text) if isinstance(item, dict)]\n\n\ndef match_it(text):\n    match json.loads(text):\n        case {"id": int(ident)}:\n            return ident\n        case _:\n            return 0\n\n\ndef by_type(text):\n    data = json.loads(text)\n    return type(data) is dict\n\n\ndef by_attribute(text):\n    data = json.loads(text)\n    return hasattr(data, "items")\n\n\ndef parameter(payload: dict[str, Any]):\n    return isinstance(payload["total"], int)\n\n\ndef opaque(payload: object):\n    return isinstance(payload, int)\n\n\ndef is_order(value: Mapping[str, object]) -> TypeGuard[dict[str, int]]:\n    return True\n\n\nclass Checker:\n    def is_order(self, value: object) -> TypeGuard[dict[str, int]]:\n        return True\n\n    def __eq__(self, other: object) -> bool:\n        return isinstance(other, Checker)\n',
    };

    expect(findingsOf(files, { sourceRoots: ['src'] })).toEqual([
      'no-explicit-any src/shop/decode.py:5 decode',
      'handwritten-boundary-guard src/shop/guards.py:13 isinstance(payload, dict)',
      'handwritten-boundary-guard src/shop/guards.py:17 isinstance(decode(), dict)',
      'handwritten-boundary-guard src/shop/guards.py:22 isinstance(data, list)',
      'handwritten-boundary-guard src/shop/guards.py:27 isinstance(data, list)',
      'handwritten-boundary-guard src/shop/guards.py:32 isinstance(item, dict)',
      'handwritten-boundary-guard src/shop/guards.py:36 isinstance(item, dict)',
      'handwritten-boundary-guard src/shop/guards.py:41 match(json.loads())',
      'handwritten-boundary-guard src/shop/guards.py:49 type(data)',
      'handwritten-boundary-guard src/shop/guards.py:54 hasattr(data)',
      'no-explicit-any src/shop/guards.py:57 parameter',
      'handwritten-boundary-guard src/shop/guards.py:58 isinstance(payload, int)',
      'handwritten-boundary-guard src/shop/guards.py:62 isinstance(payload, int)',
      'handwritten-boundary-guard src/shop/guards.py:65 is_order',
      'handwritten-boundary-guard src/shop/guards.py:70 is_order',
    ]);
  });
});
