# Null branches that fall through

An `if (x == null)` branch that handles the null case, does not leave, and is followed by a use of the same
value is an enforceable `pmd/NullBranchFallThrough` finding
(`languages/java/adapters/review-rules/null-fall-through/`), in the Java and Kotlin presets alike. On the null
path the later use throws a `NullPointerException`, or the value is handled twice: the Defects4J
jackson-databind `BeanPropertyWriter.serializeAsColumn` bug writes `null` and goes on to serialize the value
again, and the fix adds the missing `return`. The rule is read from the main sources of every module and
printed as a PMD rule, so it runs the same on Gradle and Maven builds. The finding is on the `if` line.

- **The branch:** `if (x == null)` (also `null == x`, `this.x == null`; Kotlin `x == null`) with no `else`,
  where `x` is a local, a parameter or a field, and the condition is only that comparison. The branch does
  something with the null case (a call, an append, a log, an assignment to another variable) and does not leave:
  no `return`, `throw`, `break`, `continue`, `System.exit`, Kotlin `exitProcess`, `error(...)` or `TODO(...)`, and no
  assignment to `x`.
- **The use:** the first of these in the same block after the `if`: a member access `x.m()` or `x.f` (in Kotlin
  `x!!`, or `x.m()` for a platform type), an array access `x[i]`, unboxing (`x + 1`, `x < limit`, `x++`),
  iteration (`for (T e : x)`), `Objects.requireNonNull(x)`, or `x` passed to a call with the same name as a call
  of the branch (`out.append("null")` then `out.append(x)`).
- **Allowed forms, not reported:** `return` or `throw` in the branch, an `else`, assigning `x` in the branch,
  a `x != null` guard or any other comparison of `x` before the use, null-safe uses (`String.valueOf(x)`,
  `Objects.toString(x)`, `"" + x`, `x == other`, Kotlin `x?.m()`, `x ?: other`, `x.orEmpty()`), a branch that
  only does nothing, a later assignment to `x` before the use, and a field (`this.x` or a name that is not a
  parameter or local) whose branch calls a method other than a logger or writer (`connect()`), since that call
  may set it.
- **Not covered:** test sources and files under `exclude`; a null check that is part of a larger condition
  (`x == null && flag`); a use in a later block, in a lambda, or behind a call that dereferences `x` for the
  caller. A branch that only logs and then continues on purpose is still reported, because the use after it
  fails on the same path.

The message names the value, the first later use (shortened to 40 characters) and the allowed forms, and ends with the exception sentence for
`{ "rule": "pmd/NullBranchFallThrough", "paths": ["<file>"], "reason": "..." }`. Tests:
`adapters/review-rules/null-fall-through/null-fall-through.test.mts`. The Go counterpart is
`go-rules/nil-branch-fall-through`; the TypeScript, JavaScript and Python counterparts are listed in their
presets.
