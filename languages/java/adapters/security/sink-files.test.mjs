import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { queryOffsetFromTop, sinkOffsetErrors } from './sink-files.mjs';

const sinks = readFileSync(
  path.join(import.meta.dirname, '../../gradle/security/jakarta-sinks.txt'),
  'utf8',
);

describe('jakarta-sinks.txt', () => {
  it('marks the query text, counted from the last argument, as the sink', () => {
    expect(sinkOffsetErrors(sinks)).toEqual([]);
  });

  it('lists the five EntityManager query methods', () => {
    expect(
      sinks
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => line.split('(')[0]),
    ).toEqual([
      'jakarta/persistence/EntityManager.createQuery',
      'jakarta/persistence/EntityManager.createQuery',
      'jakarta/persistence/EntityManager.createNativeQuery',
      'jakarta/persistence/EntityManager.createNativeQuery',
      'jakarta/persistence/EntityManager.createNativeQuery',
    ]);
  });
});

describe('sinkOffsetErrors', () => {
  it('counts the query text from the last argument', () => {
    expect(queryOffsetFromTop('a.b(Ljava/lang/String;)V:0')).toBe(0);
    expect(queryOffsetFromTop('a.b(Ljava/lang/String;Ljava/lang/Class;)V:1')).toBe(1);
  });

  it('reports a line with the wrong offset', () => {
    expect(
      sinkOffsetErrors('a.b(Ljava/lang/String;Ljava/lang/Class;)V:0\na.c(Ljava/lang/String;)V:0\n'),
    ).toEqual(['a.b(Ljava/lang/String;Ljava/lang/Class;)V:0']);
  });
});
