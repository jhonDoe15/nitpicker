export type FlatEntry = Readonly<Record<string, unknown>>;

export type OwnedPolicy = {
  readonly enabled: ReadonlySet<string>;
  readonly plugins: ReadonlySet<string>;
  readonly settings: ReadonlySet<string>;
};

export type ProjectLayer = {
  readonly config: string;
  readonly nitpickerFirst: boolean;
  readonly addsRules: boolean;
};

export function listField(entry: FlatEntry, key: string): readonly unknown[] | undefined {
  const value = entry[key];
  return Array.isArray(value) ? value : undefined;
}

export function recordField(
  entry: FlatEntry,
  key: string,
): Readonly<Record<string, unknown>> | undefined {
  const value = entry[key];
  return typeof value === 'object' && value !== null
    ? Object.fromEntries(Object.entries(value))
    : undefined;
}
