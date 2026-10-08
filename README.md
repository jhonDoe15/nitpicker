# nitpicker

A differential quality gate. It analyzes the merge base and `HEAD`, fingerprints every finding, and
fails only on new enforceable findings. Unchanged debt stays baselined, and findings follow renamed
files.

## Layout

Each top-level folder is one language. Inside it:

- `core/`: the engine (base/head comparison, fingerprinting, scheduling, reports).
- `adapters/`: runners that turn each tool's output into normalized findings.
- `preset/`: the opinionated default checks, custom analyzers, ESLint rules, and starter configs.

Only `typescript/` exists today.

## Status

The TypeScript engine and preset are available through the single `nitpicker` command. `--all` reports every finding; `--fix` applies safe checkout fixes before comparison. Run the policy tests:

```sh
cd typescript
npm ci
npm test
```

Not yet done: a shared language-neutral `spec/` (findings schema and conformance fixtures).
