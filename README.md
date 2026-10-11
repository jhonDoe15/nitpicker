# nitpicker

A quality gate for code written by coding agents and the people working with them. It fails a
change only for the problems that change introduces.

Flexible languages offer many ways to write the same thing. Coding agents use all of them, and
they keep making the same mistakes: swallowed errors, untested branches, giant functions, slow
tests, tangled imports. nitpicker narrows TypeScript (and Java) to roughly one allowed way of
doing each thing. It checks every change in CI, so the quickest way to get a green build is
also the right way.

```console
$ npx nitpicker
New enforceable findings: 2

  eslint-errors/nitpicker/no-silent-catch src/main/features/billing/adapters/invoice-client.ts:42
    Reference, propagate, or log the caught value before continuing.
  structure/function-statements-limit src/main/features/billing/domain/totals.ts:8
    computeTotals has 21 statements; limit is 15
```

## Why nitpicker

- **Only new problems fail.** nitpicker compares your branch with its merge base. Problems that
  were already there are recorded and left alone, so you can add it to an existing codebase today.
- **One command, no setup.** It ships with pinned ESLint, Prettier, dependency-cruiser, knip, jscpd,
  Stryker and CRAP tooling, all preconfigured. Your project only provides Vitest and TypeScript.
- **Beyond lint.** It also checks changed-branch coverage, mutation testing, function size, module
  coupling, dead code, duplication and slow test patterns.
- **Every rule explains its fix.** Each message names the allowed form. A rule that can flag
  legitimate code says how to add a reviewed exception, and every exception shows up in the report.

## Getting started

```sh
npm install --save-dev nitpicker vitest @vitest/coverage-v8 typescript
npx nitpicker
```

This needs Node.js 22.14 or newer and a Git repository. In CI, fetch enough history to contain
the merge base (for example `fetch-depth: 0`). Exit code `0` means no new problems, `1` means new
findings, and `2` means a tool error or invalid config.

Using a coding agent? Add the [agent snippet](docs/agents-snippet.md) to your `AGENTS.md`.

## Documentation

- [Usage](docs/usage.md): the command line, reports, configuration, exceptions, caching and
  sharding in CI.
- [TypeScript strict preset](docs/typescript-strict-preset.md): the rules, the project layout
  they assume, and why.
- [Java preset](docs/java-preset.md)
- [Checks](spec/checks.md): every check and rule, and what fails.

## Background

The approach follows Lauren Tan's public talks on the conventions her team uses with coding
agents (Dune). Each construct has one allowed form, repeated review feedback becomes a lint
rule, and boundaries are enforced mechanically. nitpicker uses those talks as a reference, not as
a spec, and contains no code from them.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
