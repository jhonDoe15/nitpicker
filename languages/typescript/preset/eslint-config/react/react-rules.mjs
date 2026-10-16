import { EXCEPTION_HINT, GENERAL_HINT } from '../rule-hints.mjs';
import { extraAccessibilityRuleNames } from './rules/accessibility-rules.mjs';
import { nitpickerReactRuleIds } from './rules/nitpicker-rules.mjs';
import { thirdPartyReactRuleIds } from './rules/third-party-rules.mjs';

export { stylingApproaches } from '../../eslint-plugin/rules/react/react-single-styling-approach.mjs';

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
  ...extraAccessibilityRuleNames,
];

export const reactRuleIds = [
  'nitpicker/no-runtime-exclusive-props-check',
  'nitpicker/no-singular-and-plural-prop',
  'nitpicker/react-no-effect-data-fetching',
  'nitpicker/react-no-effect-derived-state',
  'nitpicker/react-no-hardcoded-colors',
  'nitpicker/react-single-styling-approach',
  'react-hooks/exhaustive-deps',
  'react-hooks/rules-of-hooks',
  ...nitpickerReactRuleIds,
  ...thirdPartyReactRuleIds,
  ...accessibilityRuleNames.map((name) => `jsx-a11y/${name}`),
];

export const testingLibraryHints = {
  'await-async-events': `. Await the call: \`await user.<event>(...)\`. On user-event v13, whose calls are synchronous, ${EXCEPTION_HINT}`,
  'await-async-queries': `. Await it: \`await screen.findByRole(...)\`.${GENERAL_HINT}`,
  'await-async-utils': `. Await it: \`await waitFor(...)\`.${GENERAL_HINT}`,
  'no-debugging-utils': `. Remove the debug output and assert what you were looking for: \`expect(screen.getByRole(...)).toBeVisible()\`.${GENERAL_HINT}`,
  'no-manual-cleanup': ` Testing Library unmounts after each test by itself in this project: remove the call.${GENERAL_HINT}`,
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
  'nitpicker/hover-test-needs-keyboard',
  'nitpicker/react-test-no-implementation-details',
  ...testingLibraryRuleIds,
];

export const reactNativeTestingPackage = '@testing-library/react-native';

export const testingLibrarySettings = { 'testing-library/utils-module': 'test-utils' };

const confusingBrowserGlobals = [
  'addEventListener',
  'blur',
  'close',
  'closed',
  'confirm',
  'defaultStatus',
  'defaultstatus',
  'event',
  'external',
  'find',
  'focus',
  'frameElement',
  'frames',
  'history',
  'innerHeight',
  'innerWidth',
  'length',
  'location',
  'locationbar',
  'menubar',
  'moveBy',
  'moveTo',
  'name',
  'onblur',
  'onerror',
  'onfocus',
  'onload',
  'onresize',
  'onunload',
  'open',
  'opener',
  'opera',
  'outerHeight',
  'outerWidth',
  'pageXOffset',
  'pageYOffset',
  'parent',
  'print',
  'removeEventListener',
  'resizeBy',
  'resizeTo',
  'screen',
  'screenLeft',
  'screenTop',
  'screenX',
  'screenY',
  'scroll',
  'scrollbars',
  'scrollBy',
  'scrollTo',
  'scrollX',
  'scrollY',
  'self',
  'status',
  'statusbar',
  'stop',
  'toolbar',
  'top',
];

export const restrictedBrowserGlobals = [
  'error',
  ...confusingBrowserGlobals.map((name) => ({
    name,
    message: `\`${name}\` here is the browser global, not a local value. Write \`window.${name}\` when you mean the global; otherwise take the value as a parameter (\`onClick={(event) => ...}\`) or declare it.${GENERAL_HINT}`,
  })),
];
