import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';
import { createRuleChecker } from '../../test-support/python-rule-harness.mjs';
import { ingestRulesReport } from '../../../ingest/rules-report.mjs';
import { applyPythonExceptions } from '../../../adapters/configuration/python-exceptions.mjs';
import { applyRuleHints } from '../../rule-hints.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts();
afterEach(cleanup);

const RULE = 'unshielded-cleanup-await';
const indent = (text, by) => text.replace(/^(?=.)/gmu, ' '.repeat(by));

function cleanupCode(handler, imports = 'import trio') {
  return `${imports}\n\n\nasync def run(resource, work):\n    try:\n        await work()\n${indent(handler, 4)}\n`;
}

const found = (line, subject) => [`${RULE}:${String(line)} ${subject}`];
const FINALLY = 'finally:\n';

describe.skipIf(!enabled)('unshielded-cleanup-await under Trio and AnyIO', () => {
  it('reports an await that a cancellation can interrupt', () => {
    const cases = [
      [
        'finally',
        cleanupCode(`${FINALLY}    await resource.aclose()`),
        found(8, 'await resource.aclose() in finally of run'),
      ],
      [
        'trio.Cancelled handler',
        cleanupCode('except trio.Cancelled:\n    await resource.aclose()\n    raise'),
        found(8, 'await resource.aclose() in except trio.Cancelled of run'),
      ],
      [
        'tuple with a cancellation class',
        cleanupCode('except (ValueError, trio.Cancelled):\n    await resource.aclose()\n    raise'),
        found(8, 'await resource.aclose() in except (ValueError, trio.Cancelled) of run'),
      ],
      [
        'AnyIO cancellation class',
        cleanupCode(
          'except anyio.get_cancelled_exc_class():\n    await resource.aclose()\n    raise',
          'import anyio',
        ),
        found(8, 'await resource.aclose() in except anyio.get_cancelled_exc_class() of run'),
      ],
      [
        'aliased import',
        cleanupCode(`${FINALLY}    await resource.aclose()`, 'import trio as t'),
        found(8, 'await resource.aclose() in finally of run'),
      ],
      [
        'async with in finally',
        cleanupCode(`${FINALLY}    async with lock:\n        pass`),
        found(8, 'async with lock in finally of run'),
      ],
      [
        'async for in finally',
        cleanupCode(`${FINALLY}    async for item in resource:\n        pass`),
        found(8, 'async for resource in finally of run'),
      ],
      [
        'deadline without a shield',
        cleanupCode(`${FINALLY}    with trio.move_on_after(5):\n        await resource.aclose()`),
        found(9, 'await resource.aclose() in finally of run'),
      ],
      [
        'shield only around other code',
        cleanupCode(
          `${FINALLY}    with trio.move_on_after(5, shield=True):\n        resource.flush()\n    await resource.aclose()`,
        ),
        found(10, 'await resource.aclose() in finally of run'),
      ],
      [
        'first await only',
        cleanupCode(`${FINALLY}    await first()\n    await second()`),
        found(8, 'await first() in finally of run'),
      ],
    ];
    const [actual, expected] = outcomes(cases);

    expect(actual).toEqual(expected);
  });

  it('accepts shielded, bounded and non-cancellable cleanup', () => {
    const cases = [
      [
        'move_on_after with shield',
        cleanupCode(
          `${FINALLY}    with trio.move_on_after(5, shield=True):\n        await resource.aclose()`,
        ),
        [],
      ],
      [
        'fail_after with shield',
        cleanupCode(
          `${FINALLY}    with trio.fail_after(5, shield=True):\n        await resource.aclose()`,
        ),
        [],
      ],
      [
        'AnyIO move_on_after',
        cleanupCode(
          `${FINALLY}    with anyio.move_on_after(5, shield=True):\n        await resource.aclose()`,
          'import anyio',
        ),
        [],
      ],
      [
        'shield without a deadline is allowed, the message recommends a deadline',
        cleanupCode(
          `${FINALLY}    with trio.CancelScope(shield=True):\n        await resource.aclose()`,
        ),
        [],
      ],
      [
        'BaseException handler is not a named cancellation handler',
        cleanupCode('except BaseException:\n    await resource.aclose()\n    raise'),
        [],
      ],
      [
        'bare except handler is not a named cancellation handler',
        cleanupCode('except:\n    await resource.aclose()\n    raise'),
        [],
      ],
      [
        'CancelScope with deadline',
        cleanupCode(
          `${FINALLY}    with trio.CancelScope(deadline=5, shield=True):\n        await resource.aclose()`,
        ),
        [],
      ],
      [
        'imported factory',
        cleanupCode(
          `${FINALLY}    with move_on_after(5, shield=True):\n        await resource.aclose()`,
          'from trio import move_on_after',
        ),
        [],
      ],
      [
        'shield encloses the whole try',
        'import trio\n\n\nasync def run(resource, work):\n    with trio.fail_after(5, shield=True):\n        try:\n            await work()\n        finally:\n            await resource.aclose()\n',
        [],
      ],
      ['forceful close', cleanupCode(`${FINALLY}    await trio.aclose_forcefully(resource)`), []],
      [
        'shielded checkpoint',
        cleanupCode(`${FINALLY}    await trio.lowlevel.cancel_shielded_checkpoint()`),
        [],
      ],
      [
        'ordinary exception handler',
        cleanupCode('except Exception:\n    await resource.aclose()\n    raise'),
        [],
      ],
      ['sync cleanup', cleanupCode(`${FINALLY}    resource.close()`), []],
      [
        'nested function body does not run here',
        cleanupCode(
          `${FINALLY}    async def later():\n        await resource.aclose()\n    resource.close()`,
        ),
        [],
      ],
      [
        'await in the try body',
        'import trio\n\n\nasync def run(resource, work):\n    try:\n        await work()\n        await resource.aclose()\n    except OSError:\n        raise\n',
        [],
      ],
      [
        'asyncio-only module',
        'import asyncio\n\n\nasync def run(resource, work):\n    try:\n        await work()\n    finally:\n        await resource.aclose()\n',
        [],
      ],
      [
        'asyncio shield in an asyncio-only module',
        'import asyncio\n\n\nasync def run(resource, work):\n    try:\n        await work()\n    finally:\n        await asyncio.shield(resource.aclose())\n',
        [],
      ],
    ];
    const [actual, expected] = outcomes(cases);

    expect(actual).toEqual(expected);
  });

  it('resolves aliases, stored values and cancellation evidence', () => {
    const body = (imports, middle) =>
      `${imports}\n\n\nasync def run(resource, work):\n    try:\n        await work()\n    ${middle}\n        await resource.aclose()\n        raise\n`;
    const cases = [
      [
        'aliased trio.Cancelled',
        body('import trio as t', 'except t.Cancelled:'),
        found(8, 'await resource.aclose() in except trio.Cancelled of run'),
      ],
      [
        'imported cancellation class function',
        body('from anyio import get_cancelled_exc_class', 'except get_cancelled_exc_class():'),
        found(8, 'await resource.aclose() in except anyio.get_cancelled_exc_class() of run'),
      ],
      [
        'stored cancellation class',
        body('import anyio\ncancelled = anyio.get_cancelled_exc_class()', 'except cancelled:'),
        found(9, 'await resource.aclose() in except anyio.get_cancelled_exc_class() of run'),
      ],
      [
        'aliased shield factory',
        'from trio import CancelScope as Scope\n\n\nasync def run(resource, work):\n    try:\n        await work()\n    finally:\n        with Scope(shield=True):\n            await resource.aclose()\n',
        [],
      ],
      [
        'shield scope held in a variable',
        'import trio\n\n\nasync def run(resource, work):\n    scope = trio.CancelScope(shield=True)\n    try:\n        await work()\n    finally:\n        with scope:\n            await resource.aclose()\n',
        [],
      ],
      [
        'shield constant',
        'import trio\n\nSHIELD = True\n\n\nasync def run(resource, work):\n    try:\n        await work()\n    finally:\n        with trio.move_on_after(5, shield=SHIELD):\n            await resource.aclose()\n',
        [],
      ],
      [
        'unshielded scope held in a variable',
        'import trio\n\n\nasync def run(resource, work):\n    scope = trio.CancelScope(shield=False)\n    try:\n        await work()\n    finally:\n        with scope:\n            await resource.aclose()\n',
        found(10, 'await resource.aclose() in finally of run'),
      ],
      [
        'AnyIO used only for threads',
        'import anyio\n\n\nasync def run(resource, work):\n    try:\n        await anyio.to_thread.run_sync(work)\n    finally:\n        await resource.aclose()\n',
        [],
      ],
      [
        'AnyIO with a task group',
        'import anyio\n\n\nasync def run(resource, work):\n    try:\n        async with anyio.create_task_group() as tg:\n            tg.start_soon(work)\n    finally:\n        await resource.aclose()\n',
        found(9, 'await resource.aclose() in finally of run'),
      ],
      [
        'async comprehension in finally',
        'import trio\n\n\nasync def run(resource, work):\n    try:\n        await work()\n    finally:\n        items = [item async for item in resource]\n',
        found(8, 'async for resource in finally of run'),
      ],
    ];
    const [actual, expected] = outcomes(cases);

    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('unshielded-cleanup-await reporting', () => {
  it('passes the registered banned/allowed fixtures through the full AST adapter', () => {
    const check = createRuleChecker();
    const verdict = check({
      tool: 'python-rules',
      fixture: 'cleanup-cancellation',
      rule: RULE,
      mention: 'shielded scope with a deadline',
    });

    expect(verdict).toEqual({
      ok: true,
      messages: [
        '`await resource.aclose() in finally of run` can be cancelled before the cleanup finishes, so the resource may stay open. Run the cleanup in a shielded scope with a deadline: `with trio.CancelScope(deadline=trio.current_time() + 5, shield=True): await resource.aclose()` (`anyio.CancelScope(deadline=anyio.current_time() + 5, shield=True)` in AnyIO; `move_on_after(5, shield=True)` needs Trio 0.27 or later). A shield without a deadline can hang shutdown. If this is intended, add {"rule":"unshielded-cleanup-await","paths":["worker.py"],"reason":"..."} to "python.exceptions" in nitpicker.config.json.',
      ],
    });
  });

  it('keeps the identity across line moves and honours reviewed path exceptions', () => {
    const raw = {
      rule: RULE,
      path: 'src/worker.py',
      subject: 'await resource.aclose() in finally',
      line: 7,
    };
    const before = applyRuleHints(ingestRulesReport(JSON.stringify([raw])));
    const after = applyRuleHints(ingestRulesReport(JSON.stringify([{ ...raw, line: 12 }])));

    expect(after).toEqual([{ ...before[0], location: { line: 12 } }]);
    expect(applyPythonExceptions(after, [{ rule: RULE, paths: ['src/worker.py'] }])).toEqual([]);
    expect(applyPythonExceptions(after, [{ rule: RULE, paths: ['other.py'] }])).toEqual(after);
  });
});
