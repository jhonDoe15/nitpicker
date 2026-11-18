export type CallFact = {
  name: string;
  positional: number;
  named: string[];
  spread: boolean;
  lambda: boolean;
  qualifier?: string;
};

export type Declaration = {
  packageName: string;
  top: string;
  owner: string;
  kind: string;
  extension: boolean;
};

export type DeclarationInput = {
  owner: string;
  name: string;
  kind: string;
  extension: boolean;
};

export type CallerGap = {
  label: string;
  tests?: true;
  owner: string | undefined;
  reaches?: (string | undefined)[];
};
