type IngestedLocation = {
  readonly line?: number | undefined;
  readonly column?: number | undefined;
};

export type IngestedFinding = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly identity: string;
  readonly message: string;
  readonly classification: string;
  readonly subject?: string;
  readonly hintData?: unknown;
  readonly location?: IngestedLocation;
  readonly symbol?: string;
  readonly metric?: { readonly name: string; readonly value: number };
  readonly [field: string]: unknown;
};

export type RulesReportEntry = {
  readonly rule: string;
  readonly path: string;
  readonly subject: string;
  readonly line?: number | undefined;
  readonly data?: unknown;
  readonly error?: string;
  readonly via?: string;
};

export type IngestOptions = {
  readonly roots?: readonly (string | undefined)[];
  readonly root?: string;
  readonly tool?: string;
  readonly minimum?: number;
  readonly sourceText?: ((path: string) => string | undefined) | undefined;
  readonly functions?: readonly unknown[];
};

export type FindingsResult = {
  readonly findings: IngestedFinding[];
};
