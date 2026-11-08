import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../kotlin-source.mjs';
import { futuresWithoutException } from './future-completions.mjs';

function lines(source) {
  const scanned = scanKotlinSource(source);
  return futuresWithoutException(scanned).map(({ offset }) => lineOf(scanned, offset));
}

describe('futuresWithoutException', () => {
  it.each([
    [
      'a continuation resumed only from a listener',
      'suspend fun reply(client: Client): String =\n    suspendCancellableCoroutine { continuation ->\n        client.onReply { value -> continuation.resume(value) }\n    }\n',
      [2],
    ],
    [
      'a continuation passed by reference to a callback',
      'suspend fun reply(client: Client): String = suspendCoroutine<String> { client.onReply(it::resume) }\n',
      [1],
    ],
    [
      'a deferred completed only from a callback',
      'fun reply(client: Client): Deferred<String> {\n    val reply = CompletableDeferred<String>()\n    client.onReply { reply.complete(it) }\n    return reply\n}\n',
      [2],
    ],
    [
      'a future completed only through a reference',
      'fun reply(client: Client): CompletableFuture<Map<String, Int>> {\n    val reply: CompletableFuture<Map<String, Int>> = CompletableFuture<Map<String, Int>>()\n    client.onReply(reply::complete)\n    return reply\n}\n',
      [2],
    ],
  ])('reports %s', (_name, source, expected) => {
    expect(lines(source)).toEqual(expected);
  });

  it.each([
    [
      'a continuation that also resumes with the exception',
      'suspend fun reply(client: Client): String =\n    suspendCancellableCoroutine { continuation ->\n        client.onReply { value -> continuation.resume(value) }\n        client.onFailure { error -> continuation.resumeWithException(error) }\n    }\n',
    ],
    [
      'a continuation resumed with a Result',
      'suspend fun reply(client: Client): String = suspendCoroutine { continuation ->\n    client.onDone { result -> continuation.resumeWith(result) }\n}\n',
    ],
    [
      'a continuation resumed directly in the block',
      'suspend fun now(): Int = suspendCoroutine { it.resume(compute()) }\n',
    ],
    [
      'a deferred with a failure path or a deadline',
      'fun reply(client: Client): Deferred<String> {\n    val reply = CompletableDeferred<String>()\n    client.onReply { reply.complete(it) }\n    client.onFailure(reply::completeExceptionally)\n    return reply\n}\n\nfun bounded(client: Client): CompletableFuture<String> {\n    val reply = CompletableFuture<String>()\n    client.onReply { reply.complete(it) }\n    return reply.orTimeout(5, TimeUnit.SECONDS)\n}\n',
    ],
    [
      'a deferred stored where another owner can fail it',
      'class Calls {\n    private val pending = mutableMapOf<String, CompletableDeferred<String>>()\n\n    fun call(key: String, client: Client): Deferred<String> {\n        val reply = CompletableDeferred<String>()\n        pending[key] = reply\n        client.onReply { reply.complete(it) }\n        return reply\n    }\n\n    fun track(client: Client, registry: Registry): Deferred<String> {\n        val reply = CompletableDeferred<String>()\n        registry.track(reply)\n        client.onReply { reply.complete(it) }\n        return reply\n    }\n}\n',
    ],
    [
      'a deferred completed directly',
      'fun now(value: String): Deferred<String> {\n    val reply = CompletableDeferred<String>()\n    reply.complete(value)\n    return reply\n}\n',
    ],
    [
      'names only inside strings and comments',
      'fun note(): String = "suspendCoroutine { client.onReply(it::resume) }" // suspendCoroutine { x::resume }\n',
    ],
  ])('passes %s', (_name, source) => {
    expect(lines(source)).toEqual([]);
  });
});
