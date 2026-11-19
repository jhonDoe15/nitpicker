import { describe, expect, it } from 'vitest';
import type { FanOutFinding } from '../fan-out/fan-out-support.mts';
import {
  UNBOUNDED,
  enforceable,
  stableIdentities,
  fixtureProject,
} from '../fan-out/fan-out-support.mts';
import { reactiveFanOutMessage } from './reactive-fan-out.mts';

const RULE = 'UnboundedReactiveFanOut';

const { files, coverage, lineOf, run, findingAt } = fixtureProject(
  'kotlin-reactive-fan-out-project',
  'kotlin-reactive-fan-out',
  /^\s*fun\s+(\w+)/u,
);

function reactive(findings: FanOutFinding[]) {
  return findings.filter(({ rule }) => rule === RULE);
}

describe('reactive fan-out on the recorded fixture facts', () => {
  const { findings, calls } = run();

  it('reports every unbounded operator of the unbounded file once, and nothing else', () => {
    const covered = coverage(findings, reactive(findings));

    expect(covered.unbounded).toEqual(findings);
    expect(covered.reported).toEqual(covered.expected);
  });

  it('leaves concurrency limits, concatMap, buffers, fixed collections and plain lists alone', () => {
    const covered = coverage(findings, findings);

    expect(covered.boundedFunctions).toBeGreaterThan(12);
    expect(covered.bounded).toEqual([]);
  });

  it('names the operator, the helper and the call it reaches, with the default limit', () => {
    const referenced = findingAt(findings, 'flatMap(this::load)');

    expect(referenced).toEqual(
      enforceable(
        RULE,
        reactiveFanOutMessage({
          form: 'operator',
          operator: 'flatMap',
          collection: 'ids',
          limit: 256,
          work: { helper: 'load', call: 'client.get', kind: 'remote' },
        }),
        lineOf(UNBOUNDED, 'flatMap(this::load)'),
      ),
    );
    expect(referenced?.message).toBe(
      [
        '`flatMap` subscribes to `load`, which reaches `client.get`, for every element of `ids`, up to 256 at once',
        "(Reactor's default concurrency), so a large collection exhausts the remote service's connections or rate",
        'limit. Pass a concurrency limit (`flatMap({ fetch(it) }, 8)`), use `concatMap` for one call at a time, or',
        '`buffer(20)` and make one batch call per chunk. An exception fits only when the collection is always small.',
      ].join(' '),
    );
  });

  it('says every element at once for zip, when, a spread merge and flatMapMerge(Int.MAX_VALUE)', () => {
    const at = (fragment: string) =>
      findings.find(({ location }) => location.line === lineOf(UNBOUNDED, fragment))?.message;
    const work = { helper: 'fetch', call: 'client.get', kind: 'remote' };
    const zipped = { form: 'combinator' as const, collection: 'ids', work, limit: undefined };

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
        limit: undefined,
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
              (call) => call.line !== removed || call.name !== 'zip',
            ),
          }
        : file,
    );
    expect(stableIdentities(findings, run(trimmed).findings)).toBe(true);
  });

  it('lists the per-element call lines so the per-item I/O rule leaves them to this one', () => {
    expect(calls.has(`${UNBOUNDED}:${String(lineOf(UNBOUNDED, 'val calls = '))}`)).toBe(true);
    expect(calls.has(`${UNBOUNDED}:${String(lineOf(UNBOUNDED, 'client.get().uri'))}`)).toBe(true);
  });
});
