# TypeScript single command

Status: decided, in progress. This is phase 1: a TypeScript service adds one dev dependency and
runs `npx nitpicker`.

## One command

- `nitpicker` replaces `nitpicker changes` and `nitpicker working-tree`. It compares the merge base
  with the current checkout: committed, staged, unstaged, and untracked changes. Ignored files are
  excluded. In CI the checkout is clean, so the same command checks the committed `HEAD`.
- `nitpicker --all` replaces `nitpicker snapshot`: it reports every finding, without a baseline.
- `nitpicker --fix` replaces `--fix-safe`. It applies ESLint and Prettier fixes to the changed files
  in the checkout, using the gate's own configs and the old safety rules, then runs the
  comparison. A fixer that fails is reported as a tool error; the other fixer and the comparison
  still run. `--fix` cannot be combined with `--all`.
- Both modes use the diff engine and its full analyzer set. Every finding keeps the
  enforceable/descriptive/tool-error classification and its fingerprint. The old CLIs are removed.

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

The file is `nitpicker.config.json` at the project root, read from the head checkout and applied to
both sides. Keys are `base`, `preset` (only `typescript`), `disable` (analyzer names),
`thresholds` (`crapLimit` replaces the old `QUALITY_CRAP_SCORE_LIMIT` variable), `exclude`,
`layout`, `analyzers`, and `legacyInventory`. Unknown keys are an error. `exclude` and `layout` are
applied everywhere (see below); `analyzers` are run as custom analyzers (see below).

### Head policy delivery

Decision (proposed, pending owner review): the resolved head policy reaches every runner by one
JSON file and one environment variable.

- The CLI reduces the validated config to `{ exclude, layout, thresholds }` and, once per run,
  writes it to a file in a fresh temporary directory outside both worktrees. Base and head runs
  get the same file, so the base tree cannot choose its own policy. The directory is removed when
  the run ends.
- The path travels in `NITPICKER_POLICY`, set on the environment of the analyzer scheduler.
  The scheduler, every runner, and every grandchild (ESLint, depcruise, vitest, Stryker, the
  package-owned configs in `preset/defaults/`) already spawn with `{ ...process.env }`, so the
  variable reaches all of them without per-runner plumbing.
- One reader, `readHeadPolicy()` in `preset/head-policy.mjs`, is the only code that parses the
  file. It returns `{ exclude, layout, thresholds }`, with `layout` merged over the defaults
  exported by `preset/layout.mjs`. With no variable (a runner started by hand, or no config) the
  defaults apply. A variable that points at an unreadable or malformed file throws; it never
  falls back to a weaker policy.
- Delivering the policy and applying it are separate: the next section covers how runners and
  tools honor `exclude` and `layout`.

Alternatives considered:

- Filter findings after the run: ruled out, because excluded files would still be analyzed and
  could still fail or shape cross-file results.
- One environment variable per key (`NITPICKER_EXCLUDE`, ...): lists and nested layout need
  encoding anyway, and each new key would touch every spawn site.
- A CLI argument on each runner: runners spawn grandchildren and package-owned configs that
  take no arguments, so this needs plumbing at every level.
- Link a policy file into each worktree, as `linkPolicyFile` does for project-owned files:
  writes into the analyzed tree, needs a link per snapshot, and the child configs would still
  need to find it. The tree's own files are also what the policy must not be read from.
- Let each runner read `nitpicker.config.json` from the head worktree: the base run would need
  the head path, and each runner would repeat validation.
- Inline JSON in the variable: risks the environment size limit with long glob lists.

### Exclude and layout in every runner and tool

Decision (proposed, pending owner review):

- `layout` accepts `sourceRoots` and `testRoots`: non-empty arrays of project-relative directories
  (no absolute paths, `..` or globs). Other keys are an error. The defaults stay `["src"]` and
  `["test", "tests"]`. `exclude` is a list of globs relative to the project root (`**`, `*`, `?`,
  `{a,b}`) that is added to the built-in exclusions (`dist`, `build`, `generated`, `node_modules`,
  `coverage`, `reports`, `target`, `*.d.ts`).
- `preset/layout.mjs` exposes `resolveLayout(layout, exclude)`, which derives every glob, regular
  expression and predicate (`isSourceFile`, `isTestFile`, `isExcluded`, `projectCodeFiles`, ...)
  from the roots and exclusions. `readLayout()` in `preset/head-policy.mjs` resolves the delivered
  head policy. Runners, package-owned child configs, and ESLint rules call it; the exported
  constants in `layout.mjs` are the default layout.
- The CLI rebuilds the preset's analyzers for the policy (`applyLayout`), so `--pattern`s,
  source roots and the reported exclusions follow the config. Custom and injected analyzers are
  left alone.
- Tools that read a project-root JSON config (`tsconfig.quality.json`, `tsconfig.stryker.json`,
  `knip.json`, `jscpd.json`) get a generated copy with the roots moved and the exclusions added
  (`preset/tool-configs.mjs`); with the default layout the shipped file is linked as before. The
  vitest configs copied for coverage and mutation read `NITPICKER_POLICY` themselves.
- dependency-cruiser gets the exclusions as part of its `--exclude` and `doNotFollow` patterns, so
  excluded files are absent from the graph. TypeScript, ESLint and Prettier skip them in their
  file selection, and diagnostics for excluded files that other files import are dropped.
- Analyzers that work on one source root (coupling, structure, entry points) run once per root.
  With several roots the identities of their findings are prefixed with the root; with one root
  they are unchanged.
- `--fix` applies the same policy: excluded files are not fixed and the roots are used.
- The CRAP tool only expands directories named `src`, so for other roots the files inside are
  passed explicitly.

### Custom analyzers

Each `analyzers` entry is `{ "name", "command", "args"? }`. The command runs on both the base and
the head checkout, with that checkout as its working directory (so `"command": "./scripts/check"`
resolves inside each side) and `NITPICKER_ANALYZER`, `NITPICKER_PROJECT_ROOT` and
`NITPICKER_SNAPSHOT` set. It prints `{"findings": [...]}` on stdout and exits 0. Findings use the
built-in finding schema and must carry `tool` equal to the entry's `name`; they are fingerprinted and
classified exactly like built-in findings. A non-zero exit, invalid JSON, or a schema violation is a
tool error. Names must not clash with built-in analyzers. The command and args are part of the
policy hash.

## Adopting nitpicker on existing code

The `coding-standards` analyzer fails on every violation of its rules unless an inventory lists it.
To adopt nitpicker without fixing everything first:

1. Run `npx nitpicker --all` at the project root to list the violations present now.
2. Record the `coding-standards` sites in `nitpicker.legacy.json` at the project root, as
   `{ "sites": [{ "file", "rule", "source", "count" }] }`, and commit it. To use another location,
   set `"legacyInventory": "path/inside/the/project.json"` in `nitpicker.config.json`. The path must
   stay inside the project.
3. Only sites listed there (up to their `count`) are allowed; a new or extra occurrence is a new
   finding. When a site is fixed, remove it from the inventory so it cannot return. Do not add new
   code to the inventory.

The file is read from the head commit and applied to both sides, and its content is part of the
policy hash. The old nitpicker-internal path `preset/coding-standards/legacy-sites.json` is no
longer read.

## Packaging

Status: implemented. The consumer installs one npm dev dependency and runs `npx nitpicker`.

- The preset comes from the installed nitpicker package. Only project-owned files, such as the
  config file and the coding-standards legacy inventory, come from the analyzed commits. They are
  read from the head commit and applied to both sides of the comparison, so base and head are
  measured with one policy.
- Tools nitpicker owns are exact-pinned dependencies, loaded from its own package, and must match
  the pinned versions. Neither the base nor the head tree can choose them.
- `vitest`, `@vitest/coverage-v8`, and `typescript` are required peer dependencies from the
  consumer. The head can change them; the report records the version that ran, which makes such a
  change visible but does not prevent it.
- nitpicker behaves like any other dependency. It does not check the consumer's setup up front:
  if a peer or the consumer's install is missing or incompatible, the affected tool fails the way
  it would when run directly, and the report shows that as a tool error. A committed
  `node_modules/` is used like any project's, and tools that cache under `node_modules` write to
  the consumer's install. Single-package npm projects are the tested setup.
- The `policy-tests` analyzer, which runs nitpicker's own test suite, is not in the default set.
- Default file globs cover common layouts (`src/`, `test/`, `tests/`) instead of only `src/main`
  and `tests`. The config file can change them.
- Runners keep the `--tool-root` argument, pinned to nitpicker's package folder.

Not yet addressed: ESLint plugin versions are not part of the policy hash.

## Later: findings cache

Key it by merge-base SHA, project path, analyzer name, tool version, and the configuration hash
taken from the head policy. Start with a local cache. Later options are a remote cache, or base
snapshots published after each merge to `main`.
