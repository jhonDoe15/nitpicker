# nitpicker

**A quality gate for code written by coding agents.**

Flexible languages offer many ways to write the same thing, and coding agents use all of them.
They also repeat the same mistakes: swallowed errors, casts instead of checks, tests that cannot
fail, giant functions, tangled imports. nitpicker narrows TypeScript, JavaScript, Python, Java and
Kotlin to roughly one allowed way of doing each thing, and checks every change against it. The
quickest way for an agent to get a green build becomes the right way.

An agent adds this function to a TypeScript project, with a test that only checks the result is
an array:

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

```console
$ npx nitpicker
✖ 4 new enforceable violations
  eslint-errors/nitpicker/no-silent-catch src/main/features/greeting/adapters/load-names.ts:8
    This catch discards the failure. Return a failure result (`return { kind: 'malformed-json' }`), or rethrow an Error subclass with `{ cause: error }`. If dropping it is intended, add an exception for this rule in nitpicker.config.json.
  eslint-lint/nitpicker/no-handwritten-boundary-guard src/main/features/greeting/adapters/load-names.ts:6
    Pass `JSON.parse(text)` straight into `schema.safeParse(...)` inside the same `try`.
  eslint-lint/no-restricted-syntax src/main/features/greeting/adapters/load-names.ts:6
    Do not assert with `as`. Narrow the value (a discriminated union check or a zod parse) or give it the correct type at its source. `as const` is allowed.
  mutation/mutant-survived src/main/features/greeting/adapters/load-names.ts:9
    Survived ArrayDeclaration at column 12: replacing `[]` with `["Stryker was here"]` fails no test. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.
```

## What it does

- **One allowed form for each construct.** Rules are on by default, including the ones other
  linters leave off as noisy, because those are the patterns agents produce most. Every message
  names the form to use instead.
- **Only new problems fail.** nitpicker checks your branch and its merge base, and fails only on
  what the change adds. Existing problems are recorded and left alone, so you can add it to an
  existing codebase today.
- **More than lint.** It also checks that changed branches are tested, that tests can fail
  (mutation testing), function size, module boundaries, dead code, duplication and slow
  test patterns.
- **Teaches first, gates second.** A bundled agent skill teaches the allowed forms before the
  agent writes code. The gate in CI is the backstop.
- **Exceptions are explicit.** When a rule flags legitimate code, its message says how to add an
  exception to `nitpicker.config.json`, with the paths and a reason. Review sees it, and every
  report lists it.
- **One command.** The analyzers ship pinned and preconfigured inside the package.

## Languages

| Language                                                  | Preset                 | Your project provides                             |
| --------------------------------------------------------- | ---------------------- | ------------------------------------------------- |
| [TypeScript](docs/typescript-strict-preset.md), and React | `typescript` (default) | Vitest and TypeScript                             |
| [JavaScript](docs/usage.md#javascript-preset)             | `javascript`           | Vitest and TypeScript                             |
| [Python](docs/python-preset.md)                           | `python`               | A Python environment (uv, poetry or a virtualenv) |
| [Java](docs/java-preset.md)                               | `java`                 | Gradle and Java 21                                |
| [Kotlin](docs/kotlin-preset.md)                           | `kotlin`               | Gradle and Java 21                                |

## Getting started

For TypeScript:

```sh
npm install --save-dev nitpicker vitest @vitest/coverage-v8 typescript @types/node
npx nitpicker
```

For another language, install `nitpicker` and name the preset in `nitpicker.config.json`, for
example `{ "preset": "python" }`. nitpicker needs Node.js 22.14 or newer and a Git repository.
In CI, fetch enough history to contain the merge base (for example `fetch-depth: 0`).

Then teach your agent. For TypeScript, Python and Kotlin, copy the bundled skill into your agent's
skills folder (for Claude Code, `.claude/skills/`):

```sh
mkdir -p .claude/skills && cp -r node_modules/nitpicker/skills/nitpicker .claude/skills/
```

For other agents, add the [agent snippet](docs/agents-snippet.md) to your `AGENTS.md`.

## Disagree with a rule?

If a rule flags code that is right, add an exception for those paths with a reason. If it flags
right code often, [open an issue](https://github.com/jhonDoe15/nitpicker/issues): the fix is a
narrower rule, not a rule that is off. [Mindset](docs/mindset.md) explains how rules are chosen.

## Documentation

- [Mindset](docs/mindset.md): what nitpicker enforces and why.
- [Usage](docs/usage.md): the command line, reports, exit codes, configuration, exceptions and CI.
- [Checks](spec/checks.md): every check and rule, and what fails.
- Language guides: [TypeScript](docs/typescript-strict-preset.md),
  [JavaScript](docs/usage.md#javascript-preset), [Python](docs/python-preset.md),
  [Java](docs/java-preset.md), [Kotlin](docs/kotlin-preset.md).

## Status

nitpicker is pre-1.0. Rules and messages can change between versions; pin the version you use.

## Acknowledgements

The approach follows Lauren Tan's public talks on the conventions her team uses with coding agents
(Dune): one allowed form for each construct, repeated review feedback turned into lint rules, and
boundaries enforced mechanically. nitpicker uses those talks as a reference, not a spec, and
contains no code from them.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
