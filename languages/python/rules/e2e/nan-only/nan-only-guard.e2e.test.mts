import { useRuleScripts } from '../../test-support/python-rule-scripts.mts';

const { itOutcomes, describeRules } = useRuleScripts('nan-only-guard', {
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
});

describeRules('nan-only-guard', () => {
  itOutcomes('flags isnan as the only check on a parsed float', [
    [
      'float of text then isnan',
      'import math\n\n\ndef read(text, fallback):\n    value = float(text)\n    if ' +
        'math.isnan(value):\n        return fallback\n    return value\n',
      ['nan-only-guard:6 value'],
    ],
    [
      'from math import isnan',
      'from math import isnan\n\n\ndef read(text):\n    value = float(text)\n    ' +
        'return None if isnan(value) else value\n',
      ['nan-only-guard:6 value'],
    ],
    [
      'numpy isnan',
      'import numpy as np\n\n\ndef read(text):\n    value = float(text)\n    return ' +
        '0.0 if np.isnan(value) else value\n',
      ['nan-only-guard:6 value'],
    ],
  ]);

  itOutcomes('leaves a check that rejects infinity or bounds the value', [
    [
      'isfinite',
      'import math\n\n\ndef read(text):\n    value = float(text)\n    if not ' +
        'math.isfinite(value):\n        return 0.0\n    return value\n',
      [],
    ],
    [
      'isinf next to isnan',
      'import math\n\n\ndef read(text):\n    value = float(text)\n    if ' +
        'math.isnan(value) or math.isinf(value):\n        return 0.0\n    return ' +
        'value\n',
      [],
    ],
    [
      'a range check',
      'import math\n\n\ndef read(text):\n    value = float(text)\n    if ' +
        'math.isnan(value) or value < 0 or value > 100:\n        return 0.0\n    ' +
        'return value\n',
      [],
    ],
    [
      'a parameter that is not parsed here',
      'import math\n\n\ndef read(value):\n    return math.isnan(value)\n',
      [],
    ],
    [
      'a literal float',
      'import math\n\n\ndef read():\n    value = float("nan")\n    return math.isnan(value)\n',
      [],
    ],
    [
      'a filter that collects the other values',
      'import numpy as np\n\n\ndef read(items):\n    result = set()\n    for item in ' +
        'items:\n        value = float(item)\n        if not np.isnan(value):\n        ' +
        '    result.add(value)\n    return result\n',
      [],
    ],
    [
      'a test file',
      {
        file: 'tests/test_mod.py',
        code: 'import math\n\n\ndef test_it(text):\n    value = float(text)\n    assert not math.isnan(value)\n',
      },
      [],
    ],
  ]);
});
