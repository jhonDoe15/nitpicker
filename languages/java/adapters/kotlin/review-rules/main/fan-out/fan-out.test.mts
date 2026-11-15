import { describe, expect, it } from 'vitest';
import { fieldOf, listOf } from '../../../../../../../shared/values/readers.mts';
import {
  BOUNDED,
  UNBOUNDED,
  enforceable,
  stableIdentities,
  fixtureProject,
} from './fan-out-support.mts';
import { FAN_OUT_MESSAGES, fanOutMessage } from './fan-out.mjs';

const { files, coverage, lineOf, run, findingAt } = fixtureProject(
  'kotlin-fan-out-project',
  'kotlin-fan-out',
  /^\s*(?:suspend\s+)?fun\s+(\w+)/u,
);

describe('fanOutFindings on the recorded fixture facts', () => {
  const { findings, calls } = run();

  it('reports every per-element task of the unbounded file once, at the per-element scope', () => {
    const covered = coverage(findings, findings);

    expect(covered.unbounded).toEqual(findings);
    expect(covered.reported).toEqual(covered.expected);
  });

  it('leaves the bounded file alone: permits, limited dispatchers, fixed pools, chunks and fixed collections', () => {
    const covered = coverage(findings, findings);

    expect(covered.boundedFunctions).toBeGreaterThan(20);
    expect(covered.bounded).toEqual([]);
  });

  it('names the starter, the helper and the call it reaches, under the source rule id', () => {
    const relayed = findingAt(findings, 'pages.relay');

    expect(relayed).toEqual(
      enforceable(
        'UnboundedFanOut',
        fanOutMessage({
          starter: 'async',
          collection: 'urls',
          work: { helper: 'relay', call: 'client.send', kind: 'remote' },
        }),
        lineOf(UNBOUNDED, 'pages.relay'),
      ),
    );
    expect(Object.keys(FAN_OUT_MESSAGES)).toEqual(['UnboundedFanOut', 'UnboundedReactiveFanOut']);
  });

  it('keeps identities stable when another function of the file is fixed', () => {
    const trimmed = files.map((file) =>
      file.file === UNBOUNDED
        ? {
            ...file,
            scopes: listOf(file['scopes']).filter(
              (scope) =>
                fieldOf(scope, 'line') !== lineOf(UNBOUNDED, 'urls.map { async { client.send'),
            ),
          }
        : file,
    );
    expect(stableIdentities(findings, run(trimmed).findings)).toBe(true);
  });

  it('lists the reported call lines so the per-item I/O rule leaves them to this one', () => {
    expect(calls.has(`${UNBOUNDED}:${String(lineOf(UNBOUNDED, 'producer.send'))}`)).toBe(true);
    expect(calls.has(`${BOUNDED}:${String(lineOf(BOUNDED, 'client.send'))}`)).toBe(false);
  });
});
