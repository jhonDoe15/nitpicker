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
    expect(referenced.message).toMatch(
      /^`flatMap` subscribes to `load`, which reaches `client\.get`, /u,
    );
    expect(referenced.message).toMatch(/for every element of `ids`, up to 256 at once/u);
  });

  it('says every element at once for zip, when, a spread merge and flatMapMerge(Int.MAX_VALUE)', () => {
    const at = (fragment) =>
      findings.find(({ location }) => location.line === lineOf(UNBOUNDED, fragment))?.message;

    expect(at('Mono.zip(')).toMatch(
      /^`Mono\.zip` subscribes to .* for every element of `ids` at once/u,
    );
    expect(at('Mono.`when`(')).toMatch(/^`Mono\.when` .* at once.*collectList\(\)/u);
    expect(at('Flux.merge(*')).toMatch(/for every element of `ids` at once/u);
    expect(at('Flux.merge(calls)')).toMatch(/up to 256 at once/u);
    expect(at('flatMapMerge(Int.MAX_VALUE)')).toMatch(
      /^`flatMapMerge\(Int\.MAX_VALUE\)` .* at once.*flatMapMerge\(8\)/u,
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
