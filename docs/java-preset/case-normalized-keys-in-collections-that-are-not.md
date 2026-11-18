# Case-normalized keys in collections that are not

A lookup whose key is lower-cased or upper-cased in a collection that keeps its values in their original case, or
the reverse, is an enforceable `pmd/CaseMismatchedLookup` finding
(`languages/java/adapters/review-rules/case-lookups/`), in the Java and Kotlin presets alike. The lookup misses
every value that is not already in the key's case: a lower-cased auditor name looked up in the names as the user
typed them ignores names with capitals, and a map filled by `name.toLowerCase()` and read with `name` misses a
mixed-case name. Merged fixes in open-source projects (a database middleware, a loan platform, a data catalog)
normalized both sides or switched to a case-insensitive collection.

- **Reported:** `contains`, `get`, `containsKey`, `indexOf` or `remove` with a `toLowerCase`, `toUpperCase`
  (also with a locale) or Kotlin `lowercase`, `uppercase` key, when the receiver is a local or field initialised
  in the file from string literals of which at least one is not already in that case
  (`Set.of("GET", "POST")` with `toLowerCase`), or from a copy (`new HashSet<>(values)`, `Arrays.asList(values)`,
  `Set.copyOf(values)`) of a parameter of the same method. The reverse: a plain variable looked up where the same
  receiver was filled with `add`, `put` or `set` of the normalized variable (`index.put(name.toLowerCase(), 1)`
  and `index.get(name)`), in the same method, or anywhere in the class for a `this.` field.
- **Allowed forms, not reported:** a collection whose literals are all in the key's case, a collection that is
  a parameter itself (the caller owns its case), a key normalized into a local before both the fill and the lookup,
  `equalsIgnoreCase` in a stream match, a case-insensitive collection (`TreeSet(String.CASE_INSENSITIVE_ORDER)`,
  a `CaseInsensitive*` type) and normalizing both sides where the collection is built.
- **Not covered:** a collection returned by a getter or another method (the case of its values is not known from
  the file), `Map.of` literals, and lookups through `stream().anyMatch`.

The message names the allowed forms and ends with the exception sentence for
`{ "rule": "pmd/CaseMismatchedLookup", "paths": ["<file>"], "reason": "..." }`. Tests:
`adapters/review-rules/case-lookups/case-lookups.test.mts`. The TypeScript and JavaScript counterpart is
`nitpicker/no-case-mismatched-lookup`.
