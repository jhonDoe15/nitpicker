import { readFileSync } from 'node:fs';
import path from 'node:path';
import { durationFile } from './duration-profile.mjs';

const UNMEASURED_SECONDS = 1;

export function readDurations(file = durationFile()) {
  return new Map(Object.entries(JSON.parse(readFileSync(file, 'utf8'))));
}

/**
 * The weight of a file without a measurement: the median of the measured ones (or one second
 * without any), so a new file needs no profile edit and still lands as a typical file would.
 */
export function unmeasuredWeight(durations) {
  const measured = [...durations.values()].toSorted((left, right) => left - right);
  return measured.length === 0 ? UNMEASURED_SECONDS : measured[Math.floor(measured.length / 2)];
}

/** The weight of `file` in `durations`, or the weight of an unmeasured file. */
export function weightOf(durations, file) {
  return durations.get(file) ?? unmeasuredWeight(durations);
}

export function heaviestFirst(files, durations) {
  return files.toSorted(
    (left, right) =>
      weightOf(durations, right) - weightOf(durations, left) || left.localeCompare(right),
  );
}

const lightestShard = (shards) =>
  shards.reduce((best, shard, index) => (shard.load < shards[best].load ? index : best), 0);

export function assignShards(files, durations, count) {
  const empty = Array.from({ length: count }, () => ({ load: 0, files: [] }));
  const shards = heaviestFirst([...new Set(files)], durations).reduce((current, file) => {
    const target = lightestShard(current);
    return current.with(target, {
      load: current[target].load + weightOf(durations, file),
      files: [...current[target].files, file],
    });
  }, empty);
  return shards.map((shard) => shard.files);
}

export function createDurationSequencer(context, durations = readDurations()) {
  const fileOf = (specification) =>
    path.relative(context.config.root, specification.moduleId).split(path.sep).join('/');
  const inFileOrder = (specifications, files) =>
    files.flatMap((file) =>
      specifications.filter((specification) => fileOf(specification) === file),
    );
  const filesOf = (specifications) => specifications.map(fileOf);
  return {
    shard: (specifications) => {
      const { index, count } = context.config.shard;
      return inFileOrder(
        specifications,
        assignShards(filesOf(specifications), durations, count)[index - 1],
      );
    },
    sort: (specifications) =>
      inFileOrder(specifications, heaviestFirst([...new Set(filesOf(specifications))], durations)),
  };
}
