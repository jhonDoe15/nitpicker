import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FAN_OUT_MESSAGES, fanOutFindings, fanOutMessage } from './fan-out.mjs';

const FIXTURES = path.resolve(import.meta.dirname, '../../../../fixtures');
const PROJECT = path.join(FIXTURES, 'kotlin-fan-out-project');
const { files } = JSON.parse(
  readFileSync(path.join(FIXTURES, 'kotlin-fan-out-facts.json'), 'utf8'),
);
const UNBOUNDED = 'src/main/kotlin/shop/Unbounded.kt';
const BOUNDED = 'src/main/kotlin/shop/Bounded.kt';
const FUNCTION = /^\s*(?:suspend\s+)?fun\s+(\w+)/u;

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

describe('fanOutFindings on the recorded fixture facts', () => {
  const { findings, calls } = run();

  it('reports every per-element task of the unbounded file once, at the per-element scope', () => {
    const reported = findings.map(({ path: file, location }) => functionAt(file, location.line));

    expect(findings.every(({ path: file }) => file === UNBOUNDED)).toBe(true);
    expect(reported).toEqual(publicFunctions(UNBOUNDED));
  });

  it('leaves the bounded file alone: permits, limited dispatchers, fixed pools, chunks and fixed collections', () => {
    expect(publicFunctions(BOUNDED).length).toBeGreaterThan(20);
    expect(findings.filter(({ path: file }) => file === BOUNDED)).toEqual([]);
  });

  it('names the starter, the helper and the call it reaches, under the source rule id', () => {
    const relayed = findings.find(
      ({ location }) => location.line === lineOf(UNBOUNDED, 'pages.relay'),
    );

    expect(relayed).toEqual({
      tool: 'kotlin-source',
      rule: 'UnboundedFanOut',
      path: UNBOUNDED,
      identity: expect.any(String),
      message: fanOutMessage({
        starter: 'async',
        collection: 'urls',
        work: { helper: 'relay', call: 'client.send', kind: 'remote' },
      }),
      classification: 'enforceable',
      location: { line: lineOf(UNBOUNDED, 'pages.relay') },
    });
    expect(Object.keys(FAN_OUT_MESSAGES)).toEqual(['UnboundedFanOut']);
  });

  it('keeps identities stable when another function of the file is fixed', () => {
    const trimmed = files.map((file) =>
      file.file === UNBOUNDED
        ? {
            ...file,
            scopes: file.scopes.filter(
              ({ line }) => line !== lineOf(UNBOUNDED, 'urls.map { async { client.send'),
            ),
          }
        : file,
    );
    const before = new Set(findings.map(({ identity }) => identity));
    const after = run(trimmed).findings;

    expect(after).toHaveLength(findings.length - 1);
    expect(after.every(({ identity }) => before.has(identity))).toBe(true);
  });

  it('lists the reported call lines so the per-item I/O rule leaves them to this one', () => {
    expect(calls.has(`${UNBOUNDED}:${String(lineOf(UNBOUNDED, 'producer.send'))}`)).toBe(true);
    expect(calls.has(`${BOUNDED}:${String(lineOf(BOUNDED, 'client.send'))}`)).toBe(false);
  });
});
