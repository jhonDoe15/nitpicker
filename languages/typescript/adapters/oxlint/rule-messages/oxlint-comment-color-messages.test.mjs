import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { rule as noComments } from '../../../preset/eslint-plugin/rules/modules/no-comments.mjs';
import { rule as noFixedSleep } from '../../../preset/eslint-plugin/rules/testing/lifecycle/no-fixed-sleep-synchronization.mjs';
import { rule as noHardcodedColors } from '../../../preset/eslint-plugin/rules/react/theme/react-no-hardcoded-colors.mjs';
import { createProject, lintProject } from '../test-support/oxlint-project.mjs';

const POLICY = `import tseslint from ${JSON.stringify(import.meta.resolve('typescript-eslint'))};
import { nitpickerRules } from ${JSON.stringify(import.meta.resolve('../../../preset/eslint-plugin/index.mjs'))};

export default [
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
    plugins: { nitpicker: nitpickerRules },
    rules: {
      'nitpicker/no-comments': 'error',
      'nitpicker/no-fixed-sleep-synchronization': 'error',
      'nitpicker/react-no-hardcoded-colors': 'error',
    },
  },
];
`;

const SOURCES = {
  'src/orders.ts': '/** Gets the order id. */\nexport function getOrderId() { return 1; }\n',
  'src/rounding.ts':
    '/**\n * One.\n * Two.\n * Three.\n * Four.\n * Five.\n * Six.\n */\nexport const rounding = 1;\n',
  'src/panel.tsx':
    "export const Panel = () => <div style={{ color: '#336699', background: 'red' }} />;\n",
  'src/tooltip.test.ts':
    "await expect(screen.findByRole('tooltip')).rejects.toThrow();\nawait page.waitForTimeout(500);\ncy.wait(500);\n",
};

function textOf(rule, messageId, data = {}) {
  return rule.meta.messages[messageId].replaceAll(/\{\{(\w+)\}\}/gu, (_, key) => data[key]);
}

function finding(ruleId, rule, messageId, data) {
  return { ruleId, messageId, message: textOf(rule, messageId, data) };
}

const EXPECTED = {
  'src/orders.ts': [
    finding('nitpicker/no-comments', noComments, 'restatingDocComment', { name: 'getOrderId' }),
  ],
  'src/rounding.ts': [
    finding('nitpicker/no-comments', noComments, 'longDocComment', { lines: 6, limit: 5 }),
  ],
  'src/panel.tsx': ['#336699', 'red'].map((color) =>
    finding('nitpicker/react-no-hardcoded-colors', noHardcodedColors, 'hardcodedColor', { color }),
  ),
  'src/tooltip.test.ts': ['negativeTimeoutAssertion', 'playwrightTimeout', 'cypressWait'].map(
    (messageId) =>
      finding('nitpicker/no-fixed-sleep-synchronization', noFixedSleep, messageId, {
        advanceFakeTime: 'vi.advanceTimersByTime',
      }),
  ),
};

const roots = [];

afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('nitpicker rule messages through the oxlint engine', () => {
  it('keeps the doc comment, hard-coded color and wall-clock wait messages with their data', () => {
    const root = createProject('nitpicker-oxlint-messages-', { 'policy.mjs': POLICY, ...SOURCES });
    roots.push(root);
    const results = lintProject({ root, patterns: ['src/**/*.{ts,tsx}'] });

    const messages = Object.fromEntries(
      Object.keys(EXPECTED).map((file) => [
        file,
        results
          .find((result) => result.filePath === path.join(root, file))
          ?.messages.map(({ ruleId, messageId, message }) => ({ ruleId, messageId, message })),
      ]),
    );

    expect(messages).toEqual(EXPECTED);
  });
});
