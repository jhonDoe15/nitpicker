# TypeScript and JavaScript: ESLint plugin rules

The rules of the third-party ESLint plugins the presets use: Vitest, React, accessibility, Testing Library, i18n, regular expressions and functional style. This page lists 149 rules. [All pages](README.md).

The guide for these rules: [docs/typescript-strict-preset.md](../typescript-strict-preset.md).

The summaries of the ESLint rules are the `meta.docs.description` of each rule, from ESLint, typescript-eslint and the plugins, all under the MIT License.

Unless an entry says otherwise:

- **Analyzers:** `eslint-lint`

<a id="eslint-formatjs-enforce-default-message"></a>

### `eslint/formatjs/enforce-default-message`

Enforce defaultMessage in message descriptor.

- **Printed as:** `eslint-lint/formatjs/enforce-default-message`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with `i18n.enabled` or an i18n library.
- **Why it is on:** The i18n scope turns on the rules for internationalized messages.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://formatjs.github.io/docs/tooling/linter#enforce-default-message).
- **Exception:** If this is intended, add `{"rule":"formatjs/enforce-default-message","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/internationalized-messages.md), [Rule documentation](https://formatjs.github.io/docs/tooling/linter#enforce-default-message)

<a id="eslint-formatjs-enforce-description"></a>

### `eslint/formatjs/enforce-description`

Enforce description in message descriptor.

- **Printed as:** `eslint-lint/formatjs/enforce-description`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with `i18n.enabled` or an i18n library.
- **Why it is on:** The i18n scope turns on the rules for internationalized messages.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://formatjs.github.io/docs/tooling/linter#enforce-description).
- **Exception:** If this is intended, add `{"rule":"formatjs/enforce-description","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/internationalized-messages.md), [Rule documentation](https://formatjs.github.io/docs/tooling/linter#enforce-description)

<a id="eslint-formatjs-enforce-placeholders"></a>

### `eslint/formatjs/enforce-placeholders`

Enforce that all messages with placeholders have enough passed-in values.

- **Printed as:** `eslint-lint/formatjs/enforce-placeholders`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with `i18n.enabled` or an i18n library.
- **Why it is on:** The i18n scope turns on the rules for internationalized messages.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://formatjs.github.io/docs/tooling/linter#enforce-placeholders).
- **Exception:** If this is intended, add `{"rule":"formatjs/enforce-placeholders","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/internationalized-messages.md), [Rule documentation](https://formatjs.github.io/docs/tooling/linter#enforce-placeholders)

<a id="eslint-formatjs-no-complex-selectors"></a>

### `eslint/formatjs/no-complex-selectors`

Make sure a sentence is not too complex.
Complexity is determined by how many strings are produced when we try to
flatten the sentence given its selectors. For example:
"I have {count, plural, one{a dog} other{many dogs}}"
has the complexity of 2 because flattening the plural selector
results in 2 sentences: "I have a dog" & "I have many dogs".
Default complexity limit is 20
(using Smartling as a reference: https://help.smartling.com/hc/en-us/articles/360008030994-ICU-MessageFormat)
.

- **Printed as:** `eslint-lint/formatjs/no-complex-selectors`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with `i18n.enabled` or an i18n library.
- **Why it is on:** The i18n scope turns on the rules for internationalized messages.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://formatjs.github.io/docs/tooling/linter#no-complex-selectors).
- **Exception:** If this is intended, add `{"rule":"formatjs/no-complex-selectors","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/internationalized-messages.md), [Rule documentation](https://formatjs.github.io/docs/tooling/linter#no-complex-selectors)

<a id="eslint-formatjs-no-invalid-icu"></a>

### `eslint/formatjs/no-invalid-icu`

Make sure ICU messages are formatted correctly with no bad select statements, plurals, etc.

- **Printed as:** `eslint-lint/formatjs/no-invalid-icu`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with `i18n.enabled` or an i18n library.
- **Why it is on:** The i18n scope turns on the rules for internationalized messages.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset/internationalized-messages.md).
- **Exception:** If this is intended, add `{"rule":"formatjs/no-invalid-icu","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/internationalized-messages.md)

<a id="eslint-formatjs-no-literal-string-in-jsx"></a>

### `eslint/formatjs/no-literal-string-in-jsx`

Disallow untranslated literal strings without translation.

- **Printed as:** `eslint-lint/formatjs/no-literal-string-in-jsx`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with `i18n.enabled` or an i18n library.
- **Why it is on:** The i18n scope turns on the rules for internationalized messages.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://formatjs.github.io/docs/tooling/linter#no-literal-string-in-jsx).
- **Exception:** If this is intended, add `{"rule":"formatjs/no-literal-string-in-jsx","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/internationalized-messages.md), [Rule documentation](https://formatjs.github.io/docs/tooling/linter#no-literal-string-in-jsx)

<a id="eslint-formatjs-no-missing-icu-plural-one-placeholders"></a>

### `eslint/formatjs/no-missing-icu-plural-one-placeholders`

We use `one {# item}` instead of `one {1 item}` in ICU messages as some locales use the `one` formatting for other similar numbers.

- **Printed as:** `eslint-lint/formatjs/no-missing-icu-plural-one-placeholders`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with `i18n.enabled` or an i18n library.
- **Why it is on:** The i18n scope turns on the rules for internationalized messages.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://formatjs.github.io/docs/tooling/linter#no-explicit-icu-plural).
- **Exception:** If this is intended, add `{"rule":"formatjs/no-missing-icu-plural-one-placeholders","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/internationalized-messages.md), [Rule documentation](https://formatjs.github.io/docs/tooling/linter#no-explicit-icu-plural)

<a id="eslint-formatjs-no-multiple-plurals"></a>

### `eslint/formatjs/no-multiple-plurals`

Disallow multiple plural rules in the same message.

- **Printed as:** `eslint-lint/formatjs/no-multiple-plurals`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with `i18n.enabled` or an i18n library.
- **Why it is on:** The i18n scope turns on the rules for internationalized messages.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://formatjs.github.io/docs/tooling/linter#no-multiple-plurals).
- **Exception:** If this is intended, add `{"rule":"formatjs/no-multiple-plurals","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/internationalized-messages.md), [Rule documentation](https://formatjs.github.io/docs/tooling/linter#no-multiple-plurals)

<a id="eslint-formatjs-no-multiple-whitespaces"></a>

### `eslint/formatjs/no-multiple-whitespaces`

Prevents usage of multiple consecutive whitespaces in message.

- **Printed as:** `eslint-lint/formatjs/no-multiple-whitespaces`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with `i18n.enabled` or an i18n library.
- **Why it is on:** The i18n scope turns on the rules for internationalized messages.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://formatjs.github.io/docs/tooling/linter#no-multiple-whitespaces).
- **Exception:** If this is intended, add `{"rule":"formatjs/no-multiple-whitespaces","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/internationalized-messages.md), [Rule documentation](https://formatjs.github.io/docs/tooling/linter#no-multiple-whitespaces)

<a id="eslint-formatjs-no-offset"></a>

### `eslint/formatjs/no-offset`

Disallow offset in plural rules.

- **Printed as:** `eslint-lint/formatjs/no-offset`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with `i18n.enabled` or an i18n library.
- **Why it is on:** The i18n scope turns on the rules for internationalized messages.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://formatjs.github.io/docs/tooling/linter#no-offset).
- **Exception:** If this is intended, add `{"rule":"formatjs/no-offset","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/internationalized-messages.md), [Rule documentation](https://formatjs.github.io/docs/tooling/linter#no-offset)

<a id="eslint-formatjs-no-useless-message"></a>

### `eslint/formatjs/no-useless-message`

Disallow unnecessary formatted message.

- **Printed as:** `eslint-lint/formatjs/no-useless-message`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with `i18n.enabled` or an i18n library.
- **Why it is on:** The i18n scope turns on the rules for internationalized messages.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://formatjs.github.io/docs/tooling/linter#no-useless-message).
- **Exception:** If this is intended, add `{"rule":"formatjs/no-useless-message","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/internationalized-messages.md), [Rule documentation](https://formatjs.github.io/docs/tooling/linter#no-useless-message)

<a id="eslint-formatjs-prefer-full-sentence"></a>

### `eslint/formatjs/prefer-full-sentence`

Detects messages with leading/trailing whitespace, which suggests string concatenation instead of full sentences.

- **Printed as:** `eslint-lint/formatjs/prefer-full-sentence`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with `i18n.enabled` or an i18n library.
- **Why it is on:** The i18n scope turns on the rules for internationalized messages.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://formatjs.github.io/docs/tooling/linter#prefer-full-sentence).
- **Exception:** If this is intended, add `{"rule":"formatjs/prefer-full-sentence","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/internationalized-messages.md), [Rule documentation](https://formatjs.github.io/docs/tooling/linter#prefer-full-sentence)

<a id="eslint-formatjs-prefer-pound-in-plural"></a>

### `eslint/formatjs/prefer-pound-in-plural`

Prefer using # to reference the count in the plural argument.

- **Printed as:** `eslint-lint/formatjs/prefer-pound-in-plural`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with `i18n.enabled` or an i18n library.
- **Why it is on:** The i18n scope turns on the rules for internationalized messages.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://formatjs.github.io/docs/tooling/linter#prefer-pound-in-plurals).
- **Exception:** If this is intended, add `{"rule":"formatjs/prefer-pound-in-plural","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/internationalized-messages.md), [Rule documentation](https://formatjs.github.io/docs/tooling/linter#prefer-pound-in-plurals)

<a id="eslint-functional-no-classes"></a>

### `eslint/functional/no-classes`

Disallow classes.

- **Printed as:** `eslint-lint/functional/no-classes`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep data immutable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/eslint-functional/eslint-plugin-functional/blob/v10.0.1/docs/rules/no-classes.md).
- **Exception:** If this is intended, add `{"rule":"functional/no-classes","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://github.com/eslint-functional/eslint-plugin-functional/blob/v10.0.1/docs/rules/no-classes.md)

<a id="eslint-functional-no-let"></a>

### `eslint/functional/no-let`

Disallow mutable variables.

- **Printed as:** `eslint-lint/functional/no-let`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep data immutable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/eslint-functional/eslint-plugin-functional/blob/v10.0.1/docs/rules/no-let.md).
- **Exception:** If this is intended, add `{"rule":"functional/no-let","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://github.com/eslint-functional/eslint-plugin-functional/blob/v10.0.1/docs/rules/no-let.md)

<a id="eslint-functional-no-this-expressions"></a>

### `eslint/functional/no-this-expressions`

Disallow this access.

- **Printed as:** `eslint-lint/functional/no-this-expressions`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep data immutable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/eslint-functional/eslint-plugin-functional/blob/v10.0.1/docs/rules/no-this-expressions.md).
- **Exception:** If this is intended, add `{"rule":"functional/no-this-expressions","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://github.com/eslint-functional/eslint-plugin-functional/blob/v10.0.1/docs/rules/no-this-expressions.md)

<a id="eslint-functional-prefer-immutable-types"></a>

### `eslint/functional/prefer-immutable-types`

Require function parameters to be typed as certain immutability.

- **Printed as:** `eslint-lint/functional/prefer-immutable-types`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep data immutable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/eslint-functional/eslint-plugin-functional/blob/v10.0.1/docs/rules/prefer-immutable-types.md).
- **Exception:** If this is intended, add `{"rule":"functional/prefer-immutable-types","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://github.com/eslint-functional/eslint-plugin-functional/blob/v10.0.1/docs/rules/prefer-immutable-types.md)

<a id="eslint-jsx-a11y-alt-text"></a>

### `eslint/jsx-a11y/alt-text`

Enforce all elements that require alternative text have meaningful information to relay back to end user.

- **Printed as:** `eslint-lint/jsx-a11y/alt-text`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the accessibility rules for JSX.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/alt-text.md).
- **Exception:** If this is intended, add `{"rule":"jsx-a11y/alt-text","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/alt-text.md)

<a id="eslint-jsx-a11y-anchor-ambiguous-text"></a>

### `eslint/jsx-a11y/anchor-ambiguous-text`

Enforce `<a>` text to not exactly match "click here", "here", "link", or "a link".

- **Printed as:** `eslint-lint/jsx-a11y/anchor-ambiguous-text`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the accessibility rules for JSX.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/anchor-ambiguous-text.md).
- **Exception:** If this is intended, add `{"rule":"jsx-a11y/anchor-ambiguous-text","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/anchor-ambiguous-text.md)

<a id="eslint-jsx-a11y-anchor-has-content"></a>

### `eslint/jsx-a11y/anchor-has-content`

Enforce all anchors to contain accessible content.

- **Printed as:** `eslint-lint/jsx-a11y/anchor-has-content`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the accessibility rules for JSX.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/anchor-has-content.md).
- **Exception:** If this is intended, add `{"rule":"jsx-a11y/anchor-has-content","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/anchor-has-content.md)

<a id="eslint-jsx-a11y-anchor-is-valid"></a>

### `eslint/jsx-a11y/anchor-is-valid`

Enforce all anchors are valid, navigable elements.

- **Printed as:** `eslint-lint/jsx-a11y/anchor-is-valid`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the accessibility rules for JSX.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/anchor-is-valid.md).
- **Exception:** If this is intended, add `{"rule":"jsx-a11y/anchor-is-valid","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/anchor-is-valid.md)

<a id="eslint-jsx-a11y-aria-activedescendant-has-tabindex"></a>

### `eslint/jsx-a11y/aria-activedescendant-has-tabindex`

Enforce elements with aria-activedescendant are tabbable.

- **Printed as:** `eslint-lint/jsx-a11y/aria-activedescendant-has-tabindex`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the accessibility rules for JSX.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/aria-activedescendant-has-tabindex.md).
- **Exception:** If this is intended, add `{"rule":"jsx-a11y/aria-activedescendant-has-tabindex","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/aria-activedescendant-has-tabindex.md)

<a id="eslint-jsx-a11y-aria-props"></a>

### `eslint/jsx-a11y/aria-props`

Enforce all `aria-*` props are valid.

- **Printed as:** `eslint-lint/jsx-a11y/aria-props`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the accessibility rules for JSX.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/aria-props.md).
- **Exception:** If this is intended, add `{"rule":"jsx-a11y/aria-props","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/aria-props.md)

<a id="eslint-jsx-a11y-aria-proptypes"></a>

### `eslint/jsx-a11y/aria-proptypes`

Enforce ARIA state and property values are valid.

- **Printed as:** `eslint-lint/jsx-a11y/aria-proptypes`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the accessibility rules for JSX.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/aria-proptypes.md).
- **Exception:** If this is intended, add `{"rule":"jsx-a11y/aria-proptypes","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/aria-proptypes.md)

<a id="eslint-jsx-a11y-aria-role"></a>

### `eslint/jsx-a11y/aria-role`

Enforce that elements with ARIA roles must use a valid, non-abstract ARIA role.

- **Printed as:** `eslint-lint/jsx-a11y/aria-role`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the accessibility rules for JSX.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/aria-role.md).
- **Exception:** If this is intended, add `{"rule":"jsx-a11y/aria-role","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/aria-role.md)

<a id="eslint-jsx-a11y-aria-unsupported-elements"></a>

### `eslint/jsx-a11y/aria-unsupported-elements`

Enforce that elements that do not support ARIA roles, states, and properties do not have those attributes.

- **Printed as:** `eslint-lint/jsx-a11y/aria-unsupported-elements`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the accessibility rules for JSX.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/aria-unsupported-elements.md).
- **Exception:** If this is intended, add `{"rule":"jsx-a11y/aria-unsupported-elements","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/aria-unsupported-elements.md)

<a id="eslint-jsx-a11y-autocomplete-valid"></a>

### `eslint/jsx-a11y/autocomplete-valid`

Enforce that autocomplete attributes are used correctly.

- **Printed as:** `eslint-lint/jsx-a11y/autocomplete-valid`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the accessibility rules for JSX.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/autocomplete-valid.md).
- **Exception:** If this is intended, add `{"rule":"jsx-a11y/autocomplete-valid","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/autocomplete-valid.md)

<a id="eslint-jsx-a11y-click-events-have-key-events"></a>

### `eslint/jsx-a11y/click-events-have-key-events`

Enforce a clickable non-interactive element has at least one keyboard event listener.

- **Printed as:** `eslint-lint/jsx-a11y/click-events-have-key-events`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the accessibility rules for JSX.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/click-events-have-key-events.md).
- **Exception:** If this is intended, add `{"rule":"jsx-a11y/click-events-have-key-events","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/click-events-have-key-events.md)

<a id="eslint-jsx-a11y-control-has-associated-label"></a>

### `eslint/jsx-a11y/control-has-associated-label`

Enforce that a control (an interactive element) has a text label.

- **Printed as:** `eslint-lint/jsx-a11y/control-has-associated-label`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the accessibility rules for JSX.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/control-has-associated-label.md).
- **Exception:** If this is intended, add `{"rule":"jsx-a11y/control-has-associated-label","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/control-has-associated-label.md)

<a id="eslint-jsx-a11y-heading-has-content"></a>

### `eslint/jsx-a11y/heading-has-content`

Enforce heading (`h1`, `h2`, etc) elements contain accessible content.

- **Printed as:** `eslint-lint/jsx-a11y/heading-has-content`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the accessibility rules for JSX.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/heading-has-content.md).
- **Exception:** If this is intended, add `{"rule":"jsx-a11y/heading-has-content","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/heading-has-content.md)

<a id="eslint-jsx-a11y-html-has-lang"></a>

### `eslint/jsx-a11y/html-has-lang`

Enforce `<html>` element has `lang` prop.

- **Printed as:** `eslint-lint/jsx-a11y/html-has-lang`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the accessibility rules for JSX.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/html-has-lang.md).
- **Exception:** If this is intended, add `{"rule":"jsx-a11y/html-has-lang","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/html-has-lang.md)

<a id="eslint-jsx-a11y-iframe-has-title"></a>

### `eslint/jsx-a11y/iframe-has-title`

Enforce iframe elements have a title attribute.

- **Printed as:** `eslint-lint/jsx-a11y/iframe-has-title`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the accessibility rules for JSX.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/iframe-has-title.md).
- **Exception:** If this is intended, add `{"rule":"jsx-a11y/iframe-has-title","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/iframe-has-title.md)

<a id="eslint-jsx-a11y-img-redundant-alt"></a>

### `eslint/jsx-a11y/img-redundant-alt`

Enforce `<img>` alt prop does not contain the word "image", "picture", or "photo".

- **Printed as:** `eslint-lint/jsx-a11y/img-redundant-alt`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the accessibility rules for JSX.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/img-redundant-alt.md).
- **Exception:** If this is intended, add `{"rule":"jsx-a11y/img-redundant-alt","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/img-redundant-alt.md)

<a id="eslint-jsx-a11y-interactive-supports-focus"></a>

### `eslint/jsx-a11y/interactive-supports-focus`

Enforce that elements with interactive handlers like `onClick` must be focusable.

- **Printed as:** `eslint-lint/jsx-a11y/interactive-supports-focus`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the accessibility rules for JSX.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/interactive-supports-focus.md).
- **Exception:** If this is intended, add `{"rule":"jsx-a11y/interactive-supports-focus","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/interactive-supports-focus.md)

<a id="eslint-jsx-a11y-label-has-associated-control"></a>

### `eslint/jsx-a11y/label-has-associated-control`

Enforce that a `label` tag has a text label and an associated control.

- **Printed as:** `eslint-lint/jsx-a11y/label-has-associated-control`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the accessibility rules for JSX.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/label-has-associated-control.md).
- **Exception:** If this is intended, add `{"rule":"jsx-a11y/label-has-associated-control","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/label-has-associated-control.md)

<a id="eslint-jsx-a11y-media-has-caption"></a>

### `eslint/jsx-a11y/media-has-caption`

Enforces that `<audio>` and `<video>` elements must have a `<track>` for captions.

- **Printed as:** `eslint-lint/jsx-a11y/media-has-caption`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the accessibility rules for JSX.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/media-has-caption.md).
- **Exception:** If this is intended, add `{"rule":"jsx-a11y/media-has-caption","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/media-has-caption.md)

<a id="eslint-jsx-a11y-mouse-events-have-key-events"></a>

### `eslint/jsx-a11y/mouse-events-have-key-events`

Enforce that `onMouseOver`/`onMouseOut` are accompanied by `onFocus`/`onBlur` for keyboard-only users.

- **Printed as:** `eslint-lint/jsx-a11y/mouse-events-have-key-events`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the accessibility rules for JSX.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/mouse-events-have-key-events.md).
- **Exception:** If this is intended, add `{"rule":"jsx-a11y/mouse-events-have-key-events","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/mouse-events-have-key-events.md)

<a id="eslint-jsx-a11y-no-access-key"></a>

### `eslint/jsx-a11y/no-access-key`

Enforce that the `accessKey` prop is not used on any element to avoid complications with keyboard commands used by a screen reader.

- **Printed as:** `eslint-lint/jsx-a11y/no-access-key`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the accessibility rules for JSX.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/no-access-key.md).
- **Exception:** If this is intended, add `{"rule":"jsx-a11y/no-access-key","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/no-access-key.md)

<a id="eslint-jsx-a11y-no-aria-hidden-on-focusable"></a>

### `eslint/jsx-a11y/no-aria-hidden-on-focusable`

Disallow `aria-hidden="true"` from being set on focusable elements.

- **Printed as:** `eslint-lint/jsx-a11y/no-aria-hidden-on-focusable`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the accessibility rules for JSX.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/no-aria-hidden-on-focusable.md).
- **Exception:** If this is intended, add `{"rule":"jsx-a11y/no-aria-hidden-on-focusable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/no-aria-hidden-on-focusable.md)

<a id="eslint-jsx-a11y-no-autofocus"></a>

### `eslint/jsx-a11y/no-autofocus`

Enforce autoFocus prop is not enabled.

- **Printed as:** `eslint-lint/jsx-a11y/no-autofocus`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the accessibility rules for JSX.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/no-autofocus.md).
- **Exception:** If this is intended, add `{"rule":"jsx-a11y/no-autofocus","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/no-autofocus.md)

<a id="eslint-jsx-a11y-no-distracting-elements"></a>

### `eslint/jsx-a11y/no-distracting-elements`

Enforce distracting elements are not used.

- **Printed as:** `eslint-lint/jsx-a11y/no-distracting-elements`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the accessibility rules for JSX.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/no-distracting-elements.md).
- **Exception:** If this is intended, add `{"rule":"jsx-a11y/no-distracting-elements","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/no-distracting-elements.md)

<a id="eslint-jsx-a11y-no-interactive-element-to-noninteractive-role"></a>

### `eslint/jsx-a11y/no-interactive-element-to-noninteractive-role`

Disallow interactive elements being assigned non-interactive roles.

- **Printed as:** `eslint-lint/jsx-a11y/no-interactive-element-to-noninteractive-role`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the accessibility rules for JSX.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/no-interactive-element-to-noninteractive-role.md).
- **Exception:** If this is intended, add `{"rule":"jsx-a11y/no-interactive-element-to-noninteractive-role","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/no-interactive-element-to-noninteractive-role.md)

<a id="eslint-jsx-a11y-no-noninteractive-element-interactions"></a>

### `eslint/jsx-a11y/no-noninteractive-element-interactions`

Disallow non-interactive elements being assigned mouse or keyboard event listeners.

- **Printed as:** `eslint-lint/jsx-a11y/no-noninteractive-element-interactions`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the accessibility rules for JSX.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/no-noninteractive-element-interactions.md).
- **Exception:** If this is intended, add `{"rule":"jsx-a11y/no-noninteractive-element-interactions","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/no-noninteractive-element-interactions.md)

<a id="eslint-jsx-a11y-no-noninteractive-element-to-interactive-role"></a>

### `eslint/jsx-a11y/no-noninteractive-element-to-interactive-role`

Disallow non-interactive elements being assigned interactive roles.

- **Printed as:** `eslint-lint/jsx-a11y/no-noninteractive-element-to-interactive-role`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the accessibility rules for JSX.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/no-noninteractive-element-to-interactive-role.md).
- **Exception:** If this is intended, add `{"rule":"jsx-a11y/no-noninteractive-element-to-interactive-role","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/no-noninteractive-element-to-interactive-role.md)

<a id="eslint-jsx-a11y-no-noninteractive-tabindex"></a>

### `eslint/jsx-a11y/no-noninteractive-tabindex`

Enforce `tabIndex` only be declared on interactive elements.

- **Printed as:** `eslint-lint/jsx-a11y/no-noninteractive-tabindex`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the accessibility rules for JSX.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/no-noninteractive-tabindex.md).
- **Exception:** If this is intended, add `{"rule":"jsx-a11y/no-noninteractive-tabindex","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/no-noninteractive-tabindex.md)

<a id="eslint-jsx-a11y-no-redundant-roles"></a>

### `eslint/jsx-a11y/no-redundant-roles`

Enforce explicit role property is not the same as implicit/default role property on element.

- **Printed as:** `eslint-lint/jsx-a11y/no-redundant-roles`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the accessibility rules for JSX.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/no-redundant-roles.md).
- **Exception:** If this is intended, add `{"rule":"jsx-a11y/no-redundant-roles","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/no-redundant-roles.md)

<a id="eslint-jsx-a11y-no-static-element-interactions"></a>

### `eslint/jsx-a11y/no-static-element-interactions`

Enforce that non-interactive, visible elements (such as `<div>`) that have click handlers use the role attribute.

- **Printed as:** `eslint-lint/jsx-a11y/no-static-element-interactions`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the accessibility rules for JSX.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/no-static-element-interactions.md).
- **Exception:** If this is intended, add `{"rule":"jsx-a11y/no-static-element-interactions","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/no-static-element-interactions.md)

<a id="eslint-jsx-a11y-prefer-tag-over-role"></a>

### `eslint/jsx-a11y/prefer-tag-over-role`

Enforces using semantic DOM elements over the ARIA `role` property.

- **Printed as:** `eslint-lint/jsx-a11y/prefer-tag-over-role`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the accessibility rules for JSX.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/prefer-tag-over-role.md).
- **Exception:** If this is intended, add `{"rule":"jsx-a11y/prefer-tag-over-role","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/prefer-tag-over-role.md)

<a id="eslint-jsx-a11y-role-has-required-aria-props"></a>

### `eslint/jsx-a11y/role-has-required-aria-props`

Enforce that elements with ARIA roles must have all required attributes for that role.

- **Printed as:** `eslint-lint/jsx-a11y/role-has-required-aria-props`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the accessibility rules for JSX.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/role-has-required-aria-props.md).
- **Exception:** If this is intended, add `{"rule":"jsx-a11y/role-has-required-aria-props","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/role-has-required-aria-props.md)

<a id="eslint-jsx-a11y-role-supports-aria-props"></a>

### `eslint/jsx-a11y/role-supports-aria-props`

Enforce that elements with explicit or implicit roles defined contain only `aria-*` properties supported by that `role`.

- **Printed as:** `eslint-lint/jsx-a11y/role-supports-aria-props`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the accessibility rules for JSX.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/role-supports-aria-props.md).
- **Exception:** If this is intended, add `{"rule":"jsx-a11y/role-supports-aria-props","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/role-supports-aria-props.md)

<a id="eslint-jsx-a11y-scope"></a>

### `eslint/jsx-a11y/scope`

Enforce `scope` prop is only used on `<th>` elements.

- **Printed as:** `eslint-lint/jsx-a11y/scope`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the accessibility rules for JSX.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/scope.md).
- **Exception:** If this is intended, add `{"rule":"jsx-a11y/scope","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/scope.md)

<a id="eslint-jsx-a11y-tabindex-no-positive"></a>

### `eslint/jsx-a11y/tabindex-no-positive`

Enforce `tabIndex` value is not greater than zero.

- **Printed as:** `eslint-lint/jsx-a11y/tabindex-no-positive`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the accessibility rules for JSX.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/tabindex-no-positive.md).
- **Exception:** If this is intended, add `{"rule":"jsx-a11y/tabindex-no-positive","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/tree/HEAD/docs/rules/tabindex-no-positive.md)

<a id="eslint-react-dom-no-dangerously-set-innerhtml"></a>

### `eslint/react-dom/no-dangerously-set-innerhtml`

Disallows DOM elements from using 'dangerouslySetInnerHTML'.

- **Printed as:** `eslint-lint/react-dom/no-dangerously-set-innerhtml`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the rules of this plugin, so that components follow the rules of React: hooks, effects, state and the DOM.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://eslint-react.xyz/docs/rules/dom-no-dangerously-set-innerhtml).
- **Exception:** If this is intended, add `{"rule":"react-dom/no-dangerously-set-innerhtml","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://eslint-react.xyz/docs/rules/dom-no-dangerously-set-innerhtml)

<a id="eslint-react-dom-no-missing-button-type"></a>

### `eslint/react-dom/no-missing-button-type`

Enforces an explicit 'type' attribute for 'button' elements.

- **Printed as:** `eslint-lint/react-dom/no-missing-button-type`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the rules of this plugin, so that components follow the rules of React: hooks, effects, state and the DOM.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://eslint-react.xyz/docs/rules/dom-no-missing-button-type).
- **Exception:** If this is intended, add `{"rule":"react-dom/no-missing-button-type","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://eslint-react.xyz/docs/rules/dom-no-missing-button-type)

<a id="eslint-react-dom-no-script-url"></a>

### `eslint/react-dom/no-script-url`

Disallows 'javascript:' URLs as attribute values.

- **Printed as:** `eslint-lint/react-dom/no-script-url`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the rules of this plugin, so that components follow the rules of React: hooks, effects, state and the DOM.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://eslint-react.xyz/docs/rules/dom-no-script-url).
- **Exception:** If this is intended, add `{"rule":"react-dom/no-script-url","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://eslint-react.xyz/docs/rules/dom-no-script-url)

<a id="eslint-react-dom-no-unsafe-target-blank"></a>

### `eslint/react-dom/no-unsafe-target-blank`

Disallows 'target="\_blank"' without 'rel="noreferrer noopener"'.

- **Printed as:** `eslint-lint/react-dom/no-unsafe-target-blank`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the rules of this plugin, so that components follow the rules of React: hooks, effects, state and the DOM.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://eslint-react.xyz/docs/rules/dom-no-unsafe-target-blank).
- **Exception:** If this is intended, add `{"rule":"react-dom/no-unsafe-target-blank","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://eslint-react.xyz/docs/rules/dom-no-unsafe-target-blank)

<a id="eslint-react-hooks-exhaustive-deps"></a>

### `eslint/react-hooks/exhaustive-deps`

Verifies the list of dependencies for Hooks like useEffect and similar.

- **Printed as:** `eslint-lint/react-hooks/exhaustive-deps`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the rules of this plugin, so that components follow the rules of React: hooks, effects, state and the DOM.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/facebook/react/issues/14920).
- **Exception:** If this is intended, add `{"rule":"react-hooks/exhaustive-deps","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/facebook/react/issues/14920)

<a id="eslint-react-hooks-rules-of-hooks"></a>

### `eslint/react-hooks/rules-of-hooks`

Enforces the Rules of Hooks.

- **Printed as:** `eslint-lint/react-hooks/rules-of-hooks`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the rules of this plugin, so that components follow the rules of React: hooks, effects, state and the DOM.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://react.dev/reference/rules/rules-of-hooks).
- **Exception:** If this is intended, add `{"rule":"react-hooks/rules-of-hooks","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://react.dev/reference/rules/rules-of-hooks)

<a id="eslint-react-web-api-no-leaked-event-listener"></a>

### `eslint/react-web-api/no-leaked-event-listener`

Enforces that every 'addEventListener' in a component or custom hook has a corresponding 'removeEventListener'.

- **Printed as:** `eslint-lint/react-web-api/no-leaked-event-listener`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the rules of this plugin, so that components follow the rules of React: hooks, effects, state and the DOM.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://eslint-react.xyz/docs/rules/web-api-no-leaked-event-listener).
- **Exception:** If this is intended, add `{"rule":"react-web-api/no-leaked-event-listener","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://eslint-react.xyz/docs/rules/web-api-no-leaked-event-listener)

<a id="eslint-react-web-api-no-leaked-intersection-observer"></a>

### `eslint/react-web-api/no-leaked-intersection-observer`

Enforces that every 'IntersectionObserver' created in a component or custom hook has a corresponding 'IntersectionObserver.disconnect()'.

- **Printed as:** `eslint-lint/react-web-api/no-leaked-intersection-observer`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the rules of this plugin, so that components follow the rules of React: hooks, effects, state and the DOM.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://eslint-react.xyz/docs/rules/web-api-no-leaked-intersection-observer).
- **Exception:** If this is intended, add `{"rule":"react-web-api/no-leaked-intersection-observer","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://eslint-react.xyz/docs/rules/web-api-no-leaked-intersection-observer)

<a id="eslint-react-web-api-no-leaked-interval"></a>

### `eslint/react-web-api/no-leaked-interval`

Enforces that every 'setInterval' in a component or custom hook has a corresponding 'clearInterval'.

- **Printed as:** `eslint-lint/react-web-api/no-leaked-interval`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the rules of this plugin, so that components follow the rules of React: hooks, effects, state and the DOM.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://eslint-react.xyz/docs/rules/web-api-no-leaked-interval).
- **Exception:** If this is intended, add `{"rule":"react-web-api/no-leaked-interval","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://eslint-react.xyz/docs/rules/web-api-no-leaked-interval)

<a id="eslint-react-web-api-no-leaked-resize-observer"></a>

### `eslint/react-web-api/no-leaked-resize-observer`

Enforces that every 'ResizeObserver' created in a component or custom hook has a corresponding 'ResizeObserver.disconnect()'.

- **Printed as:** `eslint-lint/react-web-api/no-leaked-resize-observer`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the rules of this plugin, so that components follow the rules of React: hooks, effects, state and the DOM.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://eslint-react.xyz/docs/rules/web-api-no-leaked-resize-observer).
- **Exception:** If this is intended, add `{"rule":"react-web-api/no-leaked-resize-observer","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://eslint-react.xyz/docs/rules/web-api-no-leaked-resize-observer)

<a id="eslint-react-web-api-no-leaked-timeout"></a>

### `eslint/react-web-api/no-leaked-timeout`

Enforces that every 'setTimeout' in a component or custom hook has a corresponding 'clearTimeout'.

- **Printed as:** `eslint-lint/react-web-api/no-leaked-timeout`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the rules of this plugin, so that components follow the rules of React: hooks, effects, state and the DOM.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://eslint-react.xyz/docs/rules/web-api-no-leaked-timeout).
- **Exception:** If this is intended, add `{"rule":"react-web-api/no-leaked-timeout","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://eslint-react.xyz/docs/rules/web-api-no-leaked-timeout)

<a id="eslint-react-x-immutability"></a>

### `eslint/react-x/immutability`

Validates against mutating props, state, and other immutable values, including through functions passed into frozen contexts such as JSX props, hook arguments, and hook return values.

- **Printed as:** `eslint-lint/react-x/immutability`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the rules of this plugin, so that components follow the rules of React: hooks, effects, state and the DOM.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://eslint-react.xyz/docs/rules/immutability).
- **Exception:** If this is intended, add `{"rule":"react-x/immutability","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://eslint-react.xyz/docs/rules/immutability)

<a id="eslint-react-x-no-array-index-key"></a>

### `eslint/react-x/no-array-index-key`

Disallows using an item's index in the array as its key.

- **Printed as:** `eslint-lint/react-x/no-array-index-key`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the rules of this plugin, so that components follow the rules of React: hooks, effects, state and the DOM.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://eslint-react.xyz/docs/rules/no-array-index-key).
- **Exception:** If this is intended, add `{"rule":"react-x/no-array-index-key","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://eslint-react.xyz/docs/rules/no-array-index-key)

<a id="eslint-react-x-no-class-component"></a>

### `eslint/react-x/no-class-component`

Disallows class components except for error boundaries.

- **Printed as:** `eslint-lint/react-x/no-class-component`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the rules of this plugin, so that components follow the rules of React: hooks, effects, state and the DOM.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://eslint-react.xyz/docs/rules/no-class-component).
- **Exception:** If this is intended, add `{"rule":"react-x/no-class-component","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://eslint-react.xyz/docs/rules/no-class-component)

<a id="eslint-react-x-no-context-provider"></a>

### `eslint/react-x/no-context-provider`

Replaces usage of '\<Context.Provider>' with '\<Context>'.

- **Printed as:** `eslint-lint/react-x/no-context-provider`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the rules of this plugin, so that components follow the rules of React: hooks, effects, state and the DOM.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://eslint-react.xyz/docs/rules/no-context-provider).
- **Exception:** If this is intended, add `{"rule":"react-x/no-context-provider","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://eslint-react.xyz/docs/rules/no-context-provider)

<a id="eslint-react-x-no-duplicate-key"></a>

### `eslint/react-x/no-duplicate-key`

Prevents duplicate 'key' props on sibling elements when rendering lists.

- **Printed as:** `eslint-lint/react-x/no-duplicate-key`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the rules of this plugin, so that components follow the rules of React: hooks, effects, state and the DOM.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://eslint-react.xyz/docs/rules/no-duplicate-key).
- **Exception:** If this is intended, add `{"rule":"react-x/no-duplicate-key","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://eslint-react.xyz/docs/rules/no-duplicate-key)

<a id="eslint-react-x-no-forward-ref"></a>

### `eslint/react-x/no-forward-ref`

Replaces usage of 'forwardRef' with passing 'ref' as a prop.

- **Printed as:** `eslint-lint/react-x/no-forward-ref`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the rules of this plugin, so that components follow the rules of React: hooks, effects, state and the DOM.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://eslint-react.xyz/docs/rules/no-forward-ref).
- **Exception:** If this is intended, add `{"rule":"react-x/no-forward-ref","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://eslint-react.xyz/docs/rules/no-forward-ref)

<a id="eslint-react-x-no-leaked-conditional-rendering"></a>

### `eslint/react-x/no-leaked-conditional-rendering`

Prevents problematic leaked values from being rendered.

- **Printed as:** `eslint-lint/react-x/no-leaked-conditional-rendering`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the rules of this plugin, so that components follow the rules of React: hooks, effects, state and the DOM.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://eslint-react.xyz/docs/rules/no-leaked-conditional-rendering).
- **Exception:** If this is intended, add `{"rule":"react-x/no-leaked-conditional-rendering","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://eslint-react.xyz/docs/rules/no-leaked-conditional-rendering)

<a id="eslint-react-x-no-missing-key"></a>

### `eslint/react-x/no-missing-key`

Disallows missing 'key' on items in list rendering.

- **Printed as:** `eslint-lint/react-x/no-missing-key`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the rules of this plugin, so that components follow the rules of React: hooks, effects, state and the DOM.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://eslint-react.xyz/docs/rules/no-missing-key).
- **Exception:** If this is intended, add `{"rule":"react-x/no-missing-key","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://eslint-react.xyz/docs/rules/no-missing-key)

<a id="eslint-react-x-no-nested-component-definitions"></a>

### `eslint/react-x/no-nested-component-definitions`

Disallows nesting component definitions inside other components.

- **Printed as:** `eslint-lint/react-x/no-nested-component-definitions`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the rules of this plugin, so that components follow the rules of React: hooks, effects, state and the DOM.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://eslint-react.xyz/docs/rules/no-nested-component-definitions).
- **Exception:** If this is intended, add `{"rule":"react-x/no-nested-component-definitions","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://eslint-react.xyz/docs/rules/no-nested-component-definitions)

<a id="eslint-react-x-no-nested-lazy-component-declarations"></a>

### `eslint/react-x/no-nested-lazy-component-declarations`

Disallows nesting lazy component declarations inside other components or hooks.

- **Printed as:** `eslint-lint/react-x/no-nested-lazy-component-declarations`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the rules of this plugin, so that components follow the rules of React: hooks, effects, state and the DOM.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://eslint-react.xyz/docs/rules/no-nested-lazy-component-declarations).
- **Exception:** If this is intended, add `{"rule":"react-x/no-nested-lazy-component-declarations","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://eslint-react.xyz/docs/rules/no-nested-lazy-component-declarations)

<a id="eslint-react-x-no-unstable-context-value"></a>

### `eslint/react-x/no-unstable-context-value`

Prevents non-stable values (i.e., object literals) from being used as a value for 'Context.Provider'.

- **Printed as:** `eslint-lint/react-x/no-unstable-context-value`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the rules of this plugin, so that components follow the rules of React: hooks, effects, state and the DOM.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://eslint-react.xyz/docs/rules/no-unstable-context-value).
- **Exception:** If this is intended, add `{"rule":"react-x/no-unstable-context-value","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://eslint-react.xyz/docs/rules/no-unstable-context-value)

<a id="eslint-react-x-no-unstable-default-props"></a>

### `eslint/react-x/no-unstable-default-props`

Prevents using referential-type values as default props in object destructuring.

- **Printed as:** `eslint-lint/react-x/no-unstable-default-props`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the rules of this plugin, so that components follow the rules of React: hooks, effects, state and the DOM.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://eslint-react.xyz/docs/rules/no-unstable-default-props).
- **Exception:** If this is intended, add `{"rule":"react-x/no-unstable-default-props","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://eslint-react.xyz/docs/rules/no-unstable-default-props)

<a id="eslint-react-x-purity"></a>

### `eslint/react-x/purity`

Validates that components and hooks are pure by checking that they do not call known-impure functions during render.

- **Printed as:** `eslint-lint/react-x/purity`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the rules of this plugin, so that components follow the rules of React: hooks, effects, state and the DOM.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://eslint-react.xyz/docs/rules/purity).
- **Exception:** If this is intended, add `{"rule":"react-x/purity","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://eslint-react.xyz/docs/rules/purity)

<a id="eslint-react-x-refs"></a>

### `eslint/react-x/refs`

Validates correct usage of refs by checking that 'ref.current' is not read or written during render.

- **Printed as:** `eslint-lint/react-x/refs`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the rules of this plugin, so that components follow the rules of React: hooks, effects, state and the DOM.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://eslint-react.xyz/docs/rules/refs).
- **Exception:** If this is intended, add `{"rule":"react-x/refs","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://eslint-react.xyz/docs/rules/refs)

<a id="eslint-react-x-set-state-in-render"></a>

### `eslint/react-x/set-state-in-render`

Validates against unconditionally setting state during render, which can trigger additional renders and potential infinite render loops.

- **Printed as:** `eslint-lint/react-x/set-state-in-render`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the rules of this plugin, so that components follow the rules of React: hooks, effects, state and the DOM.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://eslint-react.xyz/docs/rules/set-state-in-render).
- **Exception:** If this is intended, add `{"rule":"react-x/set-state-in-render","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://eslint-react.xyz/docs/rules/set-state-in-render)

<a id="eslint-react-x-static-components"></a>

### `eslint/react-x/static-components`

Validates that components are static, not recreated every render.

- **Printed as:** `eslint-lint/react-x/static-components`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the rules of this plugin, so that components follow the rules of React: hooks, effects, state and the DOM.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://eslint-react.xyz/docs/rules/static-components).
- **Exception:** If this is intended, add `{"rule":"react-x/static-components","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://eslint-react.xyz/docs/rules/static-components)

<a id="eslint-regexp-confusing-quantifier"></a>

### `eslint/regexp/confusing-quantifier`

Disallow confusing quantifiers.

- **Printed as:** `eslint-lint/regexp/confusing-quantifier`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep regular expressions safe and readable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/confusing-quantifier.html).
- **Exception:** If this is intended, add `{"rule":"regexp/confusing-quantifier","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/confusing-quantifier.html)

<a id="eslint-regexp-no-contradiction-with-assertion"></a>

### `eslint/regexp/no-contradiction-with-assertion`

Disallow elements that contradict assertions.

- **Printed as:** `eslint-lint/regexp/no-contradiction-with-assertion`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep regular expressions safe and readable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-contradiction-with-assertion.html).
- **Exception:** If this is intended, add `{"rule":"regexp/no-contradiction-with-assertion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-contradiction-with-assertion.html)

<a id="eslint-regexp-no-dupe-characters-character-class"></a>

### `eslint/regexp/no-dupe-characters-character-class`

Disallow duplicate characters in the RegExp character class.

- **Printed as:** `eslint-lint/regexp/no-dupe-characters-character-class`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep regular expressions safe and readable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-dupe-characters-character-class.html).
- **Exception:** If this is intended, add `{"rule":"regexp/no-dupe-characters-character-class","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-dupe-characters-character-class.html)

<a id="eslint-regexp-no-dupe-disjunctions"></a>

### `eslint/regexp/no-dupe-disjunctions`

Disallow duplicate disjunctions.

- **Printed as:** `eslint-lint/regexp/no-dupe-disjunctions`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep regular expressions safe and readable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-dupe-disjunctions.html).
- **Exception:** If this is intended, add `{"rule":"regexp/no-dupe-disjunctions","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-dupe-disjunctions.html)

<a id="eslint-regexp-no-empty-alternative"></a>

### `eslint/regexp/no-empty-alternative`

Disallow alternatives without elements.

- **Printed as:** `eslint-lint/regexp/no-empty-alternative`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep regular expressions safe and readable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-empty-alternative.html).
- **Exception:** If this is intended, add `{"rule":"regexp/no-empty-alternative","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-empty-alternative.html)

<a id="eslint-regexp-no-empty-capturing-group"></a>

### `eslint/regexp/no-empty-capturing-group`

Disallow capturing group that captures empty.

- **Printed as:** `eslint-lint/regexp/no-empty-capturing-group`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep regular expressions safe and readable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-empty-capturing-group.html).
- **Exception:** If this is intended, add `{"rule":"regexp/no-empty-capturing-group","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-empty-capturing-group.html)

<a id="eslint-regexp-no-empty-group"></a>

### `eslint/regexp/no-empty-group`

Disallow empty group.

- **Printed as:** `eslint-lint/regexp/no-empty-group`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep regular expressions safe and readable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-empty-group.html).
- **Exception:** If this is intended, add `{"rule":"regexp/no-empty-group","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-empty-group.html)

<a id="eslint-regexp-no-empty-lookarounds-assertion"></a>

### `eslint/regexp/no-empty-lookarounds-assertion`

Disallow empty lookahead assertion or empty lookbehind assertion.

- **Printed as:** `eslint-lint/regexp/no-empty-lookarounds-assertion`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep regular expressions safe and readable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-empty-lookarounds-assertion.html).
- **Exception:** If this is intended, add `{"rule":"regexp/no-empty-lookarounds-assertion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-empty-lookarounds-assertion.html)

<a id="eslint-regexp-no-escape-backspace"></a>

### `eslint/regexp/no-escape-backspace`

Disallow escape backspace (`[\b]`).

- **Printed as:** `eslint-lint/regexp/no-escape-backspace`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep regular expressions safe and readable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-escape-backspace.html).
- **Exception:** If this is intended, add `{"rule":"regexp/no-escape-backspace","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-escape-backspace.html)

<a id="eslint-regexp-no-extra-lookaround-assertions"></a>

### `eslint/regexp/no-extra-lookaround-assertions`

Disallow unnecessary nested lookaround assertions.

- **Printed as:** `eslint-lint/regexp/no-extra-lookaround-assertions`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep regular expressions safe and readable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-extra-lookaround-assertions.html).
- **Exception:** If this is intended, add `{"rule":"regexp/no-extra-lookaround-assertions","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-extra-lookaround-assertions.html)

<a id="eslint-regexp-no-lazy-ends"></a>

### `eslint/regexp/no-lazy-ends`

Disallow lazy quantifiers at the end of an expression.

- **Printed as:** `eslint-lint/regexp/no-lazy-ends`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep regular expressions safe and readable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-lazy-ends.html).
- **Exception:** If this is intended, add `{"rule":"regexp/no-lazy-ends","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-lazy-ends.html)

<a id="eslint-regexp-no-misleading-capturing-group"></a>

### `eslint/regexp/no-misleading-capturing-group`

Disallow capturing groups that do not behave as one would expect.

- **Printed as:** `eslint-lint/regexp/no-misleading-capturing-group`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep regular expressions safe and readable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-misleading-capturing-group.html).
- **Exception:** If this is intended, add `{"rule":"regexp/no-misleading-capturing-group","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-misleading-capturing-group.html)

<a id="eslint-regexp-no-missing-g-flag"></a>

### `eslint/regexp/no-missing-g-flag`

Disallow missing `g` flag in patterns used in `String#matchAll` and `String#replaceAll`.

- **Printed as:** `eslint-lint/regexp/no-missing-g-flag`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep regular expressions safe and readable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-missing-g-flag.html).
- **Exception:** If this is intended, add `{"rule":"regexp/no-missing-g-flag","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-missing-g-flag.html)

<a id="eslint-regexp-no-obscure-range"></a>

### `eslint/regexp/no-obscure-range`

Disallow obscure character ranges.

- **Printed as:** `eslint-lint/regexp/no-obscure-range`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep regular expressions safe and readable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-obscure-range.html).
- **Exception:** If this is intended, add `{"rule":"regexp/no-obscure-range","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-obscure-range.html)

<a id="eslint-regexp-no-optional-assertion"></a>

### `eslint/regexp/no-optional-assertion`

Disallow optional assertions.

- **Printed as:** `eslint-lint/regexp/no-optional-assertion`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep regular expressions safe and readable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-optional-assertion.html).
- **Exception:** If this is intended, add `{"rule":"regexp/no-optional-assertion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-optional-assertion.html)

<a id="eslint-regexp-no-potentially-useless-backreference"></a>

### `eslint/regexp/no-potentially-useless-backreference`

Disallow backreferences that reference a group that might not be matched.

- **Printed as:** `eslint-lint/regexp/no-potentially-useless-backreference`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep regular expressions safe and readable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-potentially-useless-backreference.html).
- **Exception:** If this is intended, add `{"rule":"regexp/no-potentially-useless-backreference","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-potentially-useless-backreference.html)

<a id="eslint-regexp-no-super-linear-backtracking"></a>

### `eslint/regexp/no-super-linear-backtracking`

Disallow exponential and polynomial backtracking.

- **Printed as:** `eslint-lint/regexp/no-super-linear-backtracking`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep regular expressions safe and readable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-super-linear-backtracking.html).
- **Exception:** If this is intended, add `{"rule":"regexp/no-super-linear-backtracking","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-super-linear-backtracking.html)

<a id="eslint-regexp-no-trivially-nested-assertion"></a>

### `eslint/regexp/no-trivially-nested-assertion`

Disallow trivially nested assertions.

- **Printed as:** `eslint-lint/regexp/no-trivially-nested-assertion`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep regular expressions safe and readable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-trivially-nested-assertion.html).
- **Exception:** If this is intended, add `{"rule":"regexp/no-trivially-nested-assertion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-trivially-nested-assertion.html)

<a id="eslint-regexp-no-trivially-nested-quantifier"></a>

### `eslint/regexp/no-trivially-nested-quantifier`

Disallow nested quantifiers that can be rewritten as one quantifier.

- **Printed as:** `eslint-lint/regexp/no-trivially-nested-quantifier`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep regular expressions safe and readable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-trivially-nested-quantifier.html).
- **Exception:** If this is intended, add `{"rule":"regexp/no-trivially-nested-quantifier","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-trivially-nested-quantifier.html)

<a id="eslint-regexp-no-useless-assertions"></a>

### `eslint/regexp/no-useless-assertions`

Disallow assertions that are known to always accept (or reject).

- **Printed as:** `eslint-lint/regexp/no-useless-assertions`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep regular expressions safe and readable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-useless-assertions.html).
- **Exception:** If this is intended, add `{"rule":"regexp/no-useless-assertions","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-useless-assertions.html)

<a id="eslint-regexp-no-useless-backreference"></a>

### `eslint/regexp/no-useless-backreference`

Disallow useless backreferences in regular expressions.

- **Printed as:** `eslint-lint/regexp/no-useless-backreference`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep regular expressions safe and readable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-useless-backreference.html).
- **Exception:** If this is intended, add `{"rule":"regexp/no-useless-backreference","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-useless-backreference.html)

<a id="eslint-regexp-no-useless-character-class"></a>

### `eslint/regexp/no-useless-character-class`

Disallow character class with one character.

- **Printed as:** `eslint-lint/regexp/no-useless-character-class`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep regular expressions safe and readable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-useless-character-class.html).
- **Exception:** If this is intended, add `{"rule":"regexp/no-useless-character-class","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-useless-character-class.html)

<a id="eslint-regexp-no-useless-dollar-replacements"></a>

### `eslint/regexp/no-useless-dollar-replacements`

Disallow useless `$` replacements in replacement string.

- **Printed as:** `eslint-lint/regexp/no-useless-dollar-replacements`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep regular expressions safe and readable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-useless-dollar-replacements.html).
- **Exception:** If this is intended, add `{"rule":"regexp/no-useless-dollar-replacements","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-useless-dollar-replacements.html)

<a id="eslint-regexp-no-useless-flag"></a>

### `eslint/regexp/no-useless-flag`

Disallow unnecessary regex flags.

- **Printed as:** `eslint-lint/regexp/no-useless-flag`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep regular expressions safe and readable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-useless-flag.html).
- **Exception:** If this is intended, add `{"rule":"regexp/no-useless-flag","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-useless-flag.html)

<a id="eslint-regexp-no-useless-lazy"></a>

### `eslint/regexp/no-useless-lazy`

Disallow unnecessarily non-greedy quantifiers.

- **Printed as:** `eslint-lint/regexp/no-useless-lazy`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep regular expressions safe and readable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-useless-lazy.html).
- **Exception:** If this is intended, add `{"rule":"regexp/no-useless-lazy","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-useless-lazy.html)

<a id="eslint-regexp-no-useless-non-capturing-group"></a>

### `eslint/regexp/no-useless-non-capturing-group`

Disallow unnecessary non-capturing group.

- **Printed as:** `eslint-lint/regexp/no-useless-non-capturing-group`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep regular expressions safe and readable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-useless-non-capturing-group.html).
- **Exception:** If this is intended, add `{"rule":"regexp/no-useless-non-capturing-group","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-useless-non-capturing-group.html)

<a id="eslint-regexp-no-useless-quantifier"></a>

### `eslint/regexp/no-useless-quantifier`

Disallow quantifiers that can be removed.

- **Printed as:** `eslint-lint/regexp/no-useless-quantifier`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep regular expressions safe and readable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-useless-quantifier.html).
- **Exception:** If this is intended, add `{"rule":"regexp/no-useless-quantifier","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-useless-quantifier.html)

<a id="eslint-regexp-no-useless-range"></a>

### `eslint/regexp/no-useless-range`

Disallow unnecessary character ranges.

- **Printed as:** `eslint-lint/regexp/no-useless-range`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep regular expressions safe and readable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-useless-range.html).
- **Exception:** If this is intended, add `{"rule":"regexp/no-useless-range","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-useless-range.html)

<a id="eslint-regexp-no-useless-set-operand"></a>

### `eslint/regexp/no-useless-set-operand`

Disallow unnecessary elements in expression character classes.

- **Printed as:** `eslint-lint/regexp/no-useless-set-operand`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep regular expressions safe and readable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-useless-set-operand.html).
- **Exception:** If this is intended, add `{"rule":"regexp/no-useless-set-operand","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-useless-set-operand.html)

<a id="eslint-regexp-no-useless-string-literal"></a>

### `eslint/regexp/no-useless-string-literal`

Disallow string disjunction of single characters in `\q{...}`.

- **Printed as:** `eslint-lint/regexp/no-useless-string-literal`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep regular expressions safe and readable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-useless-string-literal.html).
- **Exception:** If this is intended, add `{"rule":"regexp/no-useless-string-literal","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-useless-string-literal.html)

<a id="eslint-regexp-no-useless-two-nums-quantifier"></a>

### `eslint/regexp/no-useless-two-nums-quantifier`

Disallow unnecessary `{n,m}` quantifier.

- **Printed as:** `eslint-lint/regexp/no-useless-two-nums-quantifier`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep regular expressions safe and readable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-useless-two-nums-quantifier.html).
- **Exception:** If this is intended, add `{"rule":"regexp/no-useless-two-nums-quantifier","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-useless-two-nums-quantifier.html)

<a id="eslint-regexp-no-zero-quantifier"></a>

### `eslint/regexp/no-zero-quantifier`

Disallow quantifiers with a maximum of zero.

- **Printed as:** `eslint-lint/regexp/no-zero-quantifier`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep regular expressions safe and readable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-zero-quantifier.html).
- **Exception:** If this is intended, add `{"rule":"regexp/no-zero-quantifier","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-zero-quantifier.html)

<a id="eslint-regexp-optimal-lookaround-quantifier"></a>

### `eslint/regexp/optimal-lookaround-quantifier`

Disallow the alternatives of lookarounds that end with a non-constant quantifier.

- **Printed as:** `eslint-lint/regexp/optimal-lookaround-quantifier`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep regular expressions safe and readable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/optimal-lookaround-quantifier.html).
- **Exception:** If this is intended, add `{"rule":"regexp/optimal-lookaround-quantifier","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/optimal-lookaround-quantifier.html)

<a id="eslint-regexp-optimal-quantifier-concatenation"></a>

### `eslint/regexp/optimal-quantifier-concatenation`

Require optimal quantifiers for concatenated quantifiers.

- **Printed as:** `eslint-lint/regexp/optimal-quantifier-concatenation`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep regular expressions safe and readable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/optimal-quantifier-concatenation.html).
- **Exception:** If this is intended, add `{"rule":"regexp/optimal-quantifier-concatenation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/optimal-quantifier-concatenation.html)

<a id="eslint-regexp-prefer-predefined-assertion"></a>

### `eslint/regexp/prefer-predefined-assertion`

Prefer predefined assertion over equivalent lookarounds.

- **Printed as:** `eslint-lint/regexp/prefer-predefined-assertion`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep regular expressions safe and readable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/prefer-predefined-assertion.html).
- **Exception:** If this is intended, add `{"rule":"regexp/prefer-predefined-assertion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/prefer-predefined-assertion.html)

<a id="eslint-regexp-simplify-set-operations"></a>

### `eslint/regexp/simplify-set-operations`

Require simplify set operations.

- **Printed as:** `eslint-lint/regexp/simplify-set-operations`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule to keep regular expressions safe and readable.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/simplify-set-operations.html).
- **Exception:** If this is intended, add `{"rule":"regexp/simplify-set-operations","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://ota-meshi.github.io/eslint-plugin-regexp/rules/simplify-set-operations.html)

<a id="eslint-testing-library-await-async-events"></a>

### `eslint/testing-library/await-async-events`

Enforce promises from async event methods are handled.

- **Printed as:** `eslint-lint/testing-library/await-async-events`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the Testing Library rules for component tests: query by role, user-event, no implementation details.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/testing-library/eslint-plugin-testing-library/tree/main/docs/rules/await-async-events.md).
- **Exception:** If this is intended, add `{"rule":"testing-library/await-async-events","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/testing-library/eslint-plugin-testing-library/tree/main/docs/rules/await-async-events.md)

<a id="eslint-testing-library-await-async-queries"></a>

### `eslint/testing-library/await-async-queries`

Enforce promises from async queries to be handled.

- **Printed as:** `eslint-lint/testing-library/await-async-queries`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the Testing Library rules for component tests: query by role, user-event, no implementation details.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/testing-library/eslint-plugin-testing-library/tree/main/docs/rules/await-async-queries.md).
- **Exception:** If this is intended, add `{"rule":"testing-library/await-async-queries","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/testing-library/eslint-plugin-testing-library/tree/main/docs/rules/await-async-queries.md)

<a id="eslint-testing-library-await-async-utils"></a>

### `eslint/testing-library/await-async-utils`

Enforce promises from async utils to be awaited properly.

- **Printed as:** `eslint-lint/testing-library/await-async-utils`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the Testing Library rules for component tests: query by role, user-event, no implementation details.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/testing-library/eslint-plugin-testing-library/tree/main/docs/rules/await-async-utils.md).
- **Exception:** If this is intended, add `{"rule":"testing-library/await-async-utils","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/testing-library/eslint-plugin-testing-library/tree/main/docs/rules/await-async-utils.md)

<a id="eslint-testing-library-no-debugging-utils"></a>

### `eslint/testing-library/no-debugging-utils`

Disallow the use of debugging utilities like `debug`.

- **Printed as:** `eslint-lint/testing-library/no-debugging-utils`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the Testing Library rules for component tests: query by role, user-event, no implementation details.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/testing-library/eslint-plugin-testing-library/tree/main/docs/rules/no-debugging-utils.md).
- **Exception:** If this is intended, add `{"rule":"testing-library/no-debugging-utils","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/testing-library/eslint-plugin-testing-library/tree/main/docs/rules/no-debugging-utils.md)

<a id="eslint-testing-library-no-manual-cleanup"></a>

### `eslint/testing-library/no-manual-cleanup`

Disallow the use of `cleanup`.

- **Printed as:** `eslint-lint/testing-library/no-manual-cleanup`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the Testing Library rules for component tests: query by role, user-event, no implementation details.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/testing-library/eslint-plugin-testing-library/tree/main/docs/rules/no-manual-cleanup.md).
- **Exception:** If this is intended, add `{"rule":"testing-library/no-manual-cleanup","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/testing-library/eslint-plugin-testing-library/tree/main/docs/rules/no-manual-cleanup.md)

<a id="eslint-testing-library-no-node-access"></a>

### `eslint/testing-library/no-node-access`

Disallow direct Node access.

- **Printed as:** `eslint-lint/testing-library/no-node-access`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the Testing Library rules for component tests: query by role, user-event, no implementation details.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/testing-library/eslint-plugin-testing-library/tree/main/docs/rules/no-node-access.md).
- **Exception:** If this is intended, add `{"rule":"testing-library/no-node-access","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/testing-library/eslint-plugin-testing-library/tree/main/docs/rules/no-node-access.md)

<a id="eslint-testing-library-no-test-id-queries"></a>

### `eslint/testing-library/no-test-id-queries`

Ensure no `data-testid` queries are used.

- **Printed as:** `eslint-lint/testing-library/no-test-id-queries`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the Testing Library rules for component tests: query by role, user-event, no implementation details.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/testing-library/eslint-plugin-testing-library/tree/main/docs/rules/no-test-id-queries.md).
- **Exception:** If this is intended, add `{"rule":"testing-library/no-test-id-queries","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/testing-library/eslint-plugin-testing-library/tree/main/docs/rules/no-test-id-queries.md)

<a id="eslint-testing-library-no-unnecessary-act"></a>

### `eslint/testing-library/no-unnecessary-act`

Disallow wrapping Testing Library utils or empty callbacks in `act`.

- **Printed as:** `eslint-lint/testing-library/no-unnecessary-act`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the Testing Library rules for component tests: query by role, user-event, no implementation details.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/testing-library/eslint-plugin-testing-library/tree/main/docs/rules/no-unnecessary-act.md).
- **Exception:** If this is intended, add `{"rule":"testing-library/no-unnecessary-act","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/testing-library/eslint-plugin-testing-library/tree/main/docs/rules/no-unnecessary-act.md)

<a id="eslint-testing-library-prefer-presence-queries"></a>

### `eslint/testing-library/prefer-presence-queries`

Ensure appropriate `get*`/`query*` queries are used with their respective matchers.

- **Printed as:** `eslint-lint/testing-library/prefer-presence-queries`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the Testing Library rules for component tests: query by role, user-event, no implementation details.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/testing-library/eslint-plugin-testing-library/tree/main/docs/rules/prefer-presence-queries.md).
- **Exception:** If this is intended, add `{"rule":"testing-library/prefer-presence-queries","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/testing-library/eslint-plugin-testing-library/tree/main/docs/rules/prefer-presence-queries.md)

<a id="eslint-testing-library-prefer-screen-queries"></a>

### `eslint/testing-library/prefer-screen-queries`

Suggest using `screen` while querying.

- **Printed as:** `eslint-lint/testing-library/prefer-screen-queries`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the Testing Library rules for component tests: query by role, user-event, no implementation details.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/testing-library/eslint-plugin-testing-library/tree/main/docs/rules/prefer-screen-queries.md).
- **Exception:** If this is intended, add `{"rule":"testing-library/prefer-screen-queries","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/testing-library/eslint-plugin-testing-library/tree/main/docs/rules/prefer-screen-queries.md)

<a id="eslint-testing-library-prefer-user-event"></a>

### `eslint/testing-library/prefer-user-event`

Suggest using `userEvent` over `fireEvent` for simulating user interactions.

- **Printed as:** `eslint-lint/testing-library/prefer-user-event`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the Testing Library rules for component tests: query by role, user-event, no implementation details.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/testing-library/eslint-plugin-testing-library/tree/main/docs/rules/prefer-user-event.md).
- **Exception:** If this is intended, add `{"rule":"testing-library/prefer-user-event","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/testing-library/eslint-plugin-testing-library/tree/main/docs/rules/prefer-user-event.md)

<a id="eslint-testing-library-prefer-user-event-setup"></a>

### `eslint/testing-library/prefer-user-event-setup`

Suggest using userEvent with setup() instead of direct methods.

- **Printed as:** `eslint-lint/testing-library/prefer-user-event-setup`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Why it is on:** The React scope turns on the Testing Library rules for component tests: query by role, user-event, no implementation details.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/testing-library/eslint-plugin-testing-library/tree/main/docs/rules/prefer-user-event-setup.md).
- **Exception:** If this is intended, add `{"rule":"testing-library/prefer-user-event-setup","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/react.md), [Rule documentation](https://github.com/testing-library/eslint-plugin-testing-library/tree/main/docs/rules/prefer-user-event-setup.md)

<a id="eslint-vitest-expect-expect"></a>

### `eslint/vitest/expect-expect`

Enforce having expectation in test body.

- **Printed as:** `eslint-lint/vitest/expect-expect`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** Part of the recommended rules of the Vitest plugin, which the presets turn on for tests.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/expect-expect.md).
- **Exception:** If this is intended, add `{"rule":"vitest/expect-expect","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/inside-tests.md), [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/expect-expect.md)

<a id="eslint-vitest-no-commented-out-tests"></a>

### `eslint/vitest/no-commented-out-tests`

Disallow commented out tests.

- **Printed as:** `eslint-lint/vitest/no-commented-out-tests`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** Part of the recommended rules of the Vitest plugin, which the presets turn on for tests.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-commented-out-tests.md).
- **Exception:** If this is intended, add `{"rule":"vitest/no-commented-out-tests","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/inside-tests.md), [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-commented-out-tests.md)

<a id="eslint-vitest-no-conditional-expect"></a>

### `eslint/vitest/no-conditional-expect`

Disallow conditional expects.

- **Printed as:** `eslint-lint/vitest/no-conditional-expect`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** Part of the recommended rules of the Vitest plugin, which the presets turn on for tests.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-conditional-expect.md).
- **Exception:** If this is intended, add `{"rule":"vitest/no-conditional-expect","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/inside-tests.md), [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-conditional-expect.md)

<a id="eslint-vitest-no-conditional-in-test"></a>

### `eslint/vitest/no-conditional-in-test`

Disallow conditional tests.

- **Printed as:** `eslint-lint/vitest/no-conditional-in-test`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule of the Vitest plugin for tests.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-conditional-in-test.md).
- **Exception:** If this is intended, add `{"rule":"vitest/no-conditional-in-test","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/inside-tests.md), [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-conditional-in-test.md)

<a id="eslint-vitest-no-disabled-tests"></a>

### `eslint/vitest/no-disabled-tests`

Disallow disabled tests.

- **Printed as:** `eslint-lint/vitest/no-disabled-tests`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** Part of the recommended rules of the Vitest plugin, which the presets turn on for tests.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-disabled-tests.md).
- **Exception:** If this is intended, add `{"rule":"vitest/no-disabled-tests","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/inside-tests.md), [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-disabled-tests.md)

<a id="eslint-vitest-no-focused-tests"></a>

### `eslint/vitest/no-focused-tests`

Disallow focused tests.

- **Printed as:** `eslint-lint/vitest/no-focused-tests`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** Part of the recommended rules of the Vitest plugin, which the presets turn on for tests.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-focused-tests.md).
- **Exception:** If this is intended, add `{"rule":"vitest/no-focused-tests","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/inside-tests.md), [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-focused-tests.md)

<a id="eslint-vitest-no-identical-title"></a>

### `eslint/vitest/no-identical-title`

Disallow identical titles.

- **Printed as:** `eslint-lint/vitest/no-identical-title`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** Part of the recommended rules of the Vitest plugin, which the presets turn on for tests.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-identical-title.md).
- **Exception:** If this is intended, add `{"rule":"vitest/no-identical-title","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/inside-tests.md), [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-identical-title.md)

<a id="eslint-vitest-no-import-node-test"></a>

### `eslint/vitest/no-import-node-test`

Disallow importing `node:test`.

- **Printed as:** `eslint-lint/vitest/no-import-node-test`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** Part of the recommended rules of the Vitest plugin, which the presets turn on for tests.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-import-node-test.md).
- **Exception:** If this is intended, add `{"rule":"vitest/no-import-node-test","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/inside-tests.md), [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-import-node-test.md)

<a id="eslint-vitest-no-interpolation-in-snapshots"></a>

### `eslint/vitest/no-interpolation-in-snapshots`

Disallow string interpolation in snapshots.

- **Printed as:** `eslint-lint/vitest/no-interpolation-in-snapshots`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** Part of the recommended rules of the Vitest plugin, which the presets turn on for tests.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-interpolation-in-snapshots.md).
- **Exception:** If this is intended, add `{"rule":"vitest/no-interpolation-in-snapshots","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/inside-tests.md), [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-interpolation-in-snapshots.md)

<a id="eslint-vitest-no-mocks-import"></a>

### `eslint/vitest/no-mocks-import`

Disallow importing from \_\_mocks\_\_ directory.

- **Printed as:** `eslint-lint/vitest/no-mocks-import`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** Part of the recommended rules of the Vitest plugin, which the presets turn on for tests.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-mocks-import.md).
- **Exception:** If this is intended, add `{"rule":"vitest/no-mocks-import","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/inside-tests.md), [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-mocks-import.md)

<a id="eslint-vitest-no-restricted-matchers"></a>

### `eslint/vitest/no-restricted-matchers`

Disallow the use of certain matchers.

- **Printed as:** `eslint-lint/vitest/no-restricted-matchers`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The presets list the forms they ban in the options of this rule. Each form has a message that names the allowed form.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-restricted-matchers.md).
- **Exception:** If this is intended, add `{"rule":"vitest/no-restricted-matchers","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - `toBeDefined`, `resolves.toBeDefined`, `rejects.toBeDefined`: `toBeDefined` passes for any value but undefined. Assert the value itself with `toBe` or `toEqual`. An exception fits only when the value cannot be pinned.
  - `not.toBeUndefined`, `resolves.not.toBeUndefined`, `rejects.not.toBeUndefined`: `not.toBeUndefined` passes for any value but undefined. Assert the value itself with `toBe` or `toEqual`. An exception fits only when the value cannot be pinned.
  - `not.toBeNull`, `resolves.not.toBeNull`, `rejects.not.toBeNull`: `not.toBeNull` passes for any value but null. Assert the value itself with `toBe` or `toEqual`. An exception fits only when the value cannot be pinned.
  - `toBeTruthy`, `resolves.toBeTruthy`, `rejects.toBeTruthy`: `toBeTruthy` passes for any truthy value. Assert the exact value with `toBe` or `toEqual`. An exception fits only when the value cannot be pinned.
  - `toBeFalsy`, `resolves.toBeFalsy`, `rejects.toBeFalsy`: `toBeFalsy` passes for any falsy value. Assert the exact value with `toBe` or `toEqual`. An exception fits only when the value cannot be pinned.
- **See also:** [Strict preset guide](../typescript-strict-preset/inside-tests.md), [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-restricted-matchers.md)

<a id="eslint-vitest-no-standalone-expect"></a>

### `eslint/vitest/no-standalone-expect`

Disallow using `expect` outside of `it` or `test` blocks.

- **Printed as:** `eslint-lint/vitest/no-standalone-expect`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** Part of the recommended rules of the Vitest plugin, which the presets turn on for tests.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-standalone-expect.md).
- **Exception:** If this is intended, add `{"rule":"vitest/no-standalone-expect","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/inside-tests.md), [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-standalone-expect.md)

<a id="eslint-vitest-no-unneeded-async-expect-function"></a>

### `eslint/vitest/no-unneeded-async-expect-function`

Disallow unnecessary async function wrapper for expected promises.

- **Printed as:** `eslint-lint/vitest/no-unneeded-async-expect-function`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** Part of the recommended rules of the Vitest plugin, which the presets turn on for tests.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-unneeded-async-expect-function.md).
- **Exception:** If this is intended, add `{"rule":"vitest/no-unneeded-async-expect-function","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/inside-tests.md), [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-unneeded-async-expect-function.md)

<a id="eslint-vitest-prefer-called-exactly-once-with"></a>

### `eslint/vitest/prefer-called-exactly-once-with`

Prefer `toHaveBeenCalledExactlyOnceWith` over `toHaveBeenCalledOnce` and `toHaveBeenCalledWith`.

- **Printed as:** `eslint-lint/vitest/prefer-called-exactly-once-with`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** Part of the recommended rules of the Vitest plugin, which the presets turn on for tests.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-called-exactly-once-with.md).
- **Exception:** If this is intended, add `{"rule":"vitest/prefer-called-exactly-once-with","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/inside-tests.md), [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-called-exactly-once-with.md)

<a id="eslint-vitest-prefer-called-with"></a>

### `eslint/vitest/prefer-called-with`

Enforce using `toBeCalledWith()` or `toHaveBeenCalledWith()`.

- **Printed as:** `eslint-lint/vitest/prefer-called-with`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule of the Vitest plugin for tests.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-called-with.md).
- **Exception:** If this is intended, add `{"rule":"vitest/prefer-called-with","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/inside-tests.md), [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-called-with.md)

<a id="eslint-vitest-require-awaited-expect-poll"></a>

### `eslint/vitest/require-awaited-expect-poll`

Ensure that every `expect.poll` call is awaited.

- **Printed as:** `eslint-lint/vitest/require-awaited-expect-poll`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule of the Vitest plugin for tests.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/require-awaited-expect-poll.md).
- **Exception:** If this is intended, add `{"rule":"vitest/require-awaited-expect-poll","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/inside-tests.md), [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/require-awaited-expect-poll.md)

<a id="eslint-vitest-require-local-test-context-for-concurrent-snapshots"></a>

### `eslint/vitest/require-local-test-context-for-concurrent-snapshots`

Require local Test Context for concurrent snapshot tests.

- **Printed as:** `eslint-lint/vitest/require-local-test-context-for-concurrent-snapshots`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** Part of the recommended rules of the Vitest plugin, which the presets turn on for tests.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/require-local-test-context-for-concurrent-snapshots.md).
- **Exception:** If this is intended, add `{"rule":"vitest/require-local-test-context-for-concurrent-snapshots","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/inside-tests.md), [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/require-local-test-context-for-concurrent-snapshots.md)

<a id="eslint-vitest-require-to-throw-message"></a>

### `eslint/vitest/require-to-throw-message`

Require toThrow() to be called with an error message.

- **Printed as:** `eslint-lint/vitest/require-to-throw-message`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** The preset turns on this rule of the Vitest plugin for tests.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/require-to-throw-message.md).
- **Exception:** If this is intended, add `{"rule":"vitest/require-to-throw-message","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/inside-tests.md), [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/require-to-throw-message.md)

<a id="eslint-vitest-valid-describe-callback"></a>

### `eslint/vitest/valid-describe-callback`

Enforce valid describe callback.

- **Printed as:** `eslint-lint/vitest/valid-describe-callback`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** Part of the recommended rules of the Vitest plugin, which the presets turn on for tests.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/valid-describe-callback.md).
- **Exception:** If this is intended, add `{"rule":"vitest/valid-describe-callback","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/inside-tests.md), [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/valid-describe-callback.md)

<a id="eslint-vitest-valid-expect"></a>

### `eslint/vitest/valid-expect`

Enforce valid `expect()` usage.

- **Printed as:** `eslint-lint/vitest/valid-expect`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** Part of the recommended rules of the Vitest plugin, which the presets turn on for tests.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/valid-expect.md).
- **Exception:** If this is intended, add `{"rule":"vitest/valid-expect","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/inside-tests.md), [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/valid-expect.md)

<a id="eslint-vitest-valid-expect-in-promise"></a>

### `eslint/vitest/valid-expect-in-promise`

Require promises that have expectations in their chain to be valid.

- **Printed as:** `eslint-lint/vitest/valid-expect-in-promise`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** Part of the recommended rules of the Vitest plugin, which the presets turn on for tests.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/valid-expect-in-promise.md).
- **Exception:** If this is intended, add `{"rule":"vitest/valid-expect-in-promise","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/inside-tests.md), [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/valid-expect-in-promise.md)

<a id="eslint-vitest-valid-title"></a>

### `eslint/vitest/valid-title`

Enforce valid titles.

- **Printed as:** `eslint-lint/vitest/valid-title`
- **Presets:** TypeScript and JavaScript
- **Why it is on:** Part of the recommended rules of the Vitest plugin, which the presets turn on for tests.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/valid-title.md).
- **Exception:** If this is intended, add `{"rule":"vitest/valid-title","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset/inside-tests.md), [Rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/valid-title.md)
