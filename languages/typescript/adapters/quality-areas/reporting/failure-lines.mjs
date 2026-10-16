import { stripAnsi } from '../../../../../shared/rules/console/ansi.mjs';

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
