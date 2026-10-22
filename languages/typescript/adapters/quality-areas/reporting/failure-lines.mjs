import { stripAnsi } from '../../../preset/test-console/ansi.mjs';

const MAX_ASSERTION_LINE_LENGTH = 200;

export function firstLine(message) {
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

const setupHints = [
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

export function missingSetupHints(failures) {
  return setupHints
    .filter(({ pattern }) => failures.some(({ assertion }) => pattern.test(assertion)))
    .map(({ hint }) => hint.join(' '));
}

const TIMEOUT_MARKER = 'STACK_TRACE_ERROR';
const UNHANDLED_HEADER = /^⎯+ (Unhandled Rejection|Uncaught Exception|Unhandled Error) ⎯+$/gmu;
const ORIGIN_PATTERN = /This error originated in "([^"]+)" test file/u;
const SNAPSHOT_MISMATCH = /^(?:\w*Error: )?Snapshot `.*` mismatched/u;

export function timeoutText(assertion) {
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

function blockMessage(block) {
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

export function unhandledErrors(output) {
  const text = typeof output === 'string' ? stripAnsi(output) : '';
  const headers = [...text.matchAll(UNHANDLED_HEADER)];
  return headers.map((header, index) => {
    const end = headers[index + 1]?.index ?? text.length;
    const block = text.slice(header.index + header[0].length, end);
    return {
      kind: header[1].toLowerCase(),
      message: blockMessage(block),
      file: ORIGIN_PATTERN.exec(block)?.[1],
    };
  });
}

export function unhandledErrorText(errors) {
  const [first] = errors;
  const where = first.file === undefined ? '' : ` from ${first.file}`;
  const more = errors.length > 1 ? ` (and ${String(errors.length - 1)} more)` : '';
  return `Vitest caught an ${first.kind}${where}: ${first.message}${more}. Await or return the promise in the test so its failure fails the test, then rerun; coverage, CRAP and mutation were skipped.`;
}

export function withSnapshotAdvice(line) {
  return SNAPSHOT_MISMATCH.test(line)
    ? `${line}. A new snapshot must be committed: run \`vitest -u\` locally and commit the .snap file.`
    : line;
}
