const FILE = 'src/main/features/greeting/adapters/load-names.ts';

function entry(rule: string): string {
  return `If this is intended, add {"rule":"${rule}","paths":["${FILE}"],"reason":"..."} to "exceptions" in nitpicker.config.json.`;
}

type FindingSpec = {
  readonly tool: string;
  readonly rule: string;
  readonly line: number;
  readonly advice: string;
  readonly column?: number;
};

function finding({ tool, rule, line, advice, column }: FindingSpec) {
  return {
    tool,
    rule,
    path: FILE,
    identity: `${tool}/${rule}:${String(line)}`,
    classification: 'enforceable',
    location: column === undefined ? { line } : { line, column },
    message: `${advice} ${entry(rule)}`,
  };
}

export const SAMPLE_FINDINGS = [
  finding({
    tool: 'eslint-errors',
    rule: 'nitpicker/no-silent-catch',
    line: 8,
    advice:
      "This catch discards the failure. Return a failure result (`return { kind: 'malformed-json' }`), or rethrow an Error subclass with `{ cause: error }`. An exception fits only when dropping it is intended.",
    column: 5,
  }),
  finding({
    tool: 'eslint-lint',
    rule: 'nitpicker/no-handwritten-boundary-guard',
    line: 6,
    advice:
      'Pass `JSON.parse(text)` straight into `schema.safeParse(...)` inside the same `try`. An exception fits only when the text is trusted and already typed.',
    column: 18,
  }),
  finding({
    tool: 'eslint-lint',
    rule: 'no-restricted-syntax',
    line: 6,
    advice:
      'Do not assert with `as`. Narrow the value (a discriminated union check or a zod parse) or give it the correct type at its source. `as const` is allowed.',
    column: 18,
  }),
  finding({
    tool: 'mutation',
    rule: 'mutant-survived',
    line: 9,
    advice:
      'Survived ArrayDeclaration at column 12: replacing `[]` with `["Stryker was here"]` fails no test. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
  }),
];

const JAVA_FILE = 'src/main/java/shop/Order.java';

export const JAVA_FINDINGS = [
  {
    tool: 'pmd',
    rule: 'UnusedPrivateField',
    path: JAVA_FILE,
    identity: 'pmd/UnusedPrivateField:7',
    classification: 'enforceable',
    location: { line: 7, column: 21 },
    message: `Avoid unused private fields such as total. If this is intended, add {"rule":"pmd/UnusedPrivateField","paths":["${JAVA_FILE}"],"reason":"..."} to "exceptions" in nitpicker.config.json.`,
  },
];

export type SampleReport = {
  readonly summary: object;
  readonly newFindings: readonly object[];
  readonly resolvedFindings: readonly object[];
  readonly unchangedFindings: readonly object[];
  readonly changedMetrics: readonly object[];
  readonly toolErrors: readonly object[];
  readonly notes: readonly object[];
};

export function sampleReport(
  newFindings: readonly object[] = SAMPLE_FINDINGS,
  summary: object = {},
): SampleReport {
  return {
    summary: {
      requestedBaseRef: 'main',
      mergeBaseSha: '3f9c2a71b0d4e8c5',
      headSha: '9d41e7a2c6b0f813',
      ...summary,
    },
    newFindings,
    resolvedFindings: [],
    unchangedFindings: [],
    changedMetrics: [],
    toolErrors: [],
    notes: [],
  };
}
