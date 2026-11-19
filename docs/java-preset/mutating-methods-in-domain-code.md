# Mutating methods in domain code

A class in a package with a `domain` segment (not an adapter, infrastructure or infra package: the scope of the
`domain-imports-*` rules) that calls a mutating method on a parameter is an enforceable
`pmd/MutatingMethodInDomain` finding (`languages/java/adapters/review-rules/mutating-methods/`), in the Java
and Kotlin presets alike. Domain code builds new values instead of changing the ones it is given, so a caller
never finds its list, map or date changed by a call. The rule is read from the main sources of every module and
printed as a PMD rule, so it runs the same on Gradle and Maven builds. The finding is on the call line.

- **The call:** `name.method(...)` (Kotlin also `name?.method(...)`), where `name` is a parameter of the
  enclosing method or function whose declared type is a `java.util` collection (`List`, `Set`, `Map`,
  `Collection`, `Queue`, `Deque` and their implementations, Kotlin `MutableList`, `MutableSet`, `MutableMap`,
  `MutableCollection`) and `method` is one of its mutators (`add`, `addAll`, `remove`, `removeIf`, `retainAll`,
  `clear`, `sort`, `set`, `put`, `putAll`, `merge`, `compute*`, `poll`, `push`, Kotlin `sortBy`, `reverse`,
  `shuffle`, `fill`, `removeAt`, ...), or a `Date`, `Calendar` or `BitSet` and one of its setters (`setTime`,
  `set`, `add`, `roll`, `flip`, ...).
- **Allowed forms, not reported:** a collection created in the method and filled there (`new ArrayList<>()`,
  `mutableListOf()`, `buildList { ... }`), a parameter that the method assigns before the call
  (`items = new ArrayList<>(items)`), read-only calls (`get`, `contains`, `stream`), and the building forms the
  message names: `List.copyOf`, `Set.copyOf`, `Map.copyOf`, `Stream.toList()`, `Collectors.toUnmodifiableMap`,
  Kotlin `buildList`, `buildMap`, `buildSet`, `items + x`, `toMutableList()` filled and returned.
- **Not covered:** a field, a value returned by a call, a local alias of a parameter, and a receiver that is not
  a plain name (`a.b.add(x)`). Test sources and files under `exclude` are not read.

The message names the parameter, its type and the building form of the language, and ends with the exception
sentence for `{ "rule": "pmd/MutatingMethodInDomain", "paths": ["<file>"], "reason": "..." }`. There is no
automatic fix: the replacement depends on what the method returns. Tests:
`adapters/review-rules/mutating-methods/mutating-methods.test.mts`. The TypeScript counterpart is
`nitpicker/no-mutating-method-in-domain`; the Python and Go counterparts are listed in their presets.
