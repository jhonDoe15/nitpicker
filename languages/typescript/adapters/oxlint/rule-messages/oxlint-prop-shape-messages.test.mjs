import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { lintWithOxlint } from '../oxlint-runner.mjs';

const RULES_URL = import.meta.resolve('../../../preset/eslint-plugin/rules');

function ruleUrl(path) {
  return JSON.stringify(`${RULES_URL}/${path}`);
}

const POLICY = `import tseslint from ${JSON.stringify(import.meta.resolve('typescript-eslint'))};
import { rule as singularAndPlural } from ${ruleUrl('react-props/no-singular-and-plural-prop.mjs')};
import { rule as exclusiveProps } from ${ruleUrl('react-props/no-runtime-exclusive-props-check.mjs')};
import { rule as unionPredicate } from ${ruleUrl('api-shape/exhaustive-union-predicate.mjs')};
import { rule as hoverNeedsKeyboard } from ${ruleUrl('react-tests/hover-test-needs-keyboard.mjs')};
import { rule as forwardingWrapper } from ${ruleUrl('api-shape/no-forwarding-wrapper.mjs')};
import { rule as timeoutAbandons } from ${ruleUrl('async/timeout-abandons-operation.mjs')};

const nitpicker = {
  rules: {
    'no-singular-and-plural-prop': singularAndPlural,
    'no-runtime-exclusive-props-check': exclusiveProps,
    'exhaustive-union-predicate': unionPredicate,
    'hover-test-needs-keyboard': hoverNeedsKeyboard,
    'no-forwarding-wrapper': forwardingWrapper,
    'timeout-abandons-operation': timeoutAbandons,
  },
};

export default [
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
    plugins: { nitpicker },
    rules: {
      'nitpicker/no-singular-and-plural-prop': 'error',
      'nitpicker/no-runtime-exclusive-props-check': 'error',
      'nitpicker/exhaustive-union-predicate': 'error',
      'nitpicker/hover-test-needs-keyboard': 'error',
      'nitpicker/no-forwarding-wrapper': 'error',
      'nitpicker/timeout-abandons-operation': 'error',
    },
  },
];
`;

const SOURCES = {
  'src/race.ts': [
    'export const run = () =>',
    '  Promise.race([sendPayment(), new Promise((_, reject) => setTimeout(reject, 10))]);',
  ].join('\n'),
  'src/Panel.tsx': [
    'export type PanelProps = { field?: string; fields?: string[] };',
    'export function Panel({ icon, image }: { icon?: string; image?: string }) {',
    '  if (icon && image) { throw new Error("both"); }',
    '  return <div />;',
    '}',
  ].join('\n'),
  'src/Tip.test.tsx': [
    "import { render } from '@testing-library/react';",
    "import userEvent from '@testing-library/user-event';",
    "it('shows', async () => { render(null); await userEvent.hover(document.body); });",
  ].join('\n'),
};

const RACE_MESSAGE =
  '`Promise.race` with a `new Promise` around `setTimeout` does not stop `sendPayment`: when the timeout wins, the call keeps running and repeats its side effects if the caller retries. Create an `AbortController`, abort it from the timeout path and pass `{ signal: controller.signal }` to the operation, or pass `AbortSignal.timeout(ms)` straight to an API that accepts `signal` and drop the race. An exception fits only for background work that is meant to finish after the caller gave up.';

const EXPECTED = {
  'src/race.ts': [['nitpicker/timeout-abandons-operation', RACE_MESSAGE]],
  'src/Panel.tsx': [
    [
      'nitpicker/no-singular-and-plural-prop',
      `Optional props \`field\` and \`fields\` are two ways to pass the same data. Keep \`fields\` and pass a single item as a one-element array.`,
    ],
    [
      'nitpicker/no-runtime-exclusive-props-check',
      `Props \`icon\`, \`image\` are checked together at runtime. Make the props a discriminated union (\`{ icon: Icon; image?: never } | { image: string; icon?: never }\`) so the compiler rejects the combination.`,
    ],
  ],
  'src/Tip.test.tsx': [
    [
      'nitpicker/hover-test-needs-keyboard',
      `Every hover behavior needs a keyboard equivalent. Add a test that tabs to the element (\`await user.tab()\`) and asserts the same state.`,
    ],
  ],
};

let root;
let outcome;

function recordResidualRules(files, extraEnvironment) {
  outcome.residualRules = JSON.parse(extraEnvironment.NITPICKER_DIFF_ESLINT_ONLY_RULES);
  return [];
}

function lintOnce() {
  if (outcome !== undefined) {
    return outcome;
  }
  outcome = {};
  root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-oxlint-messages-')));
  const files = {
    'policy.mjs': POLICY,
    ...SOURCES,
  };
  for (const [relativePath, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
    writeFileSync(path.join(root, relativePath), text);
  }
  const environment = {
    ...process.env,
    NITPICKER_DIFF_ESLINT_POLICY_CONFIG: path.join(root, 'policy.mjs'),
    NITPICKER_DIFF_ESLINT_PROJECT_ROOT: root,
  };
  outcome.results = lintWithOxlint({
    options: { projectRoot: root, patterns: ['src/**/*.{ts,tsx}'] },
    environment,
    runEslintCli: recordResidualRules,
  });
  return outcome;
}

afterAll(() => {
  if (root !== undefined) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('nitpicker rule messages through the oxlint engine', () => {
  it.each(Object.entries(EXPECTED))('keeps the full message text in %s', (file, expected) => {
    const { results } = lintOnce();
    const messages = results
      .find((entry) => entry.filePath === path.join(root, file))
      .messages.map(({ ruleId, message }) => [ruleId, message]);

    expect(messages).toEqual(expected);
  });

  it('hands only the type-aware rules to the ESLint residual pass, where their messages are kept', () => {
    expect(lintOnce().residualRules).toEqual([
      'nitpicker/exhaustive-union-predicate',
      'nitpicker/no-forwarding-wrapper',
    ]);
  });
});
