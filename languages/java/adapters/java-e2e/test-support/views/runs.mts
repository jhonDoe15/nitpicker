export type Runs<Key extends string, Run> = Partial<Record<Key, Run>>;

export function ranOf<Key extends string, Run>(runs: Runs<Key, Run>, key: Key): Run {
  const found = runs[key];
  if (found === undefined) {
    throw new Error(`The ${key} run did not finish`);
  }
  return found;
}
