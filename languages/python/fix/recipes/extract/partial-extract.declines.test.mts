import { describe, expect, it } from 'vitest';
import { extracted, module, note } from './test-support/extract-sources.mts';
import { reportPair } from './test-support/partial-sources.mts';

type Case = { readonly name: string; readonly source: string; readonly reason: string };

const SCOPE =
  'the code declares a function or class, imports, deletes, yields or reads its own scope';
const FEED = ['extra = [n async for n in feed]'];

const CASES: readonly Case[] = [
  {
    name: 'a value the run defines only on some paths',
    source: module(
      ...reportPair(
        { inRun: ['if names:', '    picked = names[0]'], after: ['return picked'] },
        { inRun: ['if keys:', '    picked = keys[0]'], after: ['return count, picked'] },
      ),
    ),
    reason: 'a value the run defines for the code after it is not always assigned',
  },
  {
    name: 'a run that reads a name the function assigns after it',
    source: module(
      ...reportPair(
        { inLoop: ['record(item, late)'], after: ['print("x")', 'late = 5', 'return names'] },
        {
          inLoop: ['record(value, late)'],
          after: ['print("x", "y")', 'late = 6', 'return keys, count'],
        },
      ),
    ),
    reason: 'the flow of a name the run reads is unclear',
  },
  {
    name: 'a run that declares a global name',
    source: module(
      ...reportPair(
        { before: ['global CACHE', 'print("a")'], after: ['return names'] },
        { before: ['global CACHE', 'print("a", "b")'], after: ['return keys, count'] },
      ),
    ),
    reason: SCOPE,
  },
  {
    name: 'a second copy with a comment the shared function would drop',
    source: module(...reportPair({}, { inLoop: ['# only here'] })),
    reason: 'the second copy has comments the shared function would drop',
  },
  {
    name: 'a run with an async comprehension',
    source: module(...reportPair({ inLoop: FEED }, { inLoop: FEED })).replaceAll(
      'def ',
      'async def ',
    ),
    reason: 'the run returns, breaks or continues out of itself, or awaits',
  },
  {
    name: 'a pair where only one copy is async',
    source: module(...reportPair().map((text, side) => (side === 1 ? `async ${text}` : text))),
    reason: 'only one copy is async',
  },
];

describe('python-extract-partial-run declines', () => {
  it.each(CASES)('declines $name', ({ source, reason }) => {
    const { after, notes } = extracted(source);
    expect([after, notes]).toEqual([source, [note(1, reason)]]);
  });
});
