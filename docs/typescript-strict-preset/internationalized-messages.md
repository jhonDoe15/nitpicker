# Internationalized messages

Part of the [TypeScript strict preset guide](../typescript-strict-preset.md).

The i18n scope turns on when `react-intl` or `@formatjs/intl` is in `dependencies` or
`devDependencies` of the head checkout (a peer dependency alone does not count, as with React), or
when `nitpicker.config.json` sets `"i18n": { "enabled": true }`; `"enabled": false` turns it off
whatever `package.json` says. The decision is made once, from the head checkout, and both sides of
the comparison use it, so a pull request that adds the library does not turn every existing literal
into a new finding; the React scope is decided the same way. It is independent of the React scope.
It covers production source under the source roots, not test files or story files
(`*.stories.*`, `*.story.*`, which hold literal arguments on purpose), and runs
`eslint-plugin-formatjs`. Its dependency tree is permissive: MIT throughout, Apache-2.0 for
TypeScript, and `jsonify` (through `json-stable-stringify`), which is public domain.

Projects that wrap the library name the wrappers: `i18n.functionNames` (functions called like
`formatMessage`) and `i18n.componentNames` (components used like `FormattedMessage`) are passed to
the plugin as `additionalFunctionNames` and `additionalComponentNames`, so their messages are
checked too. `formatMessage`, `$t`, `defineMessage(s)` and `FormattedMessage` are always checked.

Each rule names the allowed form in its message and says to add an exception for the rule in
`nitpicker.config.json` where it can flag legitimate code. An exception that names an i18n rule is
skipped while the scope is off; one that names an i18n rule nitpicker does not run (such as
`formatjs/enforce-id`) is a config error. The rules never autofix, because the message text and the
description are for a person to write. Both lint engines report the same findings: a message that
cannot be parsed is reported once, by `formatjs/no-invalid-icu` (the other rules that parse
messages stay silent about it, and it honours a per-call `ignoreTag: true`), and a rule reports at
most once per node.

On, because each blocks a message that is wrong at runtime or breaks in translation, and the
allowed form is clear:

- **A literal default message** (`formatjs/enforce-default-message`, `literal`). The text is a
  non-empty string literal. It is the fallback shown when a translation is missing and the source
  the extraction workflow collects; a message with only an `id` shows its raw key and cannot be
  extracted. A variable or a template with substitutions is flagged, and a message built elsewhere
  on purpose needs an exception for the rule.
- **A translator description** (`formatjs/enforce-description`, `literal`). Every message says, as
  a non-empty string literal, where it appears and what it does, as in
  `description: 'Button that saves the profile form'`: an ambiguous label such as "Save" or "Book"
  cannot be translated without it.
- **No untranslated text in JSX** (`formatjs/no-literal-string-in-jsx`). Literal text children are
  flagged on any element, and so are attributes: `aria-label`, `aria-description`, `aria-details`
  and `aria-errormessage` on every tag, `placeholder` and `title` on lowercase intrinsic tags
  (`<input>`, not `<Field>`), and `alt` on `<img>`. Text with no letter in it (a space written
  `{' '}`, `-`, `/`, a number, `&nbsp;` and other symbol entities) is not flagged. It is the
  largest adoption step, since an existing screen is full of literals, but the gate fails only the
  literals a change adds (an existing one stays baselined), so a codebase moves screen by screen.
  Text that is not translated (a brand name, code) needs an exception for the rule, or the scope
  off for a project that is not translated yet.
- **Placeholders match their values** (`formatjs/enforce-placeholders`). A placeholder without a
  value throws when the message is formatted; a value the message never uses is dead. Values that
  are not an object literal (`values={extra}`, `formatMessage(d, extra)`) are trusted.
- **Valid ICU syntax** (`formatjs/no-invalid-icu`): unbalanced braces, a `plural` or `select`
  without `other`.
- **`#` in plurals** (`formatjs/prefer-pound-in-plural`,
  `formatjs/no-missing-icu-plural-one-placeholders`). `one {# item}`, not `one {{n} item}` (the
  argument is not formatted for the locale) or `one {1 item}` (some languages use `one` for other
  numbers).
- **Messages translators can handle**: no `offset:` (`formatjs/no-offset`), one plural per message
  (`formatjs/no-multiple-plurals`), at most 20 sentences once nested selectors are flattened
  (`formatjs/no-complex-selectors`), no consecutive spaces (`formatjs/no-multiple-whitespaces`).
- **Whole sentences** (`formatjs/prefer-full-sentence`). No leading or trailing whitespace, which
  means a sentence assembled from pieces, and no placeholder glued to a word or unit (`{n}MB`; use
  `{n, number, ::unit/megabyte}`). A message in Chinese, Japanese, Korean, Thai, Lao, Khmer or
  Burmese may join a placeholder to a word, since those scripts have no spaces.
- **No message that only formats a value** (`formatjs/no-useless-message`): `{n, number}` alone is
  `FormattedNumber`, `{d, date}` is `FormattedDate`.

Off, with the reason:

- `formatjs/enforce-id` and `formatjs/no-id`: opposite answers to one project choice (generated ids
  with a configured interpolation pattern, or hand-written ids), and `enforce-id` cannot run without
  the project's own pattern. Both are equally valid, so neither is on.
- `formatjs/enforce-plural-rules`: which categories a message must list depends on the language
  of the source text (`one` is wrong for a Japanese source). The parser already requires `other`.
- `formatjs/blocklist-elements`: it does nothing without a list of elements to block, and that
  list (`selectordinal`, `select` on gender) is a project policy.
- `formatjs/no-camel-case`: the placeholder naming style (`userName` or `user_name`) is a convention.
- `formatjs/no-emoji`: whether a product's messages carry emoji is a design decision.
- `formatjs/prefer-formatted-message`: `intl.formatMessage` in JSX children and `<FormattedMessage>`
  are both valid.
- `formatjs/no-literal-string-in-object`: it flags any `label` property in any object (a chart
  option, a fixture), which is a guess about names, not a pattern that is wrong.
- `formatjs/enforce-message-types`: without its type generation option it repeats
  `enforce-placeholders`, so every missing value would be reported twice.
