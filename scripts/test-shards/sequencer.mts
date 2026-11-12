import { readFileSync } from 'node:fs';
import path from 'node:path';
import { durationFile } from './duration-profile.mts';

const UNMEASURED_SECONDS = 1;
const UNSHARDED = { index: 1, count: 1 };

export type Durations = ReadonlyMap<string, number>;

export type SequencerContext = {
  readonly config: {
    readonly root: string;
    readonly shard?: { readonly index: number; readonly count: number };
  };
};

type Specification = { readonly moduleId: string };

type Shard = { readonly load: number; readonly files: readonly string[] };

function secondsByFile(parsed: unknown, file: string): Map<string, number> {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${file} must hold an object of seconds by test file`);
  }
  return new Map(
    Object.entries(parsed).map(([test, seconds]: [string, unknown]) => {
      if (typeof seconds !== 'number') {
        throw new Error(`${file} must hold a number of seconds for ${test}`);
      }
      return [test, seconds];
    }),
  );
}

export function readDurations(file: string = durationFile()): Map<string, number> {
  return secondsByFile(JSON.parse(readFileSync(file, 'utf8')), file);
}

export function weightOf(durations: Durations, file: string): number {
  return durations.get(file) ?? UNMEASURED_SECONDS;
}

export function heaviestFirst(files: readonly string[], durations: Durations): string[] {
  return files.toSorted(
    (left, right) =>
      weightOf(durations, right) - weightOf(durations, left) || left.localeCompare(right),
  );
}

function lightestShard(shards: readonly Shard[]): number {
  return shards.reduce(
    (best, shard, index) => (shard.load < (shards[best]?.load ?? Infinity) ? index : best),
    0,
  );
}

export function assignShards(
  files: readonly string[],
  durations: Durations,
  count: number,
): string[][] {
  const empty: Shard[] = Array.from({ length: count }, () => ({ load: 0, files: [] }));
  const shards = heaviestFirst([...new Set(files)], durations).reduce((current, file) => {
    const target = lightestShard(current);
    const shard = current[target] ?? { load: 0, files: [] };
    return current.with(target, {
      load: shard.load + weightOf(durations, file),
      files: [...shard.files, file],
    });
  }, empty);
  return shards.map((shard) => [...shard.files]);
}

export type DurationSequencer = {
  readonly shard: <Item extends Specification>(specifications: readonly Item[]) => Item[];
  readonly sort: <Item extends Specification>(specifications: readonly Item[]) => Item[];
};

export function createDurationSequencer(
  context: SequencerContext,
  durations: Durations = readDurations(),
): DurationSequencer {
  function fileOf(specification: Specification): string {
    return path.relative(context.config.root, specification.moduleId).split(path.sep).join('/');
  }
  function inFileOrder<Item extends Specification>(
    specifications: readonly Item[],
    files: readonly string[],
  ): Item[] {
    return files.flatMap((file) =>
      specifications.filter((specification) => fileOf(specification) === file),
    );
  }
  function filesOf(specifications: readonly Specification[]): string[] {
    return specifications.map(fileOf);
  }
  return {
    shard: (specifications) => {
      const { index, count } = context.config.shard ?? UNSHARDED;
      const shards = assignShards(filesOf(specifications), durations, count);
      return inFileOrder(specifications, shards[index - 1] ?? []);
    },
    sort: (specifications) =>
      inFileOrder(specifications, heaviestFirst([...new Set(filesOf(specifications))], durations)),
  };
}
