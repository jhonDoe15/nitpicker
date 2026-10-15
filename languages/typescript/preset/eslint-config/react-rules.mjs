export { stylingApproaches } from '../eslint-plugin/rules/react-single-styling-approach.mjs';

export const defaultStylingApproach = 'class-names';

export const accessibilityRuleNames = [
  'alt-text',
  'anchor-has-content',
  'anchor-is-valid',
  'aria-activedescendant-has-tabindex',
  'aria-props',
  'aria-proptypes',
  'aria-role',
  'aria-unsupported-elements',
  'autocomplete-valid',
  'click-events-have-key-events',
  'heading-has-content',
  'html-has-lang',
  'iframe-has-title',
  'img-redundant-alt',
  'interactive-supports-focus',
  'label-has-associated-control',
  'media-has-caption',
  'mouse-events-have-key-events',
  'no-access-key',
  'no-autofocus',
  'no-distracting-elements',
  'no-interactive-element-to-noninteractive-role',
  'no-noninteractive-element-interactions',
  'no-noninteractive-element-to-interactive-role',
  'no-noninteractive-tabindex',
  'no-redundant-roles',
  'no-static-element-interactions',
  'role-has-required-aria-props',
  'role-supports-aria-props',
  'scope',
  'tabindex-no-positive',
];

export const reactRuleIds = [
  'nitpicker/react-no-effect-data-fetching',
  'nitpicker/react-no-effect-derived-state',
  'nitpicker/react-single-styling-approach',
  'react-hooks/exhaustive-deps',
  'react-hooks/rules-of-hooks',
  'react-x/no-array-index-key',
  'react-x/no-class-component',
  ...accessibilityRuleNames.map((name) => `jsx-a11y/${name}`),
];

export const EXCEPTION_HINT = 'add an exception for this rule in nitpicker.config.json.';
export const GENERAL_HINT = ` If this is intentional, ${EXCEPTION_HINT}`;

export const testingLibraryHints = {
  'await-async-events': `. Await the call: \`await user.<event>(...)\`. On user-event v13, whose calls are synchronous, ${EXCEPTION_HINT}`,
  'await-async-queries': `. Await it: \`await screen.findByRole(...)\`.${GENERAL_HINT}`,
  'await-async-utils': `. Await it: \`await waitFor(...)\`.${GENERAL_HINT}`,
  'no-debugging-utils': `. Remove the debug output and assert what you were looking for: \`expect(screen.getByRole(...)).toBeVisible()\`.${GENERAL_HINT}`,
  'no-manual-cleanup': ` With Vitest, set \`test.globals: true\` in the Vitest config so Testing Library registers it. If a setup file must call it, ${EXCEPTION_HINT}`,
  'no-node-access': ` Use \`screen.getByRole(...)\` or \`within(...)\`, and \`toHaveFocus()\` for focus.${GENERAL_HINT}`,
  'no-test-id-queries': ` Use \`screen.getByRole('button', { name: 'Save' })\`.${GENERAL_HINT}`,
  'no-unnecessary-act': `: \`render\` and \`user\` events already run in \`act\`. Call them directly.${GENERAL_HINT}`,
  'prefer-presence-queries': `: \`expect(screen.getByText('Saved')).toBeInTheDocument()\`, \`expect(screen.queryByText('Error')).not.toBeInTheDocument()\`.${GENERAL_HINT}`,
  'prefer-screen-queries': `. For part of the page use \`within(element).getByRole(...)\`.${GENERAL_HINT}`,
  'prefer-user-event': `. Use \`await user.click(button)\`.${GENERAL_HINT}`,
  'prefer-user-event-setup': `, with \`import { userEvent } from '@testing-library/user-event'\`.${GENERAL_HINT}`,
};

const testingLibraryRuleIds = Object.keys(testingLibraryHints).map(
  (name) => `testing-library/${name}`,
);

export const reactTestRuleIds = [
  'nitpicker/react-test-no-implementation-details',
  ...testingLibraryRuleIds,
];

export const reactNativeTestingPackage = '@testing-library/react-native';

export const testingLibrarySettings = { 'testing-library/utils-module': 'test-utils' };
