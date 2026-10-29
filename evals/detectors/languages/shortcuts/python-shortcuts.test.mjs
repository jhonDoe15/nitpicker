import { describe, expect, it } from 'vitest';
import { toTree } from '../../tree.mjs';
import { detectLanguageCodeShortcuts } from './index.mjs';

const FILE = 'src/demo/cart.py';
const detect = (before, after) =>
  detectLanguageCodeShortcuts(toTree({ [FILE]: before }), toTree({ [FILE]: after }));
const kinds = (found) => found.map((shortcut) => shortcut.kind);

const BASE = 'def total(lines):\n    return sum(lines)\n';
const added = (code) => `${BASE}\n\n${code}`;

describe('Python Any', () => {
  it('reports a use of Any, wherever it appears in an annotation', () => {
    const found = detect(
      BASE,
      added('def load(raw: dict[str, Any]) -> typing.Any:\n    return raw\n'),
    );
    expect(found).toMatchObject([
      { category: 'code-shortcuts', kind: 'any', path: FILE, line: 5, detail: 'Any type' },
      { kind: 'any' },
    ]);
  });

  it('does not report importing Any, in one line or a parenthesised list', () => {
    expect(detect(BASE, `from typing import Any\n${BASE}`)).toEqual([]);
    expect(detect(BASE, `from typing import (\n    Any,\n    Optional,\n)\n${BASE}`)).toEqual([]);
  });

  it('ignores Any in strings, comments and longer names', () => {
    const code = added('# Any value\nNAME = "Any"\nAnyway = 1\nmock.ANY\n');
    expect(detect(BASE, code)).toEqual([]);
  });

  it('reports only the occurrences added to a file that already had one', () => {
    const before = `${BASE}\ndef a(x: Any) -> None:\n    pass\n`;
    expect(detect(before, `# moved\n${before}`)).toEqual([]);
    expect(kinds(detect(before, `${before}\ndef b(x: Any) -> None:\n    pass\n`))).toEqual(['any']);
  });
});

describe('Python cast', () => {
  it.each([
    ['typing.cast', 'typing.cast(int, value)', 'int'],
    ['t.cast', 't.cast("list[int]", value)', '"list[int]"'],
    ['a bare cast imported from typing', 'cast(dict[str, int], value)', 'dict[str, int]'],
  ])('reports %s', (_name, call, type) => {
    const code = added(`from typing import cast\n\nX = ${call}\n`);
    expect(detect(BASE, code)).toMatchObject([
      { kind: 'type-assertion', detail: `type assertion: cast(${type}, ...)` },
    ]);
  });

  it('does not report a cast that is not typing.cast', () => {
    expect(detect(BASE, added('X = value.cast(int)\nY = cast(int, value)\n'))).toEqual([]);
    expect(detect(BASE, added('X = "typing.cast(int, value)"\n'))).toEqual([]);
  });

  it('takes the type up to the first comma outside brackets', () => {
    const code = added('Y = typing.cast(dict[str, int], load(1, 2))\n');
    expect(detect(BASE, code)[0].detail).toBe('type assertion: cast(dict[str, int], ...)');
  });
});

describe('Python swallowed errors', () => {
  it.each([
    ['a bare except', 'except:\n        pass'],
    ['except Exception', 'except Exception:\n        pass'],
    ['except BaseException as e', 'except BaseException as e:\n        pass'],
    ['except in a tuple', 'except (ValueError, Exception):\n        pass'],
    ['an ellipsis body', 'except Exception:\n        ...'],
    ['a return-only body', 'except Exception:\n        return None'],
    ['a return of a literal', 'except Exception:\n        return 0'],
    ['a one-line body', 'except Exception: pass'],
    ['a body with only a comment and pass', 'except Exception:\n        # later\n        pass'],
    ['a continue in a loop', 'except Exception:\n        continue'],
  ])('reports %s', (_name, handler) => {
    const code = added(`def load():\n    try:\n        run()\n    ${handler}\n`);
    expect(detect(BASE, code)).toMatchObject([{ kind: 'ignored-error' }]);
  });

  it.each([
    ['a narrow exception that only passes', 'except KeyError:\n        pass'],
    ['a narrow exception that returns a constant', 'except OSError:\n        return DEFAULT'],
    ['a broad exception that returns a constant', 'except Exception:\n        return DEFAULT'],
  ])('reports %s as an ignored error', (_name, handler) => {
    const code = added(`def load():\n    try:\n        run()\n    ${handler}\n`);
    expect(detect(BASE, code)).toMatchObject([{ kind: 'ignored-error' }]);
  });

  it.each([
    ['logging the error', 'except Exception:\n        log.exception("x")'],
    ['returning a computed value', 'except Exception:\n        return fallback()'],
    ['pass after other work', 'except Exception:\n        cleanup()\n        pass'],
    ['a bare except that acts', 'except:\n        cleanup()'],
  ])('reports %s as a broad catch', (_name, handler) => {
    const code = added(`def load():\n    try:\n        run()\n    ${handler}\n`);
    expect(detect(BASE, code)).toMatchObject([{ kind: 'broad-catch' }]);
  });

  it.each([
    ['a narrow exception that acts', 'except KeyError:\n        log.warning("x")'],
    ['re-raising with the cause', 'except Exception as e:\n        raise RuntimeError("x") from e'],
    ['re-raising', 'except Exception:\n        cleanup()\n        raise'],
  ])('does not report %s', (_name, handler) => {
    const code = added(`def load():\n    try:\n        run()\n    ${handler}\n`);
    expect(detect(BASE, code)).toEqual([]);
  });

  it('ends the body at the next line that is not indented under the clause', () => {
    const code = added(
      'def load():\n    try:\n        run()\n    except Exception:\n        pass\n    finally:\n        cleanup()\n',
    );
    expect(kinds(detect(BASE, code))).toEqual(['ignored-error']);
    const other = added(
      'def load():\n    try:\n        run()\n    except Exception:\n        pass\n        notify()\n',
    );
    expect(kinds(detect(BASE, other))).toEqual(['broad-catch']);
  });

  it('reports suppress(Exception)', () => {
    expect(kinds(detect(BASE, added('with suppress(Exception):\n    run()\n')))).toEqual([
      'ignored-error',
    ]);
  });
});

describe('Python files', () => {
  it('reports a new file in full and ignores an unchanged one', () => {
    const tree = toTree({ [FILE]: BASE, 'src/demo/new.py': 'def f(x: Any):\n    pass\n' });
    expect(kinds(detectLanguageCodeShortcuts(toTree({ [FILE]: BASE }), tree))).toEqual(['any']);
    expect(detectLanguageCodeShortcuts(tree, tree)).toEqual([]);
  });

  it('allows Any and cast in test files but not a swallowed error', () => {
    const test = 'tests/test_cart.py';
    const body =
      'def test_a(x: Any):\n    try:\n        run()\n    except Exception:\n        pass\n';
    expect(kinds(detectLanguageCodeShortcuts(toTree({}), toTree({ [test]: body })))).toEqual([
      'ignored-error',
    ]);
  });
});
