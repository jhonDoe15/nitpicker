# Nitpicker checks

The checks nitpicker runs itself in every preset: function and file size, CRAP, coverage, mutation, duplicates, coupling, dead code, test runtime, repository hygiene and the policy checks on nitpicker.config.json. This page lists 52 rules. [All pages](README.md).

The guide for these rules: [spec/checks.md](../../spec/checks.md).

<a id="change-history-co-change"></a>

### `change-history/co-change`

Two folders of production code that changed together in most of the commits of the less-changed one, which the history check reads when `history.coChange` is on.

- **Presets:** TypeScript, JavaScript, Java, Kotlin and Python
- **Analyzers:** `change-history`
- **Scope:** Report-only: it never fails the gate.
- **Why it is on:** Folders that keep changing together usually share knowledge that has no single owner, so every change has to touch both.
- **Allowed form:** This is correlation, not proof of coupling: if they share knowledge (a format, a constant, a schema) give it one owner, and if they only ever change as one unit, merge them.
- **Threshold:** two folders of production code that changed together in at least 5 of the last 300 commits and in at least 60% of the commits of the less-changed one (only edits of production code count, and commits of more than 30 files are ignored); opt-in with `history.coChange`, never fails
- **Exception:** If this is intended, add `{"rule":"co-change","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="coding-standards-baseline-expansion"></a>

### `coding-standards/baseline-expansion`

A change raises an allowance in the legacy baseline (`nitpicker.legacy.json`).

- **Printed as:** `coding-standards/baseline-expansion`, `java/baseline-expansion`, `kotlin/baseline-expansion` and `python/baseline-expansion`
- **Presets:** TypeScript, JavaScript, Java, Kotlin and Python
- **Analyzers:** `coding-standards` (TypeScript and JavaScript); `java` (Java); `kotlin` (Kotlin); `python` (Python)
- **Why it is on:** The baseline records old problems so that they can shrink; raising it would hide new ones.
- **Allowed form:** Fix the new sites instead of baselining them.
- **Exception:** It has no exception: fix the sites instead of raising the allowance of the legacy inventory.

<a id="coding-standards-callback-protocol-rule"></a>

### `coding-standards/callback-protocol/<rule>`

A callback breaks its protocol: `source-loader-does-not-merge-published-state`, `publication-owner-does-not-commit-external-state` or `correlated-callback-declares-correlation-input`.

- **Printed as:** `coding-standards/callback-protocol/<rule>`
- **For example:** `coding-standards/callback-protocol/source-loader-does-not-merge-published-state`
- **Presets:** TypeScript and JavaScript
- **Analyzers:** `coding-standards`
- **Why it is on:** Callbacks that belong together keep one owner for the state they publish and declare the input that correlates them. No contract is declared by default, so the rules report only where a callback contract is configured.
- **Allowed form:** Commit published state in its owner, read only bounded metadata or independent upstream snapshots in a loader, and declare the correlation input in the options.
- **Exception:** If this is intended, add `{"rule":"callback-protocol/<rule>","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="coding-standards-doc-comment-content"></a>

### `coding-standards/doc-comment-content`

A doc comment that only restates its declaration name, or whose description is longer than the limit.

- **Presets:** TypeScript, JavaScript, Java and Kotlin
- **Analyzers:** `coding-standards` (TypeScript and JavaScript); `java` (Java); `kotlin` (Kotlin)
- **Why it is on:** A comment that repeats the name adds noise; a long one belongs in names and types.
- **Threshold:** a doc comment or docstring that only restates its declaration name (a tag or section with text, such as `@param id the account` or `Args:`, says more), or a description longer than 5 lines, tags, sections and code examples not counted (TypeScript and JavaScript report it as `nitpicker/no-comments`)
- **Exception:** If this is intended, add `{"rule":"doc-comment-content","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. With the TypeScript and JavaScript presets: If this is intended, add `{"rule":"nitpicker/no-comments","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - `restatingDocComment`: Delete it, or say what the name cannot: a unit, a limit, an edge case or why.
  - `longDocComment`: Keep the non-obvious point, a unit, a limit or an edge case, and put the rest in names and types.

<a id="coding-standards-public-contract-production-use"></a>

### `coding-standards/public-contract-production-use`

A method of an exported interface that a production class implements, which no production code outside the implementations uses.

- **Presets:** TypeScript and JavaScript
- **Analyzers:** `coding-standards`
- **Why it is on:** A contract method that production code never calls is dead surface that every implementation has to carry.
- **Allowed form:** Remove the method from the interface, or call it from production code.
- **Exception:** If this is intended, add `{"rule":"public-contract-production-use","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="coding-standards-runtime-boundary-rule"></a>

### `coding-standards/runtime-boundary/<rule>`

A module breaks the runtime boundary of its role: `forbidden-runtime-dependency`, `forbidden-runtime-call` or `unresolved-runtime-dependency`.

- **Printed as:** `coding-standards/runtime-boundary/<rule>`
- **For example:** `coding-standards/runtime-boundary/forbidden-runtime-call`
- **Presets:** TypeScript and JavaScript
- **Analyzers:** `coding-standards`
- **Why it is on:** Module roles keep the runtime dependencies and side effects of each layer in one direction. No role is declared by default, so the rules report only where a role is configured.
- **Allowed form:** Depend on the allowed module, move the call to a module whose role may make it, and write the specifier of a dynamic import as a string literal.
- **Exception:** If this is intended, add `{"rule":"runtime-boundary/<rule>","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="coupling-shared-used-by-one-feature"></a>

### `coupling/shared-used-by-one-feature`

A module under a shared root that exactly one feature reaches and nothing else uses.

- **Presets:** TypeScript and JavaScript
- **Analyzers:** `coupling`
- **Why it is on:** `shared` is for code several features use; code with one user belongs with it.
- **Allowed form:** Move it into \<directory>.
- **Exception:** If this is intended, add `{"rule":"shared-used-by-one-feature","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="coupling-stability-direction"></a>

### `coupling/stability-direction`

A package that depends on a less stable package.

- **Presets:** TypeScript, JavaScript, Java, Kotlin and Python
- **Analyzers:** `coupling` (TypeScript and JavaScript); `java` (Java); `kotlin` (Kotlin); `python` (Python)
- **Why it is on:** Stable code that depends on volatile code breaks whenever the volatile code changes (the Stable Dependencies Principle).
- **Allowed form:** Depend on an abstraction in a more stable package, or move the dependency inward. An import that exists only for the type checker is never the reported dependency.
- **Exception:** If this is intended, add `{"rule":"stability-direction","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. With the Python preset: If this is intended, add `{"rule":"stability-direction","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="coverage-changed-branch-coverage"></a>

### `coverage/changed-branch-coverage`

A branch the change added or touched with coverage below the minimum.

- **Printed as:** `coverage/changed-branch-coverage`, `jacoco/changed-branch-coverage` and `coverage-py/changed-branch-coverage`
- **Presets:** TypeScript, JavaScript, Java, Kotlin and Python
- **Analyzers:** `coverage` (TypeScript and JavaScript); `java` (Java); `kotlin` (Kotlin); `python` (Python)
- **Why it is on:** Only changed code is held to coverage, so a change cannot add code that no test exercises.
- **Allowed form:** Cover the branch with a test. When a branch cannot be reached from a test, accept it with an exception that names its function; it applies to that function only.
- **Threshold:** a changed branch with coverage below 95%
- **Exception:** If this is intended, add `{"rule":"changed-branch-coverage","paths":["<path>"],"function":"<function>","reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="crap-crap-coverage-unknown"></a>

### `crap/crap-coverage-unknown`

A function with unknown coverage and so no CRAP score, because no test runs it.

- **Presets:** TypeScript, JavaScript, Java, Kotlin and Python
- **Analyzers:** `crap` (TypeScript and JavaScript); `java` (Java); `kotlin` (Kotlin); `python` (Python)
- **Why it is on:** A function no test runs cannot be scored, and is the riskiest kind.
- **Exception:** If this is intended, add `{"rule":"crap-coverage-unknown","paths":["<path>"],"function":"<function>","reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - `crapCoverageUnknown`: Add a test that calls it; for inline composition-root wiring, move it to a named function in adapters/ and test that.
  - `crapCoverageUnknownJava`: Add a test that calls it, and remove @Generated from hand-written code.

<a id="crap-crap-score-limit"></a>

### `crap/crap-score-limit`

A function whose CRAP score (its complexity combined with how little of it the tests cover) is at or above the limit.

- **Presets:** TypeScript, JavaScript, Java, Kotlin and Python
- **Analyzers:** `crap` (TypeScript and JavaScript); `java` (Java); `kotlin` (Kotlin); `python` (Python)
- **Why it is on:** Complex code that tests do not cover is the code most likely to break unnoticed.
- **Threshold:** CRAP score at or above 9; override with `QUALITY_CRAP_SCORE_LIMIT` (positive number) or `thresholds.crapLimit`
- **Exception:** If this is intended, add `{"rule":"crap-score-limit","paths":["<path>"],"function":"<function>","reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - `crapScoreLimit`: Test its uncovered branches, or split a branchy part into its own function.
  - `crapScoreLimitCovered`: Reduce its branches: split a branchy part into its own function.

<a id="dead-code-exports"></a>

### `dead-code/exports`

Unused export.

- **Presets:** TypeScript and JavaScript
- **Analyzers:** `dead-code`
- **Why it is on:** An export that nothing imports is dead surface; every reader has to understand it.
- **Allowed form:** Remove `export`, or the declaration if nothing uses it.
- **Exception:** If this is intended, add `{"rule":"exports","paths":["<path>"],"name":"<name>","reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="dead-code-files"></a>

### `dead-code/files`

Unused file.

- **Presets:** TypeScript and JavaScript
- **Analyzers:** `dead-code`
- **Why it is on:** Nothing imports the file, and no entry point, test or configuration reaches it.
- **Allowed form:** Delete the file, or import it where it is needed.
- **Exception:** If this is intended, add `{"rule":"files","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="dead-code-test-only-export"></a>

### `dead-code/test-only-export`

An export, module or main class that only tests use (a re-export is not an import).

- **Printed as:** `dead-code/test-only-export` and `coupling/test-only-export`
- **Presets:** TypeScript, JavaScript, Java and Kotlin
- **Analyzers:** `dead-code` (TypeScript and JavaScript); `java` (Java); `kotlin` (Kotlin)
- **Why it is on:** Code that only tests call is not part of the product, and its tests prove nothing about it.
- **Exception:** If this is intended, add `{"rule":"test-only-export","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - `testOnlyExport`: Remove `export`, or import it from production code.
  - `testOnlyReexport`: Remove the re-export and `export`, or import it from production code. If a host or tool loads \<reexporter> instead of importing it, list it in "layout.entryPoints".
  - `testOnlyModule`: Move it to a test-support/ folder, or import it from production code.
  - `testOnlyDeclaration`: Make it private to its module, or use it from production code.
  - `testOnlyFile`: Move it beside the tests as a test helper, or use it from production code.

<a id="dead-code-types"></a>

### `dead-code/types`

Unused exported type.

- **Presets:** TypeScript and JavaScript
- **Analyzers:** `dead-code`
- **Why it is on:** An exported type that nothing imports is dead surface; every reader has to understand it.
- **Allowed form:** Remove `export`, or the type if nothing uses it.
- **Exception:** If this is intended, add `{"rule":"types","paths":["<path>"],"name":"<name>","reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="dead-code-unlisted-dependency"></a>

### `dead-code/unlisted-dependency`

An import of a package that `package.json` does not list.

- **Presets:** TypeScript, JavaScript and Python
- **Analyzers:** `dead-code` (TypeScript and JavaScript); `python` (Python)
- **Why it is on:** An unlisted package works only by accident of what else is installed.
- **Allowed form:** Add the package to the right dependencies of `package.json`.
- **Exception:** If this is intended, add `{"rule":"unlisted-dependency","paths":["<path>"],"packages":["<package>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. With the Python preset: If this is intended, add `{"rule":"unlisted-dependency","paths":["<path>"],"packages":["<package>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="dead-code-unresolved-import"></a>

### `dead-code/unresolved-import`

An import that resolves to no file and no package.

- **Presets:** TypeScript, JavaScript and Python
- **Analyzers:** `dead-code` (TypeScript and JavaScript); `python` (Python)
- **Why it is on:** It fails when the code runs.
- **Allowed form:** Fix the path, or install the package and list it in `package.json`.
- **Exception:** If this is intended, add `{"rule":"unresolved-import","paths":["<path>"],"packages":["<package>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. With the Python preset: If this is intended, add `{"rule":"unresolved-import","paths":["<path>"],"packages":["<package>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="dead-code-unused-dependency"></a>

### `dead-code/unused-dependency`

A dependency in `package.json` that nothing imports or runs.

- **Presets:** TypeScript, JavaScript and Python
- **Analyzers:** `dead-code` (TypeScript and JavaScript); `python` (Python)
- **Why it is on:** Unused dependencies add install time and attack surface.
- **Allowed form:** Remove it from `package.json`.
- **Exception:** If this is intended, add `{"rule":"unused-dependency","paths":["<path>"],"packages":["<package>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. With the Python preset: If this is intended, add `{"rule":"unused-dependency","paths":["<path>"],"packages":["<package>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="duplicates-duplicate-clone"></a>

### `duplicates/duplicate-clone`

A new block of code that repeats another block, also when only the names and literals differ.

- **Presets:** TypeScript, JavaScript, Java, Kotlin and Python
- **Analyzers:** `duplicates` (TypeScript and JavaScript); `java` (Java); `kotlin` (Kotlin); `python` (Python)
- **Why it is on:** Copies drift apart and each fix has to be made twice.
- **Allowed form:** Extract the shared code into one function or module and call it from both places. When the copies are meant to be copies, the message names the files to add to `exclude`.
- **Threshold:** jscpd in `mild` mode, also over sources with names and literals normalized (at least 100 tokens, except code that only repeats one or two statements); any new clone fails
- **Exception:** If this is intended, add `{"rule":"duplicate-clone","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. With the Python preset: If this is intended, add `{"rule":"duplicate-clone","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="entry-points-public-alternative-bypass"></a>

### `entry-points/public-alternative-bypass`

An import that goes around the public entry point of a package.

- **Presets:** TypeScript and JavaScript
- **Analyzers:** `entry-points`
- **Why it is on:** Importing internals defeats the entry point that keeps a package replaceable.
- **Allowed form:** Import from the public entry point.
- **Exception:** If this is intended, add `{"rule":"public-alternative-bypass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="mutation-mutant-nocoverage"></a>

### `mutation/mutant-nocoverage`

A mutant in code that no test runs.

- **Printed as:** `mutation/mutant-nocoverage`, `pit/mutant-nocoverage` and `mutmut/mutant-nocoverage`
- **Presets:** TypeScript, JavaScript, Java and Python
- **Analyzers:** `mutation` (TypeScript, JavaScript and Python); `java` (Java)
- **Why it is on:** Code no test reaches is not protected against change.
- **Allowed form:** Add a test that runs the code and asserts its result.
- **Exception:** If this is intended, add `{"rule":"mutant-nocoverage","paths":["<path>"],"function":"<function>","reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="mutation-mutant-survived"></a>

### `mutation/mutant-survived`

A mutant (a small deliberate change to production code) that every test survived.

- **Printed as:** `mutation/mutant-survived`, `pit/mutant-survived` and `mutmut/mutant-survived`
- **Presets:** TypeScript, JavaScript, Java and Python
- **Analyzers:** `mutation` (TypeScript, JavaScript and Python); `java` (Java)
- **Why it is on:** A mutant that survives shows a test that runs the code without checking what it does.
- **Allowed form:** Strengthen the test so that it fails for the mutant: assert the exact value instead of only running the code. An equivalent mutant is accepted with an exception after review.
- **Exception:** If this is intended, add `{"rule":"mutant-survived","paths":["<path>"],"function":"<function>","reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="nitpicker-config-policy-loosened"></a>

### `nitpicker-config/policy-loosened`

A change to `nitpicker.config.json` or to a tool config that makes the gate check less than the base did.

- **Presets:** TypeScript, JavaScript, Java, Kotlin and Python
- **Why it is on:** A change that loosens the policy it is judged by would pass itself, so a person has to accept it.
- **Allowed form:** Keep the base's policy and change the code until it passes: keep new code under the source roots, where the gate checks it, and fix findings instead of excluding, excepting or reclassifying the code.
- **Exception:** It has no `exceptions` entry. Only a person reviewing the change accepts exactly these loosenings, with `--accept-policy-change=<digest>` at an interactive terminal or `NITPICKER_ACCEPT_POLICY_CHANGE=<digest>` in CI.
- **See also:** [Usage guide](../usage.md)

<a id="repository-hygiene-committed-binary"></a>

### `repository-hygiene/committed-binary`

A committed archive or compiled binary (`gradle-wrapper.jar` is allowed).

- **Presets:** TypeScript, JavaScript, Java, Kotlin and Python
- **Analyzers:** `repository-hygiene`
- **Why it is on:** Binaries bloat the history, cannot be reviewed and go stale.
- **Allowed form:** Remove the file; fetch or build it in the build instead.
- **Exception:** If this is intended, add `{"rule":"committed-binary","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="repository-hygiene-committed-build-output"></a>

### `repository-hygiene/committed-build-output`

A committed build output folder (`dist`, `build`, `out`, `coverage` or `target` next to a project manifest; `.next`, `.nuxt`, `storybook-static`, `.turbo` or `.parcel-cache` anywhere).

- **Presets:** TypeScript, JavaScript, Java, Kotlin and Python
- **Analyzers:** `repository-hygiene`
- **Why it is on:** Build output is generated, so committing it creates noise and merge conflicts.
- **Allowed form:** Remove the folder from version control and add it to `.gitignore`.
- **Exception:** If this is intended, add `{"rule":"committed-build-output","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="repository-hygiene-committed-env-file"></a>

### `repository-hygiene/committed-env-file`

A committed `.env` file (templates such as `.env.example` are fine).

- **Presets:** TypeScript, JavaScript, Java, Kotlin and Python
- **Analyzers:** `repository-hygiene`
- **Why it is on:** An env file holds real secrets and values that differ per machine.
- **Allowed form:** Remove the file from version control, ignore it, and commit a `.env.example` template.
- **Exception:** If this is intended, add `{"rule":"committed-env-file","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="repository-hygiene-committed-private-key"></a>

### `repository-hygiene/committed-private-key`

A committed private key: a key file, or any text file holding a private-key block.

- **Presets:** TypeScript, JavaScript, Java, Kotlin and Python
- **Analyzers:** `repository-hygiene`
- **Why it is on:** A key in git is a leaked key.
- **Allowed form:** Remove the key from the repository, rotate it, and load it from a secret store or the environment.
- **Exception:** If this is intended, add `{"rule":"committed-private-key","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="repository-hygiene-large-file"></a>

### `repository-hygiene/large-file`

A committed file larger than the limit (lockfiles are exempt).

- **Presets:** TypeScript, JavaScript, Java, Kotlin and Python
- **Analyzers:** `repository-hygiene`
- **Why it is on:** Large files bloat every clone for ever.
- **Allowed form:** Keep large data outside the repository (artifact storage, Git LFS).
- **Threshold:** a file larger than 1 MB (lockfiles are exempt)
- **Exception:** If this is intended, add `{"rule":"large-file","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="structure-class-fields-limit"></a>

### `structure/class-fields-limit`

A class with more instance fields than the limit.

- **Presets:** Java, Kotlin and Python
- **Analyzers:** `java` (Java); `kotlin` (Kotlin); `python` (Python)
- **Why it is on:** Many fields mean a class holds state that belongs in separate types.
- **Allowed form:** Group related fields into a record or a class of their own.
- **Threshold:** more than 10 instance fields in a class of the main Java sources or the Python source roots; override with `thresholds.classFields`
- **Exception:** If this is intended, add `{"rule":"class-fields-limit","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="structure-class-methods-limit"></a>

### `structure/class-methods-limit`

A class with more methods than the limit.

- **Presets:** Java, Kotlin and Python
- **Analyzers:** `java` (Java); `kotlin` (Kotlin); `python` (Python)
- **Why it is on:** A class with many methods usually has more than one responsibility.
- **Allowed form:** Split it into classes by responsibility.
- **Threshold:** more than 20 methods in a class of the main Java sources or the Python source roots; override with `thresholds.classMethods`
- **Exception:** If this is intended, add `{"rule":"class-methods-limit","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="structure-component-story-missing"></a>

### `structure/component-story-missing`

A component file without a story, in a package that has Storybook.

- **Presets:** TypeScript and JavaScript
- **Analyzers:** `structure`
- **Scope:** The JavaScript preset enforces this check only in part.
- **Why it is on:** When most components have a story, a component without one is an oversight.
- **Exception:** If this is intended, add `{"rule":"component-story-missing","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - `componentStoryMissing`: Add \<story> for \<name>.
  - `componentStoryMissingUnenforced`: Add \<story>. Not enforced until more than half of the components have one.

<a id="structure-duplicate-definition"></a>

### `structure/duplicate-definition`

A used literal constant, function or type with the same name and text in two modules of a package.

- **Presets:** TypeScript, JavaScript, Java and Kotlin
- **Analyzers:** `structure` (TypeScript and JavaScript); `java` (Java); `kotlin` (Kotlin)
- **Scope:** The JavaScript preset enforces this check only in part.
- **Why it is on:** Two copies of one definition drift apart.
- **Allowed form:** Define it once in one module and import it where it is used.
- **Exception:** If this is intended, add `{"rule":"duplicate-definition","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="structure-exported-name-collision"></a>

### `structure/exported-name-collision`

Two different exports with one name, imported by the same module, which keeps the name for one of them.

- **Presets:** TypeScript, JavaScript, Java and Kotlin
- **Analyzers:** `structure` (TypeScript and JavaScript); `java` (Java); `kotlin` (Kotlin)
- **Scope:** The JavaScript preset enforces this check only in part.
- **Why it is on:** Two things with one name make an import ambiguous to read.
- **Allowed form:** Rename one of the exports.
- **Exception:** If this is intended, add `{"rule":"exported-name-collision","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="structure-file-lines-limit"></a>

### `structure/file-lines-limit`

A file longer than the limit (source and test files have separate limits).

- **Presets:** TypeScript, JavaScript, Java, Kotlin and Python
- **Analyzers:** `structure` (TypeScript and JavaScript); `java` (Java); `kotlin` (Kotlin); `python` (Python)
- **Why it is on:** Long files collect unrelated responsibilities and are slow to review.
- **Allowed form:** Split it into files by responsibility.
- **Threshold:** more than 300 lines in a source file or 500 in a test file; override with `thresholds.fileLines` and `thresholds.testFileLines`
- **Exception:** If this is intended, add `{"rule":"file-lines-limit","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="structure-folder-depth-limit"></a>

### `structure/folder-depth-limit`

Code nested deeper below its feature folder or root package than the limit.

- **Presets:** TypeScript, JavaScript, Java, Kotlin and Python
- **Analyzers:** `structure` (TypeScript and JavaScript); `java` (Java); `kotlin` (Kotlin); `python` (Python)
- **Why it is on:** Deep trees hide where code belongs and make imports long.
- **Allowed form:** Flatten the tree: move the code up to the feature or package that owns it.
- **Threshold:** code more than 1 folder below `features/<feature>/<layer>/` (TypeScript), more than 4 packages below the root package (Java, Kotlin) or more than 4 packages below the root package (Python); override with `thresholds.folderDepth`
- **Exception:** If this is intended, add `{"rule":"folder-depth-limit","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="structure-folder-files-limit"></a>

### `structure/folder-files-limit`

A folder with more source files, or more test files, directly in it than the limit.

- **Presets:** TypeScript, JavaScript, Java, Kotlin and Python
- **Analyzers:** `structure` (TypeScript and JavaScript); `java` (Java); `kotlin` (Kotlin); `python` (Python)
- **Why it is on:** A flat folder of many files has no structure for a reader to follow.
- **Allowed form:** Group related files into subfolders (packages in Java).
- **Threshold:** more than 6 source files, or test files, directly in one folder; override with `thresholds.folderFiles`
- **Exception:** If this is intended, add `{"rule":"folder-files-limit","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="structure-function-control-nesting-limit"></a>

### `structure/function-control-nesting-limit`

A function that nests control flow deeper than the limit.

- **Presets:** TypeScript, JavaScript, Java, Kotlin and Python
- **Analyzers:** `structure` (TypeScript and JavaScript); `java` (Java); `kotlin` (Kotlin); `python` (Python)
- **Why it is on:** Deep nesting makes the paths through a function hard to follow and to test.
- **Allowed form:** Return early instead of nesting.
- **Threshold:** control nesting deeper than 2
- **Exception:** If this is intended, add `{"rule":"function-control-nesting-limit","paths":["<path>"],"function":"<function>","reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="structure-function-lines-limit"></a>

### `structure/function-lines-limit`

A function longer than the limit.

- **Presets:** TypeScript, JavaScript, Java, Kotlin and Python
- **Analyzers:** `structure` (TypeScript and JavaScript); `java` (Java); `kotlin` (Kotlin); `python` (Python)
- **Why it is on:** Long functions hide several jobs in one place; agents grow them instead of splitting them.
- **Allowed form:** Split it into functions named for what each part does and put new code in a new function. A function, file or class already over its limit may be edited as long as the change does not make it worse.
- **Threshold:** more than 50 lines
- **Exception:** If this is intended, add `{"rule":"function-lines-limit","paths":["<path>"],"function":"<function>","reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="structure-function-parameters-limit"></a>

### `structure/function-parameters-limit`

A function with more parameters than the limit.

- **Presets:** TypeScript, JavaScript, Java, Kotlin and Python
- **Analyzers:** `structure` (TypeScript and JavaScript); `java` (Java); `kotlin` (Kotlin); `python` (Python)
- **Why it is on:** Long parameter lists are easy to call in the wrong order and tend to grow.
- **Allowed form:** Group related parameters into one object (an options object, a record or a data class) instead of adding another.
- **Threshold:** more than 3 parameters
- **Exception:** If this is intended, add `{"rule":"function-parameters-limit","paths":["<path>"],"function":"<function>","reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="structure-function-statements-limit"></a>

### `structure/function-statements-limit`

A function with more statements than the limit.

- **Presets:** TypeScript, JavaScript, Java, Kotlin and Python
- **Analyzers:** `structure` (TypeScript and JavaScript); `java` (Java); `kotlin` (Kotlin); `python` (Python)
- **Why it is on:** Many statements usually mean several responsibilities in one function.
- **Allowed form:** Split by responsibility and name each part for what it checks or does.
- **Threshold:** more than 15 statements
- **Exception:** If this is intended, add `{"rule":"function-statements-limit","paths":["<path>"],"function":"<function>","reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="structure-inheritance-depth-limit"></a>

### `structure/inheritance-depth-limit`

A class that extends more superclasses than the limit.

- **Presets:** Java, Kotlin and Python
- **Analyzers:** `java` (Java); `kotlin` (Kotlin); `python` (Python)
- **Why it is on:** Deep inheritance spreads behaviour over many classes and couples them.
- **Allowed form:** Hold the shared part as a field and delegate to it instead of extending.
- **Threshold:** a class more than 3 superclasses deep in the main Java sources or the Python source roots; override with `thresholds.inheritanceDepth`
- **Exception:** If this is intended, add `{"rule":"inheritance-depth-limit","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="structure-javascript-in-typescript-project"></a>

### `structure/javascript-in-typescript-project`

A `.js`, `.mjs`, `.cjs` or `.jsx` file in a project that has a `tsconfig.json`.

- **Presets:** TypeScript
- **Analyzers:** `structure`
- **Why it is on:** JavaScript in a TypeScript project has no type checking.
- **Allowed form:** Write it as a .ts or .tsx file: \<typescript>.
- **Exception:** If this is intended, add `{"rule":"javascript-in-typescript-project","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="structure-line-length-limit"></a>

### `structure/line-length-limit`

A line longer than the limit, except imports, URLs and the text of string literals.

- **Presets:** TypeScript, JavaScript, Java, Kotlin and Python
- **Analyzers:** `structure` (TypeScript and JavaScript); `java` (Java); `kotlin` (Kotlin); `python` (Python)
- **Why it is on:** Long lines are hard to review in a diff and hide complexity.
- **Allowed form:** Break it up or extract a named value.
- **Threshold:** a line longer than 120 characters, except imports, URLs and string literal text; override with `thresholds.lineLength` (Java files: the width of the formatter, 100 for google-java-format and 120 for palantir-java-format, or the `java.lineLength` convention (a Checkstyle `LineLength` max, a pin, or measured when no formatter runs); Kotlin files: detekt's)
- **Exception:** If this is intended, add `{"rule":"line-length-limit","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="structure-new-icon-asset"></a>

### `structure/new-icon-asset`

A new icon-sized `.svg` file while an icon package is a dependency.

- **Presets:** TypeScript and JavaScript
- **Analyzers:** `structure`
- **Why it is on:** Icons from one package look consistent; one-off files pile up.
- **Allowed form:** Use an icon from \<package> instead of adding \<path>.
- **Exception:** If this is intended, add `{"rule":"new-icon-asset","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="structure-redefined-library-component"></a>

### `structure/redefined-library-component`

A component named like one the project already renders from a dependency.

- **Presets:** TypeScript and JavaScript
- **Analyzers:** `structure`
- **Scope:** The JavaScript preset enforces this check only in part.
- **Why it is on:** A second copy of a library component diverges from the real one.
- **Allowed form:** \<name> is already rendered from \<package> in \<count>. Use that one.
- **Exception:** If this is intended, add `{"rule":"redefined-library-component","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="structure-sibling-copy-edit"></a>

### `structure/sibling-copy-edit`

A function or class edited so that it drifts from its same-named copy in another module while that copy is left unedited.

- **Presets:** TypeScript, JavaScript, Java and Kotlin
- **Analyzers:** `structure` (TypeScript and JavaScript); `java` (Java); `kotlin` (Kotlin)
- **Why it is on:** Editing one of two near-identical copies leaves the other with the old bug.
- **Allowed form:** Edit it there too, or merge the copies.
- **Threshold:** a function or class edited so that it drifts from its same-named copy in another module of the package, at least 80% the same tokens before and after, while that copy is left unedited (Java and Kotlin: top-level classes and static, `object` and top-level functions)
- **Exception:** If this is intended, add `{"rule":"sibling-copy-edit","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="structure-unused-option"></a>

### `structure/unused-option`

A property of the options parameter of an exported function that no call sets; in Kotlin, a defaulted parameter of a private or internal function that no call names or fills.

- **Presets:** TypeScript and Kotlin
- **Analyzers:** `structure` (TypeScript); `kotlin` (Kotlin)
- **Why it is on:** An option nobody sets is dead surface that every reader has to understand.
- **Allowed form:** Remove it, or set it from a real call (\<scope>).
- **Exception:** If this is intended, add `{"rule":"unused-option","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="structure-unused-prop"></a>

### `structure/unused-prop`

A prop the project declares that no caller passes (a spread of a non-literal passes all).

- **Presets:** TypeScript
- **Analyzers:** `structure`
- **Why it is on:** An option or prop nobody sets is dead surface that every reader has to understand.
- **Allowed form:** Remove it, or pass it from a real caller (\<scope>).
- **Exception:** If this is intended, add `{"rule":"unused-prop","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="test-console-test-console-output"></a>

### `test-console/test-console-output`

A test file that prints console error or warn output the base run did not print.

- **Printed as:** `test-console/test-console-output` and `test-runtime/test-console-output`
- **Presets:** TypeScript, JavaScript, Java and Kotlin
- **Analyzers:** `test-console` (TypeScript and JavaScript); `java` (Java); `kotlin` (Kotlin)
- **Why it is on:** Console noise hides real warnings and usually points at a leaked timer or an unhandled error.
- **Allowed form:** Fix the cause (for example a timer that outlives the test), or allow a third-party message in "testConsole.allow" of nitpicker.config.json.
- **Exception:** If this is intended, add `{"rule":"test-console-output","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="test-runtime-no-production-runtime"></a>

### `test-runtime/no-production-runtime`

A test that runs no production runtime code.

- **Presets:** TypeScript and JavaScript
- **Analyzers:** `test-runtime`
- **Why it is on:** A test that never runs the code it is named for cannot fail when that code breaks.
- **Allowed form:** Import and run the production code the test is about.
- **Exception:** If this is intended, add `{"rule":"no-production-runtime","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="test-runtime-slow-test"></a>

### `test-runtime/slow-test`

A test the change adds or edits that takes longer than the limit for its kind (unit or integration).

- **Presets:** TypeScript, JavaScript, Java, Kotlin and Python
- **Analyzers:** `test-runtime` (TypeScript and JavaScript); `java` (Java); `kotlin` (Kotlin); `python` (Python)
- **Why it is on:** Slow tests slow every run and are the first to be skipped; most tests should be fast unit tests.
- **Allowed form:** Make the test fast: inject a clock or a fake instead of waiting, or move it to the integration tests, which have a higher limit.
- **Threshold:** a test the change adds or edits taking more than 5 s (unit) or 30 s (integration); override with `thresholds.unitTestSeconds` and `thresholds.integrationTestSeconds`
- **Exception:** If this is intended, add `{"rule":"slow-test","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="test-runtime-type-only-production-dependency"></a>

### `test-runtime/type-only-production-dependency`

A test whose only link to production code is a type-only import.

- **Presets:** TypeScript and JavaScript
- **Analyzers:** `test-runtime`
- **Why it is on:** A type import proves nothing at runtime, so the test cannot fail when the code breaks.
- **Allowed form:** Import and run the production code the test is about.
- **Exception:** If this is intended, add `{"rule":"type-only-production-dependency","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
