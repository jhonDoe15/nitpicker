import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const ruff = process.env.NITPICKER_RUFF ?? 'ruff';
const RULE = 'timeout-scope-path-without-checkpoint';
const RUFF_TIMEOUT_MS = 60_000;
const { cleanup, outcomes, findingsOf } = createScripts();
afterEach(cleanup);

const inAsync = (head, body) => `${head}\n\n\nasync def f(flag, items):\n${body}`;
const TRIO = 'import trio';
const ASYNCIO = 'import asyncio';
const finding = (line, subject) => [`${RULE}:${String(line)} ${subject}`];

function ruffLines(code) {
  const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-ruff-async-'));
  try {
    writeFileSync(path.join(directory, 'mod.py'), code);
    const run = spawnSync(
      ruff,
      ['check', '--isolated', '--select', 'ASYNC100', '--output-format', 'json', 'mod.py'],
      { cwd: directory, encoding: 'utf8', timeout: RUFF_TIMEOUT_MS },
    );
    return JSON.parse(run.stdout).map((entry) => entry.location.row);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe.skipIf(!enabled)('timeout scopes with a path that has no checkpoint', () => {
  it('reports the scope kinds of Trio, AnyIO and asyncio, with aliases', () => {
    const [actual, expected] = outcomes([
      [
        'trio.fail_after',
        inAsync(
          TRIO,
          '    with trio.fail_after(5):\n        if flag:\n            render()\n        else:\n            await trio.sleep(0)\n',
        ),
        finding(5, 'trio.fail_after: render()'),
      ],
      [
        'trio.move_on_after through an import rename',
        inAsync(
          'from trio import move_on_after as limit',
          '    with limit(5):\n        if flag:\n            await fetch()\n        else:\n            render()\n',
        ),
        finding(5, 'trio.move_on_after: render()'),
      ],
      [
        'anyio.fail_after',
        inAsync(
          'import anyio',
          '    with anyio.fail_after(5):\n        for item in items:\n            await send(item)\n        finish()\n',
        ),
        finding(5, 'anyio.fail_after: finish()'),
      ],
      [
        'asyncio.timeout',
        inAsync(
          ASYNCIO,
          '    async with asyncio.timeout(5):\n        if flag:\n            render()\n        else:\n            await fetch()\n',
        ),
        finding(5, 'asyncio.timeout: render()'),
      ],
      [
        'asyncio.timeout_at through a module rename',
        inAsync(
          'import asyncio as aio',
          '    async with aio.timeout_at(5):\n        if flag:\n            await fetch()\n        else:\n            render()\n',
        ),
        finding(5, 'asyncio.timeout_at: render()'),
      ],
      [
        'trio.CancelScope with a deadline',
        inAsync(
          TRIO,
          '    with trio.CancelScope(deadline=5):\n        if flag:\n            render()\n        else:\n            await trio.sleep(0)\n',
        ),
        finding(5, 'trio.CancelScope: render()'),
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('follows branches, loops, handlers and early exits', () => {
    const [actual, expected] = outcomes([
      [
        'an elif chain without a final else',
        inAsync(
          TRIO,
          '    with trio.fail_after(5):\n        if flag == 1:\n            await a()\n        elif flag == 2:\n            await b()\n',
        ),
        [],
      ],
      [
        'a for loop that may not run',
        inAsync(
          TRIO,
          '    with trio.fail_after(5):\n        for item in items:\n            await send(item)\n        finish()\n',
        ),
        finding(5, 'trio.fail_after: finish()'),
      ],
      [
        'a for loop with an else clause',
        inAsync(
          TRIO,
          '    with trio.fail_after(5):\n        for item in items:\n            await send(item)\n        else:\n            await done()\n',
        ),
        [],
      ],
      [
        'a loop that always runs',
        inAsync(
          TRIO,
          '    with trio.fail_after(5):\n        while True:\n            await trio.sleep(1)\n            work()\n',
        ),
        [],
      ],
      [
        'a while loop that may not run',
        inAsync(
          TRIO,
          '    with trio.fail_after(5):\n        while flag:\n            await trio.sleep(1)\n        work()\n',
        ),
        finding(5, 'trio.fail_after: work()'),
      ],
      [
        'an async for loop',
        inAsync(
          TRIO,
          '    with trio.fail_after(5):\n        async for item in items:\n            handle(item)\n',
        ),
        [],
      ],
      [
        'a return before the checkpoint',
        inAsync(
          TRIO,
          '    with trio.fail_after(5):\n        if flag:\n            return compute()\n        await fetch()\n',
        ),
        finding(5, 'trio.fail_after: compute()'),
      ],
      [
        'a break that skips the checkpoint',
        inAsync(
          TRIO,
          '    for item in items:\n        with trio.fail_after(5):\n            if flag:\n                break\n            await send(item)\n            render()\n            if item:\n                continue\n            await send(item)\n',
        ),
        [],
      ],
      [
        'a continue that skips the checkpoint',
        inAsync(
          TRIO,
          '    for item in items:\n        with trio.fail_after(5):\n            if flag:\n                render()\n                continue\n            await send(item)\n',
        ),
        finding(6, 'trio.fail_after: render()'),
      ],
      [
        'an except handler after a checkpoint in the try body',
        inAsync(
          TRIO,
          '    with trio.fail_after(5):\n        try:\n            await fetch()\n        except ValueError as error:\n            recover()\n            raise\n',
        ),
        [],
      ],
      [
        'an except handler when the try body has no checkpoint',
        inAsync(
          TRIO,
          '    with trio.fail_after(5):\n        try:\n            risky()\n        except ValueError:\n            recover()\n        if flag:\n            await fetch()\n',
        ),
        finding(5, 'trio.fail_after: recover()'),
      ],
      [
        'a finally clause that checkpoints',
        inAsync(
          TRIO,
          '    with trio.fail_after(5):\n        try:\n            work()\n        finally:\n            await close()\n',
        ),
        [],
      ],
      [
        'a match statement without a wildcard case',
        inAsync(
          TRIO,
          '    with trio.fail_after(5):\n        match flag:\n            case 1:\n                await a()\n            case 2:\n                await b()\n        render()\n',
        ),
        finding(5, 'trio.fail_after: render()'),
      ],
      [
        'a match statement with a wildcard case',
        inAsync(
          TRIO,
          '    with trio.fail_after(5):\n        match flag:\n            case 1:\n                await a()\n            case _:\n                await b()\n',
        ),
        [],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('skips cheap paths, shielded scopes and nested definitions', () => {
    const [actual, expected] = outcomes([
      [
        'an early return of a cached value',
        inAsync(
          TRIO,
          '    with trio.fail_after(5):\n        if flag in items:\n            return items.get(flag)\n        return await fetch()\n',
        ),
        [],
      ],
      [
        'logging on the other branch',
        inAsync(
          TRIO,
          '    with trio.fail_after(5):\n        if flag:\n            await fetch()\n        else:\n            logger.info("skipped")\n',
        ),
        [],
      ],
      [
        'scheduling on the other branch',
        inAsync(
          TRIO,
          '    with trio.fail_after(5):\n        if flag:\n            await fetch()\n        else:\n            nursery.start_soon(work)\n',
        ),
        [],
      ],
      [
        'a shielded scope without a deadline',
        inAsync(
          'import anyio',
          '    with anyio.CancelScope(shield=True):\n        if flag:\n            await close()\n        else:\n            release()\n',
        ),
        [],
      ],
      [
        'a definition inside the scope',
        inAsync(
          TRIO,
          '    with trio.fail_after(5):\n        if flag:\n            def later():\n                return render()\n        await fetch()\n',
        ),
        [],
      ],
      [
        'a scope from another library',
        inAsync(
          'import other',
          '    with other.fail_after(5):\n        if flag:\n            render()\n        else:\n            await fetch()\n',
        ),
        [],
      ],
      [
        'a test file',
        {
          file: 'tests/test_scopes.py',
          code: inAsync(
            TRIO,
            '    with trio.fail_after(5):\n        if flag:\n            render()\n        else:\n            await fetch()\n',
          ),
        },
        [],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('treats an await of a coroutine that never suspends as no checkpoint', () => {
    const quiet =
      'import asyncio\n\n\nasync def quiet():\n    return render()\n\n\nasync def loud():\n    await asyncio.sleep(0)\n';
    const [actual, expected] = outcomes([
      [
        'a scope that only awaits the quiet coroutine',
        `${quiet}\n\nasync def f():\n    async with asyncio.timeout(5):\n        await quiet()\n`,
        finding(13, 'asyncio.timeout: quiet()'),
      ],
      [
        'a scope that also awaits a coroutine that suspends',
        `${quiet}\n\nasync def f():\n    async with asyncio.timeout(5):\n        await quiet()\n        await loud()\n`,
        [],
      ],
      [
        'a decorated coroutine',
        `${quiet.replace('async def quiet', '@wrap\nasync def quiet')}\n\nasync def f():\n    async with asyncio.timeout(5):\n        await quiet()\n`,
        [],
      ],
      [
        'wait_for of the quiet coroutine',
        `${quiet}\n\nasync def f():\n    await asyncio.wait_for(quiet(), 5)\n`,
        finding(13, 'asyncio.wait_for(quiet): render()'),
      ],
      [
        'wait_for of a coroutine that suspends',
        `${quiet}\n\nasync def f():\n    await asyncio.wait_for(loud(), 5)\n`,
        [],
      ],
      [
        'wait_for of a coroutine from another module',
        'import asyncio\nfrom other import fetch\n\n\nasync def f():\n    await asyncio.wait_for(fetch(), 5)\n',
        [],
      ],
    ]);

    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('timeout scopes that Ruff ASYNC100 reports', () => {
  it('never reports a scope without any checkpoint, which Ruff owns', () => {
    const code = [
      'import asyncio',
      'import trio',
      'from trio import fail_at',
      '',
      '',
      'async def f(flag):',
      '    async with asyncio.timeout(5):',
      '        render()',
      '    with trio.move_on_after(5):',
      '        render()',
      '    with fail_at(5):',
      '        render()',
      '    with trio.fail_after(5):',
      '        if flag:',
      '            render()',
      '        else:',
      '            await trio.sleep(0)',
      '',
    ].join('\n');

    const owned = findingsOf({ 'mod.py': code }).filter((entry) => entry.startsWith(RULE));

    expect(ruffLines(code)).toEqual([7, 9, 11]);
    expect(owned).toEqual([`${RULE} mod.py:13 trio.fail_after: render()`]);
  });
});
