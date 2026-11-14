# nitpicker

**A quality gate that holds coding agents to one allowed way of writing each thing.**

[Usage](docs/usage.md) · [Mindset](docs/mindset.md) · [Checks](spec/checks.md) · [Rule reference](https://github.com/jhonDoe15/nitpicker/blob/latest/docs/rules/README.md)

Flexible languages offer many ways to write the same thing, and coding agents use all of them.
Agents also repeat the same mistakes: swallowed errors, casts instead of checks, tests that cannot
fail, giant functions, tangled imports. nitpicker narrows TypeScript, JavaScript, Python, Java,
Kotlin and Go to roughly one allowed way of doing each thing and checks every change against it, so the
quickest way to a green build is the right way. Only what a change adds can fail, so it works on
an existing codebase.

An agent adds `src/main/features/greeting/adapters/load-names.ts` to a TypeScript project, with a
test whose only assertion is `expect(names.length >= 0).toBe(true)`:

```ts
import { readFile } from 'node:fs/promises';

export async function loadNames(path: string): Promise<string[]> {
  try {
    const text = await readFile(path, 'utf8');
    const data = JSON.parse(text) as { names: string[] };
    return data.names;
  } catch {
    return [];
  }
}
```

nitpicker fails the change and says what to write instead:

<!-- example:typescript-failing -->

```console
$ npx nitpicker
Quality gate summary
✖ 4 new enforceable violations
  by area: lint 3 · mutation 1
  eslint-lint/nitpicker/no-handwritten-boundary-guard: Pass `JSON.parse(text)` straight into `schema.safeParse(...)` inside the same `try`. An exception fits only when the text is trusted and already typed.
    src/main/features/greeting/adapters/load-names.ts:6:18
    If this is intended, add {"rule":"nitpicker/no-handwritten-boundary-guard","paths":["src/main/features/greeting/adapters/load-names.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.
  eslint-lint/no-restricted-syntax: Do not assert with `as`. Narrow the value (a discriminated union check or a zod parse) or give it the correct type at its source. `as const` is allowed.
    src/main/features/greeting/adapters/load-names.ts:6:18
    If this is intended, add {"rule":"no-restricted-syntax","paths":["src/main/features/greeting/adapters/load-names.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.
  eslint-errors/nitpicker/no-silent-catch: This catch discards the failure. Return a failure result (`return { kind: 'malformed-json' }`), or rethrow an Error subclass with `{ cause: error }`. An exception fits only when dropping it is intended.
    src/main/features/greeting/adapters/load-names.ts:8:5
    If this is intended, add {"rule":"nitpicker/no-silent-catch","paths":["src/main/features/greeting/adapters/load-names.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.
  mutation/mutant-survived: Survived ArrayDeclaration at column 12: replacing `[]` with `["Stryker was here"]` fails no test. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.
    src/main/features/greeting/adapters/load-names.ts:9
    If this is intended, add {"rule":"mutant-survived","paths":["src/main/features/greeting/adapters/load-names.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.
Full diagnostics: reports/quality/diff/combined/report.txt
```

The messages name zod, the default validation library; in a project that depends on another one
(valibot, yup, joi and others) they name that library instead.

## Why nitpicker

- **Strict by default.** Rules that other linters leave off as noisy are on, because those are the
  patterns agents produce most. Every finding says what to do instead.
- **Only new problems fail.** nitpicker compares your branch with its merge base and counts what
  the change adds, so you can adopt it without fixing existing code first. See
  [Adopting nitpicker on existing code](docs/usage.md#adopting-nitpicker-on-existing-code).
- **Beyond lint.** Depending on the language, it also checks that changed code is covered by
  tests, that tests can fail (mutation testing), function size, duplication, module boundaries,
  dead code, slow tests, unused or unlisted dependencies, committed secrets and slow test patterns.
- **Teaches first, gates second.** An agent skill for each preset teaches the allowed forms before
  the agent writes code. The gate in CI is the backstop.

## Getting started

nitpicker needs Node.js 22.14 or newer (22.19 or newer on TypeScript 7) and a Git repository.
[Compatibility](docs/compatibility.md) lists the operating systems, runtimes (Deno too), build tools
and test runners CI tests, with their versions. In your project's folder, run `npx nitpicker init`.
It detects the language, build tool, test runner and package manager, writes
`nitpicker.config.json`, and prints the install command for the peers you are missing and the skill
to add. `--agents-md` also appends the [agent snippet](docs/agents-snippet.md) to `AGENTS.md`, and
`--ci github` writes a GitHub Actions workflow. Setting a TypeScript project up by hand:

```sh
npm install --save-dev nitpicker typescript @types/node
npx nitpicker
```

[Worked examples](docs/examples.md) shows the common runs and what they print, for TypeScript and
for Java on Gradle and Maven.

Tests run with the runner your project already uses: Vitest, Jest, `node:test` or Mocha. A Vitest
project also needs `@vitest/coverage-v8` at its Vitest version.

The TypeScript preset assumes a feature-folder [layout](docs/typescript-strict-preset/layout-and-boundaries.md).
For another language, `init` puts the preset in `nitpicker.config.json`, for example
`{ "preset": "python" }`; then run `npx nitpicker`. Each guide lists what your project provides. A `$schema` line in that file gives your editor completion and inline errors; see [Editor support](docs/usage.md#editor-support).

| Language                                                              | Preset                 | Agent skill            |
| --------------------------------------------------------------------- | ---------------------- | ---------------------- |
| [TypeScript](docs/typescript-strict-preset.md), React, and react-intl | `typescript` (default) | `nitpicker-typescript` |
| [JavaScript](docs/usage.md#javascript-preset)                         | `javascript`           | `nitpicker-javascript` |
| [Python](docs/python-preset.md)                                       | `python`               | `nitpicker-python`     |
| [Java](docs/java-preset.md)                                           | `java`                 | `nitpicker-java`       |
| [Kotlin](docs/kotlin-preset.md)                                       | `kotlin`               | `nitpicker-kotlin`     |
| [Go](docs/go-preset.md)                                               | `go`                   | `nitpicker-go`         |

Then teach your agent the allowed forms. Install the skill for your preset with
[skills](https://skills.sh), which works with Claude Code, Cursor, Codex and other agents. Install
it from the nitpicker you installed, so the skill matches the rules your gate runs:

```sh
npx skills add ./node_modules/nitpicker --skill nitpicker-typescript
```

Without a `node_modules` install (a Python, Java, Kotlin or Go project run through `npx`), install
it from the release tag of your version, for example
`npx skills add jhonDoe15/nitpicker#v0.1.0 --skill nitpicker-python`. `npx nitpicker init` prints
the right one. `npx skills add jhonDoe15/nitpicker --skill nitpicker-typescript` installs the skill
from the default branch, which can describe rules your version does not run yet. `skills` asks which
agents to install for and whether to install into this project (commit the result to share it) or
for your user; `-a claude-code` and `-g` answer those up front. A Kotlin project with Java
sources adds `nitpicker-java` too. For an agent without skills, add the
[agent snippet](docs/agents-snippet.md) to your `AGENTS.md`.

In CI, run `npx nitpicker` as a step and fetch enough history to contain the merge base (for
example `fetch-depth: 0`). It exits non-zero when a change adds a problem. On GitHub Actions the
`jhonDoe15/nitpicker` action does the setup, the cache, the job summary and the annotations;
[nitpicker in CI](docs/ci.md) has that and the GitLab CI and Jenkins recipes. `npx nitpicker init --ci
github` writes a workflow that uses that action.

> nitpicker is pre-1.0. Rules and messages can change between versions, so pin the version you
> use.

## Disagree with a rule?

If a rule flags code that is right, its message ends with the entry to add to
`exceptions` in `nitpicker.config.json`: the rule, the paths and a reason a reviewer fills in. Review sees it, and every report lists
it. If a rule flags right code often, [open an issue](https://github.com/jhonDoe15/nitpicker/issues):
the fix is a narrower rule, not a rule that is off. [Mindset](docs/mindset.md) explains how rules
are chosen, and the [rule reference](https://github.com/jhonDoe15/nitpicker/blob/latest/docs/rules/README.md) lists every rule with its allowed form, or
with a link to the tool's own page for the rule where the reference has no allowed form of its own.

## Documentation

- [Mindset](docs/mindset.md): what nitpicker enforces and why.
- [Worked examples](docs/examples.md): the common runs, with the command and what it prints.
- [Usage](docs/usage.md): the command line, reports, exit codes, configuration, caching and
  sharding in CI.
- [nitpicker in CI](docs/ci.md): GitHub Actions (the action and plain steps), GitLab CI, Jenkins,
  the toolchain each preset needs.
- [Checks](spec/checks.md): every check and rule, and what fails.
- [Troubleshooting](docs/troubleshooting.md): the cause and fix for a run that exits 2, a tool that
  cannot start, a base that cannot be analyzed, and the other failures that are not findings.
- [Changelog](CHANGELOG.md): what changed in each release, and what to do when upgrading.
- [Compatibility](docs/compatibility.md): the tested operating systems, runtimes, build tools and
  test runners per preset, and the limits on Windows, Deno and Bun.
- [Rule reference](https://github.com/jhonDoe15/nitpicker/blob/latest/docs/rules/README.md): one entry for every rule any preset can report, with the
  allowed form (or the tool's own page for the rule) and the exception to add.
  `nitpicker explain <tool/rule>` prints one in the terminal.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)

## Acknowledgements

The approach follows Lauren Tan's public talks on the conventions her team uses with coding
agents. nitpicker uses them as a reference, not a spec, and contains no code from them.
