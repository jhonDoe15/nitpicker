# TypeScript single command

Status: decided, in progress. This is phase 1: a TypeScript service adds one dev dependency and
runs `npx nitpicker`.

## One command

- `nitpicker` replaces `nitpicker changes` and `nitpicker working-tree`. It compares the merge base
  with the current checkout: committed, staged, unstaged, and untracked changes. Ignored files are
  excluded. In CI the checkout is clean, so the same command checks the committed `HEAD`.
- `nitpicker --all` replaces `nitpicker snapshot`: it reports every finding, without a baseline.
- `nitpicker --fix` replaces `--fix-safe`. It applies safe fixes to the checkout first, then runs
  the comparison.
- Both modes use the diff engine and its full analyzer set. Every finding keeps the
  enforceable/descriptive/tool-error classification and its fingerprint. The separate working-tree
  checkers retire once `--fix` no longer needs them.

## The head side

The head side is a commit that captures the checkout. nitpicker copies the index to a temporary
file, runs `git add -A` against the copy, and writes a tree and a commit whose parent is `HEAD`.
The user's index, branches, and files are untouched. The diff engine then compares the merge base
with that commit, exactly as it compares with `HEAD` in CI.

This keeps the head side immutable while analyzers run, and rename detection covers uncommitted and
untracked files. When the checkout is clean, the captured tree equals `HEAD`'s tree and nitpicker
uses `HEAD` itself.

## Base resolution

The first match wins:

1. An explicit `--base`.
2. The pull request's target branch from CI: `CHANGE_TARGET`, `GITHUB_BASE_REF`, or
   `CI_MERGE_REQUEST_TARGET_BRANCH_NAME`.
3. A `base:` value in the config file.
4. `git symbolic-ref refs/remotes/<remote>/HEAD`, using the remote `upstream` if it exists and
   `origin` otherwise.
5. `origin/main`, then `origin/master`, whichever exists.

Never use `@{upstream}`: on a feature branch it resolves to the same branch.

## Config file

Optional; zero config must work. Overrides are limited to:

- `preset`
- disabling an analyzer
- thresholds such as `crapLimit`
- `exclude` globs
- custom `analyzers` entries, each an executable that prints findings JSON

Every override appears in the report and changes the policy hash, so a weakened check is visible in
review.

## Packaging

The consumer installs one npm dev dependency and runs `npx nitpicker`. Two things change once
nitpicker lives under a consumer's `node_modules`:

- Tool versions are read from `package-lock.json` today, which npm never publishes.
- Runners trust a tool root equal to nitpicker's own folder and expect tools in
  `<toolRoot>/node_modules`. A consumer install usually hoists them to the consumer's
  `node_modules`.

Decided:

- The preset comes from the installed nitpicker package. Only project-owned files, such as the
  config file, are read from the base and head commits.
- The `policy-tests` analyzer, which runs nitpicker's own test suite, is not in the installed
  default set.
- Default file globs cover common layouts (`src/`, `test/`, `tests/`) instead of only `src/main`
  and `tests`. The config file can change them.
- `vitest`, `@vitest/coverage-v8`, and `typescript` are required peer dependencies resolved from
  the consumer. The report records the versions that ran. The other tools are exact-pinned
  dependencies resolved from nitpicker's own package.
- nitpicker behaves like any other dependency. It does not check the consumer's setup up front:
  if a peer or the consumer's install is missing or incompatible, the affected tool fails the way
  it would when run directly, and the report shows that as a tool error. Single-package npm
  projects are the tested setup.
- Runners keep the `--tool-root` argument, pinned to nitpicker's package folder.
- Project-owned policy files, such as the coding-standards legacy inventory, are read from the head
  commit and applied to both sides of the comparison, so base and head are measured with one policy.
- Tools nitpicker owns come from its own package and must match its pinned versions. Neither the
  base nor the head tree can choose them. Peer tools come from the consumer's install, so the head
  can change them; the report records the version that ran, which makes such a change visible but
  does not prevent it.

Known risks, not yet addressed:

- A snapshot that commits a real `node_modules/` directory and changes `package.json` skips
  `npm ci`, so vitest can load the coverage provider or `vitest/config` from the committed files.
- The snapshot's `node_modules` links to the consumer's live install, so tools that cache under
  `node_modules` write into the consumer's checkout.
- ESLint plugin versions are not part of the policy hash yet.
- Project-owned policy files, such as the coding-standards legacy inventory, are read from the head
  commit and applied to both sides of the comparison, so base and head are measured with one policy.
- Tools nitpicker owns come from its own package and must match its pinned versions. Neither the
  base nor the head tree can choose them. Peer tools come from the consumer's install, so the head
  can change them; the report records the version that ran, which makes such a change visible but
  does not prevent it.

Known risks, not yet addressed:

- A snapshot that commits a real `node_modules/` directory and changes `package.json` skips
  `npm ci`, so vitest can load the coverage provider or `vitest/config` from the committed files.
- The snapshot's `node_modules` links to the consumer's live install, so tools that cache under
  `node_modules` write into the consumer's checkout.
- ESLint plugin versions are not part of the policy hash yet.

## Later: findings cache

Key it by merge-base SHA, project path, analyzer name, tool version, and the configuration hash
taken from the head policy. Start with a local cache. Later options are a remote cache, or base
snapshots published after each merge to `main`.
