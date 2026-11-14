import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fieldOf, listOf } from '../../../../../shared/values/readers.mts';
import {
  type ShownValues,
  formattedValue,
  stripAnsi,
  valuesInMessage,
} from '../typed/reporting.mts';

export type ReportedAssertion = {
  readonly status?: unknown;
  readonly fullName?: unknown;
  readonly title?: unknown;
  readonly duration?: unknown;
  readonly failureMessages?: readonly unknown[];
  readonly failureDetails?: unknown;
  readonly location?: { readonly line?: unknown };
};

export type UnhandledError = {
  readonly kind: string;
  readonly message: string;
  readonly file: string | undefined;
};

type FrameLocation = { readonly file: string; readonly line: number };

type SetupHint = { readonly pattern: RegExp; readonly hint: readonly string[] };

type DetailValues = { readonly expected: unknown; readonly received: unknown };

type AssertionDetails = ShownValues & { readonly line?: number };

const MAX_ASSERTION_LINE_LENGTH = 200;

export function firstLine(message: unknown): string {
  const line =
    typeof message === 'string'
      ? stripAnsi(message)
          .split('\n')
          .map((candidate) => candidate.trim())
          .find((candidate) => candidate.length > 0)
      : undefined;
  if (line === undefined) {
    return '';
  }
  return line.length > MAX_ASSERTION_LINE_LENGTH
    ? `${line.slice(0, MAX_ASSERTION_LINE_LENGTH)}…`
    : line;
}

const jestDomMatchers = [
  'toBeInTheDocument',
  'toBeVisible',
  'toBeDisabled',
  'toBeEnabled',
  'toBeChecked',
  'toBeEmptyDOMElement',
  'toHaveTextContent',
  'toHaveAttribute',
  'toHaveClass',
  'toHaveStyle',
  'toHaveValue',
  'toHaveDisplayValue',
  'toHaveFocus',
  'toHaveAccessibleName',
].join('|');

const setupHints: readonly SetupHint[] = [
  {
    pattern: /\b(?:document|window|navigator|HTMLElement) is not defined\b/u,
    hint: [
      'Hint: the test runs without a DOM.',
      "Set `environment: 'jsdom'` under `test` in the Vitest config.",
    ],
  },
  {
    pattern: new RegExp(`Invalid Chai property: (?:${jestDomMatchers})\\b`, 'u'),
    hint: [
      'Hint: the jest-dom matchers are not registered.',
      "Add `import '@testing-library/jest-dom/vitest'` to a file listed in `test.setupFiles`.",
    ],
  },
  {
    pattern:
      /\b(?:describe|it|test|expect|vi|beforeAll|beforeEach|afterAll|afterEach) is not defined\b/u,
    hint: [
      'Hint: the test globals are off. Set `globals: true` under `test` in the Vitest config,',
      'which also lets Testing Library clean up after each test.',
    ],
  },
];

export function missingSetupHints(failures: readonly { readonly assertion: string }[]): string[] {
  return setupHints
    .filter(({ pattern }) => failures.some(({ assertion }) => pattern.test(assertion)))
    .map(({ hint }) => hint.join(' '));
}

const MISSING_ENVIRONMENT = new RegExp(
  [
    String.raw`\b(?:invalid|missing) (?:required )?env(?:ironment)?\b`,
    String.raw`\benv(?:ironment)? (?:var(?:iable)?s? )?(?:is |are )?(?:missing|required|not set|undefined)`,
  ].join('|'),
  'iu',
);
const MISSING_VARIABLE =
  /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+ (?:is|are) (?:required|missing|not set|undefined)\b/u;
const ENVIRONMENT_HINT = [
  'Hint: the tests need environment variables that are not set.',
  'Ignored files such as `.env` are not in the snapshots; export the variables in the shell that runs nitpicker.',
].join(' ');

export function missingEnvironmentHints(
  failures: readonly { readonly assertion: string }[],
): string[] {
  return failures.some(
    ({ assertion }) => MISSING_ENVIRONMENT.test(assertion) || MISSING_VARIABLE.test(assertion),
  )
    ? [ENVIRONMENT_HINT]
    : [];
}

const TIMEOUT_MARKER = 'STACK_TRACE_ERROR';
const UNHANDLED_HEADER = /^⎯+ (Unhandled Rejection|Uncaught Exception|Unhandled Error) ⎯+$/gmu;
const ORIGIN_PATTERN = /This error originated in "([^"]+)" test file/u;
const SNAPSHOT_MISMATCH = /^(?:\w*Error: )?Snapshot `.*` mismatched/u;

export function timeoutText(assertion: ReportedAssertion): string | undefined {
  const [first] = assertion.failureMessages ?? [];
  if (typeof first !== 'string' || !first.includes(TIMEOUT_MARKER)) {
    return undefined;
  }
  const milliseconds =
    typeof assertion.duration === 'number'
      ? ` after ${String(Math.round(assertion.duration))} ms`
      : '';
  return `Test timed out${milliseconds}. A fake clock that was never restored (\`vi.useRealTimers()\` in \`afterEach\`), a promise that never settles or a long wait is the usual cause.`;
}

function blockMessage(block: string): string {
  const line = block
    .split('\n')
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate.length > 0);
  if (line === undefined) {
    return '';
  }
  return line.length > MAX_ASSERTION_LINE_LENGTH
    ? `${line.slice(0, MAX_ASSERTION_LINE_LENGTH)}…`
    : line;
}

export function unhandledErrors(output: unknown): UnhandledError[] {
  const text = typeof output === 'string' ? stripAnsi(output) : '';
  const headers = [...text.matchAll(UNHANDLED_HEADER)];
  return headers.map((header, index) => {
    const end = headers[index + 1]?.index ?? text.length;
    const block = text.slice(header.index + header[0].length, end);
    return {
      kind: (header[1] ?? '').toLowerCase(),
      message: blockMessage(block),
      file: ORIGIN_PATTERN.exec(block)?.[1],
    };
  });
}

export function unhandledErrorText(errors: readonly [UnhandledError, ...UnhandledError[]]): string {
  const [first] = errors;
  const where = first.file === undefined ? '' : ` from ${first.file}`;
  const more = errors.length > 1 ? ` (and ${String(errors.length - 1)} more)` : '';
  return `Vitest caught an ${first.kind}${where}: ${first.message}${more}. Await or return the promise in the test so its failure fails the test, then rerun; coverage, CRAP and mutation were skipped.`;
}

export function withSnapshotAdvice(line: string): string {
  return SNAPSHOT_MISMATCH.test(line)
    ? `${line}. A new snapshot must be committed: run \`vitest -u\` locally and commit the .snap file.`
    : line;
}

const FRAME_START = 'at ';
const FRAME_END = /:(?<line>\d+):\d+$/u;
const QUERY = /\?[^/]*$/u;

function framePath(file: string): string {
  return file.startsWith('file://') && URL.canParse(file) && new URL(file).hostname === ''
    ? fileURLToPath(file)
    : file;
}

function frameLocation(text: string): FrameLocation | undefined {
  const frame = text.trim();
  if (!frame.startsWith(FRAME_START)) {
    return undefined;
  }
  const open = frame.lastIndexOf(' (');
  const site =
    frame.endsWith(')') && open !== -1
      ? frame.slice(open + 2, -1)
      : frame.slice(FRAME_START.length);
  const end = FRAME_END.exec(site);
  return end === null
    ? undefined
    : {
        file: framePath(site.slice(0, end.index).replace(QUERY, '')),
        line: Number(end.groups?.['line']),
      };
}

function lineInFile(message: unknown, testFile: unknown, projectRoot: string): number | undefined {
  if (typeof message !== 'string' || typeof testFile !== 'string') {
    return undefined;
  }
  return stripAnsi(message)
    .split('\n')
    .map((line) => frameLocation(line))
    .find((frame) => frame !== undefined && path.resolve(projectRoot, frame.file) === testFile)
    ?.line;
}

function detailValues(detail: unknown): DetailValues | undefined {
  const values = fieldOf(detail, 'matcherResult') ?? detail;
  if (values === null || typeof values !== 'object' || !('expected' in values)) {
    return undefined;
  }
  if (!('actual' in values)) {
    return undefined;
  }
  return fieldOf(detail, 'formatted') === true
    ? { expected: values.expected, received: values.actual }
    : { expected: formattedValue(values.expected), received: formattedValue(values.actual) };
}

export function assertionDetails(
  assertion: ReportedAssertion,
  {
    testFile,
    projectRoot,
  }: { readonly testFile: string | undefined; readonly projectRoot: string },
): AssertionDetails | DetailValues {
  const [message] = (assertion.failureMessages ?? []).filter((text) => typeof text === 'string');
  const details = listOf(assertion.failureDetails);
  const values = detailValues(details[0]) ?? valuesInMessage(stripAnsi(message ?? ''));
  const line = lineInFile(message, testFile, projectRoot) ?? assertion.location?.line;
  return { ...(typeof line === 'number' && Number.isInteger(line) ? { line } : {}), ...values };
}
