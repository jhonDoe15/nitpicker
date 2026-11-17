# Python: type checkers and import contracts

mypy, pyright and basedpyright diagnostics, import-linter contracts, the dependency checks and mutmut. This page lists 18 rules. [All pages](README.md).

The guide for these rules: [docs/python-preset.md](../python-preset.md).

Unless an entry says otherwise:

- **Presets:** Python
- **Analyzers:** `python`
- **Fix:** None: fix it by hand.

<a id="basedpyright-rule"></a>

### `basedpyright/<rule>`

A diagnostic of basedpyright, named by its \<rule>.

- **Labels:** bug
- **Printed as:** `basedpyright/<rule>`
- **For example:** `basedpyright/reportAny`
- **Why it is on:** The Python preset runs the type checker the project picks (`python.typeChecker`: mypy, pyright or basedpyright) and fails a diagnostic the change adds.
- **Allowed form:** Fix the type; inline ignores are banned.
- **Exception:** If this is intended, add `{"rule":"<rule>","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="basedpyright-reportdeprecated"></a>

### `basedpyright/reportDeprecated`

A basedpyright diagnostic with the rule reportDeprecated.

- **Labels:** maintainability
- **Why it is on:** The Python preset runs the type checker the project picks and fails a diagnostic the change adds.
- **Allowed form:** Call the replacement the deprecation notice names; the deprecated API is going away.
- **Exception:** If this is intended, add `{"rule":"reportDeprecated","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="basedpyright-reportmissingimports"></a>

### `basedpyright/reportMissingImports`

A basedpyright diagnostic with the rule reportMissingImports.

- **Labels:** bug
- **Why it is on:** The Python preset runs the type checker the project picks and fails a diagnostic the change adds.
- **Allowed form:** Install the package, or its `types-` stubs, in the project environment.
- **Exception:** If this is intended, add `{"rule":"reportMissingImports","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="basedpyright-reportmissingmodulesource"></a>

### `basedpyright/reportMissingModuleSource`

A basedpyright diagnostic with the rule reportMissingModuleSource.

- **Labels:** bug
- **Why it is on:** The Python preset runs the type checker the project picks and fails a diagnostic the change adds.
- **Allowed form:** Install the package, or its `types-` stubs, in the project environment.
- **Exception:** If this is intended, add `{"rule":"reportMissingModuleSource","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="dependencies-no-dev-dependency-in-production"></a>

### `dependencies/no-dev-dependency-in-production`

Production code imports a package that is only a dev dependency.

- **Labels:** bug
- **Why it is on:** A production install does not have dev dependencies, so the import fails there.
- **Allowed form:** Move the dependency to the runtime dependencies, or stop importing it in production code.
- **Fix:** With `nitpicker --fix --rule dependencies/no-dev-dependency-in-production`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"no-dev-dependency-in-production","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="dependencies-unlisted-dependency"></a>

### `dependencies/unlisted-dependency`

A package that code imports but the project manifest does not list.

- **Labels:** bug
- **Why it is on:** An import that works only because another package pulls it in breaks when that package changes.
- **Allowed form:** Add it to the project dependencies (a dev dependency group for tests and tooling).
- **Fix:** With `nitpicker --fix --rule dependencies/unlisted-dependency`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"unlisted-dependency","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="dependencies-unused-dependency"></a>

### `dependencies/unused-dependency`

A dependency in the project manifest that no code imports.

- **Labels:** simplification
- **Why it is on:** Unused dependencies add install time and attack surface.
- **Allowed form:** Remove it from the manifest.
- **Fix:** With `nitpicker --fix --rule dependencies/unused-dependency`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"unused-dependency","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="import-linter-contract-broken"></a>

### `import-linter/contract-broken`

An import that breaks an import-linter contract.

- **Labels:** maintainability
- **Why it is on:** The Python preset checks the import contracts of the project (`python.importLinter`) so that layers keep their direction.
- **Allowed form:** Remove the import; move the code to the layer that may depend on it.
- **Exception:** If this is intended, add `{"rule":"contract-broken","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="mutmut-mutant-ignored"></a>

### `mutmut/mutant-ignored`

A `# pragma: no mutate` comment or a mutmut ignore pattern that hides code from mutation testing.

- **Labels:** tests
- **Analyzers:** `mutation`
- **Why it is on:** An ignored mutant cannot fail, so an ignore comment hides code from the mutation check.
- **Allowed form:** Remove the comment or pattern and test the code.
- **Fix:** With `nitpicker --fix --rule mutmut/mutant-ignored`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** Ignore comments and patterns are not an exception route.

<a id="mypy-error-code"></a>

### `mypy/<error code>`

A diagnostic of mypy, named by its \<error code>.

- **Labels:** bug
- **Printed as:** `mypy/<error code>`
- **For example:** `mypy/arg-type`
- **Why it is on:** The Python preset runs the type checker the project picks (`python.typeChecker`: mypy, pyright or basedpyright) and fails a diagnostic the change adds.
- **Allowed form:** Fix the type; inline ignores are banned.
- **Fix:** With `nitpicker --fix --rule mypy/<error code>`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"<error code>","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="mypy-deprecated"></a>

### `mypy/deprecated`

A mypy diagnostic with the rule deprecated.

- **Labels:** maintainability
- **Why it is on:** The Python preset runs the type checker the project picks and fails a diagnostic the change adds.
- **Allowed form:** Call the replacement the deprecation notice names; the deprecated API is going away.
- **Exception:** If this is intended, add `{"rule":"deprecated","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="mypy-import-not-found"></a>

### `mypy/import-not-found`

A mypy diagnostic with the rule import-not-found.

- **Labels:** bug
- **Why it is on:** The Python preset runs the type checker the project picks and fails a diagnostic the change adds.
- **Allowed form:** Install the package, or its `types-` stubs, in the project environment.
- **Exception:** If this is intended, add `{"rule":"import-not-found","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="mypy-import-untyped"></a>

### `mypy/import-untyped`

A mypy diagnostic with the rule import-untyped.

- **Labels:** bug
- **Why it is on:** The Python preset runs the type checker the project picks and fails a diagnostic the change adds.
- **Allowed form:** Install the package, or its `types-` stubs, in the project environment.
- **Exception:** If this is intended, add `{"rule":"import-untyped","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="mypy-unused-ignore"></a>

### `mypy/unused-ignore`

A mypy diagnostic with the rule unused-ignore.

- **Labels:** simplification
- **Why it is on:** The Python preset runs the type checker the project picks and fails a diagnostic the change adds.
- **Allowed form:** Delete the comment.
- **Fix:** With `nitpicker --fix --rule mypy/unused-ignore`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** It has no exception route.

<a id="pyright-rule"></a>

### `pyright/<rule>`

A diagnostic of pyright, named by its \<rule>.

- **Labels:** bug
- **Printed as:** `pyright/<rule>`
- **For example:** `pyright/reportOptionalMemberAccess`
- **Why it is on:** The Python preset runs the type checker the project picks (`python.typeChecker`: mypy, pyright or basedpyright) and fails a diagnostic the change adds.
- **Allowed form:** Fix the type; inline ignores are banned.
- **Exception:** If this is intended, add `{"rule":"<rule>","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="pyright-reportdeprecated"></a>

### `pyright/reportDeprecated`

A pyright diagnostic with the rule reportDeprecated.

- **Labels:** maintainability
- **Why it is on:** The Python preset runs the type checker the project picks and fails a diagnostic the change adds.
- **Allowed form:** Call the replacement the deprecation notice names; the deprecated API is going away.
- **Exception:** If this is intended, add `{"rule":"reportDeprecated","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="pyright-reportmissingimports"></a>

### `pyright/reportMissingImports`

A pyright diagnostic with the rule reportMissingImports.

- **Labels:** bug
- **Why it is on:** The Python preset runs the type checker the project picks and fails a diagnostic the change adds.
- **Allowed form:** Install the package, or its `types-` stubs, in the project environment.
- **Exception:** If this is intended, add `{"rule":"reportMissingImports","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="pyright-reportmissingmodulesource"></a>

### `pyright/reportMissingModuleSource`

A pyright diagnostic with the rule reportMissingModuleSource.

- **Labels:** bug
- **Why it is on:** The Python preset runs the type checker the project picks and fails a diagnostic the change adds.
- **Allowed form:** Install the package, or its `types-` stubs, in the project environment.
- **Exception:** If this is intended, add `{"rule":"reportMissingModuleSource","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
