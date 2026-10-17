import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { mergeDurations } from './record-durations.mjs';
import {
  assignShards,
  createDurationSequencer,
  heaviestFirst,
  readDurations,
} from './sequencer.mjs';

const files = ['a.test.mjs', 'b.test.mjs', 'c.test.mjs', 'd.test.mjs', 'e.test.mjs', 'f.test.mjs'];
const durations = new Map([
  ['a.test.mjs', 90],
  ['b.test.mjs', 60],
  ['c.test.mjs', 40],
  ['d.test.mjs', 20],
]);

describe('assignShards', () => {
  it('puts every file in exactly one shard', () => {
    for (const count of [1, 2, 3, 6]) {
      const shards = assignShards(files, durations, count);
      expect(shards).toHaveLength(count);
      expect(shards.flat().toSorted()).toEqual(files);
    }
  });

  it('gives each shard the heaviest file left when it is the lightest', () => {
    expect(assignShards(files, durations, 3)).toEqual([
      ['a.test.mjs'],
      ['b.test.mjs', 'e.test.mjs'],
      ['c.test.mjs', 'd.test.mjs', 'f.test.mjs'],
    ]);
  });

  it('does not depend on the order the runner lists the files in', () => {
    expect(assignShards(files.toReversed(), durations, 4)).toEqual(
      assignShards(files, durations, 4),
    );
  });

  it('weighs a file with no recorded duration as one second', () => {
    expect(
      heaviestFirst(['z.test.mjs', 'y.test.mjs', 'x.test.mjs'], new Map([['z.test.mjs', 2]])),
    ).toEqual(['z.test.mjs', 'x.test.mjs', 'y.test.mjs']);
  });
});

describe('createDurationSequencer', () => {
  const root = path.resolve('/repository');
  const specification = (file) => ({ moduleId: path.join(root, file) });
  const specifications = files.map(specification);

  it('runs its own shard, heaviest file first', () => {
    const context = { config: { root, shard: { index: 3, count: 3 } } };
    const sequencer = createDurationSequencer(context, durations);
    const shard = sequencer.shard(specifications);
    expect(shard).toEqual(['c.test.mjs', 'd.test.mjs', 'f.test.mjs'].map(specification));
    expect(sequencer.sort(shard.toReversed())).toEqual(shard);
  });

  it('starts the heaviest files first when the suite is not sharded', () => {
    const sequencer = createDurationSequencer({ config: { root } }, durations);
    expect(sequencer.sort(specifications.toReversed()).slice(0, 2)).toEqual([
      specification('a.test.mjs'),
      specification('b.test.mjs'),
    ]);
  });

  it('reads the recorded durations of this repository', () => {
    expect([...readDurations().values()].every((seconds) => Number.isInteger(seconds))).toBe(true);
  });
});

describe('mergeDurations', () => {
  const root = path.resolve('/repository');
  const measured = (file, milliseconds) => ({
    moduleId: path.join(root, file),
    diagnostic: {
      environmentSetupDuration: 0,
      prepareDuration: 100,
      collectDuration: 200,
      setupDuration: 0,
      duration: milliseconds,
    },
  });

  it('records whole seconds, setup and import included, for files over a second', () => {
    const modules = [measured('slow.test.mjs', 12_000), measured('quick.test.mjs', 400)];
    expect(mergeDurations(new Map(), modules, root)).toEqual({ 'slow.test.mjs': 13 });
  });

  it('replaces the files it measured and keeps the others', () => {
    const previous = new Map([
      ['quick.test.mjs', 5],
      ['core/other.test.mjs', 7],
    ]);
    const modules = [measured('quick.test.mjs', 400), measured('slow.test.mjs', 1500)];
    expect(mergeDurations(previous, modules, root)).toEqual({
      'core/other.test.mjs': 7,
      'slow.test.mjs': 2,
    });
  });
});
