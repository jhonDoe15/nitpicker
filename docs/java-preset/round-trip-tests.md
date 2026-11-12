# Round-trip tests

Part of the [Java preset guide](../java-preset.md).

`pmd/UntestedRoundTrip` reports two public methods of one main-source class or nested class (or, in the Kotlin
preset, two public top-level functions of one file, or the methods of a class and its companion
object) that turn values into each other, when no test calls both. Nitpicker computes it over the
sources of every module and prints it as a PMD rule, like the other test honesty rules; the
TypeScript and JavaScript presets report the same with `nitpicker/untested-round-trip` and the
Python preset with `untested-round-trip`.

- **Pairs.** Names that differ only by a direction word: `toX`/`fromX`, `dumps`/`loads`,
  `dump`/`load`, `encode`/`decode`, `serialize`/`deserialize` (also `serialise`), `marshal`/`unmarshal`,
  `parse`/`format`, `pack`/`unpack`, `encrypt`/`decrypt`, `compress`/`decompress`,
  `escape`/`unescape`, alone or with the same rest of the name (`encodeToken`/`decodeToken`,
  `parseDate`/`formatDate`). `to` and `from` need a rest (`toJson`), and `toString`/`fromString` is
  not a pair, since `toString` is mostly called implicitly.
- **Public.** Java: `public` methods, or methods of an interface; Kotlin: not `private` or
  `protected`. Abstract methods and interface methods without a body are contracts, not code, and
  are not reported; their implementations are.
- **Tested.** One test calls both: a `@Test`, `@ParameterizedTest`, `@RepeatedTest`, `@TestFactory`,
  `@TestTemplate` or `@Property` method (also with a qualified annotation and in `@Nested`
  classes), a JUnit 3 `test...` method, a Kotlin test function or a Kotest leaf, counting the helper
  functions of the same test file that the test calls, directly or through other helpers. Names
  are matched by name, so `Codec.fromJson(codec.toJson())` and a helper `trip(value)` count.
- **Where.** On the later of the two declarations, so a new or changed pair is held on touched lines.

Allowed: a test that runs one on the other's output,
`assertEquals(value, Codec.fromJson(value.toJson()))`, with values that need escaping or mapping
(quotes, newlines, non-ASCII, empty and absent fields). An exception goes in `exceptions` with the
rule `pmd/UntestedRoundTrip`.
