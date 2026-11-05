import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fanOutFindings } from '../fan-out/fan-out.mjs';
import { reactiveFanOutMessage } from './reactive-fan-out.mjs';

const FIXTURES = path.resolve(import.meta.dirname, '../../../../fixtures');
const PROJECT = path.join(FIXTURES, 'kotlin-reactive-fan-out-project');
const { files } = JSON.parse(
  readFileSync(path.join(FIXTURES, 'kotlin-reactive-fan-out-facts.json'), 'utf8'),
);
const RULE = 'UnboundedReactiveFanOut';
const UNBOUNDED = 'src/main/kotlin/shop/Unbounded.kt';
const BOUNDED = 'src/main/kotlin/shop/Bounded.kt';
const FUNCTION = /^\s*fun\s+(\w+)/u;

function sourceLines(file) {
  return readFileSync(path.join(PROJECT, file), 'utf8').split('\n');
}

function functionAt(file, line) {
  const lines = sourceLines(file).slice(0, line).toReversed();
  return lines.map((text) => FUNCTION.exec(text)?.[1]).find(Boolean);
}

function publicFunctions(file) {
  return sourceLines(file)
    .filter((text) => !text.includes('private fun'))
    .map((text) => FUNCTION.exec(text)?.[1])
    .filter(Boolean);
}

function lineOf(file, fragment) {
  return sourceLines(file).findIndex((text) => text.includes(fragment)) + 1;
}

function run(own = files) {
  return fanOutFindings({ own, projectFiles: files, projectRoot: PROJECT, javaRoots: [] });
}

function reactive(findings) {
  return findings.filter(({ rule }) => rule === RULE);
}

describe('reactive fan-out on the recorded fixture facts', () => {
  const { findings, calls } = run();

  it('reports every unbounded operator of the unbounded file once, and nothing else', () => {
    const reported = reactive(findings).map(({ path: file, location }) =>
      functionAt(file, location.line),
    );

    expect(findings.every(({ path: file }) => file === UNBOUNDED)).toBe(true);
    expect(reported).toEqual(publicFunctions(UNBOUNDED));
  });

  it('leaves concurrency limits, concatMap, buffers, fixed collections and plain lists alone', () => {
    expect(publicFunctions(BOUNDED).length).toBeGreaterThan(12);
    expect(findings.filter(({ path: file }) => file === BOUNDED)).toEqual([]);
  });

  it('names the operator, the helper and the call it reaches, with the default limit', () => {
    const referenced = findings.find(
      ({ location }) => location.line === lineOf(UNBOUNDED, 'flatMap(this::load)'),
    );

    expect(referenced).toEqual({
      tool: 'kotlin-source',
      rule: RULE,
      path: UNBOUNDED,
      identity: expect.any(String),
      message: reactiveFanOutMessage({
        form: 'operator',
        operator: 'flatMap',
        collection: 'ids',
        limit: 256,
        work: { helper: 'load', call: 'client.get', kind: 'remote' },
      }),
      classification: 'enforceable',
      location: { line: lineOf(UNBOUNDED, 'flatMap(this::load)') },
    });
    expect(referenced.message).toBe(
      [
        '`flatMap` subscribes to `load`, which reaches `client.get`, for every element of `ids`, up to 256 at once',
        "(Reactor's default concurrency), so a large collection exhausts the remote service's connections or rate",
        'limit. Pass a concurrency limit (`flatMap({ fetch(it) }, 8)`), use `concatMap` for one call at a time, or',
        '`buffer(20)` and make one batch call per chunk. An exception fits only when the collection is always small.',
      ].join(' '),
    );
  });

  it('says every element at once for zip, when, a spread merge and flatMapMerge(Int.MAX_VALUE)', () => {
    const at = (fragment) =>
      findings.find(({ location }) => location.line === lineOf(UNBOUNDED, fragment))?.message;
    const work = { helper: 'fetch', call: 'client.get', kind: 'remote' };
    const zipped = { form: 'combinator', collection: 'ids', work };

    expect(at('Mono.zip(')).toBe(reactiveFanOutMessage({ ...zipped, operator: 'Mono.zip' }));
    expect(at('Mono.`when`(')).toBe(reactiveFanOutMessage({ ...zipped, operator: 'Mono.when' }));
    expect(at('Flux.merge(*')).toBe(reactiveFanOutMessage({ ...zipped, operator: 'Flux.merge' }));
    expect(at('Flux.merge(calls)')).toBe(
      reactiveFanOutMessage({ ...zipped, operator: 'Flux.merge', limit: 256 }),
    );
    expect(at('flatMapMerge(Int.MAX_VALUE)')).toBe(
      reactiveFanOutMessage({
        form: 'flow',
        operator: 'flatMapMerge(Int.MAX_VALUE)',
        collection: 'ids.asFlow()',
        work,
      }),
    );
    expect(at('Mono.zip(')).toBe(
      [
        '`Mono.zip` subscribes to `fetch`, which reaches `client.get`, for every element of `ids` at once, so a large',
        "collection exhausts the remote service's connections or rate limit. Build the list through",
        '`Flux.fromIterable(items).flatMap({ fetch(it) }, 8).collectList()`, or make one batch call when the API has',
        'one. An exception fits only when the collection is always small.',
      ].join(' '),
    );
  });

  it('keeps identities stable when another function of the file is fixed', () => {
    const removed = lineOf(UNBOUNDED, 'Mono.zip(');
    const trimmed = files.map((file) =>
      file.file === UNBOUNDED
        ? {
            ...file,
            invocations: file.invocations.filter(
              ({ line, name }) => line !== removed || name !== 'zip',
            ),
          }
        : file,
    );
    const before = new Set(findings.map(({ identity }) => identity));
    const after = run(trimmed).findings;

    expect(after).toHaveLength(findings.length - 1);
    expect(after.every(({ identity }) => before.has(identity))).toBe(true);
  });

  it('lists the per-element call lines so the per-item I/O rule leaves them to this one', () => {
    expect(calls.has(`${UNBOUNDED}:${String(lineOf(UNBOUNDED, 'val calls = '))}`)).toBe(true);
    expect(calls.has(`${UNBOUNDED}:${String(lineOf(UNBOUNDED, 'client.get().uri'))}`)).toBe(true);
  });
});
