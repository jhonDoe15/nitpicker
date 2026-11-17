# TypeScript and JavaScript: ESLint core and typescript-eslint rules

The rules of ESLint itself and of typescript-eslint that the TypeScript and JavaScript presets turn on, including the restricted syntax, properties and globals. This page lists 158 rules. [All pages](README.md).

The guide for these rules: [docs/typescript-strict-preset.md](../typescript-strict-preset.md).

The summaries of the ESLint rules are the `meta.docs.description` of each rule, from ESLint, typescript-eslint and the plugins, all under the MIT License.

Unless an entry says otherwise:

- **Presets:** TypeScript and JavaScript
- **Analyzers:** `eslint-lint`
- **Fix:** None: fix it by hand.

<a id="eslint-typescript-eslint-await-thenable"></a>

### `eslint/@typescript-eslint/await-thenable`

Disallow awaiting a value that is not a Thenable.

- **Labels:** bug, async
- **Printed as:** `eslint-lint/@typescript-eslint/await-thenable`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/await-thenable).
- **Fix:** With `nitpicker --fix --rule eslint/@typescript-eslint/await-thenable`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/await-thenable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/await-thenable)

<a id="eslint-typescript-eslint-ban-ts-comment"></a>

### `eslint/@typescript-eslint/ban-ts-comment`

Disallow `@ts-<directive>` comments or require descriptions after directives.

- **Labels:** maintainability
- **Printed as:** `eslint-lint/@typescript-eslint/ban-ts-comment`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/ban-ts-comment).
- **Fix:** With `nitpicker --fix --rule eslint/@typescript-eslint/ban-ts-comment`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/ban-ts-comment","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/ban-ts-comment)

<a id="eslint-typescript-eslint-consistent-type-imports"></a>

### `eslint/@typescript-eslint/consistent-type-imports`

Enforce consistent usage of type imports.

- **Labels:** style
- **Printed as:** `eslint-lint/@typescript-eslint/consistent-type-imports`
- **Presets:** TypeScript
- **Scope:** The TypeScript preset only.
- **Why it is on:** Turned on by the preset on top of the ESLint and typescript-eslint rule sets.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/consistent-type-imports).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/consistent-type-imports","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/consistent-type-imports)

<a id="eslint-typescript-eslint-explicit-module-boundary-types"></a>

### `eslint/@typescript-eslint/explicit-module-boundary-types`

Require explicit return and argument types on exported functions' and classes' public class methods.

- **Labels:** maintainability
- **Printed as:** `eslint-lint/@typescript-eslint/explicit-module-boundary-types`
- **Presets:** TypeScript
- **Scope:** The TypeScript preset only.
- **Why it is on:** Turned on by the preset on top of the ESLint and typescript-eslint rule sets.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/explicit-module-boundary-types).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/explicit-module-boundary-types","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/explicit-module-boundary-types)

<a id="eslint-typescript-eslint-no-array-constructor"></a>

### `eslint/@typescript-eslint/no-array-constructor`

Disallow generic `Array` constructors.

- **Labels:** style
- **Printed as:** `eslint-lint/@typescript-eslint/no-array-constructor`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-array-constructor).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-array-constructor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-array-constructor)

<a id="eslint-typescript-eslint-no-array-delete"></a>

### `eslint/@typescript-eslint/no-array-delete`

Disallow using the `delete` operator on array values.

- **Labels:** bug
- **Printed as:** `eslint-lint/@typescript-eslint/no-array-delete`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-array-delete).
- **Fix:** With `nitpicker --fix --rule eslint/@typescript-eslint/no-array-delete`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-array-delete","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-array-delete)

<a id="eslint-typescript-eslint-no-base-to-string"></a>

### `eslint/@typescript-eslint/no-base-to-string`

Require `.toString()` and `.toLocaleString()` to only be called on objects which provide useful information when stringified.

- **Labels:** bug
- **Printed as:** `eslint-lint/@typescript-eslint/no-base-to-string`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-base-to-string).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-base-to-string","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-base-to-string)

<a id="eslint-typescript-eslint-no-confusing-void-expression"></a>

### `eslint/@typescript-eslint/no-confusing-void-expression`

Require expressions of type void to appear in statement position.

- **Labels:** style
- **Printed as:** `eslint-lint/@typescript-eslint/no-confusing-void-expression`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-confusing-void-expression).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-confusing-void-expression","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-confusing-void-expression)

<a id="eslint-typescript-eslint-no-deprecated"></a>

### `eslint/@typescript-eslint/no-deprecated`

Disallow using code marked as `@deprecated`.

- **Labels:** maintainability
- **Printed as:** `eslint-lint/@typescript-eslint/no-deprecated`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-deprecated).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-deprecated","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-deprecated)

<a id="eslint-typescript-eslint-no-duplicate-enum-values"></a>

### `eslint/@typescript-eslint/no-duplicate-enum-values`

Disallow duplicate enum member values.

- **Labels:** bug
- **Printed as:** `eslint-lint/@typescript-eslint/no-duplicate-enum-values`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-duplicate-enum-values).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-duplicate-enum-values","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-duplicate-enum-values)

<a id="eslint-typescript-eslint-no-duplicate-type-constituents"></a>

### `eslint/@typescript-eslint/no-duplicate-type-constituents`

Disallow duplicate constituents of union or intersection types.

- **Labels:** simplification
- **Printed as:** `eslint-lint/@typescript-eslint/no-duplicate-type-constituents`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-duplicate-type-constituents).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-duplicate-type-constituents","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-duplicate-type-constituents)

<a id="eslint-typescript-eslint-no-dynamic-delete"></a>

### `eslint/@typescript-eslint/no-dynamic-delete`

Disallow using the `delete` operator on computed key expressions.

- **Labels:** performance, maintainability
- **Printed as:** `eslint-lint/@typescript-eslint/no-dynamic-delete`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-dynamic-delete).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-dynamic-delete","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-dynamic-delete)

<a id="eslint-typescript-eslint-no-empty-object-type"></a>

### `eslint/@typescript-eslint/no-empty-object-type`

Disallow accidentally using the "empty object" type.

- **Labels:** bug
- **Printed as:** `eslint-lint/@typescript-eslint/no-empty-object-type`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-empty-object-type).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-empty-object-type","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-empty-object-type)

<a id="eslint-typescript-eslint-no-explicit-any"></a>

### `eslint/@typescript-eslint/no-explicit-any`

Disallow the `any` type.

- **Labels:** maintainability
- **Printed as:** `eslint-lint/@typescript-eslint/no-explicit-any`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-explicit-any).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-explicit-any","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-explicit-any)

<a id="eslint-typescript-eslint-no-extra-non-null-assertion"></a>

### `eslint/@typescript-eslint/no-extra-non-null-assertion`

Disallow extra non-null assertions.

- **Labels:** simplification
- **Printed as:** `eslint-lint/@typescript-eslint/no-extra-non-null-assertion`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-extra-non-null-assertion).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-extra-non-null-assertion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-extra-non-null-assertion)

<a id="eslint-typescript-eslint-no-extraneous-class"></a>

### `eslint/@typescript-eslint/no-extraneous-class`

Disallow classes used as namespaces.

- **Labels:** maintainability
- **Printed as:** `eslint-lint/@typescript-eslint/no-extraneous-class`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-extraneous-class).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-extraneous-class","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-extraneous-class)

<a id="eslint-typescript-eslint-no-floating-promises"></a>

### `eslint/@typescript-eslint/no-floating-promises`

Require Promise-like statements to be handled appropriately.

- **Labels:** bug, reliability, async
- **Printed as:** `eslint-lint/@typescript-eslint/no-floating-promises`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-floating-promises).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-floating-promises","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-floating-promises)

<a id="eslint-typescript-eslint-no-for-in-array"></a>

### `eslint/@typescript-eslint/no-for-in-array`

Disallow iterating over an array with a for-in loop.

- **Labels:** bug
- **Printed as:** `eslint-lint/@typescript-eslint/no-for-in-array`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-for-in-array).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-for-in-array","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-for-in-array)

<a id="eslint-typescript-eslint-no-implied-eval"></a>

### `eslint/@typescript-eslint/no-implied-eval`

Disallow the use of `eval()`-like functions.

- **Labels:** security
- **Printed as:** `eslint-lint/@typescript-eslint/no-implied-eval`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-implied-eval).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-implied-eval","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-implied-eval)

<a id="eslint-typescript-eslint-no-invalid-void-type"></a>

### `eslint/@typescript-eslint/no-invalid-void-type`

Disallow `void` type outside of generic or return types.

- **Labels:** bug
- **Printed as:** `eslint-lint/@typescript-eslint/no-invalid-void-type`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-invalid-void-type).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-invalid-void-type","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-invalid-void-type)

<a id="eslint-typescript-eslint-no-meaningless-void-operator"></a>

### `eslint/@typescript-eslint/no-meaningless-void-operator`

Disallow the `void` operator except when used to discard a value.

- **Labels:** simplification
- **Printed as:** `eslint-lint/@typescript-eslint/no-meaningless-void-operator`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-meaningless-void-operator).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-meaningless-void-operator","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-meaningless-void-operator)

<a id="eslint-typescript-eslint-no-misused-new"></a>

### `eslint/@typescript-eslint/no-misused-new`

Enforce valid definition of `new` and `constructor`.

- **Labels:** bug
- **Printed as:** `eslint-lint/@typescript-eslint/no-misused-new`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-misused-new).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-misused-new","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-misused-new)

<a id="eslint-typescript-eslint-no-misused-promises"></a>

### `eslint/@typescript-eslint/no-misused-promises`

Disallow Promises in places not designed to handle them.

- **Labels:** bug, async
- **Printed as:** `eslint-lint/@typescript-eslint/no-misused-promises`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-misused-promises).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-misused-promises","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-misused-promises)

<a id="eslint-typescript-eslint-no-misused-spread"></a>

### `eslint/@typescript-eslint/no-misused-spread`

Disallow using the spread operator when it might cause unexpected behavior.

- **Labels:** bug
- **Printed as:** `eslint-lint/@typescript-eslint/no-misused-spread`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-misused-spread).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-misused-spread","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-misused-spread)

<a id="eslint-typescript-eslint-no-mixed-enums"></a>

### `eslint/@typescript-eslint/no-mixed-enums`

Disallow enums from having both number and string members.

- **Labels:** bug
- **Printed as:** `eslint-lint/@typescript-eslint/no-mixed-enums`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-mixed-enums).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-mixed-enums","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-mixed-enums)

<a id="eslint-typescript-eslint-no-namespace"></a>

### `eslint/@typescript-eslint/no-namespace`

Disallow TypeScript namespaces.

- **Labels:** maintainability
- **Printed as:** `eslint-lint/@typescript-eslint/no-namespace`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-namespace).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-namespace","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-namespace)

<a id="eslint-typescript-eslint-no-non-null-asserted-nullish-coalescing"></a>

### `eslint/@typescript-eslint/no-non-null-asserted-nullish-coalescing`

Disallow non-null assertions in the left operand of a nullish coalescing operator.

- **Labels:** bug
- **Printed as:** `eslint-lint/@typescript-eslint/no-non-null-asserted-nullish-coalescing`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-non-null-asserted-nullish-coalescing).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-non-null-asserted-nullish-coalescing","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-non-null-asserted-nullish-coalescing)

<a id="eslint-typescript-eslint-no-non-null-asserted-optional-chain"></a>

### `eslint/@typescript-eslint/no-non-null-asserted-optional-chain`

Disallow non-null assertions after an optional chain expression.

- **Labels:** bug
- **Printed as:** `eslint-lint/@typescript-eslint/no-non-null-asserted-optional-chain`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-non-null-asserted-optional-chain).
- **Fix:** With `nitpicker --fix --rule eslint/@typescript-eslint/no-non-null-asserted-optional-chain`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-non-null-asserted-optional-chain","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-non-null-asserted-optional-chain)

<a id="eslint-typescript-eslint-no-non-null-assertion"></a>

### `eslint/@typescript-eslint/no-non-null-assertion`

Disallow non-null assertions using the `!` postfix operator.

- **Labels:** bug, maintainability
- **Printed as:** `eslint-lint/@typescript-eslint/no-non-null-assertion`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-non-null-assertion).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-non-null-assertion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-non-null-assertion)

<a id="eslint-typescript-eslint-no-redundant-type-constituents"></a>

### `eslint/@typescript-eslint/no-redundant-type-constituents`

Disallow members of unions and intersections that do nothing or override type information.

- **Labels:** simplification
- **Printed as:** `eslint-lint/@typescript-eslint/no-redundant-type-constituents`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-redundant-type-constituents).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-redundant-type-constituents","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-redundant-type-constituents)

<a id="eslint-typescript-eslint-no-require-imports"></a>

### `eslint/@typescript-eslint/no-require-imports`

Disallow invocation of `require()`.

- **Labels:** style
- **Printed as:** `eslint-lint/@typescript-eslint/no-require-imports`
- **Presets:** TypeScript
- **Scope:** The TypeScript preset only.
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-require-imports).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-require-imports","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-require-imports)

<a id="eslint-typescript-eslint-no-this-alias"></a>

### `eslint/@typescript-eslint/no-this-alias`

Disallow aliasing `this`.

- **Labels:** maintainability
- **Printed as:** `eslint-lint/@typescript-eslint/no-this-alias`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-this-alias).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-this-alias","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-this-alias)

<a id="eslint-typescript-eslint-no-unnecessary-boolean-literal-compare"></a>

### `eslint/@typescript-eslint/no-unnecessary-boolean-literal-compare`

Disallow unnecessary equality comparisons against boolean literals.

- **Labels:** simplification
- **Printed as:** `eslint-lint/@typescript-eslint/no-unnecessary-boolean-literal-compare`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-unnecessary-boolean-literal-compare).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-unnecessary-boolean-literal-compare","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-unnecessary-boolean-literal-compare)

<a id="eslint-typescript-eslint-no-unnecessary-condition"></a>

### `eslint/@typescript-eslint/no-unnecessary-condition`

Disallow conditionals where the type is always truthy or always falsy.

- **Labels:** simplification, bug
- **Printed as:** `eslint-lint/@typescript-eslint/no-unnecessary-condition`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-unnecessary-condition).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-unnecessary-condition","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-unnecessary-condition)

<a id="eslint-typescript-eslint-no-unnecessary-template-expression"></a>

### `eslint/@typescript-eslint/no-unnecessary-template-expression`

Disallow unnecessary template expressions.

- **Labels:** simplification
- **Printed as:** `eslint-lint/@typescript-eslint/no-unnecessary-template-expression`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-unnecessary-template-expression).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-unnecessary-template-expression","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-unnecessary-template-expression)

<a id="eslint-typescript-eslint-no-unnecessary-type-arguments"></a>

### `eslint/@typescript-eslint/no-unnecessary-type-arguments`

Disallow type arguments that are equal to the default.

- **Labels:** simplification
- **Printed as:** `eslint-lint/@typescript-eslint/no-unnecessary-type-arguments`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-unnecessary-type-arguments).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-unnecessary-type-arguments","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-unnecessary-type-arguments)

<a id="eslint-typescript-eslint-no-unnecessary-type-assertion"></a>

### `eslint/@typescript-eslint/no-unnecessary-type-assertion`

Disallow type assertions that do not change the type of an expression.

- **Labels:** simplification
- **Printed as:** `eslint-lint/@typescript-eslint/no-unnecessary-type-assertion`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-unnecessary-type-assertion).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-unnecessary-type-assertion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-unnecessary-type-assertion)

<a id="eslint-typescript-eslint-no-unnecessary-type-constraint"></a>

### `eslint/@typescript-eslint/no-unnecessary-type-constraint`

Disallow unnecessary constraints on generic types.

- **Labels:** simplification
- **Printed as:** `eslint-lint/@typescript-eslint/no-unnecessary-type-constraint`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-unnecessary-type-constraint).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-unnecessary-type-constraint","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-unnecessary-type-constraint)

<a id="eslint-typescript-eslint-no-unnecessary-type-conversion"></a>

### `eslint/@typescript-eslint/no-unnecessary-type-conversion`

Disallow conversion idioms when they do not change the type or value of the expression.

- **Labels:** simplification
- **Printed as:** `eslint-lint/@typescript-eslint/no-unnecessary-type-conversion`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-unnecessary-type-conversion).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-unnecessary-type-conversion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-unnecessary-type-conversion)

<a id="eslint-typescript-eslint-no-unnecessary-type-parameters"></a>

### `eslint/@typescript-eslint/no-unnecessary-type-parameters`

Disallow type parameters that aren't used multiple times.

- **Labels:** simplification
- **Printed as:** `eslint-lint/@typescript-eslint/no-unnecessary-type-parameters`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-unnecessary-type-parameters).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-unnecessary-type-parameters","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-unnecessary-type-parameters)

<a id="eslint-typescript-eslint-no-unsafe-argument"></a>

### `eslint/@typescript-eslint/no-unsafe-argument`

Disallow calling a function with a value with type `any`.

- **Labels:** bug
- **Printed as:** `eslint-lint/@typescript-eslint/no-unsafe-argument`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-unsafe-argument).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-unsafe-argument","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-unsafe-argument)

<a id="eslint-typescript-eslint-no-unsafe-assignment"></a>

### `eslint/@typescript-eslint/no-unsafe-assignment`

Disallow assigning a value with type `any` to variables and properties.

- **Labels:** bug
- **Printed as:** `eslint-lint/@typescript-eslint/no-unsafe-assignment`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-unsafe-assignment).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-unsafe-assignment","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-unsafe-assignment)

<a id="eslint-typescript-eslint-no-unsafe-call"></a>

### `eslint/@typescript-eslint/no-unsafe-call`

Disallow calling a value with type `any`.

- **Labels:** bug
- **Printed as:** `eslint-lint/@typescript-eslint/no-unsafe-call`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-unsafe-call).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-unsafe-call","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-unsafe-call)

<a id="eslint-typescript-eslint-no-unsafe-declaration-merging"></a>

### `eslint/@typescript-eslint/no-unsafe-declaration-merging`

Disallow unsafe declaration merging.

- **Labels:** bug
- **Printed as:** `eslint-lint/@typescript-eslint/no-unsafe-declaration-merging`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-unsafe-declaration-merging).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-unsafe-declaration-merging","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-unsafe-declaration-merging)

<a id="eslint-typescript-eslint-no-unsafe-enum-comparison"></a>

### `eslint/@typescript-eslint/no-unsafe-enum-comparison`

Disallow comparing an enum value with a non-enum value.

- **Labels:** bug
- **Printed as:** `eslint-lint/@typescript-eslint/no-unsafe-enum-comparison`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-unsafe-enum-comparison).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-unsafe-enum-comparison","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-unsafe-enum-comparison)

<a id="eslint-typescript-eslint-no-unsafe-function-type"></a>

### `eslint/@typescript-eslint/no-unsafe-function-type`

Disallow using the unsafe built-in Function type.

- **Labels:** bug
- **Printed as:** `eslint-lint/@typescript-eslint/no-unsafe-function-type`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-unsafe-function-type).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-unsafe-function-type","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-unsafe-function-type)

<a id="eslint-typescript-eslint-no-unsafe-member-access"></a>

### `eslint/@typescript-eslint/no-unsafe-member-access`

Disallow member access on a value with type `any`.

- **Labels:** bug
- **Printed as:** `eslint-lint/@typescript-eslint/no-unsafe-member-access`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-unsafe-member-access).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-unsafe-member-access","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-unsafe-member-access)

<a id="eslint-typescript-eslint-no-unsafe-return"></a>

### `eslint/@typescript-eslint/no-unsafe-return`

Disallow returning a value with type `any` from a function.

- **Labels:** bug
- **Printed as:** `eslint-lint/@typescript-eslint/no-unsafe-return`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-unsafe-return).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-unsafe-return","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-unsafe-return)

<a id="eslint-typescript-eslint-no-unsafe-unary-minus"></a>

### `eslint/@typescript-eslint/no-unsafe-unary-minus`

Require unary negation to take a number.

- **Labels:** bug
- **Printed as:** `eslint-lint/@typescript-eslint/no-unsafe-unary-minus`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-unsafe-unary-minus).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-unsafe-unary-minus","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-unsafe-unary-minus)

<a id="eslint-typescript-eslint-no-unused-expressions"></a>

### `eslint/@typescript-eslint/no-unused-expressions`

Disallow unused expressions.

- **Labels:** simplification, bug
- **Printed as:** `eslint-lint/@typescript-eslint/no-unused-expressions`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-unused-expressions).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-unused-expressions","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-unused-expressions)

<a id="eslint-typescript-eslint-no-unused-private-class-members"></a>

### `eslint/@typescript-eslint/no-unused-private-class-members`

Disallow unused private class members.

- **Labels:** simplification
- **Printed as:** `eslint-lint/@typescript-eslint/no-unused-private-class-members`
- **Why it is on:** Turned on by the preset on top of the ESLint and typescript-eslint rule sets.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-unused-private-class-members).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-unused-private-class-members","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-unused-private-class-members)

<a id="eslint-typescript-eslint-no-unused-vars"></a>

### `eslint/@typescript-eslint/no-unused-vars`

Disallow unused variables.

- **Labels:** simplification
- **Printed as:** `eslint-lint/@typescript-eslint/no-unused-vars`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-unused-vars).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-unused-vars","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-unused-vars)

<a id="eslint-typescript-eslint-no-useless-constructor"></a>

### `eslint/@typescript-eslint/no-useless-constructor`

Disallow unnecessary constructors.

- **Labels:** simplification
- **Printed as:** `eslint-lint/@typescript-eslint/no-useless-constructor`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-useless-constructor).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-useless-constructor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-useless-constructor)

<a id="eslint-typescript-eslint-no-useless-default-assignment"></a>

### `eslint/@typescript-eslint/no-useless-default-assignment`

Disallow default values that will never be used.

- **Labels:** simplification
- **Printed as:** `eslint-lint/@typescript-eslint/no-useless-default-assignment`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-useless-default-assignment).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-useless-default-assignment","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-useless-default-assignment)

<a id="eslint-typescript-eslint-no-wrapper-object-types"></a>

### `eslint/@typescript-eslint/no-wrapper-object-types`

Disallow using confusing built-in primitive class wrappers.

- **Labels:** bug
- **Printed as:** `eslint-lint/@typescript-eslint/no-wrapper-object-types`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-wrapper-object-types).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/no-wrapper-object-types","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-wrapper-object-types)

<a id="eslint-typescript-eslint-only-throw-error"></a>

### `eslint/@typescript-eslint/only-throw-error`

Disallow throwing non-`Error` values as exceptions.

- **Labels:** bug, reliability
- **Printed as:** `eslint-lint/@typescript-eslint/only-throw-error`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/only-throw-error).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/only-throw-error","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/only-throw-error)

<a id="eslint-typescript-eslint-prefer-as-const"></a>

### `eslint/@typescript-eslint/prefer-as-const`

Enforce the use of `as const` over literal type.

- **Labels:** simplification
- **Printed as:** `eslint-lint/@typescript-eslint/prefer-as-const`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/prefer-as-const).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/prefer-as-const","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/prefer-as-const)

<a id="eslint-typescript-eslint-prefer-find"></a>

### `eslint/@typescript-eslint/prefer-find`

Enforce the use of Array.prototype.find() over Array.prototype.filter() followed by [0] when looking for a single result.

- **Labels:** simplification, performance
- **Printed as:** `eslint-lint/@typescript-eslint/prefer-find`
- **Why it is on:** Turned on by the preset on top of the ESLint and typescript-eslint rule sets.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/prefer-find).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/prefer-find","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/prefer-find)

<a id="eslint-typescript-eslint-prefer-includes"></a>

### `eslint/@typescript-eslint/prefer-includes`

Enforce `includes` method over `indexOf` method.

- **Labels:** simplification
- **Printed as:** `eslint-lint/@typescript-eslint/prefer-includes`
- **Why it is on:** Turned on by the preset on top of the ESLint and typescript-eslint rule sets.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/prefer-includes).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/prefer-includes","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/prefer-includes)

<a id="eslint-typescript-eslint-prefer-literal-enum-member"></a>

### `eslint/@typescript-eslint/prefer-literal-enum-member`

Require all enum members to be literal values.

- **Labels:** maintainability
- **Printed as:** `eslint-lint/@typescript-eslint/prefer-literal-enum-member`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/prefer-literal-enum-member).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/prefer-literal-enum-member","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/prefer-literal-enum-member)

<a id="eslint-typescript-eslint-prefer-namespace-keyword"></a>

### `eslint/@typescript-eslint/prefer-namespace-keyword`

Require using `namespace` keyword over `module` keyword to declare custom TypeScript modules.

- **Labels:** style
- **Printed as:** `eslint-lint/@typescript-eslint/prefer-namespace-keyword`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/prefer-namespace-keyword).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/prefer-namespace-keyword","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/prefer-namespace-keyword)

<a id="eslint-typescript-eslint-prefer-promise-reject-errors"></a>

### `eslint/@typescript-eslint/prefer-promise-reject-errors`

Require using Error objects as Promise rejection reasons.

- **Labels:** reliability, async
- **Printed as:** `eslint-lint/@typescript-eslint/prefer-promise-reject-errors`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/prefer-promise-reject-errors).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/prefer-promise-reject-errors","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/prefer-promise-reject-errors)

<a id="eslint-typescript-eslint-prefer-reduce-type-parameter"></a>

### `eslint/@typescript-eslint/prefer-reduce-type-parameter`

Enforce using type parameter when calling `Array#reduce` instead of using a type assertion.

- **Labels:** simplification
- **Printed as:** `eslint-lint/@typescript-eslint/prefer-reduce-type-parameter`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/prefer-reduce-type-parameter).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/prefer-reduce-type-parameter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/prefer-reduce-type-parameter)

<a id="eslint-typescript-eslint-prefer-return-this-type"></a>

### `eslint/@typescript-eslint/prefer-return-this-type`

Enforce that `this` is used when only `this` type is returned.

- **Labels:** maintainability
- **Printed as:** `eslint-lint/@typescript-eslint/prefer-return-this-type`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/prefer-return-this-type).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/prefer-return-this-type","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/prefer-return-this-type)

<a id="eslint-typescript-eslint-related-getter-setter-pairs"></a>

### `eslint/@typescript-eslint/related-getter-setter-pairs`

Enforce that `get()` types should be assignable to their equivalent `set()` type.

- **Labels:** bug
- **Printed as:** `eslint-lint/@typescript-eslint/related-getter-setter-pairs`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/related-getter-setter-pairs).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/related-getter-setter-pairs","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/related-getter-setter-pairs)

<a id="eslint-typescript-eslint-require-array-sort-compare"></a>

### `eslint/@typescript-eslint/require-array-sort-compare`

Require `Array#sort` and `Array#toSorted` calls to always provide a `compareFunction`.

- **Labels:** bug
- **Printed as:** `eslint-lint/@typescript-eslint/require-array-sort-compare`
- **Why it is on:** Turned on by the preset on top of the ESLint and typescript-eslint rule sets.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/require-array-sort-compare).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/require-array-sort-compare","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/require-array-sort-compare)

<a id="eslint-typescript-eslint-require-await"></a>

### `eslint/@typescript-eslint/require-await`

Disallow async functions which do not return promises and have no `await` expression.

- **Labels:** simplification, async
- **Printed as:** `eslint-lint/@typescript-eslint/require-await`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/require-await).
- **Fix:** With `nitpicker --fix --rule eslint/@typescript-eslint/require-await`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/require-await","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/require-await)

<a id="eslint-typescript-eslint-restrict-plus-operands"></a>

### `eslint/@typescript-eslint/restrict-plus-operands`

Require both operands of addition to be the same type and be `bigint`, `number`, or `string`.

- **Labels:** bug
- **Printed as:** `eslint-lint/@typescript-eslint/restrict-plus-operands`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/restrict-plus-operands).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/restrict-plus-operands","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/restrict-plus-operands)

<a id="eslint-typescript-eslint-restrict-template-expressions"></a>

### `eslint/@typescript-eslint/restrict-template-expressions`

Enforce template literal expressions to be of `string` type.

- **Labels:** bug
- **Printed as:** `eslint-lint/@typescript-eslint/restrict-template-expressions`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/restrict-template-expressions).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/restrict-template-expressions","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/restrict-template-expressions)

<a id="eslint-typescript-eslint-return-await"></a>

### `eslint/@typescript-eslint/return-await`

Enforce consistent awaiting of returned promises.

- **Labels:** reliability, async
- **Printed as:** `eslint-lint/@typescript-eslint/return-await`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/return-await).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/return-await","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/return-await)

<a id="eslint-typescript-eslint-switch-exhaustiveness-check"></a>

### `eslint/@typescript-eslint/switch-exhaustiveness-check`

Require switch-case statements to be exhaustive.

- **Labels:** bug
- **Printed as:** `eslint-lint/@typescript-eslint/switch-exhaustiveness-check`
- **Why it is on:** Turned on by the preset on top of the ESLint and typescript-eslint rule sets.
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/switch-exhaustiveness-check).
- **Fix:** With `nitpicker --fix --rule eslint/@typescript-eslint/switch-exhaustiveness-check`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/switch-exhaustiveness-check","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/switch-exhaustiveness-check)

<a id="eslint-typescript-eslint-triple-slash-reference"></a>

### `eslint/@typescript-eslint/triple-slash-reference`

Disallow certain triple slash directives in favor of ES6-style import declarations.

- **Labels:** style
- **Printed as:** `eslint-lint/@typescript-eslint/triple-slash-reference`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/triple-slash-reference).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/triple-slash-reference","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/triple-slash-reference)

<a id="eslint-typescript-eslint-unbound-method"></a>

### `eslint/@typescript-eslint/unbound-method`

Enforce unbound methods are called with their expected scope.

- **Labels:** bug
- **Printed as:** `eslint-lint/@typescript-eslint/unbound-method`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/unbound-method).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/unbound-method","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/unbound-method)

<a id="eslint-typescript-eslint-unified-signatures"></a>

### `eslint/@typescript-eslint/unified-signatures`

Disallow two overloads that could be unified into one with a union or an optional/rest parameter.

- **Labels:** simplification
- **Printed as:** `eslint-lint/@typescript-eslint/unified-signatures`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/unified-signatures).
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/unified-signatures","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/unified-signatures)

<a id="eslint-typescript-eslint-use-unknown-in-catch-callback-variable"></a>

### `eslint/@typescript-eslint/use-unknown-in-catch-callback-variable`

Enforce typing arguments in Promise rejection callbacks as `unknown`.

- **Labels:** maintainability, async
- **Printed as:** `eslint-lint/@typescript-eslint/use-unknown-in-catch-callback-variable`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/use-unknown-in-catch-callback-variable).
- **Fix:** With `nitpicker --fix --rule eslint/@typescript-eslint/use-unknown-in-catch-callback-variable`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"@typescript-eslint/use-unknown-in-catch-callback-variable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/use-unknown-in-catch-callback-variable)

<a id="eslint-array-callback-return"></a>

### `eslint/array-callback-return`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/array-callback-return`
- **Why it is on:** Turned on by the preset on top of the ESLint and typescript-eslint rule sets.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"array-callback-return","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-constructor-super"></a>

### `eslint/constructor-super`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/constructor-super`
- **Presets:** JavaScript
- **Scope:** The JavaScript preset only.
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"constructor-super","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-curly"></a>

### `eslint/curly`

Reported by the rule.

- **Labels:** style
- **Printed as:** `eslint-lint/curly`
- **Why it is on:** Turned on by the preset on top of the ESLint and typescript-eslint rule sets.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"curly","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-eqeqeq"></a>

### `eslint/eqeqeq`

Reported by the rule.

- **Labels:** bug, style
- **Printed as:** `eslint-lint/eqeqeq`
- **Why it is on:** Turned on by the preset on top of the ESLint and typescript-eslint rule sets.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"eqeqeq","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-for-direction"></a>

### `eslint/for-direction`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/for-direction`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"for-direction","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-getter-return"></a>

### `eslint/getter-return`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/getter-return`
- **Presets:** JavaScript
- **Scope:** The JavaScript preset only.
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"getter-return","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-async-promise-executor"></a>

### `eslint/no-async-promise-executor`

Reported by the rule.

- **Labels:** bug, async
- **Printed as:** `eslint-lint/no-async-promise-executor`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-async-promise-executor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-case-declarations"></a>

### `eslint/no-case-declarations`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-case-declarations`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"no-case-declarations","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-class-assign"></a>

### `eslint/no-class-assign`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-class-assign`
- **Presets:** JavaScript
- **Scope:** The JavaScript preset only.
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-class-assign","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-compare-neg-zero"></a>

### `eslint/no-compare-neg-zero`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-compare-neg-zero`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"no-compare-neg-zero","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-cond-assign"></a>

### `eslint/no-cond-assign`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-cond-assign`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-cond-assign","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-const-assign"></a>

### `eslint/no-const-assign`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-const-assign`
- **Presets:** JavaScript
- **Scope:** The JavaScript preset only.
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-const-assign","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-constant-binary-expression"></a>

### `eslint/no-constant-binary-expression`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-constant-binary-expression`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-constant-binary-expression","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-constant-condition"></a>

### `eslint/no-constant-condition`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-constant-condition`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-constant-condition","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-constructor-return"></a>

### `eslint/no-constructor-return`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-constructor-return`
- **Why it is on:** Turned on by the preset on top of the ESLint and typescript-eslint rule sets.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-constructor-return","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-control-regex"></a>

### `eslint/no-control-regex`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-control-regex`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-control-regex","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-debugger"></a>

### `eslint/no-debugger`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-debugger`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-debugger","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-delete-var"></a>

### `eslint/no-delete-var`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-delete-var`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-delete-var","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-dupe-args"></a>

### `eslint/no-dupe-args`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-dupe-args`
- **Presets:** JavaScript
- **Scope:** The JavaScript preset only.
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-dupe-args","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-dupe-class-members"></a>

### `eslint/no-dupe-class-members`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-dupe-class-members`
- **Presets:** JavaScript
- **Scope:** The JavaScript preset only.
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-dupe-class-members","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-dupe-else-if"></a>

### `eslint/no-dupe-else-if`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-dupe-else-if`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-dupe-else-if","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-dupe-keys"></a>

### `eslint/no-dupe-keys`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-dupe-keys`
- **Presets:** JavaScript
- **Scope:** The JavaScript preset only.
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-dupe-keys","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-duplicate-case"></a>

### `eslint/no-duplicate-case`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-duplicate-case`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-duplicate-case","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-duplicate-imports"></a>

### `eslint/no-duplicate-imports`

Reported by the rule.

- **Labels:** simplification
- **Printed as:** `eslint-lint/no-duplicate-imports`
- **Why it is on:** Turned on by the preset on top of the ESLint and typescript-eslint rule sets.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-duplicate-imports","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-empty"></a>

### `eslint/no-empty`

Reported by the rule.

- **Labels:** simplification
- **Printed as:** `eslint-lint/no-empty`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-empty","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-empty-character-class"></a>

### `eslint/no-empty-character-class`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-empty-character-class`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-empty-character-class","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-empty-pattern"></a>

### `eslint/no-empty-pattern`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-empty-pattern`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-empty-pattern","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-empty-static-block"></a>

### `eslint/no-empty-static-block`

Reported by the rule.

- **Labels:** simplification
- **Printed as:** `eslint-lint/no-empty-static-block`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-empty-static-block","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-eval"></a>

### `eslint/no-eval`

Reported by the rule.

- **Labels:** security
- **Printed as:** `eslint-lint/no-eval`
- **Why it is on:** Turned on by the preset on top of the ESLint and typescript-eslint rule sets.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-eval","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-ex-assign"></a>

### `eslint/no-ex-assign`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-ex-assign`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-ex-assign","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-extra-boolean-cast"></a>

### `eslint/no-extra-boolean-cast`

Reported by the rule.

- **Labels:** simplification
- **Printed as:** `eslint-lint/no-extra-boolean-cast`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-extra-boolean-cast","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-fallthrough"></a>

### `eslint/no-fallthrough`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-fallthrough`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-fallthrough","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-func-assign"></a>

### `eslint/no-func-assign`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-func-assign`
- **Presets:** JavaScript
- **Scope:** The JavaScript preset only.
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-func-assign","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-global-assign"></a>

### `eslint/no-global-assign`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-global-assign`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-global-assign","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-import-assign"></a>

### `eslint/no-import-assign`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-import-assign`
- **Presets:** JavaScript
- **Scope:** The JavaScript preset only.
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-import-assign","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-invalid-regexp"></a>

### `eslint/no-invalid-regexp`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-invalid-regexp`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-invalid-regexp","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-irregular-whitespace"></a>

### `eslint/no-irregular-whitespace`

Reported by the rule.

- **Labels:** style
- **Printed as:** `eslint-lint/no-irregular-whitespace`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-irregular-whitespace","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-loss-of-precision"></a>

### `eslint/no-loss-of-precision`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-loss-of-precision`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-loss-of-precision","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-misleading-character-class"></a>

### `eslint/no-misleading-character-class`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-misleading-character-class`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-misleading-character-class","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-new-native-nonconstructor"></a>

### `eslint/no-new-native-nonconstructor`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-new-native-nonconstructor`
- **Presets:** JavaScript
- **Scope:** The JavaScript preset only.
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-new-native-nonconstructor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-nonoctal-decimal-escape"></a>

### `eslint/no-nonoctal-decimal-escape`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-nonoctal-decimal-escape`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-nonoctal-decimal-escape","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-obj-calls"></a>

### `eslint/no-obj-calls`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-obj-calls`
- **Presets:** JavaScript
- **Scope:** The JavaScript preset only.
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-obj-calls","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-octal"></a>

### `eslint/no-octal`

Reported by the rule.

- **Labels:** style
- **Printed as:** `eslint-lint/no-octal`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-octal","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-param-reassign"></a>

### `eslint/no-param-reassign`

Reported by the rule.

- **Labels:** maintainability
- **Printed as:** `eslint-lint/no-param-reassign`
- **Why it is on:** Turned on by the preset on top of the ESLint and typescript-eslint rule sets.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-param-reassign","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-prototype-builtins"></a>

### `eslint/no-prototype-builtins`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-prototype-builtins`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"no-prototype-builtins","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-redeclare"></a>

### `eslint/no-redeclare`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-redeclare`
- **Presets:** JavaScript
- **Scope:** The JavaScript preset only.
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-redeclare","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-regex-spaces"></a>

### `eslint/no-regex-spaces`

Reported by the rule.

- **Labels:** style
- **Printed as:** `eslint-lint/no-regex-spaces`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-regex-spaces","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-restricted-globals"></a>

### `eslint/no-restricted-globals`

Reported by the rule.

- **Labels:** style
- **Printed as:** `eslint-lint/no-restricted-globals`
- **Why it is on:** The presets list the forms they ban in the options of this rule. Each form has a message that names the allowed form.
- **Exception:** If this is intended, add `{"rule":"no-restricted-globals","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - `process`, `fetch`, `setTimeout`, `setInterval`, `setImmediate`, `queueMicrotask`, `performance`, `XMLHttpRequest`, `WebSocket`, `localStorage`, `sessionStorage`: domain/ code does no I/O and does not touch the process or timers: do it in adapters/ and pass the result in as a parameter. An exception fits only when it is deliberate.

<a id="eslint-no-restricted-properties"></a>

### `eslint/no-restricted-properties`

Reported by the rule.

- **Labels:** style
- **Printed as:** `eslint-lint/no-restricted-properties`
- **Why it is on:** The presets list the forms they ban in the options of this rule. Each form has a message that names the allowed form.
- **Exception:** If this is intended, add `{"rule":"no-restricted-properties","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - `Math.random`: Math.random() is predictable, so it must not make ids or tokens: use crypto.randomUUID() or crypto.randomInt(), or take the random value as a parameter. An exception fits only for a simulation or UI jitter.
  - `Date.now`, `Math.random`, `performance.now`: domain/ code does not read the clock or randomness: take the time, ID or random value as a parameter from adapters/. An exception fits only when it is deliberate.

<a id="eslint-no-restricted-syntax"></a>

### `eslint/no-restricted-syntax`

Reported by the rule.

- **Labels:** style
- **Printed as:** `eslint-lint/no-restricted-syntax`
- **Why it is on:** The presets list the forms they ban in the options of this rule. Each form has a message that names the allowed form.
- **Exception:** If this is intended, add `{"rule":"no-restricted-syntax","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Do not assert with `as`. Narrow the value (a discriminated union check or a zod parse) or give it the correct type at its source. `as const` is allowed.
  - Do not assert with `<Type>value`. Narrow the value (a discriminated union check or a zod parse) or give it the correct type at its source.
  - Use `unknown` and parse it into a specific type at the boundary with zod, or write the specific type.
  - Do not use the non-null assertion `!`. Check for `undefined` and return early, or make the type non-optional at its source.
  - Do not declare an `enum`. Use a union of string literals: `type Mode = 'read' | 'write'`.
  - Do not declare a `namespace`. Put the declarations in their own module and use named exports.
  - Classes are only for `Error` subclasses (`class NameError extends Error`). Use a `type` for data and `function` declarations for behavior; construct dependencies in the composition root.
  - Declare named functions with the `function` keyword (`function name() {}`). Arrow functions are only for inline callbacks.
  - Declare named functions with the `function` keyword (`function name() {}`), not a function expression assigned to a variable.
  - Return early instead of using `else` after `return`: remove the `else` and put the remaining code after the `if` block.
  - Return early instead of using `else` after `return`: remove the `else` and put the remaining code after the `if` statement.
  - Do not nest ternaries. Use early returns, a lookup object keyed by the value, or one `const` per branch.
  - Use a `type` instead of an `interface`: `type Shape = { size: number }`. Only a `declare module` or `declare global` augmentation, or a global declaration file without imports or exports, may declare an `interface`.
  - List the public names: `export { name } from './module.js'`. `export *` makes every internal export public. An exception fits only when it is deliberate.
  - for...of is the only loop; iterate the items with for...of.
  - Use a for...of loop instead of forEach.
  - Promise.allSettled with its result dropped hides every rejection. Read the results and handle the rejected ones, or use Promise.all to fail on the first rejection.
  - Do not wrap a value in `new Promise`. Return it from an async function, or use `Promise.resolve(value)`; `new Promise` is for callback APIs.
  - domain/ code has no loops: transform with map, filter, flatMap, reduce with an initial value, Object.fromEntries or Object.groupBy.
  - domain/ code does not use forEach: transform with map, filter, flatMap, reduce with an initial value, Object.fromEntries or Object.groupBy.
  - domain/ code does not use reduce without an initial value: pass one, e.g. xs.reduce((sum, x) => sum + x, 0).
  - domain/ code does not use reduceRight: fold with xs.reduce((sum, x) => sum + x, 0) (pass an initial value) or transform with map, filter, flatMap, reduce with an initial value, Object.fromEntries or Object.groupBy.
  - domain/ code does not mutate arrays: build a new array with map, filter, flatMap or spread (toSorted, toReversed and toSpliced instead of sort, reverse and splice).
  - domain/ code does not assign to properties: return a new object with spread, e.g. { ...value, field }.
  - domain/ code does not mutate properties: return a new object with spread, e.g. { ...value, count: value.count + 1 }.
  - domain/ code does not read the clock or randomness: take the time, ID or random value as a parameter from adapters/. An exception fits only when it is deliberate.
  - domain/ code does no I/O and does not touch the process or timers: do it in adapters/ and pass the result in as a parameter. An exception fits only when it is deliberate.
  - domain/ code imports dayjs and moment under their own names (`import dayjs from 'dayjs'`), so a clock read such as `dayjs()` stays visible. domain/ code does not read the clock or randomness: take the time, ID or random value as a parameter from adapters/. An exception fits only when it is deliberate.
  - domain/ code does not mutate objects: return a new object with spread, e.g. { ...value, field } (Object.assign is fine only onto a fresh object literal).
  - domain/ code does not change values through Reflect or Atomics: return a new value with spread, e.g. { ...value, field }.
  - domain/ code does not use delete: build a new object without the key using Object.fromEntries and filter.
  - domain/ types are readonly: write readonly T[] (or a readonly tuple) instead of a mutable array type.
  - domain/ types are readonly: write ReadonlyArray\<T>, ReadonlyMap\<K, V> or ReadonlySet\<T> instead of Array, Map or Set.
  - domain/ data types are readonly: mark the property readonly.
  - Throw an Error subclass that preserves cause (new DomainError(message, { cause })), not a bare Error or a non-error value.
  - for...of is the only loop; iterate the items with for...of, or give each case its own test with it.each.
  - A literal passed to `expect` can never fail. Pass the value the code under test returns.
  - A literal passed to `expect.soft` can never fail. Pass the value the code under test returns.
  - A test must not look at the mutation harness (`__stryker__`, `STRYKER_*`, `activeMutant`): a test that behaves differently under mutation hides every mutant. Test the behaviour only.
  - Read a global by its name (`globalThis.name`) so the test shows which global it depends on.

<a id="eslint-no-self-assign"></a>

### `eslint/no-self-assign`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-self-assign`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-self-assign","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-setter-return"></a>

### `eslint/no-setter-return`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-setter-return`
- **Presets:** JavaScript
- **Scope:** The JavaScript preset only.
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-setter-return","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-shadow-restricted-names"></a>

### `eslint/no-shadow-restricted-names`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-shadow-restricted-names`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-shadow-restricted-names","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-sparse-arrays"></a>

### `eslint/no-sparse-arrays`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-sparse-arrays`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-sparse-arrays","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-template-curly-in-string"></a>

### `eslint/no-template-curly-in-string`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-template-curly-in-string`
- **Why it is on:** Turned on by the preset on top of the ESLint and typescript-eslint rule sets.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-template-curly-in-string","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-this-before-super"></a>

### `eslint/no-this-before-super`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-this-before-super`
- **Presets:** JavaScript
- **Scope:** The JavaScript preset only.
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-this-before-super","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-unassigned-vars"></a>

### `eslint/no-unassigned-vars`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-unassigned-vars`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-unassigned-vars","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-undef"></a>

### `eslint/no-undef`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-undef`
- **Presets:** JavaScript
- **Scope:** The JavaScript preset only.
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-undef","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-unexpected-multiline"></a>

### `eslint/no-unexpected-multiline`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-unexpected-multiline`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-unexpected-multiline","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-unmodified-loop-condition"></a>

### `eslint/no-unmodified-loop-condition`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-unmodified-loop-condition`
- **Why it is on:** Turned on by the preset on top of the ESLint and typescript-eslint rule sets.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-unmodified-loop-condition","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-unreachable"></a>

### `eslint/no-unreachable`

Reported by the rule.

- **Labels:** simplification
- **Printed as:** `eslint-lint/no-unreachable`
- **Presets:** JavaScript
- **Scope:** The JavaScript preset only.
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-unreachable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-unreachable-loop"></a>

### `eslint/no-unreachable-loop`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-unreachable-loop`
- **Why it is on:** Turned on by the preset on top of the ESLint and typescript-eslint rule sets.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-unreachable-loop","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-unsafe-finally"></a>

### `eslint/no-unsafe-finally`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-unsafe-finally`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-unsafe-finally","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-unsafe-negation"></a>

### `eslint/no-unsafe-negation`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-unsafe-negation`
- **Presets:** JavaScript
- **Scope:** The JavaScript preset only.
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-unsafe-negation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-unsafe-optional-chaining"></a>

### `eslint/no-unsafe-optional-chaining`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-unsafe-optional-chaining`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-unsafe-optional-chaining","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-unused-labels"></a>

### `eslint/no-unused-labels`

Reported by the rule.

- **Labels:** simplification
- **Printed as:** `eslint-lint/no-unused-labels`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-unused-labels","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-unused-private-class-members"></a>

### `eslint/no-unused-private-class-members`

Reported by the rule.

- **Labels:** simplification
- **Printed as:** `eslint-lint/no-unused-private-class-members`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Fix:** With `nitpicker --fix --rule eslint/no-unused-private-class-members`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"no-unused-private-class-members","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-useless-assignment"></a>

### `eslint/no-useless-assignment`

Reported by the rule.

- **Labels:** simplification
- **Printed as:** `eslint-lint/no-useless-assignment`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-useless-assignment","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-useless-backreference"></a>

### `eslint/no-useless-backreference`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/no-useless-backreference`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-useless-backreference","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-useless-call"></a>

### `eslint/no-useless-call`

Reported by the rule.

- **Labels:** simplification
- **Printed as:** `eslint-lint/no-useless-call`
- **Why it is on:** Turned on by the preset on top of the ESLint and typescript-eslint rule sets.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-useless-call","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-useless-catch"></a>

### `eslint/no-useless-catch`

Reported by the rule.

- **Labels:** simplification, reliability
- **Printed as:** `eslint-lint/no-useless-catch`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-useless-catch","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-useless-concat"></a>

### `eslint/no-useless-concat`

Reported by the rule.

- **Labels:** simplification
- **Printed as:** `eslint-lint/no-useless-concat`
- **Why it is on:** Turned on by the preset on top of the ESLint and typescript-eslint rule sets.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-useless-concat","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-useless-escape"></a>

### `eslint/no-useless-escape`

Reported by the rule.

- **Labels:** simplification
- **Printed as:** `eslint-lint/no-useless-escape`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-useless-escape","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-useless-return"></a>

### `eslint/no-useless-return`

Reported by the rule.

- **Labels:** simplification
- **Printed as:** `eslint-lint/no-useless-return`
- **Why it is on:** Turned on by the preset on top of the ESLint and typescript-eslint rule sets.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-useless-return","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-var"></a>

### `eslint/no-var`

Reported by the rule.

- **Labels:** style, bug
- **Printed as:** `eslint-lint/no-var`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-var","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-no-with"></a>

### `eslint/no-with`

Reported by the rule.

- **Labels:** bug, maintainability
- **Printed as:** `eslint-lint/no-with`
- **Presets:** JavaScript
- **Scope:** The JavaScript preset only.
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"no-with","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-prefer-const"></a>

### `eslint/prefer-const`

Reported by the rule.

- **Labels:** style
- **Printed as:** `eslint-lint/prefer-const`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"prefer-const","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-prefer-rest-params"></a>

### `eslint/prefer-rest-params`

Reported by the rule.

- **Labels:** style
- **Printed as:** `eslint-lint/prefer-rest-params`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"prefer-rest-params","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-prefer-spread"></a>

### `eslint/prefer-spread`

Reported by the rule.

- **Labels:** style
- **Printed as:** `eslint-lint/prefer-spread`
- **Why it is on:** Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"prefer-spread","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-preserve-caught-error"></a>

### `eslint/preserve-caught-error`

Reported by the rule.

- **Labels:** reliability
- **Printed as:** `eslint-lint/preserve-caught-error`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Fix:** With `nitpicker --fix --rule eslint/preserve-caught-error`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"preserve-caught-error","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-require-yield"></a>

### `eslint/require-yield`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/require-yield`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"require-yield","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-use-isnan"></a>

### `eslint/use-isnan`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/use-isnan`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Fix:** With `nitpicker --fix --rule eslint/use-isnan`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"use-isnan","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="eslint-valid-typeof"></a>

### `eslint/valid-typeof`

Reported by the rule.

- **Labels:** bug
- **Printed as:** `eslint-lint/valid-typeof`
- **Why it is on:** Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.
- **Allowed form:** See the guide: [Strict preset guide](../typescript-strict-preset.md).
- **Exception:** If this is intended, add `{"rule":"valid-typeof","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
