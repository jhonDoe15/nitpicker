import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes, findingsOf } = createScripts();
afterEach(cleanup);

const WRITE = 'import sys\n\nsys.stdout.write("done")\n';

describe.skipIf(!enabled)('process-stream-access', () => {
  it('flags every way to reach the standard streams outside the composition root', () => {
    const [actual, expected] = outcomes([
      ['sys.stdout', WRITE, ['process-stream-access:3 sys.stdout']],
      [
        'sys.stderr',
        'import sys\n\nsys.stderr.write("x")\n',
        ['process-stream-access:3 sys.stderr'],
      ],
      [
        'the original streams',
        'import sys\n\nOUT = sys.__stdout__\nERR = sys.__stderr__\n',
        ['process-stream-access:3 sys.__stdout__', 'process-stream-access:4 sys.__stderr__'],
      ],
      [
        'print to the stream',
        'import sys\n\nprint("x", file=sys.stdout)\n',
        ['process-stream-access:3 sys.stdout'],
      ],
      [
        'a read-only fact',
        'import sys\n\nTTY = sys.stdout.isatty()\n',
        ['process-stream-access:3 sys.stdout'],
      ],
      [
        'an import alias',
        'import sys as system\n\nsystem.stdout.write("x")\n',
        ['process-stream-access:3 sys.stdout'],
      ],
      [
        'a from import with an alias',
        'from sys import stderr as err\n\nerr.write("x")\n',
        ['process-stream-access:3 sys.stderr'],
      ],
      [
        'a default value',
        'import sys\n\n\ndef run(out=sys.stdout):\n    out.write("x")\n',
        ['process-stream-access:4 sys.stdout'],
      ],
      [
        'getattr',
        'import sys\n\nOUT = getattr(sys, "stdout")\n',
        ['process-stream-access:3 sys.stdout'],
      ],
      [
        'sys.modules',
        'import sys\n\nOUT = sys.modules["sys"].stderr\n',
        ['process-stream-access:3 sys.stderr'],
      ],
      ['stdin', 'import sys\n\nTEXT = sys.stdin.read()\n', []],
      ['a stream parameter', 'def run(out):\n    out.write("x")\n', []],
      ['a TextIO parameter with print', 'def run(out):\n    print("x", file=out)\n', []],
      ['another module named sys', 'import system\n\nsystem.stdout.write("x")\n', []],
    ]);
    expect(actual).toEqual(expected);
  });

  it.each(['main.py', 'src/shop/cli.py', 'src/shop/__main__.py', 'src/shop/app.py'])(
    'allows the composition root %s',
    (file) => {
      expect(findingsOf({ [file]: WRITE })).toEqual([]);
    },
  );

  it('allows the main guard, test files and the modules the project lists as entry points', () => {
    const guarded = 'import sys\n\n\nif __name__ == "__main__":\n    sys.stdout.write("x")\n';
    const files = {
      'src/shop/guarded.py': guarded,
      'tests/test_out.py': WRITE,
      'src/shop/jobs.py': WRITE,
      'src/shop/other.py': WRITE,
      'pyproject.toml': '[project.scripts]\nshop-jobs = "shop.jobs:main"\n',
    };

    expect(findingsOf(files, { sourceRoots: ['src'] })).toEqual([
      'process-stream-access src/shop/other.py:3 sys.stdout',
    ]);
  });

  it('allows the files python.entryPoints names', () => {
    const files = { 'src/shop/jobs/run.py': WRITE, 'src/shop/other.py': WRITE };

    expect(
      findingsOf(files, { sourceRoots: ['src'], entryPoints: ['src/shop/jobs/*.py'] }),
    ).toEqual(['process-stream-access src/shop/other.py:3 sys.stdout']);
  });
});
