import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts();
afterEach(cleanup);

describe.skipIf(!enabled)('unclosed-inline-resource', () => {
  it('flags a file, URL or connection opened and used in one expression', () => {
    const [actual, expected] = outcomes([
      [
        'a file read at once',
        'def first(path: str) -> str:\n    return open(path, encoding="utf-8").readline()\n',
        ['unclosed-inline-resource:2 open()'],
      ],
      [
        'a file passed to a reader',
        'import json\n\n\ndef load(path: str) -> object:\n    return json.load(open(path, encoding="utf-8"))\n',
        ['unclosed-inline-resource:5 open()'],
      ],
      [
        'a path opened through a typed name or a join',
        'from pathlib import Path\n\n\ndef read(path: Path) -> str:\n    return (path / "x").open().read() + path.open().read()\n',
        ['unclosed-inline-resource:5 open()', 'unclosed-inline-resource:5 open()'],
      ],
      [
        'a URL, an archive and a database',
        'import sqlite3\nimport zipfile\nfrom urllib.request import urlopen\n\n\ndef fetch(url: str, path: str) -> object:\n    body = urlopen(url, timeout=5).read()\n    names = zipfile.ZipFile(path).namelist()\n    return body, names, sqlite3.connect(path).execute("select 1")\n',
        [
          'unclosed-inline-resource:7 urlopen()',
          'unclosed-inline-resource:8 ZipFile()',
          'unclosed-inline-resource:9 connect()',
        ],
      ],
      [
        'a loop source and a wrapper, reported once',
        'import io\nimport zipfile\nfrom pathlib import Path\nfrom urllib.request import urlopen\n\n\ndef lines(path: str, url: str) -> list[str]:\n    found = [name for name in zipfile.ZipFile(path).namelist()]\n    for line in io.TextIOWrapper(urlopen(url, timeout=5)):\n        found.append(line)\n    return found + [Path.home().open().read()]\n',
        [
          'unclosed-inline-resource:8 ZipFile()',
          'unclosed-inline-resource:9 TextIOWrapper()',
          'unclosed-inline-resource:11 open()',
        ],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('leaves owned, returned and closed handles alone', () => {
    const [actual, expected] = outcomes([
      [
        'with blocks',
        'import json\nfrom contextlib import closing\nfrom urllib.request import urlopen\n\n\ndef load(path: str, url: str) -> object:\n    with open(path) as handle, closing(urlopen(url, timeout=5)) as page:\n        return json.load(handle), page.read()\n',
        [],
      ],
      [
        'what ruff SIM115 reports outside a return',
        'import io\nfrom pathlib import Path\n\n\ndef read(path: str) -> str:\n    text = open(path).read() + Path(path).open().read()\n    lines = [line for line in io.TextIOWrapper(open(path, "rb"))]\n    return text + "".join(lines)\n',
        [],
      ],
      [
        'a handle handed to a response or a wrapper class',
        'import sqlite3\n\n\ndef stream(path: str) -> object:\n    return StreamingResponse(open(path, "rb"))\n\n\nclass Store:\n    def __init__(self, path: str) -> None:\n        self.db = Database(sqlite3.connect(path))\n',
        [],
      ],
      [
        'directory iterators and in-memory handles',
        'import io\nimport os\nimport sqlite3\nimport zipfile\n\n\ndef names(path: str, data: bytes) -> object:\n    found = [entry.name for entry in os.scandir(path)]\n    inside = zipfile.ZipFile(io.BytesIO(data)).namelist()\n    return found, inside, sqlite3.connect(":memory:").execute("select 1")\n',
        [],
      ],
      [
        'an exit stack',
        'from contextlib import ExitStack\n\n\ndef read(paths: list[str]) -> list[str]:\n    with ExitStack() as stack:\n        return [stack.enter_context(open(p)).read() for p in paths]\n',
        [],
      ],
      [
        'a returned or stored handle',
        'from typing import IO\n\n\ndef handle(path: str) -> IO[str]:\n    return open(path)\n\n\nclass Log:\n    def __init__(self, path: str) -> None:\n        self.out = open(path, "a")\n',
        [],
      ],
      [
        'whole-file reads and a method named open on something else',
        'from pathlib import Path\n\n\ndef read(path: Path, door: object) -> str:\n    door.open().close()\n    return path.read_text() + Path("x").read_text()\n',
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('leaves tests alone', () => {
    const [actual] = outcomes([
      [
        'a fixture read in a test',
        {
          file: 'tests/test_data.py',
          code: 'def test_data() -> None:\n    assert open("data.txt").read()\n',
        },
        [],
      ],
    ]);
    expect(actual).toEqual({ 'a fixture read in a test': [] });
  });
});
