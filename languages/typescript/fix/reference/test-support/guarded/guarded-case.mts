export type Replacement = readonly [string, string];

export type GuardedCase = {
  readonly rule: string;
  readonly input: string;
  readonly fixed?: Replacement;
  readonly selected?: Replacement;
};
