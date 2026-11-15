export type RuffRule = {
  readonly code: string;
  readonly name: string;
  readonly linter: string;
  readonly summary: string;
  readonly whatItDoes?: string;
  readonly why?: string;
  readonly useInstead?: string;
  readonly safeFix?: true;
  readonly fix?: string;
  readonly explanation?: string;
};

export type RuffSnapshot = {
  readonly version: string;
  readonly rules: readonly RuffRule[];
};

export const parseRuffSnapshot: (text: string) => RuffSnapshot = JSON.parse;
export const parseRuffRules: (text: string) => RuffRule[] = JSON.parse;
