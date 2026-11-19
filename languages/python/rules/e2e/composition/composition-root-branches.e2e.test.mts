import { expect, it } from 'vitest';
import { useScripts } from '../../test-support/python-rule-scripts.mts';

const { findingsOf, describeRules } = useScripts({
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
});

const RULE = 'branch-in-composition-root';
const lines = (...rows: string[]) => `${rows.join('\n')}\n`;

const branches = (code: string, file = 'shop/main.py', extra = {}) =>
  findingsOf({
    'shop/__init__.py': '',
    'shop/api/__init__.py': '',
    [file]: code,
    ...extra,
  }).filter((finding) => finding.startsWith(`${RULE} `));

describeRules(RULE, () => {
  it.each([
    ['an if', lines('def build(mode):', '    if mode:', '        return 1', '    return 2'), 'if'],
    [
      'a conditional expression',
      lines('def build(mode):', '    return 1 if mode else 2'),
      'conditional expression',
    ],
    [
      'a match statement',
      lines('def build(mode):', '    match mode:', '        case "a":', '            return 1'),
      'match',
    ],
    ['a for loop', lines('for name in ("a", "b"):', '    print(name)'), 'loop'],
    ['a while loop', lines('while True:', '    break'), 'loop'],
    ['a default through or', lines('PORT = settings.get("port") or 3000'), 'default value'],
    [
      'a default call through or',
      lines('PORT = settings.get("port") or default_port()'),
      'default value',
    ],
  ])('reports %s', (_name, code, kind) => {
    const found = branches(code);

    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(new RegExp(`^${RULE} shop/main\\.py:\\d+ ${kind}$`, 'u'));
  });

  it.each([
    ['a lookup table', lines('BACKENDS = {"a": 1, "b": 2}', 'STORE = BACKENDS[settings.store]')],
    ['a lookup with get', lines('STORE = {"a": 1}.get(settings.store)')],
    ['the main guard', lines('if __name__ == "__main__":', '    run()')],
    ['a guard that only raises', lines('if url is None:', '    raise RuntimeError("missing")')],
    [
      'an import for type checking',
      lines('from typing import TYPE_CHECKING', '', 'if TYPE_CHECKING:', '    import shop'),
    ],
    [
      'and and or between plain values',
      lines('READY = first and second', 'NAME = first or second'),
    ],
    [
      'a try statement',
      lines('try:', '    import uvloop', 'except ImportError:', '    uvloop = None'),
    ],
  ])('allows %s', (_name, code) => {
    expect(branches(code)).toEqual([]);
  });

  it('reports a server.py and a composition_root package of the root package', () => {
    const code = lines('if flag:', '    pass');

    expect(branches(code, 'shop/server.py')).toHaveLength(1);
    expect(branches(code, 'shop/composition_root.py')).toHaveLength(1);
    expect(branches(code, 'shop/composition_root/wiring.py')).toHaveLength(1);
  });

  it('leaves other files alone', () => {
    const code = lines('if flag:', '    pass');

    expect(branches(code, 'shop/api/main.py')).toEqual([]);
    expect(branches(code, 'shop/views.py')).toEqual([]);
    expect(branches(code, 'tests/test_main.py', { 'shop/main.py': '' })).toEqual([]);
  });
});
