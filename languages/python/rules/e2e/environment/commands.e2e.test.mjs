import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts();
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

describe.skipIf(!enabled)('sql-string-formatting', () => {
  it('flags a formatted query that reaches an execute call', () => {
    const [actual, expected] = outcomes([
      [
        'an f-string',
        'def f(cursor, table):\n    cursor.execute(f"SELECT * FROM {table}")\n',
        ['sql-string-formatting:2 cursor.execute'],
      ],
      [
        'concatenation',
        'def f(cursor, ident):\n    cursor.execute("SELECT * FROM users WHERE id = " + ident)\n',
        ['sql-string-formatting:2 cursor.execute'],
      ],
      [
        'percent formatting',
        'def f(cursor, ident):\n    cursor.execute("SELECT * FROM users WHERE id = %s" % ident)\n',
        ['sql-string-formatting:2 cursor.execute'],
      ],
      [
        'format',
        'def f(cursor, ident):\n    cursor.execute("DELETE FROM users WHERE id = {}".format(ident))\n',
        ['sql-string-formatting:2 cursor.execute'],
      ],
      [
        'a name bound to the query',
        'def f(cursor, ident):\n    query = f"UPDATE users SET name = {ident} WHERE 1"\n    cursor.execute(query)\n',
        ['sql-string-formatting:3 cursor.execute'],
      ],
      [
        'SQLAlchemy text',
        'from sqlalchemy import text\n\n\ndef f(session, ident):\n    session.execute(text(f"SELECT * FROM users WHERE id = {ident}"))\n',
        ['sql-string-formatting:5 sqlalchemy.text'],
      ],
      [
        'a Django raw query',
        'def f(model, ident):\n    return model.objects.raw("SELECT * FROM t WHERE id = %s" % ident)\n',
        ['sql-string-formatting:2 model.objects.raw'],
      ],
      [
        'parameters',
        'def f(cursor, ident):\n    cursor.execute("SELECT * FROM users WHERE id = %s", (ident,))\n',
        [],
      ],
      ['a fixed query', 'def f(cursor):\n    cursor.execute("SELECT * FROM users")\n', []],
      [
        'prose that mentions select and from',
        'def f(choices, name):\n    raise ValueError(f"Please select one option from {choices}, not {name}")\n',
        [],
      ],
      [
        'prose bound to a name that is not executed',
        'def f(name):\n    message = f"Update the settings to set {name} as default"\n    return message\n',
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
