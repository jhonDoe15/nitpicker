import { useScripts, inFile } from '../../test-support/python-rule-scripts.mts';

const { itOutcomes, describeRules } = useScripts({
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
});

describeRules('unescaped-html-value', () => {
  itOutcomes('flags a value formatted into an HTML string without escaping', [
    [
      'an f-string attribute and text',
      'def link(title, url):\n    return f\'<a href="{url}">{title}</a>\'\n',
      ['unescaped-html-value:2 url'],
    ],
    [
      'an f-string with a method call',
      'def row(user):\n    return f"<td>{user.name}</td>"\n',
      ['unescaped-html-value:2 user.name'],
    ],
    [
      'percent formatting',
      'def row(name):\n    return "<td>%s</td>" % name\n',
      ['unescaped-html-value:2 name'],
    ],
    [
      'str.format',
      'def row(name):\n    return "<td>{}</td>".format(name)\n',
      ['unescaped-html-value:2 name'],
    ],
    [
      'mark_safe around an f-string',
      'from django.utils.safestring import mark_safe\n\n\ndef span(error_text):\n    return mark_safe(f\'<span class="e">{error_text}</span>\')\n',
      ['unescaped-html-value:5 error_text'],
    ],
  ]);

  itOutcomes('flags a value concatenated into an HTML string', [
    [
      'plus concatenation',
      'def row(name):\n    return "<td>" + name + "</td>"\n',
      ['unescaped-html-value:2 name'],
    ],
  ]);

  itOutcomes('leaves escaped, numeric, constant and non-HTML strings alone', [
    [
      'html.escape',
      'import html\n\n\ndef row(name):\n    return f"<td>{html.escape(name)}</td>"\n',
      [],
    ],
    [
      'markupsafe escape',
      'from markupsafe import escape\n\n\ndef row(name):\n    return f"<td>{escape(name)}</td>"\n',
      [],
    ],
    ['a number', 'def row(items):\n    return f"<td>{len(items)}</td>"\n', []],
    ['a numeric format spec', 'def row(price):\n    return f"<td>{price:.2f}</td>"\n', []],
    ['a value already HTML', 'def page(body_html):\n    return f"<main>{body_html}</main>"\n', []],
    [
      'rows built from escaped parts',
      'import html\n\n\ndef table(rows):\n    cells = "".join(f"<td>{html.escape(row)}</td>" for row in rows)\n    return f"<table>{cells}</table>"\n',
      [],
    ],
    [
      'plus concatenation of an escaped value',
      'import html\n\n\ndef row(name):\n    return "<td>" + html.escape(name) + "</td>"\n',
      [],
    ],
    [
      'a percent digit placeholder',
      'def title(year):\n    return "<title>%d</title>" % year\n',
      [],
    ],
    ['an int annotation', 'def row(count: int):\n    return f"<b>{count}</b>"\n', []],
    [
      'a range index',
      'def links(total):\n    return [f\'<a href="#{i}">{i}</a>\' for i in range(total)]\n',
      [],
    ],
    [
      'escaped then wrapped again',
      'import html\n\n\ndef bold(text):\n    out = html.escape(text)\n    out = f"<b>{out}</b>"\n    return out\n',
      [],
    ],
    [
      'an exception message',
      'def check(name):\n    raise ValueError(f"<div> is not allowed in {name}")\n',
      [],
    ],
    ['text that only looks like a tag', 'def cmp(a, b):\n    return f"if x<b then {b}"\n', []],
    ['no placeholder', 'def row():\n    return "<td>static</td>"\n', []],
    [
      'a test file',
      inFile('tests/test_mod.py', 'def helper(name):\n    return f"<td>{name}</td>"\n'),
      [],
    ],
  ]);
});
