import { describe, expect, it } from 'vitest';
import { file, fn, klass, parameter, run, summary } from '../../test-support/facts.mjs';
import { streamedRowsFindings } from './streamed-rows.mjs';

function streamed(after, { returnType = 'Stream<Row>', supers = ['JpaRepository'] } = {}) {
  const facts = file({
    imports: [{ path: 'org.springframework.data.jpa.repository.JpaRepository', all: false }],
    classes: [
      klass('Rows', { kind: 'interface', supers }),
      klass('Exports', { primaryParameters: [parameter('rows', 'Rows', { property: true })] }),
    ],
    functions: [
      fn('streamAllBy', { owner: 'Rows', hasBody: false, returnType }),
      fn('paths', { owner: 'Exports', line: 3 }),
    ],
    scopes: [
      { id: 0, k: 'class', name: 'Exports', qualified: 'Exports' },
      { id: 1, k: 'fun', parent: 0, name: 'paths', line: 3 },
    ],
    invocations: [
      { line: 4, scope: 1, name: 'streamAllBy', receiver: 'rows', arguments: [], after },
    ],
  });
  return summary(run(streamedRowsFindings, [facts]));
}

describe('StreamedRowsCollected', () => {
  it.each([
    ['toList', ['toList']],
    ['map then collect', ['map', 'collect']],
    ['asSequence then groupBy', ['asSequence', 'groupBy']],
  ])('reports a repository stream collected with %s', (_name, after) => {
    expect(streamed(after)).toEqual(['StreamedRowsCollected Exports.paths.streamAllBy 4']);
  });

  it.each([
    ['forEach', ['forEach']],
    ['limit before toList', ['limit', 'toList']],
    ['count', ['count']],
    ['use', ['use']],
  ])('allows a repository stream read with %s', (_name, after) => {
    expect(streamed(after)).toEqual([]);
  });

  it('allows a list result and a stream of a type that is not a repository', () => {
    expect(streamed(['toList'], { returnType: 'List<Row>' })).toEqual([]);
    expect(streamed(['toList'], { supers: [] })).toEqual([]);
  });
});
