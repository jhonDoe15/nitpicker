import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../kotlin-source.mjs';
import { reactorBlocksWithoutTimeout, unboundedWaits } from './unbounded-waits.mjs';

function lines(rule, source) {
  const scanned = scanKotlinSource(source);
  return rule(scanned).map(({ offset }) => lineOf(scanned, offset));
}

const REACTOR = 'import reactor.core.publisher.Mono\nimport java.time.Duration\n\n';
const CONCURRENT =
  'import java.util.concurrent.CompletableFuture\nimport java.util.concurrent.CountDownLatch\nimport java.util.concurrent.ExecutorService\nimport java.util.concurrent.Future\nimport java.util.concurrent.TimeUnit\n\n';

describe('reactorBlocksWithoutTimeout', () => {
  it.each([
    [
      'block, blockOptional, blockFirst and blockLast without a duration',
      `${REACTOR}fun a(m: Mono<String>) = m.block()\nfun b(m: Mono<String>) = m.blockOptional()\nfun c(f: reactor.core.publisher.Flux<String>) = f.blockFirst()\nfun d(f: reactor.core.publisher.Flux<String>) = f.blockLast()\n`,
      [4, 5, 6, 7],
    ],
    [
      'a call chain on its own line',
      `${REACTOR}fun a(m: Mono<String>): String? =\n    m.map { it }\n        .block()\n`,
      [6],
    ],
    [
      'a WebClient call in a file that does not import Reactor',
      'import org.springframework.web.reactive.function.client.WebClient\n\nfun a(client: WebClient) = client.get().retrieve().bodyToMono(String::class.java).block()\n',
      [3],
    ],
  ])('reports %s', (_name, source, expected) => {
    expect(lines(reactorBlocksWithoutTimeout, source)).toEqual(expected);
  });

  it.each([
    [
      'a duration',
      `${REACTOR}fun a(m: Mono<String>) = m.block(Duration.ofSeconds(30))\nfun b(m: Mono<String>) = m.blockOptional(Duration.ofSeconds(30))\n`,
    ],
    ['a block call in a file that does not use Reactor', 'fun a(b: Builder) = b.block()\n'],
    [
      'a block call on a receiver that is not a publisher',
      `${REACTOR}fun a(b: Builder) = b.block()\n`,
    ],
    ['a call in a comment or a string', `${REACTOR}val note = "m.block()" // m.block()\n`],
  ])('passes %s', (_name, source) => {
    expect(lines(reactorBlocksWithoutTimeout, source)).toEqual([]);
  });
});

describe('unboundedWaits', () => {
  it.each([
    [
      'get and join on declared futures',
      `${CONCURRENT}fun a(f: Future<String>) = f.get()\nfun b(f: CompletableFuture<String>) = f.join()\n`,
      [7, 8],
    ],
    [
      'a future held in a local variable',
      `${CONCURRENT}fun a(): String {\n    val future = CompletableFuture.supplyAsync { "x" }\n    return future.join()\n}\n`,
      [9],
    ],
    [
      'a submitted task',
      `${CONCURRENT}fun a(executor: ExecutorService): String {\n    val job = executor.submit<String> { "x" }\n    return job.get()\n}\n`,
      [9],
    ],
    [
      'a chain on a submitted task or an async supplier',
      `${CONCURRENT}fun a(executor: ExecutorService) = executor.submit<String> { "x" }.get()\nfun b() = CompletableFuture.supplyAsync { "x" }.join()\n`,
      [7, 8],
    ],
    ['a latch await', `${CONCURRENT}fun a(done: CountDownLatch) {\n    done.await()\n}\n`, [8]],
    [
      'a thread join',
      'fun a(run: () -> Unit) {\n    val worker = Thread(run)\n    worker.start()\n    worker.join()\n}\n\nfun b(worker: Thread) = worker.join()\n',
      [4, 7],
    ],
    [
      'a thread from kotlin.concurrent',
      'import kotlin.concurrent.thread\n\nfun a() {\n    val worker = thread { println("x") }\n    worker.join()\n}\n',
      [5],
    ],
  ])('reports %s', (_name, source, expected) => {
    expect(lines(unboundedWaits, source)).toEqual(expected);
  });

  it.each([
    [
      'waits with a timeout',
      `${CONCURRENT}fun a(f: Future<String>, l: CountDownLatch, w: Thread) {\n    f.get(30, TimeUnit.SECONDS)\n    l.await(30, TimeUnit.SECONDS)\n    w.join(30_000)\n}\n`,
    ],
    [
      'a future with a timeout in the chain',
      `${CONCURRENT}fun a(f: CompletableFuture<String>) = CompletableFuture.supplyAsync { "x" }.orTimeout(30, TimeUnit.SECONDS).join()\n`,
    ],
    [
      'a coroutine job and a deferred, which suspend instead of blocking',
      'import kotlinx.coroutines.CoroutineScope\nimport kotlinx.coroutines.Deferred\nimport kotlinx.coroutines.Job\n\nsuspend fun a(job: Job, deferred: Deferred<String>) {\n    job.join()\n    deferred.await()\n}\n',
    ],
    [
      'a string join and a map get',
      'fun a(parts: List<String>, m: Map<String, String>) = parts.joinToString() + m.get("a")\n',
    ],
    [
      'a name declared as a thread in one function and as another type in the next',
      `${CONCURRENT}fun a(t: Thread) = 1\nfun b(t: Job) = runBlocking { t.join() }\nfun c(f: Future<String>) = 1\nfun d(f: AtomicReference<String>) = f.get()\n`,
    ],
    [
      'one name declared with two kinds',
      `${CONCURRENT}fun a(x: Future<String>) = 1\nfun b(x: Thread) = x.join()\nfun c(x: Future<String>) = x.get()\n`,
    ],
  ])('passes %s', (_name, source) => {
    expect(lines(unboundedWaits, source)).toEqual([]);
  });
});
