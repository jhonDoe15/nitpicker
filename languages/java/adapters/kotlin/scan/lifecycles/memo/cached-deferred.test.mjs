import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../../kotlin-source.mjs';
import { cachedDeferredKeepsFailure } from './cached-deferred.mjs';

function lines(source) {
  const scanned = scanKotlinSource(source);
  return cachedDeferredKeepsFailure(scanned).map(({ offset }) => lineOf(scanned, offset));
}

const HEAD = 'class Client(private val scope: CoroutineScope) {\n';
const FIELD = '    private var conn: Deferred<String>? = null\n';
const inClass = (body, field = FIELD) => `${HEAD}${field}${body}}\n`;

describe('cachedDeferredKeepsFailure', () => {
  it.each([
    [
      'a deferred kept after failure',
      inClass(
        '    suspend fun get(): String {\n        val cached = conn ?: scope.async { open() }.also { conn = it }\n        return cached.await()\n    }\n',
      ),
      [2],
    ],
    [
      'an if guard',
      inClass(
        '    suspend fun get(): String {\n        if (conn == null) {\n            conn = scope.async { open() }\n        }\n        return conn!!.await()\n    }\n',
      ),
      [2],
    ],
    ['a lazy deferred', `${HEAD}    val conn by lazy { scope.async { open() } }\n}\n`, [2]],
    [
      'a future memo',
      inClass(
        '    fun get(): CompletableFuture<String> {\n        if (future == null) {\n            future = CompletableFuture.supplyAsync { open() }\n        }\n        return future!!\n    }\n',
        '    private var future: CompletableFuture<String>? = null\n',
      ),
      [2],
    ],
    [
      'a local attempt stored in the property',
      inClass(
        '    suspend fun get(): String {\n        if (conn == null) {\n            val attempt = scope.async { open() }\n            conn = attempt\n        }\n        return conn!!.await()\n    }\n',
      ),
      [2],
    ],
  ])('reports %s', (_name, source, expected) => {
    expect(lines(source)).toEqual(expected);
  });

  it.each([
    [
      'a job started and cancelled on stop',
      inClass(
        '    fun start() {\n        job = scope.async { open() }\n    }\n    fun stop() {\n        job?.cancel()\n    }\n',
        '    private var job: Deferred<String>? = null\n',
      ),
      [],
    ],
    [
      'a reset on completion',
      inClass(
        '    suspend fun get(): String {\n        val attempt = conn ?: scope.async { open() }\n        conn = attempt\n        attempt.invokeOnCompletion { if (it != null) conn = null }\n        return attempt.await()\n    }\n',
      ),
    ],
    [
      'a reset in catch',
      inClass(
        '    suspend fun get(): String {\n        if (conn == null) {\n            conn = scope.async { open() }\n        }\n        try {\n            return conn!!.await()\n        } catch (e: Exception) {\n            conn = null\n            throw e\n        }\n    }\n',
      ),
    ],
    ['an eager val', `${HEAD}    private val conn = scope.async { open() }\n}\n`],
    ['a lazy value that is not a deferred', `${HEAD}    val name by lazy { compute() }\n}\n`],
    ['a deferred never reused', inClass('    fun reset() {\n        conn = null\n    }\n')],
  ])('allows %s', (_name, source) => {
    expect(lines(source)).toEqual([]);
  });
});
