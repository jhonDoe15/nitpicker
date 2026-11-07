# TypeScript strict preset

Status: implemented (ticket S13). Strict is the only TypeScript preset; there is no lax rule set.
The "Decisions" section below records the owner-review decisions that S13 follows.

The preset allows one way to write each construct, and enforces it mechanically. Every banned form
fails with a message naming the allowed form. Strict is the TypeScript preset's only mode: it
replaces the current rules rather than sitting beside them as a separate preset. An exception exists
only in the nitpicker config file, where it changes the policy hash and appears in the report.
Existing code that violates a rule is baselined by the differential gate. New and touched code must
comply.

Every rule the preset can report has an entry in the [rule reference](https://github.com/jhonDoe15/nitpicker/blob/latest/docs/rules/README.md): [nitpicker's ESLint rules](https://github.com/jhonDoe15/nitpicker/blob/latest/docs/rules/typescript-nitpicker.md), [ESLint core and typescript-eslint](https://github.com/jhonDoe15/nitpicker/blob/latest/docs/rules/typescript-eslint.md), [the plugin rules](https://github.com/jhonDoe15/nitpicker/blob/latest/docs/rules/typescript-plugins.md) and [the static checks](https://github.com/jhonDoe15/nitpicker/blob/latest/docs/rules/typescript-static.md), with the allowed form and the `exceptions` entry of each. `nitpicker explain <tool/rule>` prints an entry.

CI recipes for this preset (Node.js, the project's install, GitHub Actions, GitLab CI, Jenkins) are in
[nitpicker in CI](ci.md#toolchains-by-preset).

The rules are modeled on publicly described "one paved road" conventions, such as Lauren Tan's talks
on her Dune conventions: one allowed form per construct, repeated review feedback turned into lint
rules, mechanically enforced boundaries, and exceptions handled as reviewed changes. No code is
reused; those conventions aren't published as code.

The preset fixes the layout below, so the boundary rules can be generic. A `layout` override in the
config file is an exception like any other.

With `"$schema": "./node_modules/nitpicker/spec/config.schema.json"` as the first line of
`nitpicker.config.json`, the editor completes the `layout`, `exceptions`, `react`, `i18n`, `tools` and
`conventions` keys and flags a mistake before the run does; see
[Editor support](usage.md#editor-support).

## Contents

Each topic has its own page, so two changes to different topics never edit the same file.

- [Layout and boundaries](typescript-strict-preset/layout-and-boundaries.md)
- [Inside `domain/`](typescript-strict-preset/inside-domain.md)
- [Inside `adapters/`](typescript-strict-preset/inside-adapters.md)
- [Everywhere](typescript-strict-preset/everywhere.md)
- [Reuse after a move](typescript-strict-preset/reuse-after-a-move.md)
- [Inside tests](typescript-strict-preset/inside-tests.md)
- [Slow tests](typescript-strict-preset/slow-tests.md)
- [React](typescript-strict-preset/react.md)
- [Internationalized messages](typescript-strict-preset/internationalized-messages.md)
- [Server code](typescript-strict-preset/server-code.md)
- [No prop, option or export without a caller](typescript-strict-preset/no-prop-option-or-export-without-a-caller.md)
- [How it is enforced](typescript-strict-preset/how-it-is-enforced.md)
- [Enforcement sources](typescript-strict-preset/enforcement-sources.md)
- [Open points](typescript-strict-preset/open-points.md)
- [Decisions](typescript-strict-preset/decisions.md)
