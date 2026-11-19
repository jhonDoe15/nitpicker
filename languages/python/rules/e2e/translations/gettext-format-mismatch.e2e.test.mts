import { describe } from 'vitest';
import { useScripts, pythonLines as code } from '../../test-support/python-rule-scripts.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';
const { itOutcomes } = useScripts({ enabled, hidden: ['test-without-assertion'] });

const HEAD = ['from django.utils.translation import gettext as _', '', '', ''];

describe.skipIf(!enabled)('gettext-format-mismatch', () => {
  itOutcomes('flags format arguments that do not fit the translated text', [
    [
      'a keyword name the placeholder does not have',
      code(...HEAD, 'def run(place):', '    return _("Visit {location} today").format(site=place)'),
      ['gettext-format-mismatch:6 format|missing:location|unused:site'],
    ],
    [
      'a positional argument for a named placeholder',
      code(
        ...HEAD,
        'def run(value):',
        '    return _("Invalid IP address format: {data}").format(value)',
      ),
      ['gettext-format-mismatch:6 format|missing:data|unused:0'],
    ],
    [
      'too few positional arguments',
      code(...HEAD, 'def run(a):', '    return _("{} of {}").format(a)'),
      ['gettext-format-mismatch:6 format|missing:1'],
    ],
    [
      'an extra keyword argument',
      code(...HEAD, 'def run(a, b):', '    return _("Hello {name}").format(name=a, other=b)'),
      ['gettext-format-mismatch:6 format|unused:other'],
    ],
    [
      'a format_map dict without the key',
      code(
        ...HEAD,
        'def run(text):',
        '    return _("Failed: {messages}").format_map({"message": text})',
      ),
      ['gettext-format-mismatch:6 format_map|missing:messages'],
    ],
    [
      'a lazy and a plural form',
      code(
        'from django.utils.translation import gettext_lazy, ngettext',
        '',
        '',
        'def run(n):',
        '    a = gettext_lazy("Hello {name}").format(nick="x")',
        '    return a, ngettext("{count} item", "{count} items", n).format(total=n)',
      ),
      [
        'gettext-format-mismatch:5 format|missing:name|unused:nick',
        'gettext-format-mismatch:6 format|missing:count|unused:total',
      ],
    ],
    [
      'format_map inside the gettext call',
      code(
        ...HEAD,
        'def run(text):',
        '    return _("Failed: {messages}".format_map({"messages": text}))',
      ),
      ['gettext-format-mismatch:6 format_map|before'],
    ],
  ]);

  itOutcomes('stays quiet when the names and counts match', [
    [
      'matching keywords, positions and nested specs',
      code(
        ...HEAD,
        'def run(a, b, w):',
        '    x = _("Hello {name}").format(name=a)',
        '    y = _("{} of {}").format(a, b)',
        '    z = _("{0} {1} {0}").format(a, b)',
        '    v = _("{value:>{width}}").format(value=a, width=w)',
        '    u = _("{user.name} {items[0]}").format(user=a, items=b)',
        '    return x, y, z, v, u',
      ),
      [],
    ],
    [
      'format_map with a matching or an unknown dict',
      code(
        ...HEAD,
        'def run(values):',
        '    a = _("Failed: {messages}").format_map({"messages": 1, "extra": 2})',
        '    return a, _("Failed: {messages}").format_map(values)',
      ),
      [],
    ],
    [
      'unpacked arguments and escaped braces',
      code(
        ...HEAD,
        'def run(args, kwargs):',
        '    a = _("{} {}").format(*args)',
        '    b = _("{name}").format(**kwargs)',
        '    return a, b, _("literal {{braces}}").format()',
      ),
      [],
    ],
    [
      'format on text that is not a gettext call or has no literal',
      code(
        ...HEAD,
        'def run(text, name):',
        '    a = "Hello {name}".format(site=name)',
        '    b = _(text).format(site=name)',
        '    return a, b, other("Hello {name}").format(site=name)',
      ),
      [],
    ],
    [
      'a module that only starts with the name of a gettext module',
      code(
        'from gettext_helpers import gettext',
        '',
        '',
        'def run(a):',
        '    return gettext("Hello {name}").format(site=a)',
      ),
      [],
    ],
    [
      'an underscore that is a loop variable',
      code(
        'def run(items):',
        '    for _ in items:',
        '        pass',
        '    return _("Hello {name}").format(site=1)',
      ),
      [],
    ],
    [
      'a test file',
      {
        file: 'tests/test_run.py',
        code: code(...HEAD, 'def run(a):', '    return _("Hello {name}").format(site=a)'),
      },
      [],
    ],
  ]);
});
