# Effects rules

Part of the [Kotlin preset guide](../kotlin-preset.md).

The Java preset's [effects rules](../java-preset/effects-rules.md) run on the compiled Kotlin classes
too, under the tool `effects` (exception `effects/<Rule>`), so receivers resolve by their type and
helpers by what they call (#435, #329).

| Rule                    | Reports                                                                                                                                                                                                                                                                                                                                                                                      | Allowed form                                                                                                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IoCallInLoop`          | a `database` or `remote` call per loop item, direct (`repository.deleteById(id)`, `repository.findByIdOrNull(id)`) or through a project helper, in a `for`, `while` or `do` body or an inlined iterating lambda (`forEach`, `map`, `filter` and the rest compile to real loops), a `Sequence` step; a `database` call inside `map { async { ... } }` and the other concurrent per-item forms | a batch call for all items (`findAllById`, `saveAll`); for remote calls without a batch endpoint, `Semaphore.withPermit`, `flatMapMerge(concurrency = n)`, `limitedParallelism(n)` or `chunked(n)` |
| `AccumulatorCopyInLoop` | `fold`, `reduce`, `runningFold` and loops whose step stores `acc + x` (`CollectionsKt.plus`, `SetsKt.plus`, `MapsKt.plus`, `toMutableList()` and the other copies) of the accumulator back into it, also `acc += x` on a `var` read-only collection (#440)                                                                                                                                   | `map`, `flatMap`, `associate`, `groupBy`, `buildList`, or one mutable collection filled in the loop                                                                                                |

`IoCallInLoop` replaced the source check `kotlin-source/IoCallInLoop`. An exception written for
that one keeps working for now: nitpicker reads `kotlin-source/IoCallInLoop` in
`nitpicker.config.json` as `effects/IoCallInLoop` and prints a notice asking to rename it. When a
project first runs the effects rules, or upgrades to a release that names methods as the source
does (`Outer.Companion.load`, a lambda by its enclosing function), its findings get new identities
once; base and head are analyzed by the same release, so this creates no new findings in a review.
Iterating callbacks include the `Sequence` steps, `sortedWith`, `compareBy`, and the `Flow`
operators that run per element (`onEach`, `collect`, `collectLatest`, `mapLatest`, `flatMapConcat`,
`flatMapLatest`, `scan` and the like); `flatMapMerge` is a concurrent form, like `async`. A
`launch`, `Thread`, scheduled task or listener callback runs later and is not part of the loop.
Paging and polling loops, retries (`repeat(3) { try {
return ... } catch ... }`), batch methods, chunk calls (`ids.chunked(100).forEach {
loader.forget(it) }`), file calls and `message` publishes are not reported, as in the Java preset;
a line a Spring Data loop rule reports is not reported again.
