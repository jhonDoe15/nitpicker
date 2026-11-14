import { fieldOf, textOf, textsOf } from '../../shared/values/readers.mts';

export type RunSummary = {
  readonly quick?: { readonly skipped: readonly string[]; readonly message: string };
  readonly staged?: true;
};

export type Quick = { skipped: readonly string[]; message: string };

export type Ctx = { readonly quick?: unknown; readonly staged?: unknown };

export type SarifProfile = {
  readonly notifications: readonly {
    readonly level: string;
    readonly message: { readonly text: string };
  }[];
  readonly properties: {
    readonly quick?: true;
    readonly skipped?: readonly string[];
    readonly staged?: true;
  };
};

export type Result = {
  readonly mode: string;
  readonly quick?: unknown;
  readonly staged?: true;
};

export type JunitProfile = {
  readonly propertyLines: readonly string[];
  readonly skippedCases: readonly string[];
  readonly skippedAttribute: string;
};

export function summaryOf(value: unknown): RunSummary {
  const quick = fieldOf(value, 'quick');
  return {
    ...(quick === undefined
      ? {}
      : {
          quick: {
            skipped: textsOf(fieldOf(quick, 'skipped')),
            message: textOf(fieldOf(quick, 'message')),
          },
        }),
    ...(fieldOf(value, 'staged') === true ? { staged: true as const } : {}),
  };
}
