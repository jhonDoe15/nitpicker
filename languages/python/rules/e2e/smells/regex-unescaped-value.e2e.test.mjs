import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts();
afterEach(cleanup);

const RE = 'import re\n\n\n';

describe.skipIf(!enabled)('regex-unescaped-value', () => {
  it('flags an argument built into a pattern without re.escape', () => {
    const [actual, expected] = outcomes([
      [
        'an f-string',
        `${RE}def route(name: str):\n    return re.compile(f"^/{name}/")\n`,
        ['regex-unescaped-value:5 name'],
      ],
      [
        'a concatenation',
        `${RE}def route(name):\n    return re.match("^" + name, "x")\n`,
        ['regex-unescaped-value:5 name'],
      ],
      [
        'percent formatting',
        `${RE}def route(name):\n    return re.search("^%s$" % name, "x")\n`,
        ['regex-unescaped-value:5 name'],
      ],
      [
        'str.format',
        `${RE}def route(name):\n    return re.sub("^{}$".format(name), "", "x")\n`,
        ['regex-unescaped-value:5 name'],
      ],
      [
        'a local joined from an argument',
        `${RE}def route(names: list[str]):\n    joined = "|".join(names)\n    return re.compile(f"^(?:{joined})$")\n`,
        ['regex-unescaped-value:6 joined'],
      ],
      [
        'a comprehension over an argument',
        `${RE}def routes(names):\n    return [re.compile(f"^{n}") for n in names]\n`,
        ['regex-unescaped-value:5 n'],
      ],
      [
        'an imported function and the pattern keyword',
        'from re import findall\n\n\ndef words(name):\n    return findall(pattern=f"^{name}", string="x")\n',
        ['regex-unescaped-value:5 name'],
      ],
      [
        'an HTML escape',
        'import html\nimport re\n\n\ndef route(name):\n    return re.compile(f"^{html.escape(name)}$")\n',
        ['regex-unescaped-value:6 html.escape(name)'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('leaves escaped values, whole patterns and constants alone', () => {
    const [actual, expected] = outcomes([
      ['re.escape', `${RE}def route(name):\n    return re.compile(f"^/{re.escape(name)}/")\n`, []],
      ['a whole pattern', `${RE}def compile_it(pattern):\n    return re.compile(pattern)\n`, []],
      [
        'module constants',
        `${RE}PREFIX = "api"\n\n\ndef route():\n    return re.compile(f"^/{PREFIX}/")\n`,
        [],
      ],
      [
        'a number',
        `${RE}def digits(count: int):\n    return re.compile(rf"^\\d{{{count}}}$")\n`,
        [],
      ],
      [
        'a compiled pattern source',
        `${RE}def anchored(inner: re.Pattern[str]):\n    return re.compile(f"^(?:{inner.pattern})$")\n`,
        [],
      ],
      [
        'an escaped alternation',
        `${RE}def words(items):\n    return re.compile(f"^({'|'.join(map(re.escape, items))})$")\n`,
        [],
      ],
      [
        'a class constant, a length and a nullable number',
        `${RE}class Cells:\n    SEP = ","\n\n    def split(self, text, items, n: int | None):\n        return re.split(f"{self.SEP}{len(items)}{n}", text)\n`,
        [],
      ],
      ['module level code', `${RE}PREFIX = "api"\nROUTE = re.compile(f"^{PREFIX}")\n`, []],
    ]);
    expect(actual).toEqual(expected);
  });
});
