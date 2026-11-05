import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes: allOutcomes } = createScripts();
afterEach(cleanup);

const RULE = 'subprocess-without-timeout';

function outcomes(rows) {
  const [actual, expected] = allOutcomes(rows);
  const own = Object.fromEntries(
    Object.entries(actual).map(([name, found]) => [name, found.filter((f) => f.startsWith(RULE))]),
  );
  return [own, expected];
}

describe.skipIf(!enabled)('subprocess-without-timeout', () => {
  it('reports the run helpers without a timeout and passes those with one', () => {
    const [actual, expected] = outcomes([
      [
        'run, call, check_call and check_output without a timeout',
        'import subprocess\nfrom subprocess import check_output as out\n\n\ndef build(args):\n    subprocess.run(args, check=True)\n    subprocess.call(args)\n    subprocess.check_call(args, timeout=None)\n    return out(args)\n',
        [
          `${RULE}:6 subprocess.run`,
          `${RULE}:7 subprocess.call`,
          `${RULE}:8 subprocess.check_call`,
          `${RULE}:9 subprocess.check_output`,
        ],
      ],
      [
        'a timeout as a keyword, through options and through a partial',
        'import functools\nimport subprocess\n\nOPTIONS = {"timeout": 30, "check": True}\nrun = functools.partial(subprocess.run, timeout=30)\n\n\ndef build(args, **extra):\n    subprocess.run(args, timeout=30, check=True)\n    subprocess.run(args, **OPTIONS)\n    subprocess.run(args, **extra)\n    return run(args)\n',
        [],
      ],
      [
        'a partial without a timeout is reported where it is called',
        'import functools\nimport subprocess\n\nrun = functools.partial(subprocess.run, check=True)\n\n\ndef build(args):\n    return run(args)\n',
        [`${RULE}:8 subprocess.run`],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('reports Popen waits without a timeout', () => {
    const [actual, expected] = outcomes([
      [
        'wait and communicate on a held Popen and in a with block',
        'import subprocess\n\n\ndef build(args):\n    process = subprocess.Popen(args)\n    process.wait()\n    with subprocess.Popen(args, stdout=subprocess.PIPE) as child:\n        child.communicate()\n    return subprocess.Popen(args).wait(timeout=None)\n',
        [`${RULE}:6 Popen.wait`, `${RULE}:8 Popen.communicate`, `${RULE}:9 Popen.wait`],
      ],
      [
        'waits with a timeout, and receivers that are not a Popen',
        'import subprocess\n\n\ndef build(args, other):\n    process = subprocess.Popen(args)\n    process.wait(30)\n    process.communicate(None, 30)\n    process.communicate(timeout=30)\n    other.wait()\n    return other.communicate()\n',
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('reports asyncio process waits outside a deadline', () => {
    const [actual, expected] = outcomes([
      [
        'wait and communicate without a deadline, or with a None one',
        'import asyncio\n\nimport anyio\n\n\nasync def build(args):\n    process = await asyncio.create_subprocess_exec(*args)\n    await process.wait()\n    async with asyncio.timeout(None):\n        await process.communicate()\n    await anyio.run_process(args)\n',
        [
          `${RULE}:8 process.wait`,
          `${RULE}:10 process.communicate`,
          `${RULE}:11 anyio.run_process`,
        ],
      ],
      [
        'waits inside asyncio.timeout, wait_for and fail_after',
        'import asyncio\n\nimport anyio\n\n\nasync def build(args):\n    process = await asyncio.create_subprocess_exec(*args)\n    async with asyncio.timeout(30):\n        await process.communicate()\n    await asyncio.wait_for(process.wait(), timeout=30)\n    with anyio.fail_after(30):\n        await anyio.run_process(args)\n',
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('follows attributes of the class, and covers getoutput and lambdas', () => {
    const [actual, expected] = outcomes([
      [
        'a process held on self, getoutput and a lambda',
        'import asyncio\nimport subprocess\n\n\nclass Worker:\n    def __init__(self, args):\n        self.process = subprocess.Popen(args)\n\n    def stop(self):\n        self.process.wait()\n\n\ndef version():\n    return subprocess.getoutput("tool --version")\n\n\nasync def later(loop):\n    return await loop.run_in_executor(None, lambda: subprocess.run(["tool"]))\n',
        [`${RULE}:10 Popen.wait`, `${RULE}:14 subprocess.getoutput`, `${RULE}:18 subprocess.run`],
      ],
      [
        'a held process with a timeout, and asyncio.wait with a timeout',
        'import asyncio\nimport subprocess\n\nimport anyio\n\n\nclass Worker:\n    def __init__(self, args):\n        self.process = subprocess.Popen(args)\n\n    def stop(self):\n        self.process.wait(timeout=30)\n\n\nasync def run(args):\n    process = await asyncio.create_subprocess_exec(*args)\n    await asyncio.wait([asyncio.ensure_future(process.wait())], timeout=30)\n    async with await anyio.open_process(args) as child:\n        with anyio.fail_after(30):\n            await child.wait()\n',
        [],
      ],
      [
        'an anyio process waited without a deadline',
        'import anyio\n\n\nasync def run(args):\n    async with await anyio.open_process(args) as child:\n        await child.wait()\n',
        [`${RULE}:6 process.wait`],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('leaves tests out', () => {
    const [actual, expected] = outcomes([
      [
        'a test that runs a command',
        {
          file: 'tests/test_cli.py',
          code: 'import subprocess\n\n\ndef test_cli():\n    subprocess.run(["tool"])\n',
        },
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
