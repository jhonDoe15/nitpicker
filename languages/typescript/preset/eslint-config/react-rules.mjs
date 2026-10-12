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

export const testingLibraryHints = {
  'await-async-events': '. Await it: `await userEvent.click(button)`.',
  'no-node-access':
    ' Query by accessible role: `screen.getByRole("listitem")`, or `within(...)` to narrow the search. If the markup has no accessible role, add an exception for this rule in nitpicker.config.json.',
  'no-test-id-queries':
    ' Query by accessible role: `screen.getByRole("button", { name: "Save" })`. If the element has no role or name, add an exception for this rule in nitpicker.config.json.',
  'prefer-user-event':
    '. `userEvent` fires the whole sequence of browser events: `await userEvent.click(button)`. If an event has no `userEvent` equivalent, add an exception for this rule in nitpicker.config.json.',
};

const testingLibraryRuleIds = Object.keys(testingLibraryHints).map(
  (name) => `testing-library/${name}`,
);

export const reactTestRuleIds = [
  'nitpicker/react-test-no-implementation-details',
  ...testingLibraryRuleIds,
];
