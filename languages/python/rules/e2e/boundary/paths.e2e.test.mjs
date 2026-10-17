import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes, findingsOf } = createScripts();
afterEach(cleanup);

const inFile = (file, code) => ({ file, code });
function inAdapters(rows) {
  return rows.map(([name, code, found]) => [name, inFile('adapters/m.py', code), found]);
}

describe.skipIf(!enabled)('unsafe-path-join', () => {
  const read = (body, head = 'from pathlib import Path\n\nBASE = Path("/srv")\n') =>
    `${head}\n\ndef read(name):\n${body}`;

  it('flags a path built from a parameter that reaches a file operation unchecked', () => {
    const [actual, expected] = outcomes([
      ['a slash join', read('    return (BASE / name).read_text()\n'), ['unsafe-path-join:7 read']],
      [
        'through a variable',
        read('    target = BASE / name\n    return target.read_text()\n'),
        ['unsafe-path-join:8 read'],
      ],
      [
        'os.path.join with open',
        'import os\n\n\ndef read(name):\n    return open(os.path.join("/srv", name))\n',
        ['unsafe-path-join:5 read'],
      ],
      [
        'an f-string',
        'def read(name):\n    return open(f"/srv/{name}")\n',
        ['unsafe-path-join:2 read'],
      ],
      [
        'joinpath',
        read('    return BASE.joinpath(name).read_bytes()\n'),
        ['unsafe-path-join:7 read'],
      ],
      [
        'shutil',
        'import shutil\nfrom pathlib import Path\n\n\ndef copy(name):\n    shutil.copy(Path("/srv") / name, "/out")\n',
        ['unsafe-path-join:6 copy'],
      ],
      [
        'send_from_directory',
        'from flask import send_from_directory\n\n\ndef download(name):\n    return send_from_directory("/srv", name)\n',
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('follows a parameter through loops, closures, models, helpers and archives', () => {
    const files = {
      'src/shop/files/locate.py':
        'from pathlib import Path\n\nROOT = Path("/srv/data").resolve()\n\n\ndef locate(name: str) -> Path:\n    return ROOT / name\n',
      'src/shop/files/reads.py':
        'from shop.files.locate import ROOT, locate\n\n\ndef via(name):\n    return locate(name).read_text()\n\n\ndef loop(names: list[str]):\n    for name in names:\n        (ROOT / name).read_text()\n\n\ndef comprehension(names):\n    return [(ROOT / name).read_text() for name in names]\n\n\ndef closure(name):\n    def inner():\n        return (ROOT / name).read_text()\n\n    return inner()\n',
      'src/shop/files/sinks.py':
        'import zipfile\nfrom dataclasses import dataclass\nfrom pathlib import Path\n\nROOT = Path("/srv/data").resolve()\n\n\n@dataclass(frozen=True)\nclass Download:\n    filename: str\n\n\ndef model(request: Download):\n    return (ROOT / request.filename).read_text()\n\n\ndef archive(name):\n    return zipfile.ZipFile(ROOT / name)\n\n\ndef pattern(name):\n    return ROOT.glob(f"{name}/*")\n\n\ndef parent(name):\n    return (ROOT / Path(name).parent / "a.txt").read_text()\n',
    };

    expect(findingsOf(files, { sourceRoots: ['src'] })).toEqual([
      'unsafe-path-join src/shop/files/reads.py:5 via',
      'unsafe-path-join src/shop/files/reads.py:10 loop',
      'unsafe-path-join src/shop/files/reads.py:14 comprehension',
      'unsafe-path-join src/shop/files/reads.py:19 inner',
      'unsafe-path-join src/shop/files/sinks.py:14 model',
      'unsafe-path-join src/shop/files/sinks.py:18 archive',
      'unsafe-path-join src/shop/files/sinks.py:22 pattern',
      'unsafe-path-join src/shop/files/sinks.py:26 parent',
    ]);
  });

  it('does not accept an unrelated check or a lexical containment test', () => {
    const [actual, expected] = outcomes([
      [
        'an unrelated startswith',
        read(
          '    if name.startswith("_"):\n        raise ValueError(name)\n    return (BASE / name).read_text()\n',
        ),
        ['unsafe-path-join:9 read'],
      ],
      [
        'is_relative_to without resolve',
        read(
          '    target = BASE / name\n    if not target.is_relative_to(BASE):\n        raise ValueError(name)\n    return target.read_text()\n',
        ),
        ['unsafe-path-join:10 read'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('accepts a resolved path that is checked to stay inside the base', () => {
    const [actual, expected] = outcomes([
      [
        'is_relative_to with a raise',
        read(
          '    target = (BASE / name).resolve()\n    if not target.is_relative_to(BASE):\n        raise ValueError(name)\n    return target.read_text()\n',
        ),
        [],
      ],
      [
        'relative_to in a try that exits',
        read(
          '    target = (BASE / name).resolve()\n    try:\n        target.relative_to(BASE)\n    except ValueError as error:\n        raise LookupError(name) from error\n    return target.read_text()\n',
        ),
        [],
      ],
      [
        'a startswith check',
        'import os\n\n\ndef read(name):\n    target = os.path.realpath(os.path.join("/srv", name))\n    if not target.startswith("/srv/"):\n        raise ValueError(name)\n    return open(target)\n',
        [],
      ],
      ['an integer parameter', read('    return (BASE / f"{int(name)}.txt").read_text()\n'), []],
      [
        'a path used as given, without a join',
        'from pathlib import Path\n\n\ndef remove(name: str):\n    Path(name).unlink()\n',
        [],
      ],
      ['only the file name is used', read('    return (BASE / Path(name).name).read_text()\n'), []],
      ['a constant path', read('    return (BASE / "a.txt").read_text()\n'), []],
      [
        'a Literal parameter',
        'from typing import Literal\nfrom pathlib import Path\n\n\ndef read(name: Literal["a", "b"]):\n    return (Path("/srv") / name).read_text()\n',
        [],
      ],
      [
        'a test file',
        inFile('tests/test_a.py', 'def read(name):\n    return open(f"/srv/{name}")\n'),
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
