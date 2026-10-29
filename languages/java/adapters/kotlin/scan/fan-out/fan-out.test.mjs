import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../kotlin-source.mjs';
import { fanOutCallOffsets, unboundedFanOut } from './fan-out.mjs';

const HEADER = [
  'package shop',
  '',
  'import io.ktor.client.HttpClient',
  'import io.ktor.client.request.get',
  'import kotlinx.coroutines.async',
  'import kotlinx.coroutines.awaitAll',
  'import kotlinx.coroutines.coroutineScope',
  'import kotlinx.coroutines.launch',
  'import kotlinx.coroutines.sync.Semaphore',
  'import kotlinx.coroutines.sync.withPermit',
  'import org.springframework.kafka.core.KafkaTemplate',
  '',
  'class Prefetch(private val client: HttpClient, private val kafka: KafkaTemplate<String, String>) {',
  '    private val permits = Semaphore(8)',
  '    private val limited = Dispatchers.IO.limitedParallelism(8)',
  '',
  '    suspend fun page(url: String): String = client.get(url).bodyAsText()',
  '',
];
const MESSAGE = [
  '`async` starts `client.get` (a remote call) for every element of `urls` at once, with no bound on how many',
  ' run together, so a large collection exhausts connections, rate limits or the remote service. Bound it:',
  ' take a permit around each call (`val permits = Semaphore(8)` created once, then',
  ' `permits.withPermit { send(it) }`), work through fixed-size chunks',
  ' (`items.chunked(20).forEach { chunk -> chunk.map { async { send(it) } }.awaitAll() }`), use',
  ' `flatMapMerge(concurrency = 8)` on a flow, run blocking calls on `Dispatchers.IO.limitedParallelism(8)`,',
  ' or send one batch request when the API has one. A limit constant that no semaphore or dispatcher uses',
  ' bounds nothing.',
].join('');
const FIRST_LINE = HEADER.length + 2;

function source(lines) {
  return [
    ...HEADER,
    '    suspend fun run(urls: List<String>) = coroutineScope {',
    ...lines.map((line) => `        ${line}`),
    '    }',
    '}',
    '',
  ].join('\n');
}

function found(lines) {
  const scanned = scanKotlinSource(source(lines));
  return unboundedFanOut(scanned).map((reported) => [
    lineOf(scanned, reported.offset),
    reported.subject,
  ]);
}

describe('unboundedFanOut', () => {
  it.each([
    [
      'async per element',
      ['urls.map { async { client.get(it) } }.awaitAll()'],
      'urls async client.get',
    ],
    [
      'launch in forEach',
      ['urls.forEach { url -> launch { kafka.send("t", url) } }'],
      'urls launch kafka.send',
    ],
    [
      'launch in a for loop',
      ['for (url in urls) {', '    launch { page(url) }', '}'],
      'urls launch page()',
    ],
    [
      'a typed loop variable',
      ['for (url: String in urls) {', '    launch { page(url) }', '}'],
      'urls launch page()',
    ],
    [
      'a named parameter',
      ['urls.mapIndexed { i, url -> async { page(url) } }'],
      'urls async page()',
    ],
    ['a scope receiver', ['urls.map { this.async { page(it) } }.awaitAll()'], 'urls async page()'],
    ['a property chain', ['this.urls.map { async { page(it) } }'], 'this.urls async page()'],
  ])('reports %s', (_name, lines, subject) => {
    expect(found(lines)).toEqual([[FIRST_LINE, subject]]);
  });

  it('names the collection, the start, the call, the missing bound and the bounded forms', () => {
    const [reported] = unboundedFanOut(
      scanKotlinSource(source(['urls.map { async { client.get(it) } }'])),
    );

    expect(reported.message).toBe(MESSAGE);
  });

  it.each([
    ['a semaphore permit', ['urls.map { async { permits.withPermit { page(it) } } }.awaitAll()']],
    ['a limited dispatcher', ['urls.map { async(limited) { page(it) } }.awaitAll()']],
    [
      'chunks',
      [
        'urls.chunked(20).forEach { chunk ->',
        '    chunk.map { async { page(it) } }.awaitAll()',
        '}',
      ],
    ],
    [
      'a chunk loop',
      ['for (chunk in urls.chunked(20)) {', '    chunk.map { async { page(it) } }.awaitAll()', '}'],
    ],
    ['a fixed list', ['listOf("a", "b").map { async { page(it) } }.awaitAll()']],
    ['a fixed range', ['(1..3).map { async { page("$it") } }.awaitAll()']],
    ['an awaited task', ['urls.map { async { page(it) }.await() }']],
    ['a task without a remote call', ['urls.map { async { it.trim() } }.awaitAll()']],
    ['a call on an untyped receiver', ['urls.map { url -> async { url.get() } }.awaitAll()']],
    ['a sequential call', ['urls.forEach { page(it) }']],
    [
      'a flow with flatMapMerge',
      ['urls.asFlow().flatMapMerge { flow { emit(page(it)) } }.toList()'],
    ],
  ])('passes %s', (_name, lines) => {
    expect(found(lines)).toEqual([]);
  });

  it('needs the client type to come from its library', () => {
    const text = source(['urls.map { async { client.get(it) } }']).replace(
      'import io.ktor.client.HttpClient',
      'import shop.http.HttpClient',
    );

    expect(unboundedFanOut(scanKotlinSource(text))).toEqual([]);
  });
});

describe('fanOutCallOffsets', () => {
  it('lists the remote calls inside per-element tasks, bounded or not, for the loop rule to skip', () => {
    const scanned = scanKotlinSource(
      source([
        'urls.map { async { permits.withPermit { client.get(it) } } }',
        'urls.forEach { client.get(it) }',
      ]),
    );

    expect([...fanOutCallOffsets(scanned)].map((offset) => lineOf(scanned, offset))).toEqual([
      FIRST_LINE,
    ]);
  });
});
