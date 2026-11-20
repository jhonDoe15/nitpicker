import { useScripts } from '../../test-support/python-rule-scripts.mts';

const { itOutcomes, describeRules } = useScripts({
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
});

describeRules('precondition-message-names-other-value', () => {
  itOutcomes('flags a check whose message names another value', [
    [
      'a raise that names another parameter',
      'def build(name, value):\n    if value is None:\n        raise ' +
        'ValueError("name must not be None")\n    return name, value\n',
      ['precondition-message-names-other-value:2 value|name'],
    ],
    [
      'an assert that names another parameter',
      'def build(name, value):\n    assert value is not None, "name must not be None"\n    return name, value\n',
      ['precondition-message-names-other-value:2 value|name'],
    ],
    [
      'a camel-case message word against a snake-case parameter',
      'def wait(duration, time_unit):\n    if duration is None:\n    ' +
        '    raise ValueError("TimeUnit must not be None")\n',
      ['precondition-message-names-other-value:2 duration|time_unit'],
    ],
  ]);

  itOutcomes('leaves checks that name the checked value alone', [
    [
      'the message names the checked value',
      'def build(name, value):\n    if name is None:\n        raise ValueError("name must not be None")\n',
      [],
    ],
    [
      'a message that starts with a name that is not in scope',
      'def build(name, value):\n    if value is None:\n        raise ValueError("Request must not be None")\n',
      [],
    ],
    [
      'the checked name ends in the same word',
      'def build(user_id, order_id):\n    if user_id is None:\n        raise ValueError("id must be set")\n',
      [],
    ],
    [
      'a checked value derived from the named one',
      'def build(title):\n    stripped = title.strip()\n    if not ' +
        'stripped:\n        raise ValueError("title must be ' +
        'non-empty")\n',
      [],
    ],
    [
      'a setter whose message names its own attribute',
      'class A:\n    def tag(self, value):\n        if value is ' +
        'None:\n            raise ValueError("tag must be set")\n      ' +
        '  self.tag = value\n',
      [],
    ],
    [
      'a branch with an else',
      'def build(name, value):\n    if value is None:\n        raise ' +
        'ValueError("name must not be None")\n    else:\n        ' +
        'return name\n',
      [],
    ],
  ]);
});
