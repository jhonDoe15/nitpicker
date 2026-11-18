# NaN-only checks on parsed numbers

`isNaN` as the only check on a number that was parsed from text is an enforceable `pmd/NanOnlyGuard` finding
(`languages/java/adapters/review-rules/value-checks/nan-guard/`), in the Java and Kotlin presets alike. `Infinity` and
`-Infinity` pass an `isNaN` check, and `Double.parseDouble("Infinity")` or `"1e999"` produces them, so the value goes on
as a limit, an amount or a timeout. The rule prints as a PMD rule like the other cross-file rules. The finding is on the
`isNaN` call.

- **The value:** a local assigned from `Double.parseDouble`, `Double.valueOf`, `Float.parseFloat` (Kotlin also
  `toDoubleOrNull` and `toFloatOrNull`), checked with `Double.isNaN(x)`, `Float.isNaN(x)` or `x.isNaN()`.
- **Allowed forms, not reported:** a method that calls `isFinite` or `isInfinite`, names `POSITIVE_INFINITY`,
  `NEGATIVE_INFINITY` or `Infinity`, or compares the local with `<`, `>`, `<=` or `>=` (a range check rejects the infinities
  too).
- **Not covered:** a division or a product (the sources carry no types, so a double cannot be told from an integer),
  `Kotlin` `toDouble()` (it cannot be told from an `Int` conversion), and a value that is passed to another method before
  the check.

The message names the local and the allowed form, and ends with the exception route `pmd/NanOnlyGuard`.
