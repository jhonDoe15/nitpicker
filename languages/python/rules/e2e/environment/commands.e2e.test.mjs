import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes, findingsOf } = createScripts();
afterEach(cleanup);

describe.skipIf(!enabled)('shell-command', () => {
  it('flags the ways of running a shell that ruff does not report', () => {
    const [actual, expected] = outcomes([
      [
        'sh -c',
        'import subprocess\n\n\ndef f(cmd):\n    subprocess.run(["sh", "-c", cmd], check=True)\n',
        ['shell-command:5 subprocess.run'],
      ],
      [
        'a shell by path',
        'import subprocess\n\n\ndef f(cmd):\n    subprocess.Popen(("/bin/bash", "-c", cmd))\n',
        ['shell-command:5 subprocess.Popen'],
      ],
      [
        'powershell',
        'import subprocess\n\n\ndef f(cmd):\n    subprocess.run(["powershell.exe", "-Command", cmd])\n',
        ['shell-command:5 subprocess.run'],
      ],
      [
        'shell set by a variable',
        'import subprocess\n\n\ndef f(cmd, use_shell):\n    subprocess.run(cmd, shell=use_shell)\n',
        ['shell-command:5 subprocess.run'],
      ],
      [
        'shell in a keyword dictionary',
        'import subprocess\n\n\ndef f(cmd):\n    subprocess.run(cmd, **{"shell": True})\n',
        ['shell-command:5 subprocess.run'],
      ],
      [
        'asyncio.create_subprocess_shell',
        'import asyncio\n\n\nasync def f(cmd):\n    await asyncio.create_subprocess_shell(cmd)\n',
        ['shell-command:5 asyncio.create_subprocess_shell'],
      ],
      [
        'pty.spawn',
        'import pty\n\n\ndef f(cmd):\n    return pty.spawn(["bash", "-c", cmd])\n',
        ['shell-command:5 pty.spawn'],
      ],
      [
        'os.execvp',
        'import os\n\n\ndef f(cmd):\n    os.execvp("sh", ["sh", "-c", cmd])\n',
        ['shell-command:5 os.execvp'],
      ],
      [
        'os.spawnlp',
        'import os\n\n\ndef f(cmd):\n    return os.spawnlp(os.P_WAIT, "sh", "sh", "-c", cmd)\n',
        ['shell-command:5 os.spawnlp'],
      ],
      [
        'a program with its arguments',
        'import subprocess\n\n\ndef f():\n    subprocess.run(["git", "status"], check=True)\n',
        [],
      ],
      [
        'a shell script file',
        'import subprocess\n\n\ndef f(path):\n    subprocess.run(["bash", path], check=True)\n',
        [],
      ],
      [
        'shell=False',
        'import subprocess\n\n\ndef f(cmd):\n    subprocess.run(cmd, shell=False)\n',
        [],
      ],
      [
        'a test file',
        {
          file: 'tests/test_a.py',
          code: 'import subprocess\n\n\ndef f(cmd):\n    subprocess.run(["sh", "-c", cmd])\n',
        },
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});

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
      [
        'a star import',
        'from sys import *\n\nstdout.write("x")\n',
        ['process-stream-access:1 from sys import *'],
      ],
      ['a parameter called sys', 'def run(sys):\n    sys.stdout.write("x")\n', []],
      ['a class called sys', 'class sys:\n    stdout = 1\n\n\nOUT = sys.stdout\n', []],
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
