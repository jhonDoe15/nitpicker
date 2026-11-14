import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../kotlin-source.mjs';
import { unhandledRootCoroutines } from './root-scope-launches.mjs';

function lines(source, context) {
  const scanned = scanKotlinSource(source);
  return unhandledRootCoroutines(scanned, context).map(({ offset }) => lineOf(scanned, offset));
}

const IMPORTS = 'import kotlinx.coroutines.*\n\n';
const ROOT = `${IMPORTS}class Service {\n    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)\n\n`;

describe('unhandledRootCoroutines', () => {
  it.each([
    [
      'a launch on a scope field',
      `${ROOT}    fun start() {\n        scope.launch {\n            work()\n        }\n    }\n}\n`,
      [7],
    ],
    [
      'a launch on MainScope() and on an inline scope',
      `${IMPORTS}fun a() {\n    MainScope().launch { work() }\n    CoroutineScope(Dispatchers.Default).launch { work() }\n}\n`,
      [4, 5],
    ],
    [
      'a launch on a scope held in a local and typed',
      `${IMPORTS}fun a() {\n    val scope: CoroutineScope = CoroutineScope(Job())\n    scope.launch(Dispatchers.IO) { work() }\n}\n`,
      [5],
    ],
    [
      'a block with a catch that does not cover everything',
      `${ROOT}    fun start() {\n        scope.launch {\n            try {\n                work()\n            } catch (e: java.io.IOException) {\n                log(e)\n            }\n            more()\n        }\n    }\n}\n`,
      [7],
    ],
    [
      'a runCatching that wraps only part of the block',
      `${ROOT}    fun start() {\n        scope.launch {\n            runCatching { work() }\n            more()\n        }\n    }\n}\n`,
      [7],
    ],
    [
      'an async nobody awaits',
      `${ROOT}    fun start() {\n        scope.async { work() }\n        val unused = scope.async { work() }\n    }\n}\n`,
      [7, 8],
    ],
  ])('reports %s', (_name, source, expected) => {
    expect(lines(source)).toEqual(expected);
  });

  it.each([
    [
      'a handler in the scope context',
      `${IMPORTS}class Service(private val handler: CoroutineExceptionHandler) {\n    private val scope = CoroutineScope(SupervisorJob() + handler)\n\n    fun start() {\n        scope.launch { work() }\n    }\n}\n`,
    ],
    [
      'a handler built in the scope context',
      `${IMPORTS}private val scope = CoroutineScope(\n    SupervisorJob() + CoroutineExceptionHandler { _, error -> log(error) },\n)\n\nfun start() {\n    scope.launch { work() }\n}\n`,
    ],
    [
      'a handler passed to the launch',
      `${ROOT}    fun start(handler: CoroutineExceptionHandler) {\n        scope.launch(handler) { work() }\n        scope.launch(CoroutineExceptionHandler { _, e -> log(e) }) { work() }\n    }\n}\n`,
    ],
    [
      'a block that catches Exception or Throwable around everything',
      `${ROOT}    fun start() {\n        scope.launch {\n            try {\n                work()\n            } catch (e: Exception) {\n                log(e)\n            }\n        }\n        scope.launch {\n            try {\n                work()\n            } catch (e: CancellationException) {\n                throw e\n            } catch (e: Throwable) {\n                log(e)\n            } finally {\n                done()\n            }\n        }\n    }\n}\n`,
    ],
    [
      'a block that is a runCatching',
      `${ROOT}    fun start() {\n        scope.launch { runCatching { work() }.onFailure { log(it) } }\n    }\n}\n`,
    ],
    [
      'a launch inside a structured scope or another coroutine',
      `${IMPORTS}suspend fun a() {\n    coroutineScope {\n        launch { work() }\n    }\n    supervisorScope {\n        launch { work() }\n        async { work() }\n    }\n}\n`,
    ],
    [
      'a scope that is a parameter, a property of another object or a name declared twice',
      `${IMPORTS}fun a(scope: CoroutineScope, owner: Owner) {\n    scope.launch { work() }\n    owner.scope.launch { work() }\n}\n\nclass Twin(scope: CoroutineScope) {\n    private val local = 1\n}\n`,
    ],
    [
      'a first parameter or a lambda parameter named like a root scope',
      `${ROOT}    fun start(scope: CoroutineScope) {\n        scope.launch { work() }\n    }\n\n    fun each(items: List<Scope>) {\n        items.forEach { scope -> scope.launch { work() } }\n    }\n}\n`,
    ],
    [
      'a scope that carries the caller context or a parent job',
      `${IMPORTS}class Service(private val parentJob: Job) {\n    private val a = CoroutineScope(parentJob + Dispatchers.IO)\n    private val b = CoroutineScope(SupervisorJob(parentJob))\n\n    suspend fun start() {\n        a.launch { work() }\n        b.launch { work() }\n        CoroutineScope(coroutineContext).launch { work() }\n        CoroutineScope(currentCoroutineContext()).launch { work() }\n    }\n}\n`,
    ],
    [
      'an async whose Deferred is awaited',
      `${ROOT}    suspend fun start() {\n        val value = scope.async { work() }\n        value.await()\n        scope.async { work() }.await()\n    }\n}\n`,
    ],
    [
      'a launch in a comment or a string',
      `${ROOT}    val note = "scope.launch { work() }" // scope.launch { work() }\n}\n`,
    ],
  ])('passes %s', (_name, source) => {
    expect(lines(source)).toEqual([]);
  });

  it('skips a launch inside a runner lambda or on a scope named like a runner', () => {
    const source = `${ROOT}    fun start() {\n        runDetached {\n            scope.launch { work() }\n        }\n        appScope.launch { work() }\n        scope.launch { work() }\n    }\n\n    private val appScope = CoroutineScope(Job())\n}\n`;
    expect(lines(source)).toEqual([8, 10, 11]);
    expect(lines(source, { runners: ['runDetached', 'appScope'] })).toEqual([11]);
  });
});
