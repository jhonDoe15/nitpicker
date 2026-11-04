# Java and Kotlin: SpotBugs rules

The SpotBugs bug patterns that the Java and Kotlin presets run on compiled classes: Java with Gradle or Maven, Kotlin with Gradle. This page lists 504 rules. [All pages](README.md).

The guide for these rules: [docs/java-preset.md](../java-preset.md).

SpotBugs 4.9.3 is under the LGPL-2.1, so this page names each rule and its category only; the description is in the documentation each entry links to.

In the Java preset, an entry of `exceptions` names a finding as it prints, `<tool>/<rule>` with one of the tools `pmd`, `spotbugs`, `errorprone`, `archunit`, `google-java-format`, `palantir-java-format`, `jacoco`, `checkstyle`, `crap`, `duplicates`, `pit`, `structure`, `coupling`, `spring` and `test-runtime`, or one of these rules: `function-lines-limit`, `function-statements-limit`, `function-control-nesting-limit`, `function-parameters-limit`, `crap-score-limit`, `crap-coverage-unknown`, `changed-branch-coverage`, `mutant-survived`, `mutant-nocoverage`, `duplicate-clone`, `stability-direction`, `no-production-runtime`, `file-lines-limit`, `line-length-limit`, `folder-files-limit`, `slow-test`, `committed-env-file`, `committed-private-key`, `committed-binary`, `large-file`, `committed-build-output`, `co-change`, `duplicate-definition`, `exported-name-collision`, `sibling-copy-edit`, `test-only-export`, `doc-comment-content`, `test-console-output`, `folder-depth-limit`, `class-methods-limit`, `class-fields-limit` and `inheritance-depth-limit`. The Kotlin preset takes the same `<tool>/<rule>` form for the Java sources of a mixed module.

Unless an entry says otherwise:

- **Presets:** Java and Kotlin
- **Analyzers:** `java` (Java); `kotlin` (Kotlin)
- **Builds:** Gradle and Maven (Java); Gradle (Kotlin)

<a id="spotbugs-aa-assertion-of-arguments"></a>

### `spotbugs/AA_ASSERTION_OF_ARGUMENTS`

A SpotBugs bad practice pattern, `AA_ASSERTION_OF_ARGUMENTS`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Validate public arguments with Objects.requireNonNull or an explicit check that throws IllegalArgumentException; assert is skipped when assertions are off.
- **Exception:** If this is intended, add `{"rule":"spotbugs/AA_ASSERTION_OF_ARGUMENTS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#aa-assertion-is-used-to-validate-an-argument-of-a-public-method-aa-assertion-of-arguments)

<a id="spotbugs-am-creates-empty-jar-file-entry"></a>

### `spotbugs/AM_CREATES_EMPTY_JAR_FILE_ENTRY`

A SpotBugs bad practice pattern, `AM_CREATES_EMPTY_JAR_FILE_ENTRY`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Write the entry's bytes between putNextEntry and closeEntry, or drop the entry if it is not needed.
- **Exception:** If this is intended, add `{"rule":"spotbugs/AM_CREATES_EMPTY_JAR_FILE_ENTRY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#am-creates-an-empty-jar-file-entry-am-creates-empty-jar-file-entry)

<a id="spotbugs-am-creates-empty-zip-file-entry"></a>

### `spotbugs/AM_CREATES_EMPTY_ZIP_FILE_ENTRY`

A SpotBugs bad practice pattern, `AM_CREATES_EMPTY_ZIP_FILE_ENTRY`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Write the entry's bytes between putNextEntry and closeEntry, or drop the entry if it is not needed.
- **Exception:** If this is intended, add `{"rule":"spotbugs/AM_CREATES_EMPTY_ZIP_FILE_ENTRY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#am-creates-an-empty-zip-file-entry-am-creates-empty-zip-file-entry)

<a id="spotbugs-ase-assertion-with-side-effect"></a>

### `spotbugs/ASE_ASSERTION_WITH_SIDE_EFFECT`

A SpotBugs security pattern, `ASE_ASSERTION_WITH_SIDE_EFFECT`.

- **Why it is on:** SpotBugs reports code that untrusted input can exploit, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Run the state-changing call on its own line, store the result in a local, and assert on the local.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ASE_ASSERTION_WITH_SIDE_EFFECT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ase-expression-in-assertion-may-produce-a-side-effect-ase-assertion-with-side-effect)

<a id="spotbugs-ase-assertion-with-side-effect-method"></a>

### `spotbugs/ASE_ASSERTION_WITH_SIDE_EFFECT_METHOD`

A SpotBugs security pattern, `ASE_ASSERTION_WITH_SIDE_EFFECT_METHOD`.

- **Why it is on:** SpotBugs reports code that untrusted input can exploit, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Call the mutating method outside the assert, keep the result in a local, and assert on that local.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ASE_ASSERTION_WITH_SIDE_EFFECT_METHOD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ase-method-invoked-in-assertion-may-produce-a-side-effect-ase-assertion-with-side-effect-method)

<a id="spotbugs-at-nonatomic-64bit-primitive"></a>

### `spotbugs/AT_NONATOMIC_64BIT_PRIMITIVE`

A SpotBugs multithreaded correctness pattern, `AT_NONATOMIC_64BIT_PRIMITIVE`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Make the long or double field volatile, use AtomicLong, or guard every read and write with the same lock.
- **Exception:** If this is intended, add `{"rule":"spotbugs/AT_NONATOMIC_64BIT_PRIMITIVE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#at-this-write-of-this-64-bit-primitive-variable-may-not-atomic-at-nonatomic-64bit-primitive)

<a id="spotbugs-at-nonatomic-operations-on-shared-variable"></a>

### `spotbugs/AT_NONATOMIC_OPERATIONS_ON_SHARED_VARIABLE`

A SpotBugs multithreaded correctness pattern, `AT_NONATOMIC_OPERATIONS_ON_SHARED_VARIABLE`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use AtomicInteger or AtomicReference (incrementAndGet, updateAndGet), or hold one lock across the whole read-modify-write.
- **Exception:** If this is intended, add `{"rule":"spotbugs/AT_NONATOMIC_OPERATIONS_ON_SHARED_VARIABLE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#at-operation-on-shared-variable-is-not-atomic-at-nonatomic-operations-on-shared-variable)

<a id="spotbugs-at-operation-sequence-on-concurrent-abstraction"></a>

### `spotbugs/AT_OPERATION_SEQUENCE_ON_CONCURRENT_ABSTRACTION`

A SpotBugs multithreaded correctness pattern, `AT_OPERATION_SEQUENCE_ON_CONCURRENT_ABSTRACTION`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Replace the check-then-act on the concurrent map with one atomic call: putIfAbsent, computeIfAbsent, compute or merge.
- **Exception:** If this is intended, add `{"rule":"spotbugs/AT_OPERATION_SEQUENCE_ON_CONCURRENT_ABSTRACTION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#at-sequence-of-calls-to-concurrent-abstraction-may-not-be-atomic-at-operation-sequence-on-concurrent-abstraction)

<a id="spotbugs-at-stale-thread-write-of-primitive"></a>

### `spotbugs/AT_STALE_THREAD_WRITE_OF_PRIMITIVE`

A SpotBugs multithreaded correctness pattern, `AT_STALE_THREAD_WRITE_OF_PRIMITIVE`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Make the field volatile or an atomic type, or guard every read and write of it with the same lock.
- **Exception:** If this is intended, add `{"rule":"spotbugs/AT_STALE_THREAD_WRITE_OF_PRIMITIVE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#at-this-write-of-this-shared-primitive-variable-may-not-be-visible-to-other-threads-at-stale-thread-write-of-primitive)

<a id="spotbugs-at-unsafe-resource-access-in-thread"></a>

### `spotbugs/AT_UNSAFE_RESOURCE_ACCESS_IN_THREAD`

A SpotBugs multithreaded correctness pattern, `AT_UNSAFE_RESOURCE_ACCESS_IN_THREAD`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Guard the shared resource with one lock around each use, or open a separate instance per thread in try-with-resources.
- **Exception:** If this is intended, add `{"rule":"spotbugs/AT_UNSAFE_RESOURCE_ACCESS_IN_THREAD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#at-operation-on-resource-is-not-safe-in-a-multithreaded-context-at-unsafe-resource-access-in-thread)

<a id="spotbugs-bac-bad-applet-constructor"></a>

### `spotbugs/BAC_BAD_APPLET_CONSTRUCTOR`

A SpotBugs correctness pattern, `BAC_BAD_APPLET_CONSTRUCTOR`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Move the work that needs the AppletStub (getParameter, getCodeBase, getDocumentBase) out of the constructor into init().
- **Exception:** If this is intended, add `{"rule":"spotbugs/BAC_BAD_APPLET_CONSTRUCTOR","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#bac-bad-applet-constructor-relies-on-uninitialized-appletstub-bac-bad-applet-constructor)

<a id="spotbugs-bc-bad-cast-to-abstract-collection"></a>

### `spotbugs/BC_BAD_CAST_TO_ABSTRACT_COLLECTION`

A SpotBugs dodgy code pattern, `BC_BAD_CAST_TO_ABSTRACT_COLLECTION`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Declare the parameter or return type as List, Set or Map instead of Collection, or copy with List.copyOf(c) rather than casting.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BC_BAD_CAST_TO_ABSTRACT_COLLECTION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#bc-questionable-cast-to-abstract-collection-bc-bad-cast-to-abstract-collection)

<a id="spotbugs-bc-bad-cast-to-concrete-collection"></a>

### `spotbugs/BC_BAD_CAST_TO_CONCRETE_COLLECTION`

A SpotBugs dodgy code pattern, `BC_BAD_CAST_TO_CONCRETE_COLLECTION`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Declare the type as the interface (List, Set, Map) and drop the cast to ArrayList or HashMap.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BC_BAD_CAST_TO_CONCRETE_COLLECTION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#bc-questionable-cast-to-concrete-collection-bc-bad-cast-to-concrete-collection)

<a id="spotbugs-bc-equals-method-should-work-for-all-objects"></a>

### `spotbugs/BC_EQUALS_METHOD_SHOULD_WORK_FOR_ALL_OBJECTS`

A SpotBugs bad practice pattern, `BC_EQUALS_METHOD_SHOULD_WORK_FOR_ALL_OBJECTS`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Start equals with a pattern-matching instanceof check and return false for other types instead of casting or throwing.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BC_EQUALS_METHOD_SHOULD_WORK_FOR_ALL_OBJECTS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#bc-equals-method-should-not-assume-anything-about-the-type-of-its-argument-bc-equals-method-should-work-for-all-objects)

<a id="spotbugs-bc-impossible-cast"></a>

### `spotbugs/BC_IMPOSSIBLE_CAST`

A SpotBugs correctness pattern, `BC_IMPOSSIBLE_CAST`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove the cast or fix the variable's declared type so the cast can succeed; otherwise it always throws ClassCastException.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BC_IMPOSSIBLE_CAST","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#bc-impossible-cast-bc-impossible-cast)

<a id="spotbugs-bc-impossible-cast-primitive-array"></a>

### `spotbugs/BC_IMPOSSIBLE_CAST_PRIMITIVE_ARRAY`

A SpotBugs correctness pattern, `BC_IMPOSSIBLE_CAST_PRIMITIVE_ARRAY`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Cast to the array type the value really has, or change the declared type; a primitive array never casts to another array type.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BC_IMPOSSIBLE_CAST_PRIMITIVE_ARRAY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#bc-impossible-cast-involving-primitive-array-bc-impossible-cast-primitive-array)

<a id="spotbugs-bc-impossible-downcast"></a>

### `spotbugs/BC_IMPOSSIBLE_DOWNCAST`

A SpotBugs correctness pattern, `BC_IMPOSSIBLE_DOWNCAST`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Drop the downcast or build the value as the subtype; check the runtime type with instanceof pattern matching before casting.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BC_IMPOSSIBLE_DOWNCAST","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#bc-impossible-downcast-bc-impossible-downcast)

<a id="spotbugs-bc-impossible-downcast-of-toarray"></a>

### `spotbugs/BC_IMPOSSIBLE_DOWNCAST_OF_TOARRAY`

A SpotBugs correctness pattern, `BC_IMPOSSIBLE_DOWNCAST_OF_TOARRAY`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Call toArray(new String[0]) with a typed array argument instead of casting the Object[] result.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BC_IMPOSSIBLE_DOWNCAST_OF_TOARRAY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#bc-impossible-downcast-of-toarray-result-bc-impossible-downcast-of-toarray)

<a id="spotbugs-bc-impossible-instanceof"></a>

### `spotbugs/BC_IMPOSSIBLE_INSTANCEOF`

A SpotBugs correctness pattern, `BC_IMPOSSIBLE_INSTANCEOF`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Delete the instanceof test or fix the types; the compared types are unrelated, so the check is always false.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BC_IMPOSSIBLE_INSTANCEOF","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#bc-instanceof-will-always-return-false-bc-impossible-instanceof)

<a id="spotbugs-bc-unconfirmed-cast"></a>

### `spotbugs/BC_UNCONFIRMED_CAST`

A SpotBugs dodgy code pattern, `BC_UNCONFIRMED_CAST`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Guard the cast with a pattern instanceof (if (o instanceof Foo foo)), or change the declared type so no cast is needed.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BC_UNCONFIRMED_CAST","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#bc-unchecked-unconfirmed-cast-bc-unconfirmed-cast)

<a id="spotbugs-bc-unconfirmed-cast-of-return-value"></a>

### `spotbugs/BC_UNCONFIRMED_CAST_OF_RETURN_VALUE`

A SpotBugs dodgy code pattern, `BC_UNCONFIRMED_CAST_OF_RETURN_VALUE`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Check the returned value with a pattern instanceof before using it as the subtype, or make the method return the subtype.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BC_UNCONFIRMED_CAST_OF_RETURN_VALUE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#bc-unchecked-unconfirmed-cast-of-return-value-from-method-bc-unconfirmed-cast-of-return-value)

<a id="spotbugs-bc-vacuous-instanceof"></a>

### `spotbugs/BC_VACUOUS_INSTANCEOF`

A SpotBugs dodgy code pattern, `BC_VACUOUS_INSTANCEOF`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove the instanceof test, since the static type already guarantees it; use == null if a null check was meant.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BC_VACUOUS_INSTANCEOF","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#bc-instanceof-will-always-return-true-bc-vacuous-instanceof)

<a id="spotbugs-bit-add-of-signed-byte"></a>

### `spotbugs/BIT_ADD_OF_SIGNED_BYTE`

A SpotBugs correctness pattern, `BIT_ADD_OF_SIGNED_BYTE`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Mask the byte before combining: (b & 0xFF) in the addition or OR.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BIT_ADD_OF_SIGNED_BYTE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#bit-bitwise-add-of-signed-byte-value-bit-add-of-signed-byte)

<a id="spotbugs-bit-and"></a>

### `spotbugs/BIT_AND`

A SpotBugs correctness pattern, `BIT_AND`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Fix the mask or the compared constant so the test can match; then compare (flags & MASK) != 0 for a membership check.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BIT_AND","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#bit-incompatible-bit-masks-bit-and)

<a id="spotbugs-bit-and-zz"></a>

### `spotbugs/BIT_AND_ZZ`

A SpotBugs correctness pattern, `BIT_AND_ZZ`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** The mask is 0, so (e & 0) == 0 is always true: use the intended non-zero mask, or delete the test.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BIT_AND_ZZ","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#bit-check-to-see-if-0-0-bit-and-zz)

<a id="spotbugs-bit-ior"></a>

### `spotbugs/BIT_IOR`

A SpotBugs correctness pattern, `BIT_IOR`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use & to test bits, (flags & MASK) != 0, and parenthesize mixed expressions like (e & (A | B)) == C.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BIT_IOR","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#bit-incompatible-bit-masks-bit-ior)

<a id="spotbugs-bit-ior-of-signed-byte"></a>

### `spotbugs/BIT_IOR_OF_SIGNED_BYTE`

A SpotBugs correctness pattern, `BIT_IOR_OF_SIGNED_BYTE`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Mask the byte before ORing it into a wider value: (b & 0xFF) \<\< 8 | (c & 0xFF).
- **Exception:** If this is intended, add `{"rule":"spotbugs/BIT_IOR_OF_SIGNED_BYTE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#bit-bitwise-or-of-signed-byte-value-bit-ior-of-signed-byte)

<a id="spotbugs-bit-signed-check"></a>

### `spotbugs/BIT_SIGNED_CHECK`

A SpotBugs bad practice pattern, `BIT_SIGNED_CHECK`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Compare the masked value against 0 with != 0, not > 0, because the sign bit makes > 0 wrong: (flags & MASK) != 0.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BIT_SIGNED_CHECK","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#bit-check-for-sign-of-bitwise-operation-bit-signed-check)

<a id="spotbugs-bit-signed-check-high-bit"></a>

### `spotbugs/BIT_SIGNED_CHECK_HIGH_BIT`

A SpotBugs correctness pattern, `BIT_SIGNED_CHECK_HIGH_BIT`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Test the bit with (x & MASK) != 0 instead of > 0, since the mask's high bit makes the result negative.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BIT_SIGNED_CHECK_HIGH_BIT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#bit-check-for-sign-of-bitwise-operation-involving-negative-number-bit-signed-check-high-bit)

<a id="spotbugs-boa-badly-overridden-adapter"></a>

### `spotbugs/BOA_BADLY_OVERRIDDEN_ADAPTER`

A SpotBugs correctness pattern, `BOA_BADLY_OVERRIDDEN_ADAPTER`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Fix the method signature so it overrides the listener adapter method, and add @Override so the compiler checks it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BOA_BADLY_OVERRIDDEN_ADAPTER","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#boa-class-overrides-a-method-implemented-in-super-class-adapter-wrongly-boa-badly-overridden-adapter)

<a id="spotbugs-bshift-wrong-add-priority"></a>

### `spotbugs/BSHIFT_WRONG_ADD_PRIORITY`

A SpotBugs correctness pattern, `BSHIFT_WRONG_ADD_PRIORITY`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Add parentheses to say which you mean: (a \<\< 8) + b or a \<\< (8 + b); + binds tighter than \<\<.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BSHIFT_WRONG_ADD_PRIORITY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#bshift-possible-bad-parsing-of-shift-operation-bshift-wrong-add-priority)

<a id="spotbugs-bx-boxing-immediately-unboxed"></a>

### `spotbugs/BX_BOXING_IMMEDIATELY_UNBOXED`

A SpotBugs performance pattern, `BX_BOXING_IMMEDIATELY_UNBOXED`.

- **Why it is on:** SpotBugs reports code that is correct but needlessly slow or wasteful, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use the primitive directly (Integer.parseInt, an int variable) instead of boxing a value and calling intValue() on it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BX_BOXING_IMMEDIATELY_UNBOXED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#bx-primitive-value-is-boxed-and-then-immediately-unboxed-bx-boxing-immediately-unboxed)

<a id="spotbugs-bx-boxing-immediately-unboxed-to-perform-coercion"></a>

### `spotbugs/BX_BOXING_IMMEDIATELY_UNBOXED_TO_PERFORM_COERCION`

A SpotBugs performance pattern, `BX_BOXING_IMMEDIATELY_UNBOXED_TO_PERFORM_COERCION`.

- **Why it is on:** SpotBugs reports code that is correct but needlessly slow or wasteful, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Convert with a cast such as (double) count instead of boxing and unboxing the value.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BX_BOXING_IMMEDIATELY_UNBOXED_TO_PERFORM_COERCION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#bx-primitive-value-is-boxed-then-unboxed-to-perform-primitive-coercion-bx-boxing-immediately-unboxed-to-perform-coercion)

<a id="spotbugs-bx-unboxed-and-coerced-for-ternary-operator"></a>

### `spotbugs/BX_UNBOXED_AND_COERCED_FOR_TERNARY_OPERATOR`

A SpotBugs performance pattern, `BX_UNBOXED_AND_COERCED_FOR_TERNARY_OPERATOR`.

- **Why it is on:** SpotBugs reports code that is correct but needlessly slow or wasteful, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Give both ternary branches the same type, all boxed or all primitive, so no hidden unboxing or numeric promotion happens.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BX_UNBOXED_AND_COERCED_FOR_TERNARY_OPERATOR","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#bx-primitive-value-is-unboxed-and-coerced-for-ternary-operator-bx-unboxed-and-coerced-for-ternary-operator)

<a id="spotbugs-bx-unboxing-immediately-reboxed"></a>

### `spotbugs/BX_UNBOXING_IMMEDIATELY_REBOXED`

A SpotBugs performance pattern, `BX_UNBOXING_IMMEDIATELY_REBOXED`.

- **Why it is on:** SpotBugs reports code that is correct but needlessly slow or wasteful, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Keep the value as the boxed type and pass it along; do not call intValue() and box it again.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BX_UNBOXING_IMMEDIATELY_REBOXED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#bx-boxed-value-is-unboxed-and-then-immediately-reboxed-bx-unboxing-immediately-reboxed)

<a id="spotbugs-caa-covariant-array-element-store"></a>

### `spotbugs/CAA_COVARIANT_ARRAY_ELEMENT_STORE`

A SpotBugs correctness pattern, `CAA_COVARIANT_ARRAY_ELEMENT_STORE`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use a List\<T> or an array of the exact element type so stores cannot hit ArrayStoreException.
- **Exception:** If this is intended, add `{"rule":"spotbugs/CAA_COVARIANT_ARRAY_ELEMENT_STORE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#caa-possibly-incompatible-element-is-stored-in-covariant-array-caa-covariant-array-element-store)

<a id="spotbugs-caa-covariant-array-field"></a>

### `spotbugs/CAA_COVARIANT_ARRAY_FIELD`

A SpotBugs dodgy code pattern, `CAA_COVARIANT_ARRAY_FIELD`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Declare the field with the element type you actually store (String[], not Object[]), or hold a List instead of an array.
- **Exception:** If this is intended, add `{"rule":"spotbugs/CAA_COVARIANT_ARRAY_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#caa-covariant-array-assignment-to-a-field-caa-covariant-array-field)

<a id="spotbugs-caa-covariant-array-local"></a>

### `spotbugs/CAA_COVARIANT_ARRAY_LOCAL`

A SpotBugs dodgy code pattern, `CAA_COVARIANT_ARRAY_LOCAL`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Declare the local with the element type you actually store (String[], not Object[]), or use a List.
- **Exception:** If this is intended, add `{"rule":"spotbugs/CAA_COVARIANT_ARRAY_LOCAL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#caa-covariant-array-assignment-to-a-local-variable-caa-covariant-array-local)

<a id="spotbugs-caa-covariant-array-return"></a>

### `spotbugs/CAA_COVARIANT_ARRAY_RETURN`

A SpotBugs dodgy code pattern, `CAA_COVARIANT_ARRAY_RETURN`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Declare the return type with the element type you actually return (String[], not Object[]), or return a List.
- **Exception:** If this is intended, add `{"rule":"spotbugs/CAA_COVARIANT_ARRAY_RETURN","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#caa-covariant-array-is-returned-from-the-method-caa-covariant-array-return)

<a id="spotbugs-cd-circular-dependency"></a>

### `spotbugs/CD_CIRCULAR_DEPENDENCY`

A SpotBugs dodgy code pattern, `CD_CIRCULAR_DEPENDENCY`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Break the cycle: move the shared logic into a third class or behind an interface that both classes depend on.
- **Exception:** If this is intended, add `{"rule":"spotbugs/CD_CIRCULAR_DEPENDENCY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#cd-test-for-circular-dependencies-among-classes-cd-circular-dependency)

<a id="spotbugs-ci-confused-inheritance"></a>

### `spotbugs/CI_CONFUSED_INHERITANCE`

A SpotBugs dodgy code pattern, `CI_CONFUSED_INHERITANCE`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Make the protected member of the final class private, since nothing can inherit it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/CI_CONFUSED_INHERITANCE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ci-class-is-final-but-declares-protected-field-ci-confused-inheritance)

<a id="spotbugs-cn-idiom"></a>

### `spotbugs/CN_IDIOM`

A SpotBugs bad practice pattern, `CN_IDIOM`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove implements Cloneable and offer a copy constructor or static copy factory; if clone is needed, override it calling super.clone().
- **Exception:** If this is intended, add `{"rule":"spotbugs/CN_IDIOM","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#cn-class-implements-cloneable-but-does-not-define-or-use-clone-method-cn-idiom)

<a id="spotbugs-cn-idiom-no-super-call"></a>

### `spotbugs/CN_IDIOM_NO_SUPER_CALL`

A SpotBugs bad practice pattern, `CN_IDIOM_NO_SUPER_CALL`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Obtain the copy through super.clone() in clone, or drop clone and use a copy constructor.
- **Exception:** If this is intended, add `{"rule":"spotbugs/CN_IDIOM_NO_SUPER_CALL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#cn-clone-method-does-not-call-super-clone-cn-idiom-no-super-call)

<a id="spotbugs-cn-implements-clone-but-not-cloneable"></a>

### `spotbugs/CN_IMPLEMENTS_CLONE_BUT_NOT_CLONEABLE`

A SpotBugs bad practice pattern, `CN_IMPLEMENTS_CLONE_BUT_NOT_CLONEABLE`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Replace clone with a copy constructor or static factory, or declare implements Cloneable and call super.clone().
- **Exception:** If this is intended, add `{"rule":"spotbugs/CN_IMPLEMENTS_CLONE_BUT_NOT_CLONEABLE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#cn-class-defines-clone-but-doesn-t-implement-cloneable-cn-implements-clone-but-not-cloneable)

<a id="spotbugs-cnt-rough-constant-value"></a>

### `spotbugs/CNT_ROUGH_CONSTANT_VALUE`

A SpotBugs bad practice pattern, `CNT_ROUGH_CONSTANT_VALUE`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use the exact constant, such as Math.PI or Math.E, instead of a rounded literal.
- **Exception:** If this is intended, add `{"rule":"spotbugs/CNT_ROUGH_CONSTANT_VALUE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#cnt-rough-value-of-known-constant-found-cnt-rough-constant-value)

<a id="spotbugs-co-abstract-self"></a>

### `spotbugs/CO_ABSTRACT_SELF`

A SpotBugs bad practice pattern, `CO_ABSTRACT_SELF`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Declare the abstract class implements Comparable\<ItsType>, so compareTo(ItsType) overrides it, and mark it @Override.
- **Exception:** If this is intended, add `{"rule":"spotbugs/CO_ABSTRACT_SELF","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#co-abstract-class-defines-covariant-compareto-method-co-abstract-self)

<a id="spotbugs-co-compareto-incorrect-floating"></a>

### `spotbugs/CO_COMPARETO_INCORRECT_FLOATING`

A SpotBugs bad practice pattern, `CO_COMPARETO_INCORRECT_FLOATING`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Compare floating-point values with Double.compare or Float.compare, not by subtracting or casting the difference to int.
- **Exception:** If this is intended, add `{"rule":"spotbugs/CO_COMPARETO_INCORRECT_FLOATING","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#co-compareto-compare-incorrectly-handles-float-or-double-value-co-compareto-incorrect-floating)

<a id="spotbugs-co-compareto-results-min-value"></a>

### `spotbugs/CO_COMPARETO_RESULTS_MIN_VALUE`

A SpotBugs bad practice pattern, `CO_COMPARETO_RESULTS_MIN_VALUE`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Return -1, 0 or 1, or use Integer.compare, instead of Integer.MIN_VALUE from compareTo.
- **Exception:** If this is intended, add `{"rule":"spotbugs/CO_COMPARETO_RESULTS_MIN_VALUE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#co-compareto-compare-returns-integer-min-value-co-compareto-results-min-value)

<a id="spotbugs-co-self-no-object"></a>

### `spotbugs/CO_SELF_NO_OBJECT`

A SpotBugs bad practice pattern, `CO_SELF_NO_OBJECT`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Declare implements Comparable\<Foo>, so compareTo(Foo) overrides the interface method, and mark it @Override.
- **Exception:** If this is intended, add `{"rule":"spotbugs/CO_SELF_NO_OBJECT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#co-covariant-compareto-method-defined-co-self-no-object)

<a id="spotbugs-ct-constructor-throw"></a>

### `spotbugs/CT_CONSTRUCTOR_THROW`

A SpotBugs bad practice pattern, `CT_CONSTRUCTOR_THROW`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Make the class final (records already are), or validate in a static factory method before calling a private constructor.
- **Exception:** If this is intended, add `{"rule":"spotbugs/CT_CONSTRUCTOR_THROW","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ct-be-wary-of-letting-constructors-throw-exceptions-ct-constructor-throw)

<a id="spotbugs-db-duplicate-branches"></a>

### `spotbugs/DB_DUPLICATE_BRANCHES`

A SpotBugs dodgy code pattern, `DB_DUPLICATE_BRANCHES`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Drop the condition and keep one copy of the code, or fix the branch that was meant to differ.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DB_DUPLICATE_BRANCHES","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#db-method-uses-the-same-code-for-two-branches-db-duplicate-branches)

<a id="spotbugs-db-duplicate-switch-clauses"></a>

### `spotbugs/DB_DUPLICATE_SWITCH_CLAUSES`

A SpotBugs dodgy code pattern, `DB_DUPLICATE_SWITCH_CLAUSES`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Merge the identical cases into one arrow label (case A, B -> ...), or fix the clause that was meant to differ.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DB_DUPLICATE_SWITCH_CLAUSES","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#db-method-uses-the-same-code-for-two-switch-clauses-db-duplicate-switch-clauses)

<a id="spotbugs-dc-doublecheck"></a>

### `spotbugs/DC_DOUBLECHECK`

A SpotBugs multithreaded correctness pattern, `DC_DOUBLECHECK`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use an eager static final field or a holder class for lazy init, or make the field volatile; do not rely on an unsynchronized first check.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DC_DOUBLECHECK","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dc-possible-double-check-of-field-dc-doublecheck)

<a id="spotbugs-dc-partially-constructed"></a>

### `spotbugs/DC_PARTIALLY_CONSTRUCTED`

A SpotBugs multithreaded correctness pattern, `DC_PARTIALLY_CONSTRUCTED`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Build the object in a local variable and assign it to the field last, and make that field volatile.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DC_PARTIALLY_CONSTRUCTED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dc-possible-exposure-of-partially-initialized-object-dc-partially-constructed)

<a id="spotbugs-dcn-nullpointer-exception"></a>

### `spotbugs/DCN_NULLPOINTER_EXCEPTION`

A SpotBugs dodgy code pattern, `DCN_NULLPOINTER_EXCEPTION`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Test the reference with an explicit null check, or Objects.requireNonNull at the entry, instead of catching NullPointerException.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DCN_NULLPOINTER_EXCEPTION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dcn-nullpointerexception-caught-dcn-nullpointer-exception)

<a id="spotbugs-de-might-drop"></a>

### `spotbugs/DE_MIGHT_DROP`

A SpotBugs bad practice pattern, `DE_MIGHT_DROP`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Handle the exception: log it, return a failure value, or rethrow wrapped as new IllegalStateException(msg, e).
- **Exception:** If this is intended, add `{"rule":"spotbugs/DE_MIGHT_DROP","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#de-method-might-drop-exception-de-might-drop)

<a id="spotbugs-de-might-ignore"></a>

### `spotbugs/DE_MIGHT_IGNORE`

A SpotBugs bad practice pattern, `DE_MIGHT_IGNORE`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Handle the exception: log it, return a failure value, or rethrow wrapped as new IllegalStateException(msg, e).
- **Exception:** If this is intended, add `{"rule":"spotbugs/DE_MIGHT_IGNORE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#de-method-might-ignore-exception-de-might-ignore)

<a id="spotbugs-dl-synchronization-on-boolean"></a>

### `spotbugs/DL_SYNCHRONIZATION_ON_BOOLEAN`

A SpotBugs multithreaded correctness pattern, `DL_SYNCHRONIZATION_ON_BOOLEAN`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Synchronize on a private final Object lock = new Object() field instead of a Boolean.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DL_SYNCHRONIZATION_ON_BOOLEAN","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dl-synchronization-on-boolean-dl-synchronization-on-boolean)

<a id="spotbugs-dl-synchronization-on-boxed-primitive"></a>

### `spotbugs/DL_SYNCHRONIZATION_ON_BOXED_PRIMITIVE`

A SpotBugs multithreaded correctness pattern, `DL_SYNCHRONIZATION_ON_BOXED_PRIMITIVE`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Synchronize on a private final Object lock = new Object() field instead of a boxed number that may be shared.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DL_SYNCHRONIZATION_ON_BOXED_PRIMITIVE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dl-synchronization-on-boxed-primitive-dl-synchronization-on-boxed-primitive)

<a id="spotbugs-dl-synchronization-on-interned-string"></a>

### `spotbugs/DL_SYNCHRONIZATION_ON_INTERNED_STRING`

A SpotBugs multithreaded correctness pattern, `DL_SYNCHRONIZATION_ON_INTERNED_STRING`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Synchronize on a private final Object lock = new Object() field instead of a String literal or interned string.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DL_SYNCHRONIZATION_ON_INTERNED_STRING","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dl-synchronization-on-interned-string-dl-synchronization-on-interned-string)

<a id="spotbugs-dl-synchronization-on-shared-constant"></a>

### `spotbugs/DL_SYNCHRONIZATION_ON_SHARED_CONSTANT`

A SpotBugs multithreaded correctness pattern, `DL_SYNCHRONIZATION_ON_SHARED_CONSTANT`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Synchronize on a private final Object lock = new Object() field instead of a constant other code can also reach.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DL_SYNCHRONIZATION_ON_SHARED_CONSTANT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dl-synchronization-on-string-literal-dl-synchronization-on-shared-constant)

<a id="spotbugs-dl-synchronization-on-unshared-boxed-primitive"></a>

### `spotbugs/DL_SYNCHRONIZATION_ON_UNSHARED_BOXED_PRIMITIVE`

A SpotBugs multithreaded correctness pattern, `DL_SYNCHRONIZATION_ON_UNSHARED_BOXED_PRIMITIVE`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Synchronize on a private final Object lock = new Object() field instead of a boxed number whose identity changes on reassignment.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DL_SYNCHRONIZATION_ON_UNSHARED_BOXED_PRIMITIVE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dl-synchronization-on-boxed-primitive-values-dl-synchronization-on-unshared-boxed-primitive)

<a id="spotbugs-dls-dead-local-increment-in-return"></a>

### `spotbugs/DLS_DEAD_LOCAL_INCREMENT_IN_RETURN`

A SpotBugs correctness pattern, `DLS_DEAD_LOCAL_INCREMENT_IN_RETURN`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Return the new value with return i + 1; or increment the field, not a local that is discarded.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DLS_DEAD_LOCAL_INCREMENT_IN_RETURN","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dls-useless-increment-in-return-statement-dls-dead-local-increment-in-return)

<a id="spotbugs-dls-dead-local-store"></a>

### `spotbugs/DLS_DEAD_LOCAL_STORE`

A SpotBugs dodgy code pattern, `DLS_DEAD_LOCAL_STORE`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Delete the assignment whose value is never read, or use the value; keep just the call if its side effect is needed.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DLS_DEAD_LOCAL_STORE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dls-dead-store-to-local-variable-dls-dead-local-store)

<a id="spotbugs-dls-dead-local-store-in-return"></a>

### `spotbugs/DLS_DEAD_LOCAL_STORE_IN_RETURN`

A SpotBugs dodgy code pattern, `DLS_DEAD_LOCAL_STORE_IN_RETURN`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Return the expression directly instead of assigning it to a local that is then not used.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DLS_DEAD_LOCAL_STORE_IN_RETURN","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dls-useless-assignment-in-return-statement-dls-dead-local-store-in-return)

<a id="spotbugs-dls-dead-local-store-of-null"></a>

### `spotbugs/DLS_DEAD_LOCAL_STORE_OF_NULL`

A SpotBugs dodgy code pattern, `DLS_DEAD_LOCAL_STORE_OF_NULL`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Delete the assignment of null to the local; narrow the variable's scope so it goes out of scope by itself.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DLS_DEAD_LOCAL_STORE_OF_NULL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dls-dead-store-of-null-to-local-variable-dls-dead-local-store-of-null)

<a id="spotbugs-dls-dead-local-store-shadows-field"></a>

### `spotbugs/DLS_DEAD_LOCAL_STORE_SHADOWS_FIELD`

A SpotBugs dodgy code pattern, `DLS_DEAD_LOCAL_STORE_SHADOWS_FIELD`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Assign the field as this.name, or rename the local so it no longer hides the field.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DLS_DEAD_LOCAL_STORE_SHADOWS_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dls-dead-store-to-local-variable-that-shadows-field-dls-dead-local-store-shadows-field)

<a id="spotbugs-dls-dead-store-of-class-literal"></a>

### `spotbugs/DLS_DEAD_STORE_OF_CLASS_LITERAL`

A SpotBugs correctness pattern, `DLS_DEAD_STORE_OF_CLASS_LITERAL`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Delete the unused assignment of the class literal; to force class initialization use Class.forName(name, true, loader).
- **Exception:** If this is intended, add `{"rule":"spotbugs/DLS_DEAD_STORE_OF_CLASS_LITERAL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dls-dead-store-of-class-literal-dls-dead-store-of-class-literal)

<a id="spotbugs-dls-overwritten-increment"></a>

### `spotbugs/DLS_OVERWRITTEN_INCREMENT`

A SpotBugs correctness pattern, `DLS_OVERWRITTEN_INCREMENT`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Write i++ alone, not i = i++; the assignment overwrites the increment.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DLS_OVERWRITTEN_INCREMENT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dls-overwritten-increment-dls-overwritten-increment)

<a id="spotbugs-dm-boolean-ctor"></a>

### `spotbugs/DM_BOOLEAN_CTOR`

A SpotBugs performance pattern, `DM_BOOLEAN_CTOR`.

- **Why it is on:** SpotBugs reports code that is correct but needlessly slow or wasteful, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** See the tool's documentation: [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dm-method-invokes-inefficient-boolean-constructor-use-boolean-valueof-instead-dm-boolean-ctor).
- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_BOOLEAN_CTOR","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dm-method-invokes-inefficient-boolean-constructor-use-boolean-valueof-instead-dm-boolean-ctor)

<a id="spotbugs-dm-boxed-primitive-for-compare"></a>

### `spotbugs/DM_BOXED_PRIMITIVE_FOR_COMPARE`

A SpotBugs performance pattern, `DM_BOXED_PRIMITIVE_FOR_COMPARE`.

- **Why it is on:** SpotBugs reports code that is correct but needlessly slow or wasteful, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Compare primitives with Integer.compare(a, b) or Double.compare(a, b) instead of boxing one side to call compareTo.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_BOXED_PRIMITIVE_FOR_COMPARE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#bx-boxing-a-primitive-to-compare-dm-boxed-primitive-for-compare)

<a id="spotbugs-dm-boxed-primitive-for-parsing"></a>

### `spotbugs/DM_BOXED_PRIMITIVE_FOR_PARSING`

A SpotBugs performance pattern, `DM_BOXED_PRIMITIVE_FOR_PARSING`.

- **Why it is on:** SpotBugs reports code that is correct but needlessly slow or wasteful, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Call the primitive parser, such as Integer.parseInt(s), instead of Integer.valueOf(s) followed by intValue().
- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_BOXED_PRIMITIVE_FOR_PARSING","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#bx-boxing-unboxing-to-parse-a-primitive-dm-boxed-primitive-for-parsing)

<a id="spotbugs-dm-boxed-primitive-tostring"></a>

### `spotbugs/DM_BOXED_PRIMITIVE_TOSTRING`

A SpotBugs performance pattern, `DM_BOXED_PRIMITIVE_TOSTRING`.

- **Why it is on:** SpotBugs reports code that is correct but needlessly slow or wasteful, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Call the static Integer.toString(x) or String.valueOf(x) instead of boxing the value to call toString().
- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_BOXED_PRIMITIVE_TOSTRING","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#bx-method-allocates-a-boxed-primitive-just-to-call-tostring-dm-boxed-primitive-tostring)

<a id="spotbugs-dm-convert-case"></a>

### `spotbugs/DM_CONVERT_CASE`

A SpotBugs internationalization pattern, `DM_CONVERT_CASE`.

- **Why it is on:** SpotBugs reports code that depends on the default locale or encoding, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Pass a locale: s.toUpperCase(Locale.ROOT) or s.toLowerCase(Locale.ROOT).
- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_CONVERT_CASE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dm-consider-using-locale-parameterized-version-of-invoked-method-dm-convert-case)

<a id="spotbugs-dm-default-encoding"></a>

### `spotbugs/DM_DEFAULT_ENCODING`

A SpotBugs internationalization pattern, `DM_DEFAULT_ENCODING`.

- **Why it is on:** SpotBugs reports code that depends on the default locale or encoding, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Pass a charset explicitly, such as StandardCharsets.UTF_8 to getBytes, InputStreamReader, FileReader or new String.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_DEFAULT_ENCODING","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dm-reliance-on-default-encoding-dm-default-encoding)

<a id="spotbugs-dm-exit"></a>

### `spotbugs/DM_EXIT`

A SpotBugs bad practice pattern, `DM_EXIT`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Return a result or throw an exception and let main alone decide the exit status.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_EXIT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dm-method-invokes-system-exit-dm-exit)

<a id="spotbugs-dm-fp-number-ctor"></a>

### `spotbugs/DM_FP_NUMBER_CTOR`

A SpotBugs performance pattern, `DM_FP_NUMBER_CTOR`.

- **Why it is on:** SpotBugs reports code that is correct but needlessly slow or wasteful, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use Double.valueOf(x) or Float.valueOf(x), or keep the primitive, instead of the Double or Float constructor.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_FP_NUMBER_CTOR","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#bx-method-invokes-inefficient-floating-point-number-constructor-use-static-valueof-instead-dm-fp-number-ctor)

<a id="spotbugs-dm-gc"></a>

### `spotbugs/DM_GC`

A SpotBugs performance pattern, `DM_GC`.

- **Why it is on:** SpotBugs reports code that is correct but needlessly slow or wasteful, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Delete the System.gc() or Runtime.gc() call and let the JVM schedule collection.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_GC","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dm-explicit-garbage-collection-extremely-dubious-except-in-benchmarking-code-dm-gc)

<a id="spotbugs-dm-invalid-min-max"></a>

### `spotbugs/DM_INVALID_MIN_MAX`

A SpotBugs correctness pattern, `DM_INVALID_MIN_MAX`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Swap the clamp so the lower bound goes in Math.max and the upper in Math.min: Math.max(lo, Math.min(hi, x)).
- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_INVALID_MIN_MAX","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dm-incorrect-combination-of-math-max-and-math-min-dm-invalid-min-max)

<a id="spotbugs-dm-monitor-wait-on-condition"></a>

### `spotbugs/DM_MONITOR_WAIT_ON_CONDITION`

A SpotBugs multithreaded correctness pattern, `DM_MONITOR_WAIT_ON_CONDITION`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Call await() on the Condition instead of wait(), which waits on the Condition object's own monitor.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_MONITOR_WAIT_ON_CONDITION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dm-monitor-wait-called-on-condition-dm-monitor-wait-on-condition)

<a id="spotbugs-dm-new-for-getclass"></a>

### `spotbugs/DM_NEW_FOR_GETCLASS`

A SpotBugs performance pattern, `DM_NEW_FOR_GETCLASS`.

- **Why it is on:** SpotBugs reports code that is correct but needlessly slow or wasteful, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Write Foo.class, or call getClass() on an object you already have, instead of creating an object only to call getClass().
- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_NEW_FOR_GETCLASS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dm-method-allocates-an-object-only-to-get-the-class-object-dm-new-for-getclass)

<a id="spotbugs-dm-nextint-via-nextdouble"></a>

### `spotbugs/DM_NEXTINT_VIA_NEXTDOUBLE`

A SpotBugs performance pattern, `DM_NEXTINT_VIA_NEXTDOUBLE`.

- **Why it is on:** SpotBugs reports code that is correct but needlessly slow or wasteful, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Call random.nextInt(n) instead of (int) (random.nextDouble() \* n).
- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_NEXTINT_VIA_NEXTDOUBLE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dm-use-the-nextint-method-of-random-rather-than-nextdouble-to-generate-a-random-integer-dm-nextint-via-nextdouble)

<a id="spotbugs-dm-number-ctor"></a>

### `spotbugs/DM_NUMBER_CTOR`

A SpotBugs performance pattern, `DM_NUMBER_CTOR`.

- **Why it is on:** SpotBugs reports code that is correct but needlessly slow or wasteful, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use Integer.valueOf(x) or the primitive instead of new Integer(x), new Long(x) and similar constructors.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_NUMBER_CTOR","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#bx-method-invokes-inefficient-number-constructor-use-static-valueof-instead-dm-number-ctor)

<a id="spotbugs-dm-run-finalizers-on-exit"></a>

### `spotbugs/DM_RUN_FINALIZERS_ON_EXIT`

A SpotBugs bad practice pattern, `DM_RUN_FINALIZERS_ON_EXIT`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove the call; register a shutdown hook with Runtime.addShutdownHook or use try-with-resources for cleanup.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_RUN_FINALIZERS_ON_EXIT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dm-method-invokes-dangerous-method-runfinalizersonexit-dm-run-finalizers-on-exit)

<a id="spotbugs-dm-string-ctor"></a>

### `spotbugs/DM_STRING_CTOR`

A SpotBugs performance pattern, `DM_STRING_CTOR`.

- **Why it is on:** SpotBugs reports code that is correct but needlessly slow or wasteful, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use the String or literal directly; drop the new String(s) copy.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_STRING_CTOR","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dm-method-invokes-inefficient-new-string-string-constructor-dm-string-ctor)

<a id="spotbugs-dm-string-tostring"></a>

### `spotbugs/DM_STRING_TOSTRING`

A SpotBugs performance pattern, `DM_STRING_TOSTRING`.

- **Why it is on:** SpotBugs reports code that is correct but needlessly slow or wasteful, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use the String itself; drop the toString() call on a String.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_STRING_TOSTRING","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dm-method-invokes-tostring-method-on-a-string-dm-string-tostring)

<a id="spotbugs-dm-string-void-ctor"></a>

### `spotbugs/DM_STRING_VOID_CTOR`

A SpotBugs performance pattern, `DM_STRING_VOID_CTOR`.

- **Why it is on:** SpotBugs reports code that is correct but needlessly slow or wasteful, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Write the empty literal "" instead of new String().
- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_STRING_VOID_CTOR","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dm-method-invokes-inefficient-new-string-constructor-dm-string-void-ctor)

<a id="spotbugs-dm-useless-thread"></a>

### `spotbugs/DM_USELESS_THREAD`

A SpotBugs multithreaded correctness pattern, `DM_USELESS_THREAD`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Give the Thread a Runnable (new Thread(() -> work())), or submit the task to an ExecutorService.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_USELESS_THREAD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dm-a-thread-was-created-using-the-default-empty-run-method-dm-useless-thread)

<a id="spotbugs-dmi-annotation-is-not-visible-to-reflection"></a>

### `spotbugs/DMI_ANNOTATION_IS_NOT_VISIBLE_TO_REFLECTION`

A SpotBugs correctness pattern, `DMI_ANNOTATION_IS_NOT_VISIBLE_TO_REFLECTION`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Add @Retention(RetentionPolicy.RUNTIME) to the annotation type being looked up through reflection.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_ANNOTATION_IS_NOT_VISIBLE_TO_REFLECTION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dm-cannot-use-reflection-to-check-for-presence-of-annotation-without-runtime-retention-dmi-annotation-is-not-visible-to-reflection)

<a id="spotbugs-dmi-arguments-wrong-order"></a>

### `spotbugs/DMI_ARGUMENTS_WRONG_ORDER`

A SpotBugs correctness pattern, `DMI_ARGUMENTS_WRONG_ORDER`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Pass the arguments in the order the method declares them; swap the call's arguments.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_ARGUMENTS_WRONG_ORDER","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dmi-reversed-method-arguments-dmi-arguments-wrong-order)

<a id="spotbugs-dmi-bad-month"></a>

### `spotbugs/DMI_BAD_MONTH`

A SpotBugs correctness pattern, `DMI_BAD_MONTH`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use java.time (LocalDate.of(2024, Month.MARCH, 1)) or Calendar.MARCH; Calendar months run 0 to 11.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_BAD_MONTH","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dmi-bad-constant-value-for-month-dmi-bad-month)

<a id="spotbugs-dmi-bigdecimal-constructed-from-double"></a>

### `spotbugs/DMI_BIGDECIMAL_CONSTRUCTED_FROM_DOUBLE`

A SpotBugs correctness pattern, `DMI_BIGDECIMAL_CONSTRUCTED_FROM_DOUBLE`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Build it with BigDecimal.valueOf(d) or new BigDecimal("0.1") from a string, not new BigDecimal(double).
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_BIGDECIMAL_CONSTRUCTED_FROM_DOUBLE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dmi-bigdecimal-constructed-from-double-that-isn-t-represented-precisely-dmi-bigdecimal-constructed-from-double)

<a id="spotbugs-dmi-blocking-methods-on-url"></a>

### `spotbugs/DMI_BLOCKING_METHODS_ON_URL`

A SpotBugs performance pattern, `DMI_BLOCKING_METHODS_ON_URL`.

- **Why it is on:** SpotBugs reports code that is correct but needlessly slow or wasteful, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use java.net.URI for equals, hashCode and map keys; build a URL from the URI only when opening a connection.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_BLOCKING_METHODS_ON_URL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dm-the-equals-and-hashcode-methods-of-url-are-blocking-dmi-blocking-methods-on-url)

<a id="spotbugs-dmi-calling-next-from-hasnext"></a>

### `spotbugs/DMI_CALLING_NEXT_FROM_HASNEXT`

A SpotBugs correctness pattern, `DMI_CALLING_NEXT_FROM_HASNEXT`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Make hasNext() side-effect free; read ahead into a field and have next() return it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_CALLING_NEXT_FROM_HASNEXT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dmi-hasnext-method-invokes-next-dmi-calling-next-from-hasnext)

<a id="spotbugs-dmi-collection-of-urls"></a>

### `spotbugs/DMI_COLLECTION_OF_URLS`

A SpotBugs performance pattern, `DMI_COLLECTION_OF_URLS`.

- **Why it is on:** SpotBugs reports code that is correct but needlessly slow or wasteful, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Store URI values in the Set or Map keys instead of URL, and convert with uri.toURL() only when connecting.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_COLLECTION_OF_URLS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dm-maps-and-sets-of-urls-can-be-performance-hogs-dmi-collection-of-urls)

<a id="spotbugs-dmi-collections-should-not-contain-themselves"></a>

### `spotbugs/DMI_COLLECTIONS_SHOULD_NOT_CONTAIN_THEMSELVES`

A SpotBugs correctness pattern, `DMI_COLLECTIONS_SHOULD_NOT_CONTAIN_THEMSELVES`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Pass a different collection to contains, remove, or containsAll; a collection is not an element of itself.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_COLLECTIONS_SHOULD_NOT_CONTAIN_THEMSELVES","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dmi-collections-should-not-contain-themselves-dmi-collections-should-not-contain-themselves)

<a id="spotbugs-dmi-constant-db-password"></a>

### `spotbugs/DMI_CONSTANT_DB_PASSWORD`

A SpotBugs security pattern, `DMI_CONSTANT_DB_PASSWORD`.

- **Why it is on:** SpotBugs reports code that untrusted input can exploit, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Read the database password from the environment or a secrets store at startup and pass it in as a parameter.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_CONSTANT_DB_PASSWORD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dm-hardcoded-constant-database-password-dmi-constant-db-password)

<a id="spotbugs-dmi-doh"></a>

### `spotbugs/DMI_DOH`

A SpotBugs correctness pattern, `DMI_DOH`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove or correct the call; with these arguments it has no effect or always fails.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_DOH","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dmi-d-oh-a-nonsensical-method-invocation-dmi-doh)

<a id="spotbugs-dmi-empty-db-password"></a>

### `spotbugs/DMI_EMPTY_DB_PASSWORD`

A SpotBugs security pattern, `DMI_EMPTY_DB_PASSWORD`.

- **Why it is on:** SpotBugs reports code that untrusted input can exploit, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Configure a real database password from the environment or a secrets store and pass it in as a parameter.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_EMPTY_DB_PASSWORD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dm-empty-database-password-dmi-empty-db-password)

<a id="spotbugs-dmi-entry-sets-may-reuse-entry-objects"></a>

### `spotbugs/DMI_ENTRY_SETS_MAY_REUSE_ENTRY_OBJECTS`

A SpotBugs bad practice pattern, `DMI_ENTRY_SETS_MAY_REUSE_ENTRY_OBJECTS`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Copy each entry with Map.entry(e.getKey(), e.getValue()) before collecting it, or collect keys and values separately.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_ENTRY_SETS_MAY_REUSE_ENTRY_OBJECTS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dmi-adding-elements-of-an-entry-set-may-fail-due-to-reuse-of-entry-objects-dmi-entry-sets-may-reuse-entry-objects)

<a id="spotbugs-dmi-futile-attempt-to-change-maxpool-size-of-scheduled-thread-pool-executor"></a>

### `spotbugs/DMI_FUTILE_ATTEMPT_TO_CHANGE_MAXPOOL_SIZE_OF_SCHEDULED_THREAD_POOL_EXECUTOR`

A SpotBugs correctness pattern, `DMI_FUTILE_ATTEMPT_TO_CHANGE_MAXPOOL_SIZE_OF_SCHEDULED_THREAD_POOL_EXECUTOR`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Call setCorePoolSize on the ScheduledThreadPoolExecutor; setMaximumPoolSize does nothing there.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_FUTILE_ATTEMPT_TO_CHANGE_MAXPOOL_SIZE_OF_SCHEDULED_THREAD_POOL_EXECUTOR","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dm-futile-attempt-to-change-max-pool-size-of-scheduledthreadpoolexecutor-dmi-futile-attempt-to-change-maxpool-size-of-scheduled-thread-pool-executor)

<a id="spotbugs-dmi-hardcoded-absolute-filename"></a>

### `spotbugs/DMI_HARDCODED_ABSOLUTE_FILENAME`

A SpotBugs dodgy code pattern, `DMI_HARDCODED_ABSOLUTE_FILENAME`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Take the path as a parameter or a configuration value, or resolve it against Path.of with a relative or temp directory.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_HARDCODED_ABSOLUTE_FILENAME","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dmi-code-contains-a-hard-coded-reference-to-an-absolute-pathname-dmi-hardcoded-absolute-filename)

<a id="spotbugs-dmi-invoking-hashcode-on-array"></a>

### `spotbugs/DMI_INVOKING_HASHCODE_ON_ARRAY`

A SpotBugs correctness pattern, `DMI_INVOKING_HASHCODE_ON_ARRAY`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use Arrays.hashCode(array), or Arrays.deepHashCode for nested arrays.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_INVOKING_HASHCODE_ON_ARRAY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dmi-invocation-of-hashcode-on-an-array-dmi-invoking-hashcode-on-array)

<a id="spotbugs-dmi-invoking-tostring-on-anonymous-array"></a>

### `spotbugs/DMI_INVOKING_TOSTRING_ON_ANONYMOUS_ARRAY`

A SpotBugs correctness pattern, `DMI_INVOKING_TOSTRING_ON_ANONYMOUS_ARRAY`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use Arrays.toString(new String[] {...}) or just pass the values to List.of.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_INVOKING_TOSTRING_ON_ANONYMOUS_ARRAY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#useless-string-invocation-of-tostring-on-an-unnamed-array-dmi-invoking-tostring-on-anonymous-array)

<a id="spotbugs-dmi-invoking-tostring-on-array"></a>

### `spotbugs/DMI_INVOKING_TOSTRING_ON_ARRAY`

A SpotBugs correctness pattern, `DMI_INVOKING_TOSTRING_ON_ARRAY`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use Arrays.toString(array), or Arrays.deepToString for nested arrays.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_INVOKING_TOSTRING_ON_ARRAY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#useless-string-invocation-of-tostring-on-an-array-dmi-invoking-tostring-on-array)

<a id="spotbugs-dmi-long-bits-to-double-invoked-on-int"></a>

### `spotbugs/DMI_LONG_BITS_TO_DOUBLE_INVOKED_ON_INT`

A SpotBugs correctness pattern, `DMI_LONG_BITS_TO_DOUBLE_INVOKED_ON_INT`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Pass a long to Double.longBitsToDouble, or use Float.intBitsToFloat for an int.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_LONG_BITS_TO_DOUBLE_INVOKED_ON_INT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dmi-double-longbitstodouble-invoked-on-an-int-dmi-long-bits-to-double-invoked-on-int)

<a id="spotbugs-dmi-nonserializable-object-written"></a>

### `spotbugs/DMI_NONSERIALIZABLE_OBJECT_WRITTEN`

A SpotBugs dodgy code pattern, `DMI_NONSERIALIZABLE_OBJECT_WRITTEN`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Make the written class implement Serializable, or write a serializable copy (a record of the needed fields).
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_NONSERIALIZABLE_OBJECT_WRITTEN","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dmi-non-serializable-object-written-to-objectoutput-dmi-nonserializable-object-written)

<a id="spotbugs-dmi-random-used-only-once"></a>

### `spotbugs/DMI_RANDOM_USED_ONLY_ONCE`

A SpotBugs bad practice pattern, `DMI_RANDOM_USED_ONLY_ONCE`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Create one Random and reuse it as a field, or call ThreadLocalRandom.current().nextInt(bound).
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_RANDOM_USED_ONLY_ONCE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dmi-random-object-created-and-used-only-once-dmi-random-used-only-once)

<a id="spotbugs-dmi-scheduled-thread-pool-executor-with-zero-core-threads"></a>

### `spotbugs/DMI_SCHEDULED_THREAD_POOL_EXECUTOR_WITH_ZERO_CORE_THREADS`

A SpotBugs correctness pattern, `DMI_SCHEDULED_THREAD_POOL_EXECUTOR_WITH_ZERO_CORE_THREADS`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Give ScheduledThreadPoolExecutor a core pool size of at least 1, or use Executors.newSingleThreadScheduledExecutor().
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_SCHEDULED_THREAD_POOL_EXECUTOR_WITH_ZERO_CORE_THREADS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dm-creation-of-scheduledthreadpoolexecutor-with-zero-core-threads-dmi-scheduled-thread-pool-executor-with-zero-core-threads)

<a id="spotbugs-dmi-thread-passed-where-runnable-expected"></a>

### `spotbugs/DMI_THREAD_PASSED_WHERE_RUNNABLE_EXPECTED`

A SpotBugs dodgy code pattern, `DMI_THREAD_PASSED_WHERE_RUNNABLE_EXPECTED`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Pass a Runnable lambda or method reference to the executor or Thread constructor instead of a Thread object.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_THREAD_PASSED_WHERE_RUNNABLE_EXPECTED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dm-thread-passed-where-runnable-expected-dmi-thread-passed-where-runnable-expected)

<a id="spotbugs-dmi-unsupported-method"></a>

### `spotbugs/DMI_UNSUPPORTED_METHOD`

A SpotBugs dodgy code pattern, `DMI_UNSUPPORTED_METHOD`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Call the supported API instead of the method that always throws UnsupportedOperationException.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_UNSUPPORTED_METHOD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dm-call-to-unsupported-method-dmi-unsupported-method)

<a id="spotbugs-dmi-useless-substring"></a>

### `spotbugs/DMI_USELESS_SUBSTRING`

A SpotBugs dodgy code pattern, `DMI_USELESS_SUBSTRING`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use the original String directly instead of substring(0), which returns the same content.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_USELESS_SUBSTRING","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dmi-invocation-of-substring-0-which-returns-the-original-value-dmi-useless-substring)

<a id="spotbugs-dmi-using-removeall-to-clear-collection"></a>

### `spotbugs/DMI_USING_REMOVEALL_TO_CLEAR_COLLECTION`

A SpotBugs bad practice pattern, `DMI_USING_REMOVEALL_TO_CLEAR_COLLECTION`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Call clear() on the collection instead of removeAll(sameCollection).
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_USING_REMOVEALL_TO_CLEAR_COLLECTION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dmi-don-t-use-removeall-to-clear-a-collection-dmi-using-removeall-to-clear-collection)

<a id="spotbugs-dmi-vacuous-call-to-easymock-method"></a>

### `spotbugs/DMI_VACUOUS_CALL_TO_EASYMOCK_METHOD`

A SpotBugs correctness pattern, `DMI_VACUOUS_CALL_TO_EASYMOCK_METHOD`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Pass the mock object to replay, verify or reset; with no mock argument the call does nothing. Prefer Mockito.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_VACUOUS_CALL_TO_EASYMOCK_METHOD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dm-useless-vacuous-call-to-easymock-method-dmi-vacuous-call-to-easymock-method)

<a id="spotbugs-dmi-vacuous-self-collection-call"></a>

### `spotbugs/DMI_VACUOUS_SELF_COLLECTION_CALL`

A SpotBugs correctness pattern, `DMI_VACUOUS_SELF_COLLECTION_CALL`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove the call or pass a different collection; calling containsAll, removeAll or retainAll with itself does nothing useful.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_VACUOUS_SELF_COLLECTION_CALL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dmi-vacuous-call-to-collections-dmi-vacuous-self-collection-call)

<a id="spotbugs-dp-create-classloader-inside-do-privileged"></a>

### `spotbugs/DP_CREATE_CLASSLOADER_INSIDE_DO_PRIVILEGED`

A SpotBugs malicious code vulnerability pattern, `DP_CREATE_CLASSLOADER_INSIDE_DO_PRIVILEGED`.

- **Why it is on:** SpotBugs reports code that untrusted code could abuse, such as an exposed mutable field, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use the existing context or application class loader instead of creating one; do not wrap it in AccessController, which is deprecated for removal.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DP_CREATE_CLASSLOADER_INSIDE_DO_PRIVILEGED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dp-classloaders-should-only-be-created-inside-doprivileged-block-dp-create-classloader-inside-do-privileged)

<a id="spotbugs-dp-do-inside-do-privileged"></a>

### `spotbugs/DP_DO_INSIDE_DO_PRIVILEGED`

A SpotBugs malicious code vulnerability pattern, `DP_DO_INSIDE_DO_PRIVILEGED`.

- **Why it is on:** SpotBugs reports code that untrusted code could abuse, such as an exposed mutable field, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Avoid setAccessible and other reflective access; use the public API or MethodHandles.privateLookupIn. Do not add AccessController, which is deprecated.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DP_DO_INSIDE_DO_PRIVILEGED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#dp-method-invoked-that-should-be-only-be-invoked-inside-a-doprivileged-block-dp-do-inside-do-privileged)

<a id="spotbugs-ec-array-and-nonarray"></a>

### `spotbugs/EC_ARRAY_AND_NONARRAY`

A SpotBugs correctness pattern, `EC_ARRAY_AND_NONARRAY`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Compare values of the same kind; use Arrays.equals(a, b) for arrays, never array.equals(object).
- **Exception:** If this is intended, add `{"rule":"spotbugs/EC_ARRAY_AND_NONARRAY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ec-equals-used-to-compare-array-and-nonarray-ec-array-and-nonarray)

<a id="spotbugs-ec-bad-array-compare"></a>

### `spotbugs/EC_BAD_ARRAY_COMPARE`

A SpotBugs correctness pattern, `EC_BAD_ARRAY_COMPARE`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use Arrays.equals(a, b), or Arrays.deepEquals for nested arrays, not array.equals(other).
- **Exception:** If this is intended, add `{"rule":"spotbugs/EC_BAD_ARRAY_COMPARE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ec-invocation-of-equals-on-an-array-which-is-equivalent-to-ec-bad-array-compare)

<a id="spotbugs-ec-incompatible-array-compare"></a>

### `spotbugs/EC_INCOMPATIBLE_ARRAY_COMPARE`

A SpotBugs correctness pattern, `EC_INCOMPATIBLE_ARRAY_COMPARE`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Compare arrays of the same element type with Arrays.equals; arrays of different types are never equal.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EC_INCOMPATIBLE_ARRAY_COMPARE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ec-equals-used-to-compare-incompatible-arrays-ec-incompatible-array-compare)

<a id="spotbugs-ec-null-arg"></a>

### `spotbugs/EC_NULL_ARG`

A SpotBugs correctness pattern, `EC_NULL_ARG`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove the equals(null) call; use x == null for a null test.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EC_NULL_ARG","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ec-call-to-equals-null-ec-null-arg)

<a id="spotbugs-ec-unrelated-class-and-interface"></a>

### `spotbugs/EC_UNRELATED_CLASS_AND_INTERFACE`

A SpotBugs correctness pattern, `EC_UNRELATED_CLASS_AND_INTERFACE`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Compare values of related types, or fix the declared types; equals between the class and interface is always false.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EC_UNRELATED_CLASS_AND_INTERFACE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ec-call-to-equals-comparing-unrelated-class-and-interface-ec-unrelated-class-and-interface)

<a id="spotbugs-ec-unrelated-interfaces"></a>

### `spotbugs/EC_UNRELATED_INTERFACES`

A SpotBugs correctness pattern, `EC_UNRELATED_INTERFACES`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Compare values of related types, or fix the declared types; no class implements both interfaces, so equals is always false.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EC_UNRELATED_INTERFACES","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ec-call-to-equals-comparing-different-interface-types-ec-unrelated-interfaces)

<a id="spotbugs-ec-unrelated-types"></a>

### `spotbugs/EC_UNRELATED_TYPES`

A SpotBugs correctness pattern, `EC_UNRELATED_TYPES`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Compare values of the same type, or convert one side first; equals on unrelated types is always false.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EC_UNRELATED_TYPES","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ec-call-to-equals-comparing-different-types-ec-unrelated-types)

<a id="spotbugs-ec-unrelated-types-using-pointer-equality"></a>

### `spotbugs/EC_UNRELATED_TYPES_USING_POINTER_EQUALITY`

A SpotBugs correctness pattern, `EC_UNRELATED_TYPES_USING_POINTER_EQUALITY`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Compare values of related types, or fix the declared types; == between unrelated types is always false.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EC_UNRELATED_TYPES_USING_POINTER_EQUALITY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ec-using-pointer-equality-to-compare-different-types-ec-unrelated-types-using-pointer-equality)

<a id="spotbugs-ei-expose-buf"></a>

### `spotbugs/EI_EXPOSE_BUF`

A SpotBugs malicious code vulnerability pattern, `EI_EXPOSE_BUF`.

- **Why it is on:** SpotBugs reports code that untrusted code could abuse, such as an exposed mutable field, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Return buf.asReadOnlyBuffer() or a copy instead of the stored buffer.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EI_EXPOSE_BUF","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ei-may-expose-internal-representation-by-returning-a-buffer-sharing-non-public-data-ei-expose-buf)

<a id="spotbugs-ei-expose-buf2"></a>

### `spotbugs/EI_EXPOSE_BUF2`

A SpotBugs malicious code vulnerability pattern, `EI_EXPOSE_BUF2`.

- **Why it is on:** SpotBugs reports code that untrusted code could abuse, such as an exposed mutable field, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Store buf.asReadOnlyBuffer() or a copy of the buffer instead of the caller's buffer.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EI_EXPOSE_BUF2","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ei2-may-expose-internal-representation-by-creating-a-buffer-which-incorporates-reference-to-array-ei-expose-buf2)

<a id="spotbugs-ei-expose-rep"></a>

### `spotbugs/EI_EXPOSE_REP`

A SpotBugs malicious code vulnerability pattern, `EI_EXPOSE_REP`.

- **Why it is on:** SpotBugs reports code that untrusted code could abuse, such as an exposed mutable field, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Return a copy at the return statement: List.copyOf(items), Map.copyOf(m), array.clone(); returning a shared collaborator is the exception case.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EI_EXPOSE_REP","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ei-may-expose-internal-representation-by-returning-reference-to-mutable-object-ei-expose-rep)

<a id="spotbugs-ei-expose-rep2"></a>

### `spotbugs/EI_EXPOSE_REP2`

A SpotBugs malicious code vulnerability pattern, `EI_EXPOSE_REP2`.

- **Why it is on:** SpotBugs reports code that untrusted code could abuse, such as an exposed mutable field, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Store a copy of caller data (List.copyOf(items), array.clone(), Instant instead of Date); a shared injected collaborator is the exception case.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EI_EXPOSE_REP2","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ei2-may-expose-internal-representation-by-incorporating-reference-to-mutable-object-ei-expose-rep2)

<a id="spotbugs-ei-expose-static-buf2"></a>

### `spotbugs/EI_EXPOSE_STATIC_BUF2`

A SpotBugs malicious code vulnerability pattern, `EI_EXPOSE_STATIC_BUF2`.

- **Why it is on:** SpotBugs reports code that untrusted code could abuse, such as an exposed mutable field, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Store a read-only or copied buffer in the static field, not the caller's buffer.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EI_EXPOSE_STATIC_BUF2","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ms-may-expose-internal-static-state-by-creating-a-buffer-which-stores-an-external-array-into-a-static-field-ei-expose-static-buf2)

<a id="spotbugs-ei-expose-static-rep2"></a>

### `spotbugs/EI_EXPOSE_STATIC_REP2`

A SpotBugs malicious code vulnerability pattern, `EI_EXPOSE_STATIC_REP2`.

- **Why it is on:** SpotBugs reports code that untrusted code could abuse, such as an exposed mutable field, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Store an immutable copy such as List.copyOf(items) in the static field, not the caller's object.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EI_EXPOSE_STATIC_REP2","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ms-may-expose-internal-static-state-by-storing-a-mutable-object-into-a-static-field-ei-expose-static-rep2)

<a id="spotbugs-env-use-property-instead-of-env"></a>

### `spotbugs/ENV_USE_PROPERTY_INSTEAD_OF_ENV`

A SpotBugs bad practice pattern, `ENV_USE_PROPERTY_INSTEAD_OF_ENV`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Read a system property with System.getProperty, or take the setting through a config parameter instead of System.getenv.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ENV_USE_PROPERTY_INSTEAD_OF_ENV","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#env-it-is-preferable-to-use-portable-java-property-instead-of-environment-variable-env-use-property-instead-of-env)

<a id="spotbugs-eos-bad-end-of-stream-check"></a>

### `spotbugs/EOS_BAD_END_OF_STREAM_CHECK`

A SpotBugs correctness pattern, `EOS_BAD_END_OF_STREAM_CHECK`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Store read() in an int and compare that with -1 before casting to byte or char.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EOS_BAD_END_OF_STREAM_CHECK","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#eos-data-read-is-converted-before-comparison-to-1-eos-bad-end-of-stream-check)

<a id="spotbugs-eq-abstract-self"></a>

### `spotbugs/EQ_ABSTRACT_SELF`

A SpotBugs bad practice pattern, `EQ_ABSTRACT_SELF`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Declare equals(Object) in the abstract class, or implement it there, instead of an abstract equals taking the class type.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EQ_ABSTRACT_SELF","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#eq-abstract-class-defines-covariant-equals-method-eq-abstract-self)

<a id="spotbugs-eq-always-false"></a>

### `spotbugs/EQ_ALWAYS_FALSE`

A SpotBugs correctness pattern, `EQ_ALWAYS_FALSE`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Compare the fields that define equality in equals; do not return false unconditionally.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EQ_ALWAYS_FALSE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#eq-equals-method-always-returns-false-eq-always-false)

<a id="spotbugs-eq-always-true"></a>

### `spotbugs/EQ_ALWAYS_TRUE`

A SpotBugs correctness pattern, `EQ_ALWAYS_TRUE`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Compare the fields that define equality in equals; do not return true unconditionally.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EQ_ALWAYS_TRUE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#eq-equals-method-always-returns-true-eq-always-true)

<a id="spotbugs-eq-check-for-operand-not-compatible-with-this"></a>

### `spotbugs/EQ_CHECK_FOR_OPERAND_NOT_COMPATIBLE_WITH_THIS`

A SpotBugs bad practice pattern, `EQ_CHECK_FOR_OPERAND_NOT_COMPATIBLE_WITH_THIS`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Compare only with arguments that are instances of this class: use if (!(o instanceof Foo other)) return false.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EQ_CHECK_FOR_OPERAND_NOT_COMPATIBLE_WITH_THIS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#eq-equals-checks-for-incompatible-operand-eq-check-for-operand-not-compatible-with-this)

<a id="spotbugs-eq-compareto-use-object-equals"></a>

### `spotbugs/EQ_COMPARETO_USE_OBJECT_EQUALS`

A SpotBugs bad practice pattern, `EQ_COMPARETO_USE_OBJECT_EQUALS`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Override equals so it agrees with compareTo, for example return o instanceof Foo f && compareTo(f) == 0.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EQ_COMPARETO_USE_OBJECT_EQUALS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#eq-class-defines-compareto-and-uses-object-equals-eq-compareto-use-object-equals)

<a id="spotbugs-eq-comparing-class-names"></a>

### `spotbugs/EQ_COMPARING_CLASS_NAMES`

A SpotBugs correctness pattern, `EQ_COMPARING_CLASS_NAMES`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Compare classes with getClass() != o.getClass(), not by class name strings.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EQ_COMPARING_CLASS_NAMES","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#eq-equals-method-compares-class-names-rather-than-class-objects-eq-comparing-class-names)

<a id="spotbugs-eq-doesnt-override-equals"></a>

### `spotbugs/EQ_DOESNT_OVERRIDE_EQUALS`

A SpotBugs dodgy code pattern, `EQ_DOESNT_OVERRIDE_EQUALS`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Override equals and hashCode in the subclass to include its added fields, or hold the superclass as a field instead of extending it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EQ_DOESNT_OVERRIDE_EQUALS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#eq-class-doesn-t-override-equals-in-superclass-eq-doesnt-override-equals)

<a id="spotbugs-eq-dont-define-equals-for-enum"></a>

### `spotbugs/EQ_DONT_DEFINE_EQUALS_FOR_ENUM`

A SpotBugs correctness pattern, `EQ_DONT_DEFINE_EQUALS_FOR_ENUM`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Delete the equals override in the enum; enum constants are compared by ==.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EQ_DONT_DEFINE_EQUALS_FOR_ENUM","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#eq-covariant-equals-method-defined-for-enum-eq-dont-define-equals-for-enum)

<a id="spotbugs-eq-getclass-and-class-constant"></a>

### `spotbugs/EQ_GETCLASS_AND_CLASS_CONSTANT`

A SpotBugs bad practice pattern, `EQ_GETCLASS_AND_CLASS_CONSTANT`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Make the class final or compare with getClass() == o.getClass(), so a subclass does not break equals symmetry.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EQ_GETCLASS_AND_CLASS_CONSTANT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#eq-equals-method-fails-for-subtypes-eq-getclass-and-class-constant)

<a id="spotbugs-eq-other-no-object"></a>

### `spotbugs/EQ_OTHER_NO_OBJECT`

A SpotBugs correctness pattern, `EQ_OTHER_NO_OBJECT`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Change the parameter to Object: public boolean equals(Object o), then cast after an instanceof check.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EQ_OTHER_NO_OBJECT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#eq-equals-method-defined-that-doesn-t-override-equals-object-eq-other-no-object)

<a id="spotbugs-eq-other-use-object"></a>

### `spotbugs/EQ_OTHER_USE_OBJECT`

A SpotBugs correctness pattern, `EQ_OTHER_USE_OBJECT`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Replace the differently named equals with public boolean equals(Object o).
- **Exception:** If this is intended, add `{"rule":"spotbugs/EQ_OTHER_USE_OBJECT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#eq-equals-method-defined-that-doesn-t-override-object-equals-object-eq-other-use-object)

<a id="spotbugs-eq-overriding-equals-not-symmetric"></a>

### `spotbugs/EQ_OVERRIDING_EQUALS_NOT_SYMMETRIC`

A SpotBugs correctness pattern, `EQ_OVERRIDING_EQUALS_NOT_SYMMETRIC`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Make equals symmetric: compare getClass() on both sides, or make equals final in the base class.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EQ_OVERRIDING_EQUALS_NOT_SYMMETRIC","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#eq-equals-method-overrides-equals-in-superclass-and-may-not-be-symmetric-eq-overriding-equals-not-symmetric)

<a id="spotbugs-eq-self-no-object"></a>

### `spotbugs/EQ_SELF_NO_OBJECT`

A SpotBugs bad practice pattern, `EQ_SELF_NO_OBJECT`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Override equals(Object) with the exact signature and mark it @Override instead of equals taking the class type.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EQ_SELF_NO_OBJECT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#eq-covariant-equals-method-defined-eq-self-no-object)

<a id="spotbugs-eq-self-use-object"></a>

### `spotbugs/EQ_SELF_USE_OBJECT`

A SpotBugs correctness pattern, `EQ_SELF_USE_OBJECT`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Change equals(Foo) to public boolean equals(Object o) with an instanceof check and @Override.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EQ_SELF_USE_OBJECT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#eq-covariant-equals-method-defined-object-equals-object-inherited-eq-self-use-object)

<a id="spotbugs-eq-unusual"></a>

### `spotbugs/EQ_UNUSUAL`

A SpotBugs dodgy code pattern, `EQ_UNUSUAL`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Write equals(Object) in the standard form: pattern instanceof check, then compare the fields with Objects.equals, or use a record.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EQ_UNUSUAL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#eq-unusual-equals-method-eq-unusual)

<a id="spotbugs-es-comparing-parameter-string-with-eq"></a>

### `spotbugs/ES_COMPARING_PARAMETER_STRING_WITH_EQ`

A SpotBugs bad practice pattern, `ES_COMPARING_PARAMETER_STRING_WITH_EQ`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Compare strings with equals: CONSTANT.equals(param) or Objects.equals(a, b).
- **Exception:** If this is intended, add `{"rule":"spotbugs/ES_COMPARING_PARAMETER_STRING_WITH_EQ","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#es-comparison-of-string-parameter-using-or-es-comparing-parameter-string-with-eq)

<a id="spotbugs-es-comparing-strings-with-eq"></a>

### `spotbugs/ES_COMPARING_STRINGS_WITH_EQ`

A SpotBugs bad practice pattern, `ES_COMPARING_STRINGS_WITH_EQ`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Compare strings with equals: CONSTANT.equals(s) or Objects.equals(a, b).
- **Exception:** If this is intended, add `{"rule":"spotbugs/ES_COMPARING_STRINGS_WITH_EQ","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#es-comparison-of-string-objects-using-or-es-comparing-strings-with-eq)

<a id="spotbugs-esync-empty-sync"></a>

### `spotbugs/ESync_EMPTY_SYNC`

A SpotBugs multithreaded correctness pattern, `ESync_EMPTY_SYNC`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove the empty synchronized block, or move the code it was meant to protect inside it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ESync_EMPTY_SYNC","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#esync-empty-synchronized-block-esync-empty-sync)

<a id="spotbugs-fb-missing-expected-warning"></a>

### `spotbugs/FB_MISSING_EXPECTED_WARNING`

A SpotBugs correctness pattern, `FB_MISSING_EXPECTED_WARNING`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove the stale @ExpectWarning annotation or restore the code that triggers the expected warning.
- **Exception:** If this is intended, add `{"rule":"spotbugs/FB_MISSING_EXPECTED_WARNING","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#fb-missing-expected-or-desired-warning-from-spotbugs-fb-missing-expected-warning)

<a id="spotbugs-fb-unexpected-warning"></a>

### `spotbugs/FB_UNEXPECTED_WARNING`

A SpotBugs correctness pattern, `FB_UNEXPECTED_WARNING`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Fix the code that triggers the warning, or remove the @NoWarning annotation if the warning is accepted.
- **Exception:** If this is intended, add `{"rule":"spotbugs/FB_UNEXPECTED_WARNING","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#fb-unexpected-undesired-warning-from-spotbugs-fb-unexpected-warning)

<a id="spotbugs-fe-floating-point-equality"></a>

### `spotbugs/FE_FLOATING_POINT_EQUALITY`

A SpotBugs dodgy code pattern, `FE_FLOATING_POINT_EQUALITY`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Compare doubles with Math.abs(a - b) \< EPSILON, or use BigDecimal.compareTo for exact values.
- **Exception:** If this is intended, add `{"rule":"spotbugs/FE_FLOATING_POINT_EQUALITY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#fe-test-for-floating-point-equality-fe-floating-point-equality)

<a id="spotbugs-fe-test-if-equal-to-not-a-number"></a>

### `spotbugs/FE_TEST_IF_EQUAL_TO_NOT_A_NUMBER`

A SpotBugs correctness pattern, `FE_TEST_IF_EQUAL_TO_NOT_A_NUMBER`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Test with Double.isNaN(x) (or Float.isNaN); x == Double.NaN is always false.
- **Exception:** If this is intended, add `{"rule":"spotbugs/FE_TEST_IF_EQUAL_TO_NOT_A_NUMBER","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#fe-doomed-test-for-equality-to-nan-fe-test-if-equal-to-not-a-number)

<a id="spotbugs-fi-empty"></a>

### `spotbugs/FI_EMPTY`

A SpotBugs bad practice pattern, `FI_EMPTY`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Delete the empty finalize method; use try-with-resources or java.lang.ref.Cleaner for cleanup.
- **Exception:** If this is intended, add `{"rule":"spotbugs/FI_EMPTY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#fi-empty-finalizer-should-be-deleted-fi-empty)

<a id="spotbugs-fi-explicit-invocation"></a>

### `spotbugs/FI_EXPLICIT_INVOCATION`

A SpotBugs bad practice pattern, `FI_EXPLICIT_INVOCATION`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove the direct finalize() call and expose an explicit close() method that implements AutoCloseable.
- **Exception:** If this is intended, add `{"rule":"spotbugs/FI_EXPLICIT_INVOCATION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#fi-explicit-invocation-of-finalizer-fi-explicit-invocation)

<a id="spotbugs-fi-finalizer-nulls-fields"></a>

### `spotbugs/FI_FINALIZER_NULLS_FIELDS`

A SpotBugs bad practice pattern, `FI_FINALIZER_NULLS_FIELDS`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Delete the finalizer; nulling fields does nothing for the garbage collector.
- **Exception:** If this is intended, add `{"rule":"spotbugs/FI_FINALIZER_NULLS_FIELDS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#fi-finalizer-nulls-fields-fi-finalizer-nulls-fields)

<a id="spotbugs-fi-finalizer-only-nulls-fields"></a>

### `spotbugs/FI_FINALIZER_ONLY_NULLS_FIELDS`

A SpotBugs bad practice pattern, `FI_FINALIZER_ONLY_NULLS_FIELDS`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Delete the finalizer; nulling fields does nothing for the garbage collector.
- **Exception:** If this is intended, add `{"rule":"spotbugs/FI_FINALIZER_ONLY_NULLS_FIELDS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#fi-finalizer-only-nulls-fields-fi-finalizer-only-nulls-fields)

<a id="spotbugs-fi-missing-super-call"></a>

### `spotbugs/FI_MISSING_SUPER_CALL`

A SpotBugs bad practice pattern, `FI_MISSING_SUPER_CALL`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Delete finalize and use AutoCloseable or Cleaner; if it stays, end it with super.finalize() in a finally block.
- **Exception:** If this is intended, add `{"rule":"spotbugs/FI_MISSING_SUPER_CALL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#fi-finalizer-does-not-call-superclass-finalizer-fi-missing-super-call)

<a id="spotbugs-fi-nullify-super"></a>

### `spotbugs/FI_NULLIFY_SUPER`

A SpotBugs bad practice pattern, `FI_NULLIFY_SUPER`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Delete the finalizer that suppresses the superclass finalizer; cleanup belongs in AutoCloseable or Cleaner.
- **Exception:** If this is intended, add `{"rule":"spotbugs/FI_NULLIFY_SUPER","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#fi-finalizer-nullifies-superclass-finalizer-fi-nullify-super)

<a id="spotbugs-fi-public-should-be-protected"></a>

### `spotbugs/FI_PUBLIC_SHOULD_BE_PROTECTED`

A SpotBugs malicious code vulnerability pattern, `FI_PUBLIC_SHOULD_BE_PROTECTED`.

- **Why it is on:** SpotBugs reports code that untrusted code could abuse, such as an exposed mutable field, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Delete finalize and use AutoCloseable or Cleaner; do not widen it to public.
- **Exception:** If this is intended, add `{"rule":"spotbugs/FI_PUBLIC_SHOULD_BE_PROTECTED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#fi-finalizer-should-be-protected-not-public-fi-public-should-be-protected)

<a id="spotbugs-fi-useless"></a>

### `spotbugs/FI_USELESS`

A SpotBugs bad practice pattern, `FI_USELESS`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** See the tool's documentation: [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#fi-finalizer-does-nothing-but-call-superclass-finalizer-fi-useless).
- **Exception:** If this is intended, add `{"rule":"spotbugs/FI_USELESS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#fi-finalizer-does-nothing-but-call-superclass-finalizer-fi-useless)

<a id="spotbugs-fl-floats-as-loop-counters"></a>

### `spotbugs/FL_FLOATS_AS_LOOP_COUNTERS`

A SpotBugs correctness pattern, `FL_FLOATS_AS_LOOP_COUNTERS`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Loop on an int counter and compute the float value from it: for (int i = 0; i \< n; i++) { double x = i \* step; }.
- **Exception:** If this is intended, add `{"rule":"spotbugs/FL_FLOATS_AS_LOOP_COUNTERS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#fl-do-not-use-floating-point-variables-as-loop-counters-fl-floats-as-loop-counters)

<a id="spotbugs-fl-math-using-float-precision"></a>

### `spotbugs/FL_MATH_USING_FLOAT_PRECISION`

A SpotBugs correctness pattern, `FL_MATH_USING_FLOAT_PRECISION`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use double for the arithmetic, or BigDecimal when exact decimals matter.
- **Exception:** If this is intended, add `{"rule":"spotbugs/FL_MATH_USING_FLOAT_PRECISION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#fl-method-performs-math-using-floating-point-precision-fl-math-using-float-precision)

<a id="spotbugs-fs-bad-date-format-flag-combo"></a>

### `spotbugs/FS_BAD_DATE_FORMAT_FLAG_COMBO`

A SpotBugs bad practice pattern, `FS_BAD_DATE_FORMAT_FLAG_COMBO`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Fix the pattern letters: pair h or K with a, use H without a, and yyyy (not YYYY) with MM and dd; build it with DateTimeFormatter.ofPattern.
- **Exception:** If this is intended, add `{"rule":"spotbugs/FS_BAD_DATE_FORMAT_FLAG_COMBO","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#fs-date-format-strings-may-lead-to-unexpected-behavior-fs-bad-date-format-flag-combo)

<a id="spotbugs-gc-unchecked-type-in-generic-call"></a>

### `spotbugs/GC_UNCHECKED_TYPE_IN_GENERIC_CALL`

A SpotBugs bad practice pattern, `GC_UNCHECKED_TYPE_IN_GENERIC_CALL`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Pass an argument of the collection's element type to contains, remove or get, or fix the declared generic type.
- **Exception:** If this is intended, add `{"rule":"spotbugs/GC_UNCHECKED_TYPE_IN_GENERIC_CALL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#gc-unchecked-type-in-generic-call-gc-unchecked-type-in-generic-call)

<a id="spotbugs-gc-unrelated-types"></a>

### `spotbugs/GC_UNRELATED_TYPES`

A SpotBugs correctness pattern, `GC_UNRELATED_TYPES`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Pass an argument of the collection's element or key type to contains, remove or get; unrelated types never match.
- **Exception:** If this is intended, add `{"rule":"spotbugs/GC_UNRELATED_TYPES","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#gc-no-relationship-between-generic-parameter-and-method-argument-gc-unrelated-types)

<a id="spotbugs-he-equals-no-hashcode"></a>

### `spotbugs/HE_EQUALS_NO_HASHCODE`

A SpotBugs bad practice pattern, `HE_EQUALS_NO_HASHCODE`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Add hashCode that uses the same fields as equals: return Objects.hash(a, b), or make the class a record.
- **Exception:** If this is intended, add `{"rule":"spotbugs/HE_EQUALS_NO_HASHCODE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#he-class-defines-equals-but-not-hashcode-he-equals-no-hashcode)

<a id="spotbugs-he-equals-use-hashcode"></a>

### `spotbugs/HE_EQUALS_USE_HASHCODE`

A SpotBugs bad practice pattern, `HE_EQUALS_USE_HASHCODE`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Add hashCode that uses the same fields as equals: return Objects.hash(a, b), or make the class a record.
- **Exception:** If this is intended, add `{"rule":"spotbugs/HE_EQUALS_USE_HASHCODE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#he-class-defines-equals-and-uses-object-hashcode-he-equals-use-hashcode)

<a id="spotbugs-he-hashcode-no-equals"></a>

### `spotbugs/HE_HASHCODE_NO_EQUALS`

A SpotBugs bad practice pattern, `HE_HASHCODE_NO_EQUALS`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Add an equals method over the same fields that hashCode uses, or make the class a record.
- **Exception:** If this is intended, add `{"rule":"spotbugs/HE_HASHCODE_NO_EQUALS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#he-class-defines-hashcode-but-not-equals-he-hashcode-no-equals)

<a id="spotbugs-he-hashcode-use-object-equals"></a>

### `spotbugs/HE_HASHCODE_USE_OBJECT_EQUALS`

A SpotBugs bad practice pattern, `HE_HASHCODE_USE_OBJECT_EQUALS`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Add an equals method over the same fields that hashCode uses, or make the class a record.
- **Exception:** If this is intended, add `{"rule":"spotbugs/HE_HASHCODE_USE_OBJECT_EQUALS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#he-class-defines-hashcode-and-uses-object-equals-he-hashcode-use-object-equals)

<a id="spotbugs-he-inherits-equals-use-hashcode"></a>

### `spotbugs/HE_INHERITS_EQUALS_USE_HASHCODE`

A SpotBugs bad practice pattern, `HE_INHERITS_EQUALS_USE_HASHCODE`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Override hashCode together with equals using the same fields, or make the class a record.
- **Exception:** If this is intended, add `{"rule":"spotbugs/HE_INHERITS_EQUALS_USE_HASHCODE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#he-class-inherits-equals-and-uses-object-hashcode-he-inherits-equals-use-hashcode)

<a id="spotbugs-he-signature-declares-hashing-of-unhashable-class"></a>

### `spotbugs/HE_SIGNATURE_DECLARES_HASHING_OF_UNHASHABLE_CLASS`

A SpotBugs correctness pattern, `HE_SIGNATURE_DECLARES_HASHING_OF_UNHASHABLE_CLASS`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Define hashCode in the key class, or change the signature to a type that defines it, before using it in a HashMap or HashSet.
- **Exception:** If this is intended, add `{"rule":"spotbugs/HE_SIGNATURE_DECLARES_HASHING_OF_UNHASHABLE_CLASS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#he-signature-declares-use-of-unhashable-class-in-hashed-construct-he-signature-declares-hashing-of-unhashable-class)

<a id="spotbugs-he-use-of-unhashable-class"></a>

### `spotbugs/HE_USE_OF_UNHASHABLE_CLASS`

A SpotBugs correctness pattern, `HE_USE_OF_UNHASHABLE_CLASS`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Define hashCode (and equals) in the class, or use IdentityHashMap if identity keys are wanted.
- **Exception:** If this is intended, add `{"rule":"spotbugs/HE_USE_OF_UNHASHABLE_CLASS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#he-use-of-class-without-a-hashcode-method-in-a-hashed-data-structure-he-use-of-unhashable-class)

<a id="spotbugs-hrs-request-parameter-to-cookie"></a>

### `spotbugs/HRS_REQUEST_PARAMETER_TO_COOKIE`

A SpotBugs security pattern, `HRS_REQUEST_PARAMETER_TO_COOKIE`.

- **Why it is on:** SpotBugs reports code that untrusted input can exploit, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Validate the request value against an allowlist or strict pattern before putting it in a Cookie.
- **Exception:** If this is intended, add `{"rule":"spotbugs/HRS_REQUEST_PARAMETER_TO_COOKIE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#hrs-http-cookie-formed-from-untrusted-input-hrs-request-parameter-to-cookie)

<a id="spotbugs-hrs-request-parameter-to-http-header"></a>

### `spotbugs/HRS_REQUEST_PARAMETER_TO_HTTP_HEADER`

A SpotBugs security pattern, `HRS_REQUEST_PARAMETER_TO_HTTP_HEADER`.

- **Why it is on:** SpotBugs reports code that untrusted input can exploit, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Validate the request value against an allowlist or strict pattern, rejecting CR and LF, before setting a header.
- **Exception:** If this is intended, add `{"rule":"spotbugs/HRS_REQUEST_PARAMETER_TO_HTTP_HEADER","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#hrs-http-response-splitting-vulnerability-hrs-request-parameter-to-http-header)

<a id="spotbugs-hsc-huge-shared-string-constant"></a>

### `spotbugs/HSC_HUGE_SHARED_STRING_CONSTANT`

A SpotBugs performance pattern, `HSC_HUGE_SHARED_STRING_CONSTANT`.

- **Why it is on:** SpotBugs reports code that is correct but needlessly slow or wasteful, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Load the large text from a resource file at startup instead of embedding it as a string constant in the class.
- **Exception:** If this is intended, add `{"rule":"spotbugs/HSC_HUGE_SHARED_STRING_CONSTANT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#hsc-huge-string-constants-is-duplicated-across-multiple-class-files-hsc-huge-shared-string-constant)

<a id="spotbugs-hsm-hiding-method"></a>

### `spotbugs/HSM_HIDING_METHOD`

A SpotBugs correctness pattern, `HSM_HIDING_METHOD`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Rename the static method, or make it an instance method, so it no longer hides the superclass method.
- **Exception:** If this is intended, add `{"rule":"spotbugs/HSM_HIDING_METHOD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#hsm-method-hiding-should-be-avoided-hsm-hiding-method)

<a id="spotbugs-ia-ambiguous-invocation-of-inherited-or-outer-method"></a>

### `spotbugs/IA_AMBIGUOUS_INVOCATION_OF_INHERITED_OR_OUTER_METHOD`

A SpotBugs dodgy code pattern, `IA_AMBIGUOUS_INVOCATION_OF_INHERITED_OR_OUTER_METHOD`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Call super.run() for the inherited method or Outer.this.run() for the outer one; this.run() compiles to the same call and keeps the finding.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IA_AMBIGUOUS_INVOCATION_OF_INHERITED_OR_OUTER_METHOD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ia-potentially-ambiguous-invocation-of-either-an-inherited-or-outer-method-ia-ambiguous-invocation-of-inherited-or-outer-method)

<a id="spotbugs-ic-init-circularity"></a>

### `spotbugs/IC_INIT_CIRCULARITY`

A SpotBugs dodgy code pattern, `IC_INIT_CIRCULARITY`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Move the shared constants or setup into a third class so the two classes no longer initialize each other.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IC_INIT_CIRCULARITY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ic-initialization-circularity-ic-init-circularity)

<a id="spotbugs-ic-superclass-uses-subclass-during-initialization"></a>

### `spotbugs/IC_SUPERCLASS_USES_SUBCLASS_DURING_INITIALIZATION`

A SpotBugs bad practice pattern, `IC_SUPERCLASS_USES_SUBCLASS_DURING_INITIALIZATION`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Move the subclass reference out of the superclass static initializer into a lazy holder class or a method.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IC_SUPERCLASS_USES_SUBCLASS_DURING_INITIALIZATION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ic-superclass-uses-subclass-during-initialization-ic-superclass-uses-subclass-during-initialization)

<a id="spotbugs-icast-bad-shift-amount"></a>

### `spotbugs/ICAST_BAD_SHIFT_AMOUNT`

A SpotBugs correctness pattern, `ICAST_BAD_SHIFT_AMOUNT`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Shift by an amount from 0 to 31 for int, or make the value a long, e.g. 1L \<\< n.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ICAST_BAD_SHIFT_AMOUNT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#bshift-32-bit-int-shifted-by-an-amount-not-in-the-range-31-31-icast-bad-shift-amount)

<a id="spotbugs-icast-idiv-cast-to-double"></a>

### `spotbugs/ICAST_IDIV_CAST_TO_DOUBLE`

A SpotBugs dodgy code pattern, `ICAST_IDIV_CAST_TO_DOUBLE`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Convert an operand before dividing, as in (double) a / b, so the division is not done in integers.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ICAST_IDIV_CAST_TO_DOUBLE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#icast-integral-division-result-cast-to-double-or-float-icast-idiv-cast-to-double)

<a id="spotbugs-icast-int-2-long-as-instant"></a>

### `spotbugs/ICAST_INT_2_LONG_AS_INSTANT`

A SpotBugs correctness pattern, `ICAST_INT_2_LONG_AS_INSTANT`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Convert to long before multiplying, e.g. Instant.ofEpochMilli(seconds \* 1000L), or use Instant.ofEpochSecond.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ICAST_INT_2_LONG_AS_INSTANT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#icast-int-value-converted-to-long-and-used-as-absolute-time-icast-int-2-long-as-instant)

<a id="spotbugs-icast-int-cast-to-double-passed-to-ceil"></a>

### `spotbugs/ICAST_INT_CAST_TO_DOUBLE_PASSED_TO_CEIL`

A SpotBugs correctness pattern, `ICAST_INT_CAST_TO_DOUBLE_PASSED_TO_CEIL`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Divide as doubles, Math.ceil((double) a / b), or use Math.ceilDiv(a, b).
- **Exception:** If this is intended, add `{"rule":"spotbugs/ICAST_INT_CAST_TO_DOUBLE_PASSED_TO_CEIL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#icast-integral-value-cast-to-double-and-then-passed-to-math-ceil-icast-int-cast-to-double-passed-to-ceil)

<a id="spotbugs-icast-int-cast-to-float-passed-to-round"></a>

### `spotbugs/ICAST_INT_CAST_TO_FLOAT_PASSED_TO_ROUND`

A SpotBugs correctness pattern, `ICAST_INT_CAST_TO_FLOAT_PASSED_TO_ROUND`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Divide as floats or doubles before Math.round, e.g. Math.round((double) a / b); integer division already truncated.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ICAST_INT_CAST_TO_FLOAT_PASSED_TO_ROUND","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#icast-int-value-cast-to-float-and-then-passed-to-math-round-icast-int-cast-to-float-passed-to-round)

<a id="spotbugs-icast-integer-multiply-cast-to-long"></a>

### `spotbugs/ICAST_INTEGER_MULTIPLY_CAST_TO_LONG`

A SpotBugs dodgy code pattern, `ICAST_INTEGER_MULTIPLY_CAST_TO_LONG`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Widen an operand before multiplying, as in (long) a \* b, or use Math.multiplyExact.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ICAST_INTEGER_MULTIPLY_CAST_TO_LONG","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#icast-result-of-integer-multiplication-cast-to-long-icast-integer-multiply-cast-to-long)

<a id="spotbugs-icast-questionable-unsigned-right-shift"></a>

### `spotbugs/ICAST_QUESTIONABLE_UNSIGNED_RIGHT_SHIFT`

A SpotBugs dodgy code pattern, `ICAST_QUESTIONABLE_UNSIGNED_RIGHT_SHIFT`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use >> when the cast keeps only bits the sign cannot reach, or keep an int with (x >>> n) & 0xFF instead of casting to byte or short.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ICAST_QUESTIONABLE_UNSIGNED_RIGHT_SHIFT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#bshift-unsigned-right-shift-cast-to-short-byte-icast-questionable-unsigned-right-shift)

<a id="spotbugs-iil-elements-get-length-in-loop"></a>

### `spotbugs/IIL_ELEMENTS_GET_LENGTH_IN_LOOP`

A SpotBugs performance pattern, `IIL_ELEMENTS_GET_LENGTH_IN_LOOP`.

- **Why it is on:** SpotBugs reports code that is correct but needlessly slow or wasteful, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Read nodes.getLength() once into a local int before the loop and use that local in the loop condition.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IIL_ELEMENTS_GET_LENGTH_IN_LOOP","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#iil-nodelist-getlength-called-in-a-loop-iil-elements-get-length-in-loop)

<a id="spotbugs-iil-pattern-compile-in-loop"></a>

### `spotbugs/IIL_PATTERN_COMPILE_IN_LOOP`

A SpotBugs performance pattern, `IIL_PATTERN_COMPILE_IN_LOOP`.

- **Why it is on:** SpotBugs reports code that is correct but needlessly slow or wasteful, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Compile the regex once into a private static final Pattern field and reuse it inside the loop.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IIL_PATTERN_COMPILE_IN_LOOP","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#iil-method-calls-pattern-compile-in-a-loop-iil-pattern-compile-in-loop)

<a id="spotbugs-iil-pattern-compile-in-loop-indirect"></a>

### `spotbugs/IIL_PATTERN_COMPILE_IN_LOOP_INDIRECT`

A SpotBugs performance pattern, `IIL_PATTERN_COMPILE_IN_LOOP_INDIRECT`.

- **Why it is on:** SpotBugs reports code that is correct but needlessly slow or wasteful, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Compile the regex once into a private static final Pattern field, and use that field in the method the loop calls.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IIL_PATTERN_COMPILE_IN_LOOP_INDIRECT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#iil-method-compiles-the-regular-expression-in-a-loop-iil-pattern-compile-in-loop-indirect)

<a id="spotbugs-iil-prepare-statement-in-loop"></a>

### `spotbugs/IIL_PREPARE_STATEMENT_IN_LOOP`

A SpotBugs performance pattern, `IIL_PREPARE_STATEMENT_IN_LOOP`.

- **Why it is on:** SpotBugs reports code that is correct but needlessly slow or wasteful, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Prepare the statement once before the loop in try-with-resources, then set parameters and call addBatch inside the loop.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IIL_PREPARE_STATEMENT_IN_LOOP","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#iil-method-calls-preparestatement-in-a-loop-iil-prepare-statement-in-loop)

<a id="spotbugs-iio-inefficient-index-of"></a>

### `spotbugs/IIO_INEFFICIENT_INDEX_OF`

A SpotBugs performance pattern, `IIO_INEFFICIENT_INDEX_OF`.

- **Why it is on:** SpotBugs reports code that is correct but needlessly slow or wasteful, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Pass a char to indexOf (s.indexOf('x')) instead of a one-character String.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IIO_INEFFICIENT_INDEX_OF","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#iio-inefficient-use-of-string-indexof-string-iio-inefficient-index-of)

<a id="spotbugs-iio-inefficient-last-index-of"></a>

### `spotbugs/IIO_INEFFICIENT_LAST_INDEX_OF`

A SpotBugs performance pattern, `IIO_INEFFICIENT_LAST_INDEX_OF`.

- **Why it is on:** SpotBugs reports code that is correct but needlessly slow or wasteful, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Pass a char to lastIndexOf (s.lastIndexOf('x')) instead of a one-character String.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IIO_INEFFICIENT_LAST_INDEX_OF","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#iio-inefficient-use-of-string-lastindexof-string-iio-inefficient-last-index-of)

<a id="spotbugs-iju-assert-method-invoked-from-run-method"></a>

### `spotbugs/IJU_ASSERT_METHOD_INVOKED_FROM_RUN_METHOD`

A SpotBugs correctness pattern, `IJU_ASSERT_METHOD_INVOKED_FROM_RUN_METHOD`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Do not assert inside a run method; capture the result or exception and assert it on the test thread after join.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IJU_ASSERT_METHOD_INVOKED_FROM_RUN_METHOD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#iju-junit-assertion-in-run-method-will-not-be-noticed-by-junit-iju-assert-method-invoked-from-run-method)

<a id="spotbugs-iju-bad-suite-method"></a>

### `spotbugs/IJU_BAD_SUITE_METHOD`

A SpotBugs correctness pattern, `IJU_BAD_SUITE_METHOD`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Replace the JUnit 3 suite method with JUnit 5 @Test methods; use @Suite or @Nested for grouping.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IJU_BAD_SUITE_METHOD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#iju-testcase-declares-a-bad-suite-method-iju-bad-suite-method)

<a id="spotbugs-iju-no-tests"></a>

### `spotbugs/IJU_NO_TESTS`

A SpotBugs correctness pattern, `IJU_NO_TESTS`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Stop extending TestCase: write JUnit 5 @Test methods in a plain class, or delete the class.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IJU_NO_TESTS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#iju-testcase-has-no-tests-iju-no-tests)

<a id="spotbugs-iju-setup-no-super"></a>

### `spotbugs/IJU_SETUP_NO_SUPER`

A SpotBugs correctness pattern, `IJU_SETUP_NO_SUPER`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Move to JUnit 5 and use @BeforeEach with no inheritance; if staying on TestCase, call super.setUp().
- **Exception:** If this is intended, add `{"rule":"spotbugs/IJU_SETUP_NO_SUPER","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#iju-testcase-defines-setup-that-doesn-t-call-super-setup-iju-setup-no-super)

<a id="spotbugs-iju-suite-not-static"></a>

### `spotbugs/IJU_SUITE_NOT_STATIC`

A SpotBugs correctness pattern, `IJU_SUITE_NOT_STATIC`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Replace the JUnit 3 suite method with JUnit 5 @Test methods; if staying on TestCase, make suite() public static.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IJU_SUITE_NOT_STATIC","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#iju-testcase-implements-a-non-static-suite-method-iju-suite-not-static)

<a id="spotbugs-iju-teardown-no-super"></a>

### `spotbugs/IJU_TEARDOWN_NO_SUPER`

A SpotBugs correctness pattern, `IJU_TEARDOWN_NO_SUPER`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Move to JUnit 5 and use @AfterEach with no inheritance; if staying on TestCase, call super.tearDown().
- **Exception:** If this is intended, add `{"rule":"spotbugs/IJU_TEARDOWN_NO_SUPER","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#iju-testcase-defines-teardown-that-doesn-t-call-super-teardown-iju-teardown-no-super)

<a id="spotbugs-il-container-added-to-itself"></a>

### `spotbugs/IL_CONTAINER_ADDED_TO_ITSELF`

A SpotBugs correctness pattern, `IL_CONTAINER_ADDED_TO_ITSELF`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Add a different collection or element; a collection added to itself breaks hashCode and toString.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IL_CONTAINER_ADDED_TO_ITSELF","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#il-a-collection-is-added-to-itself-il-container-added-to-itself)

<a id="spotbugs-il-infinite-loop"></a>

### `spotbugs/IL_INFINITE_LOOP`

A SpotBugs correctness pattern, `IL_INFINITE_LOOP`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Make the loop condition depend on a variable the body changes, or add a break or return that ends it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IL_INFINITE_LOOP","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#il-an-apparent-infinite-loop-il-infinite-loop)

<a id="spotbugs-il-infinite-recursive-loop"></a>

### `spotbugs/IL_INFINITE_RECURSIVE_LOOP`

A SpotBugs correctness pattern, `IL_INFINITE_RECURSIVE_LOOP`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Give the method a base case, or call a different method; it currently calls itself with no way to stop.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IL_INFINITE_RECURSIVE_LOOP","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#il-an-apparent-infinite-recursive-loop-il-infinite-recursive-loop)

<a id="spotbugs-im-average-computation-could-overflow"></a>

### `spotbugs/IM_AVERAGE_COMPUTATION_COULD_OVERFLOW`

A SpotBugs dodgy code pattern, `IM_AVERAGE_COMPUTATION_COULD_OVERFLOW`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Compute the midpoint as (low + high) >>> 1, or low + (high - low) / 2.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IM_AVERAGE_COMPUTATION_COULD_OVERFLOW","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#im-computation-of-average-could-overflow-im-average-computation-could-overflow)

<a id="spotbugs-im-bad-check-for-odd"></a>

### `spotbugs/IM_BAD_CHECK_FOR_ODD`

A SpotBugs dodgy code pattern, `IM_BAD_CHECK_FOR_ODD`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Test oddness with x % 2 != 0, because x % 2 == 1 is false for negative odd numbers.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IM_BAD_CHECK_FOR_ODD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#im-check-for-oddness-that-won-t-work-for-negative-numbers-im-bad-check-for-odd)

<a id="spotbugs-im-multiplying-result-of-irem"></a>

### `spotbugs/IM_MULTIPLYING_RESULT_OF_IREM`

A SpotBugs correctness pattern, `IM_MULTIPLYING_RESULT_OF_IREM`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Add parentheses to show the intent: (i % 60) \* 1000 or i % (60 \* 1000).
- **Exception:** If this is intended, add `{"rule":"spotbugs/IM_MULTIPLYING_RESULT_OF_IREM","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#im-integer-multiply-of-result-of-integer-remainder-im-multiplying-result-of-irem)

<a id="spotbugs-ima-inefficient-member-access"></a>

### `spotbugs/IMA_INEFFICIENT_MEMBER_ACCESS`

A SpotBugs performance pattern, `IMA_INEFFICIENT_MEMBER_ACCESS`.

- **Why it is on:** SpotBugs reports code that is correct but needlessly slow or wasteful, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Keep the member private; since Java 11 nested classes reach private members directly, without the accessor this rule measures.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IMA_INEFFICIENT_MEMBER_ACCESS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ima-method-accesses-a-private-member-variable-of-owning-class-ima-inefficient-member-access)

<a id="spotbugs-imse-dont-catch-imse"></a>

### `spotbugs/IMSE_DONT_CATCH_IMSE`

A SpotBugs bad practice pattern, `IMSE_DONT_CATCH_IMSE`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Fix the code so no IllegalMonitorStateException occurs: call wait, notify and unlock only while holding the monitor or lock.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IMSE_DONT_CATCH_IMSE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#imse-dubious-catching-of-illegalmonitorstateexception-imse-dont-catch-imse)

<a id="spotbugs-int-bad-comparison-with-int-value"></a>

### `spotbugs/INT_BAD_COMPARISON_WITH_INT_VALUE`

A SpotBugs correctness pattern, `INT_BAD_COMPARISON_WITH_INT_VALUE`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Fix the constant to a value in int range, or declare the variable long if it must hold values that large.
- **Exception:** If this is intended, add `{"rule":"spotbugs/INT_BAD_COMPARISON_WITH_INT_VALUE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#int-bad-comparison-of-int-value-with-long-constant-int-bad-comparison-with-int-value)

<a id="spotbugs-int-bad-comparison-with-nonnegative-value"></a>

### `spotbugs/INT_BAD_COMPARISON_WITH_NONNEGATIVE_VALUE`

A SpotBugs correctness pattern, `INT_BAD_COMPARISON_WITH_NONNEGATIVE_VALUE`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove the comparison; a value that cannot be negative never satisfies it, or fix which value is tested.
- **Exception:** If this is intended, add `{"rule":"spotbugs/INT_BAD_COMPARISON_WITH_NONNEGATIVE_VALUE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#int-bad-comparison-of-nonnegative-value-with-negative-constant-or-zero-int-bad-comparison-with-nonnegative-value)

<a id="spotbugs-int-bad-comparison-with-signed-byte"></a>

### `spotbugs/INT_BAD_COMPARISON_WITH_SIGNED_BYTE`

A SpotBugs correctness pattern, `INT_BAD_COMPARISON_WITH_SIGNED_BYTE`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Mask the byte first: (b & 0xFF) == 0x80, since a signed byte is never above 127.
- **Exception:** If this is intended, add `{"rule":"spotbugs/INT_BAD_COMPARISON_WITH_SIGNED_BYTE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#int-bad-comparison-of-signed-byte-int-bad-comparison-with-signed-byte)

<a id="spotbugs-int-bad-rem-by-1"></a>

### `spotbugs/INT_BAD_REM_BY_1`

A SpotBugs dodgy code pattern, `INT_BAD_REM_BY_1`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove the % 1 operation, which is always 0, or use the divisor that was intended.
- **Exception:** If this is intended, add `{"rule":"spotbugs/INT_BAD_REM_BY_1","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#int-integer-remainder-modulo-1-int-bad-rem-by-1)

<a id="spotbugs-int-vacuous-bit-operation"></a>

### `spotbugs/INT_VACUOUS_BIT_OPERATION`

A SpotBugs dodgy code pattern, `INT_VACUOUS_BIT_OPERATION`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove the bit operation that never changes the value, or correct the mask or operand.
- **Exception:** If this is intended, add `{"rule":"spotbugs/INT_VACUOUS_BIT_OPERATION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#int-vacuous-bit-mask-operation-on-integer-value-int-vacuous-bit-operation)

<a id="spotbugs-int-vacuous-comparison"></a>

### `spotbugs/INT_VACUOUS_COMPARISON`

A SpotBugs dodgy code pattern, `INT_VACUOUS_COMPARISON`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove the comparison that the value's range makes always true or false, or compare the right operand.
- **Exception:** If this is intended, add `{"rule":"spotbugs/INT_VACUOUS_COMPARISON","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#int-vacuous-comparison-of-integer-value-int-vacuous-comparison)

<a id="spotbugs-io-appending-to-object-output-stream"></a>

### `spotbugs/IO_APPENDING_TO_OBJECT_OUTPUT_STREAM`

A SpotBugs correctness pattern, `IO_APPENDING_TO_OBJECT_OUTPUT_STREAM`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Write a new file for each ObjectOutputStream, or keep one stream open for all writes; appending corrupts the stream header.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IO_APPENDING_TO_OBJECT_OUTPUT_STREAM","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#io-doomed-attempt-to-append-to-an-object-output-stream-io-appending-to-object-output-stream)

<a id="spotbugs-ip-parameter-is-dead-but-overwritten"></a>

### `spotbugs/IP_PARAMETER_IS_DEAD_BUT_OVERWRITTEN`

A SpotBugs correctness pattern, `IP_PARAMETER_IS_DEAD_BUT_OVERWRITTEN`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use the parameter's value before assigning it, or remove the parameter and use a local.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IP_PARAMETER_IS_DEAD_BUT_OVERWRITTEN","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ip-a-parameter-is-dead-upon-entry-to-a-method-but-overwritten-ip-parameter-is-dead-but-overwritten)

<a id="spotbugs-is-field-not-guarded"></a>

### `spotbugs/IS_FIELD_NOT_GUARDED`

A SpotBugs multithreaded correctness pattern, `IS_FIELD_NOT_GUARDED`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Hold the lock named in the @GuardedBy annotation around every access to the field.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IS_FIELD_NOT_GUARDED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#is-field-not-guarded-against-concurrent-access-is-field-not-guarded)

<a id="spotbugs-is-inconsistent-sync"></a>

### `spotbugs/IS_INCONSISTENT_SYNC`

A SpotBugs multithreaded correctness pattern, `IS_INCONSISTENT_SYNC`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Guard every read and write of the field with the same lock, or make it final, volatile or an atomic type.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IS_INCONSISTENT_SYNC","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#is-inconsistent-synchronization-is-inconsistent-sync)

<a id="spotbugs-is2-inconsistent-sync"></a>

### `spotbugs/IS2_INCONSISTENT_SYNC`

A SpotBugs multithreaded correctness pattern, `IS2_INCONSISTENT_SYNC`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Guard every read and write of the field with the same lock, or make it final, volatile or an atomic type.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IS2_INCONSISTENT_SYNC","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#is-inconsistent-synchronization-is2-inconsistent-sync)

<a id="spotbugs-isc-instantiate-static-class"></a>

### `spotbugs/ISC_INSTANTIATE_STATIC_CLASS`

A SpotBugs bad practice pattern, `ISC_INSTANTIATE_STATIC_CLASS`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Call the static methods on the class name, for example Util.parse(x), instead of creating an instance.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ISC_INSTANTIATE_STATIC_CLASS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#isc-needless-instantiation-of-class-that-only-supplies-static-methods-isc-instantiate-static-class)

<a id="spotbugs-it-no-such-element"></a>

### `spotbugs/IT_NO_SUCH_ELEMENT`

A SpotBugs bad practice pattern, `IT_NO_SUCH_ELEMENT`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Throw NoSuchElementException from next() when hasNext() would be false.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IT_NO_SUCH_ELEMENT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#it-iterator-next-method-cannot-throw-nosuchelementexception-it-no-such-element)

<a id="spotbugs-ita-inefficient-to-array"></a>

### `spotbugs/ITA_INEFFICIENT_TO_ARRAY`

A SpotBugs performance pattern, `ITA_INEFFICIENT_TO_ARRAY`.

- **Why it is on:** SpotBugs reports code that is correct but needlessly slow or wasteful, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Pass the array constructor, list.toArray(String[]::new); toArray(new String[0]) is the form this rule flags.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ITA_INEFFICIENT_TO_ARRAY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ita-method-uses-toarray-with-zero-length-array-argument-ita-inefficient-to-array)

<a id="spotbugs-j2ee-store-of-non-serializable-object-into-session"></a>

### `spotbugs/J2EE_STORE_OF_NON_SERIALIZABLE_OBJECT_INTO_SESSION`

A SpotBugs bad practice pattern, `J2EE_STORE_OF_NON_SERIALIZABLE_OBJECT_INTO_SESSION`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Store only Serializable values, such as records of strings and numbers, in the HttpSession.
- **Exception:** If this is intended, add `{"rule":"spotbugs/J2EE_STORE_OF_NON_SERIALIZABLE_OBJECT_INTO_SESSION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#j2ee-store-of-non-serializable-object-into-httpsession-j2ee-store-of-non-serializable-object-into-session)

<a id="spotbugs-jcip-field-isnt-final-in-immutable-class"></a>

### `spotbugs/JCIP_FIELD_ISNT_FINAL_IN_IMMUTABLE_CLASS`

A SpotBugs bad practice pattern, `JCIP_FIELD_ISNT_FINAL_IN_IMMUTABLE_CLASS`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Declare every field of the @Immutable class final, or make the class a record.
- **Exception:** If this is intended, add `{"rule":"spotbugs/JCIP_FIELD_ISNT_FINAL_IN_IMMUTABLE_CLASS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#jcip-fields-of-immutable-classes-should-be-final-jcip-field-isnt-final-in-immutable-class)

<a id="spotbugs-jlm-jsr166-lock-monitorenter"></a>

### `spotbugs/JLM_JSR166_LOCK_MONITORENTER`

A SpotBugs multithreaded correctness pattern, `JLM_JSR166_LOCK_MONITORENTER`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Call lock.lock() and unlock() in try/finally instead of using synchronized on a Lock object.
- **Exception:** If this is intended, add `{"rule":"spotbugs/JLM_JSR166_LOCK_MONITORENTER","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#jlm-synchronization-performed-on-lock-jlm-jsr166-lock-monitorenter)

<a id="spotbugs-jlm-jsr166-utilconcurrent-monitorenter"></a>

### `spotbugs/JLM_JSR166_UTILCONCURRENT_MONITORENTER`

A SpotBugs multithreaded correctness pattern, `JLM_JSR166_UTILCONCURRENT_MONITORENTER`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use the concurrent class's own atomic methods, or a separate private lock Object, instead of synchronized on it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/JLM_JSR166_UTILCONCURRENT_MONITORENTER","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#jlm-synchronization-performed-on-util-concurrent-instance-jlm-jsr166-utilconcurrent-monitorenter)

<a id="spotbugs-jml-jsr166-calling-wait-rather-than-await"></a>

### `spotbugs/JML_JSR166_CALLING_WAIT_RATHER_THAN_AWAIT`

A SpotBugs multithreaded correctness pattern, `JML_JSR166_CALLING_WAIT_RATHER_THAN_AWAIT`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Call await(), signal() and signalAll() on the Condition instead of wait(), notify() and notifyAll().
- **Exception:** If this is intended, add `{"rule":"spotbugs/JML_JSR166_CALLING_WAIT_RATHER_THAN_AWAIT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#jlm-using-monitor-style-wait-methods-on-util-concurrent-abstraction-jml-jsr166-calling-wait-rather-than-await)

<a id="spotbugs-jua-dont-assert-instanceof-in-tests"></a>

### `spotbugs/JUA_DONT_ASSERT_INSTANCEOF_IN_TESTS`

A SpotBugs bad practice pattern, `JUA_DONT_ASSERT_INSTANCEOF_IN_TESTS`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Write assertInstanceOf(Foo.class, value), which fails with the actual type and returns the cast value, instead of assertTrue(value instanceof Foo).
- **Exception:** If this is intended, add `{"rule":"spotbugs/JUA_DONT_ASSERT_INSTANCEOF_IN_TESTS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#jua-asserting-value-of-instanceof-in-tests-is-not-recommended-jua-dont-assert-instanceof-in-tests)

<a id="spotbugs-lg-lost-logger-due-to-weak-reference"></a>

### `spotbugs/LG_LOST_LOGGER_DUE_TO_WEAK_REFERENCE`

A SpotBugs experimental pattern, `LG_LOST_LOGGER_DUE_TO_WEAK_REFERENCE`.

- **Why it is on:** SpotBugs reports code that an experimental SpotBugs detector reports, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Hold the Logger in a private static final field, so it is not garbage collected with its configuration.
- **Exception:** If this is intended, add `{"rule":"spotbugs/LG_LOST_LOGGER_DUE_TO_WEAK_REFERENCE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#lg-potential-lost-logger-changes-due-to-weak-reference-in-openjdk-lg-lost-logger-due-to-weak-reference)

<a id="spotbugs-li-lazy-init-static"></a>

### `spotbugs/LI_LAZY_INIT_STATIC`

A SpotBugs multithreaded correctness pattern, `LI_LAZY_INIT_STATIC`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Initialize the static field eagerly as static final, or use a holder class, instead of unsynchronized lazy init.
- **Exception:** If this is intended, add `{"rule":"spotbugs/LI_LAZY_INIT_STATIC","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#li-incorrect-lazy-initialization-of-static-field-li-lazy-init-static)

<a id="spotbugs-li-lazy-init-update-static"></a>

### `spotbugs/LI_LAZY_INIT_UPDATE_STATIC`

A SpotBugs multithreaded correctness pattern, `LI_LAZY_INIT_UPDATE_STATIC`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Build the object completely in a local, then assign the static field once; or initialize it eagerly as static final.
- **Exception:** If this is intended, add `{"rule":"spotbugs/LI_LAZY_INIT_UPDATE_STATIC","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#li-incorrect-lazy-initialization-and-update-of-static-field-li-lazy-init-update-static)

<a id="spotbugs-mc-overridable-method-call-in-clone"></a>

### `spotbugs/MC_OVERRIDABLE_METHOD_CALL_IN_CLONE`

A SpotBugs malicious code vulnerability pattern, `MC_OVERRIDABLE_METHOD_CALL_IN_CLONE`.

- **Why it is on:** SpotBugs reports code that untrusted code could abuse, such as an exposed mutable field, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Call only private, static or final methods from clone, or replace clone with a copy constructor.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MC_OVERRIDABLE_METHOD_CALL_IN_CLONE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#mc-an-overridable-method-is-called-from-the-clone-method-mc-overridable-method-call-in-clone)

<a id="spotbugs-mc-overridable-method-call-in-constructor"></a>

### `spotbugs/MC_OVERRIDABLE_METHOD_CALL_IN_CONSTRUCTOR`

A SpotBugs malicious code vulnerability pattern, `MC_OVERRIDABLE_METHOD_CALL_IN_CONSTRUCTOR`.

- **Why it is on:** SpotBugs reports code that untrusted code could abuse, such as an exposed mutable field, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Call only private, static or final methods from the constructor, or make the class final.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MC_OVERRIDABLE_METHOD_CALL_IN_CONSTRUCTOR","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#mc-an-overridable-method-is-called-from-a-constructor-mc-overridable-method-call-in-constructor)

<a id="spotbugs-mc-overridable-method-call-in-read-object"></a>

### `spotbugs/MC_OVERRIDABLE_METHOD_CALL_IN_READ_OBJECT`

A SpotBugs malicious code vulnerability pattern, `MC_OVERRIDABLE_METHOD_CALL_IN_READ_OBJECT`.

- **Why it is on:** SpotBugs reports code that untrusted code could abuse, such as an exposed mutable field, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Call only private, static or final methods from readObject, or make the class final.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MC_OVERRIDABLE_METHOD_CALL_IN_READ_OBJECT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#mc-an-overridable-method-is-called-from-the-readobject-method-mc-overridable-method-call-in-read-object)

<a id="spotbugs-me-enum-field-setter"></a>

### `spotbugs/ME_ENUM_FIELD_SETTER`

A SpotBugs bad practice pattern, `ME_ENUM_FIELD_SETTER`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove the public setter and give the enum final fields set in its constructor.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ME_ENUM_FIELD_SETTER","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#me-public-enum-method-unconditionally-sets-its-field-me-enum-field-setter)

<a id="spotbugs-me-mutable-enum-field"></a>

### `spotbugs/ME_MUTABLE_ENUM_FIELD`

A SpotBugs bad practice pattern, `ME_MUTABLE_ENUM_FIELD`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Declare the enum field final and use an immutable type such as List.of(...) instead of a mutable one.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ME_MUTABLE_ENUM_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#me-enum-field-is-public-and-mutable-me-mutable-enum-field)

<a id="spotbugs-mf-class-masks-field"></a>

### `spotbugs/MF_CLASS_MASKS_FIELD`

A SpotBugs correctness pattern, `MF_CLASS_MASKS_FIELD`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Rename the subclass field, or remove it and use the inherited one; the duplicate name hides the superclass field.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MF_CLASS_MASKS_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#mf-class-defines-field-that-masks-a-superclass-field-mf-class-masks-field)

<a id="spotbugs-mf-method-masks-field"></a>

### `spotbugs/MF_METHOD_MASKS_FIELD`

A SpotBugs correctness pattern, `MF_METHOD_MASKS_FIELD`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Rename the local variable so it does not shadow the field, or assign this.field when the field is meant.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MF_METHOD_MASKS_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#mf-method-defines-a-variable-that-obscures-a-field-mf-method-masks-field)

<a id="spotbugs-ml-sync-on-field-to-guard-changing-that-field"></a>

### `spotbugs/ML_SYNC_ON_FIELD_TO_GUARD_CHANGING_THAT_FIELD`

A SpotBugs multithreaded correctness pattern, `ML_SYNC_ON_FIELD_TO_GUARD_CHANGING_THAT_FIELD`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Synchronize on a separate private final Object lock, not on the field being reassigned.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ML_SYNC_ON_FIELD_TO_GUARD_CHANGING_THAT_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ml-synchronization-on-field-in-futile-attempt-to-guard-that-field-ml-sync-on-field-to-guard-changing-that-field)

<a id="spotbugs-ml-sync-on-updated-field"></a>

### `spotbugs/ML_SYNC_ON_UPDATED_FIELD`

A SpotBugs multithreaded correctness pattern, `ML_SYNC_ON_UPDATED_FIELD`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Synchronize on a separate private final Object lock, not on a field whose value is changed.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ML_SYNC_ON_UPDATED_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ml-method-synchronizes-on-an-updated-field-ml-sync-on-updated-field)

<a id="spotbugs-ms-cannot-be-final"></a>

### `spotbugs/MS_CANNOT_BE_FINAL`

A SpotBugs malicious code vulnerability pattern, `MS_CANNOT_BE_FINAL`.

- **Why it is on:** SpotBugs reports code that untrusted code could abuse, such as an exposed mutable field, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Make the static field private and change it only through methods of its own class, or move the state into an instance field.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MS_CANNOT_BE_FINAL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ms-field-isn-t-final-and-cannot-be-protected-from-malicious-code-ms-cannot-be-final)

<a id="spotbugs-ms-expose-buf"></a>

### `spotbugs/MS_EXPOSE_BUF`

A SpotBugs malicious code vulnerability pattern, `MS_EXPOSE_BUF`.

- **Why it is on:** SpotBugs reports code that untrusted code could abuse, such as an exposed mutable field, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Expose a read-only view with buf.asReadOnlyBuffer() instead of the shared static buffer.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MS_EXPOSE_BUF","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ms-may-expose-internal-representation-by-returning-a-buffer-sharing-non-public-data-ms-expose-buf)

<a id="spotbugs-ms-expose-rep"></a>

### `spotbugs/MS_EXPOSE_REP`

A SpotBugs malicious code vulnerability pattern, `MS_EXPOSE_REP`.

- **Why it is on:** SpotBugs reports code that untrusted code could abuse, such as an exposed mutable field, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Return a copy from the static accessor, such as array.clone() or List.copyOf(items); a deliberately shared singleton instance is the exception case.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MS_EXPOSE_REP","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ms-public-static-method-may-expose-internal-representation-by-returning-a-mutable-object-or-array-ms-expose-rep)

<a id="spotbugs-ms-final-pkgprotect"></a>

### `spotbugs/MS_FINAL_PKGPROTECT`

A SpotBugs malicious code vulnerability pattern, `MS_FINAL_PKGPROTECT`.

- **Why it is on:** SpotBugs reports code that untrusted code could abuse, such as an exposed mutable field, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Make the field private and final, or hold an immutable value (List.of, a record) so protection is unnecessary.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MS_FINAL_PKGPROTECT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ms-field-should-be-both-final-and-package-protected-ms-final-pkgprotect)

<a id="spotbugs-ms-mutable-array"></a>

### `spotbugs/MS_MUTABLE_ARRAY`

A SpotBugs malicious code vulnerability pattern, `MS_MUTABLE_ARRAY`.

- **Why it is on:** SpotBugs reports code that untrusted code could abuse, such as an exposed mutable field, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Make the array private and return a clone from a method, or expose an immutable List.of(...) instead.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MS_MUTABLE_ARRAY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ms-field-is-a-mutable-array-ms-mutable-array)

<a id="spotbugs-ms-mutable-collection"></a>

### `spotbugs/MS_MUTABLE_COLLECTION`

A SpotBugs malicious code vulnerability pattern, `MS_MUTABLE_COLLECTION`.

- **Why it is on:** SpotBugs reports code that untrusted code could abuse, such as an exposed mutable field, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Declare the field as List.of(...), Set.of(...) or Map.of(...) so the collection is immutable.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MS_MUTABLE_COLLECTION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ms-field-is-a-mutable-collection-ms-mutable-collection)

<a id="spotbugs-ms-mutable-collection-pkgprotect"></a>

### `spotbugs/MS_MUTABLE_COLLECTION_PKGPROTECT`

A SpotBugs malicious code vulnerability pattern, `MS_MUTABLE_COLLECTION_PKGPROTECT`.

- **Why it is on:** SpotBugs reports code that untrusted code could abuse, such as an exposed mutable field, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Declare the field as List.of(...), Set.of(...) or Map.of(...) so the collection is immutable.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MS_MUTABLE_COLLECTION_PKGPROTECT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ms-field-is-a-mutable-collection-which-should-be-package-protected-ms-mutable-collection-pkgprotect)

<a id="spotbugs-ms-mutable-hashtable"></a>

### `spotbugs/MS_MUTABLE_HASHTABLE`

A SpotBugs malicious code vulnerability pattern, `MS_MUTABLE_HASHTABLE`.

- **Why it is on:** SpotBugs reports code that untrusted code could abuse, such as an exposed mutable field, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Declare the field as Map.of(...) or Map.copyOf(m) so the table is immutable.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MS_MUTABLE_HASHTABLE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ms-field-is-a-mutable-hashtable-ms-mutable-hashtable)

<a id="spotbugs-ms-ooi-pkgprotect"></a>

### `spotbugs/MS_OOI_PKGPROTECT`

A SpotBugs malicious code vulnerability pattern, `MS_OOI_PKGPROTECT`.

- **Why it is on:** SpotBugs reports code that untrusted code could abuse, such as an exposed mutable field, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Replace the interface's array or mutable collection constant with List.of(...) or Map.of(...), or move it into a class as a private field.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MS_OOI_PKGPROTECT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ms-field-should-be-moved-out-of-an-interface-and-made-package-protected-ms-ooi-pkgprotect)

<a id="spotbugs-ms-pkgprotect"></a>

### `spotbugs/MS_PKGPROTECT`

A SpotBugs malicious code vulnerability pattern, `MS_PKGPROTECT`.

- **Why it is on:** SpotBugs reports code that untrusted code could abuse, such as an exposed mutable field, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Make the static field private and add an accessor that returns a copy, or hold an immutable value such as List.of(...).
- **Exception:** If this is intended, add `{"rule":"spotbugs/MS_PKGPROTECT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ms-field-should-be-package-protected-ms-pkgprotect)

<a id="spotbugs-ms-should-be-final"></a>

### `spotbugs/MS_SHOULD_BE_FINAL`

A SpotBugs malicious code vulnerability pattern, `MS_SHOULD_BE_FINAL`.

- **Why it is on:** SpotBugs reports code that untrusted code could abuse, such as an exposed mutable field, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Add final to the static field and assign it once at declaration.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MS_SHOULD_BE_FINAL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ms-field-isn-t-final-but-should-be-ms-should-be-final)

<a id="spotbugs-ms-should-be-refactored-to-be-final"></a>

### `spotbugs/MS_SHOULD_BE_REFACTORED_TO_BE_FINAL`

A SpotBugs malicious code vulnerability pattern, `MS_SHOULD_BE_REFACTORED_TO_BE_FINAL`.

- **Why it is on:** SpotBugs reports code that untrusted code could abuse, such as an exposed mutable field, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Assign the static field once in a static initializer and declare it final.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MS_SHOULD_BE_REFACTORED_TO_BE_FINAL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ms-field-isn-t-final-but-should-be-refactored-to-be-so-ms-should-be-refactored-to-be-final)

<a id="spotbugs-msf-mutable-servlet-field"></a>

### `spotbugs/MSF_MUTABLE_SERVLET_FIELD`

A SpotBugs multithreaded correctness pattern, `MSF_MUTABLE_SERVLET_FIELD`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Keep request state in local variables, or make the servlet field final and immutable; servlet instances are shared by threads.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MSF_MUTABLE_SERVLET_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#msf-mutable-servlet-field-msf-mutable-servlet-field)

<a id="spotbugs-mtia-suspect-servlet-instance-field"></a>

### `spotbugs/MTIA_SUSPECT_SERVLET_INSTANCE_FIELD`

A SpotBugs dodgy code pattern, `MTIA_SUSPECT_SERVLET_INSTANCE_FIELD`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Move the instance field into doGet or doPost as a local variable; servlet instances are shared by all request threads.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MTIA_SUSPECT_SERVLET_INSTANCE_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#mtia-class-extends-servlet-class-and-uses-instance-variables-mtia-suspect-servlet-instance-field)

<a id="spotbugs-mtia-suspect-struts-instance-field"></a>

### `spotbugs/MTIA_SUSPECT_STRUTS_INSTANCE_FIELD`

A SpotBugs dodgy code pattern, `MTIA_SUSPECT_STRUTS_INSTANCE_FIELD`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove the instance field from the Action and keep that state in locals or the form bean; Actions are shared across requests.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MTIA_SUSPECT_STRUTS_INSTANCE_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#mtia-class-extends-struts-action-class-and-uses-instance-variables-mtia-suspect-struts-instance-field)

<a id="spotbugs-mwn-mismatched-notify"></a>

### `spotbugs/MWN_MISMATCHED_NOTIFY`

A SpotBugs multithreaded correctness pattern, `MWN_MISMATCHED_NOTIFY`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Call notify or notifyAll on the same object whose synchronized block you are in.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MWN_MISMATCHED_NOTIFY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#mwn-mismatched-notify-mwn-mismatched-notify)

<a id="spotbugs-mwn-mismatched-wait"></a>

### `spotbugs/MWN_MISMATCHED_WAIT`

A SpotBugs multithreaded correctness pattern, `MWN_MISMATCHED_WAIT`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Call wait on the same object whose synchronized block you are in, inside a while loop.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MWN_MISMATCHED_WAIT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#mwn-mismatched-wait-mwn-mismatched-wait)

<a id="spotbugs-nm-bad-equal"></a>

### `spotbugs/NM_BAD_EQUAL`

A SpotBugs correctness pattern, `NM_BAD_EQUAL`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Rename equal(Object) to equals(Object) and add @Override.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NM_BAD_EQUAL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#nm-class-defines-equal-object-should-it-be-equals-object-nm-bad-equal)

<a id="spotbugs-nm-class-naming-convention"></a>

### `spotbugs/NM_CLASS_NAMING_CONVENTION`

A SpotBugs bad practice pattern, `NM_CLASS_NAMING_CONVENTION`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Name the class in UpperCamelCase, such as OrderService.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NM_CLASS_NAMING_CONVENTION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#nm-class-names-should-start-with-an-upper-case-letter-nm-class-naming-convention)

<a id="spotbugs-nm-class-not-exception"></a>

### `spotbugs/NM_CLASS_NOT_EXCEPTION`

A SpotBugs bad practice pattern, `NM_CLASS_NOT_EXCEPTION`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Rename the class so it does not end in Exception, or make it extend Exception or RuntimeException.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NM_CLASS_NOT_EXCEPTION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#nm-class-is-not-derived-from-an-exception-even-though-it-is-named-as-such-nm-class-not-exception)

<a id="spotbugs-nm-confusing"></a>

### `spotbugs/NM_CONFUSING`

A SpotBugs bad practice pattern, `NM_CONFUSING`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Rename one of the two methods so they differ by more than letter case.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NM_CONFUSING","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#nm-confusing-method-names-nm-confusing)

<a id="spotbugs-nm-field-naming-convention"></a>

### `spotbugs/NM_FIELD_NAMING_CONVENTION`

A SpotBugs bad practice pattern, `NM_FIELD_NAMING_CONVENTION`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Name fields in lowerCamelCase, and static final constants in UPPER_SNAKE_CASE.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NM_FIELD_NAMING_CONVENTION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#nm-non-final-field-names-should-start-with-a-lower-case-letter-final-fields-should-be-uppercase-with-words-separated-by-underscores-nm-field-naming-convention)

<a id="spotbugs-nm-future-keyword-used-as-identifier"></a>

### `spotbugs/NM_FUTURE_KEYWORD_USED_AS_IDENTIFIER`

A SpotBugs bad practice pattern, `NM_FUTURE_KEYWORD_USED_AS_IDENTIFIER`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Rename the identifier, since it is a reserved word in newer Java versions (assert, enum, var, record, yield).
- **Exception:** If this is intended, add `{"rule":"spotbugs/NM_FUTURE_KEYWORD_USED_AS_IDENTIFIER","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#nm-use-of-identifier-that-is-a-keyword-in-later-versions-of-java-nm-future-keyword-used-as-identifier)

<a id="spotbugs-nm-future-keyword-used-as-member-identifier"></a>

### `spotbugs/NM_FUTURE_KEYWORD_USED_AS_MEMBER_IDENTIFIER`

A SpotBugs bad practice pattern, `NM_FUTURE_KEYWORD_USED_AS_MEMBER_IDENTIFIER`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Rename the member, since its name is a reserved word in newer Java versions (assert, enum, var, record, yield).
- **Exception:** If this is intended, add `{"rule":"spotbugs/NM_FUTURE_KEYWORD_USED_AS_MEMBER_IDENTIFIER","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#nm-use-of-identifier-that-is-a-keyword-in-later-versions-of-java-nm-future-keyword-used-as-member-identifier)

<a id="spotbugs-nm-lcase-hashcode"></a>

### `spotbugs/NM_LCASE_HASHCODE`

A SpotBugs correctness pattern, `NM_LCASE_HASHCODE`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Rename hashcode() to hashCode() and add @Override.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NM_LCASE_HASHCODE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#nm-class-defines-hashcode-should-it-be-hashcode-nm-lcase-hashcode)

<a id="spotbugs-nm-lcase-tostring"></a>

### `spotbugs/NM_LCASE_TOSTRING`

A SpotBugs correctness pattern, `NM_LCASE_TOSTRING`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Rename tostring() to toString() and add @Override.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NM_LCASE_TOSTRING","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#nm-class-defines-tostring-should-it-be-tostring-nm-lcase-tostring)

<a id="spotbugs-nm-method-constructor-confusion"></a>

### `spotbugs/NM_METHOD_CONSTRUCTOR_CONFUSION`

A SpotBugs correctness pattern, `NM_METHOD_CONSTRUCTOR_CONFUSION`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Rename the method, or drop the return type if it is meant to be a constructor.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NM_METHOD_CONSTRUCTOR_CONFUSION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#nm-apparent-method-constructor-confusion-nm-method-constructor-confusion)

<a id="spotbugs-nm-method-naming-convention"></a>

### `spotbugs/NM_METHOD_NAMING_CONVENTION`

A SpotBugs bad practice pattern, `NM_METHOD_NAMING_CONVENTION`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Name methods in lowerCamelCase, starting with a verb, such as parseOrder.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NM_METHOD_NAMING_CONVENTION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#nm-method-names-should-start-with-a-lower-case-letter-nm-method-naming-convention)

<a id="spotbugs-nm-same-simple-name-as-interface"></a>

### `spotbugs/NM_SAME_SIMPLE_NAME_AS_INTERFACE`

A SpotBugs bad practice pattern, `NM_SAME_SIMPLE_NAME_AS_INTERFACE`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Give the class a name different from the interface it extends or implements in another package, such as DefaultOrderStore.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NM_SAME_SIMPLE_NAME_AS_INTERFACE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#nm-class-names-shouldn-t-shadow-simple-name-of-implemented-interface-nm-same-simple-name-as-interface)

<a id="spotbugs-nm-same-simple-name-as-superclass"></a>

### `spotbugs/NM_SAME_SIMPLE_NAME_AS_SUPERCLASS`

A SpotBugs bad practice pattern, `NM_SAME_SIMPLE_NAME_AS_SUPERCLASS`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Give the class a name different from its superclass in another package, such as ExtendedOrder.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NM_SAME_SIMPLE_NAME_AS_SUPERCLASS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#nm-class-names-shouldn-t-shadow-simple-name-of-superclass-nm-same-simple-name-as-superclass)

<a id="spotbugs-nm-very-confusing"></a>

### `spotbugs/NM_VERY_CONFUSING`

A SpotBugs correctness pattern, `NM_VERY_CONFUSING`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Rename one of the two methods so their names differ by more than capitalization.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NM_VERY_CONFUSING","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#nm-very-confusing-method-names-nm-very-confusing)

<a id="spotbugs-nm-very-confusing-intentional"></a>

### `spotbugs/NM_VERY_CONFUSING_INTENTIONAL`

A SpotBugs bad practice pattern, `NM_VERY_CONFUSING_INTENTIONAL`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Rename one of the two methods so they differ by more than letter case.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NM_VERY_CONFUSING_INTENTIONAL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#nm-very-confusing-method-names-but-perhaps-intentional-nm-very-confusing-intentional)

<a id="spotbugs-nm-wrong-package"></a>

### `spotbugs/NM_WRONG_PACKAGE`

A SpotBugs correctness pattern, `NM_WRONG_PACKAGE`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Import the parameter type from the same package the superclass method uses, and add @Override so the compiler checks it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NM_WRONG_PACKAGE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#nm-method-doesn-t-override-method-in-superclass-due-to-wrong-package-for-parameter-nm-wrong-package)

<a id="spotbugs-nm-wrong-package-intentional"></a>

### `spotbugs/NM_WRONG_PACKAGE_INTENTIONAL`

A SpotBugs bad practice pattern, `NM_WRONG_PACKAGE_INTENTIONAL`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Import the same type the superclass method declares and add @Override, so the method really overrides it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NM_WRONG_PACKAGE_INTENTIONAL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#nm-method-doesn-t-override-method-in-superclass-due-to-wrong-package-for-parameter-nm-wrong-package-intentional)

<a id="spotbugs-nn-naked-notify"></a>

### `spotbugs/NN_NAKED_NOTIFY`

A SpotBugs multithreaded correctness pattern, `NN_NAKED_NOTIFY`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Change the shared state under the lock right before notify or notifyAll, so the waiter can see the new condition.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NN_NAKED_NOTIFY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#nn-naked-notify-nn-naked-notify)

<a id="spotbugs-no-notify-not-notifyall"></a>

### `spotbugs/NO_NOTIFY_NOT_NOTIFYALL`

A SpotBugs multithreaded correctness pattern, `NO_NOTIFY_NOT_NOTIFYALL`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Call notifyAll() instead of notify(), or use a Condition per predicate.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NO_NOTIFY_NOT_NOTIFYALL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#no-using-notify-rather-than-notifyall-no-notify-not-notifyall)

<a id="spotbugs-noise-field-reference"></a>

### `spotbugs/NOISE_FIELD_REFERENCE`

A SpotBugs noise pattern, `NOISE_FIELD_REFERENCE`.

- **Why it is on:** SpotBugs reports a pattern SpotBugs uses to measure noise, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Nothing is wrong in the code: this is SpotBugs' random noise detector, which only appears when that detector is enabled.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NOISE_FIELD_REFERENCE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#noise-bogus-warning-about-a-field-reference-noise-field-reference)

<a id="spotbugs-noise-method-call"></a>

### `spotbugs/NOISE_METHOD_CALL`

A SpotBugs noise pattern, `NOISE_METHOD_CALL`.

- **Why it is on:** SpotBugs reports a pattern SpotBugs uses to measure noise, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Nothing is wrong in the code: this is SpotBugs' random noise detector, which only appears when that detector is enabled.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NOISE_METHOD_CALL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#noise-bogus-warning-about-a-method-call-noise-method-call)

<a id="spotbugs-noise-null-dereference"></a>

### `spotbugs/NOISE_NULL_DEREFERENCE`

A SpotBugs noise pattern, `NOISE_NULL_DEREFERENCE`.

- **Why it is on:** SpotBugs reports a pattern SpotBugs uses to measure noise, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Nothing is wrong in the code: this is SpotBugs' random noise detector, which only appears when that detector is enabled.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NOISE_NULL_DEREFERENCE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#noise-bogus-warning-about-a-null-pointer-dereference-noise-null-dereference)

<a id="spotbugs-noise-operation"></a>

### `spotbugs/NOISE_OPERATION`

A SpotBugs noise pattern, `NOISE_OPERATION`.

- **Why it is on:** SpotBugs reports a pattern SpotBugs uses to measure noise, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Nothing is wrong in the code: this is SpotBugs' random noise detector, which only appears when that detector is enabled.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NOISE_OPERATION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#noise-bogus-warning-about-an-operation-noise-operation)

<a id="spotbugs-np-always-null"></a>

### `spotbugs/NP_ALWAYS_NULL`

A SpotBugs correctness pattern, `NP_ALWAYS_NULL`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Assign a real value before the dereference, or delete the dead branch; the variable is null on this path.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_ALWAYS_NULL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#np-null-pointer-dereference-np-always-null)

<a id="spotbugs-np-always-null-exception"></a>

### `spotbugs/NP_ALWAYS_NULL_EXCEPTION`

A SpotBugs correctness pattern, `NP_ALWAYS_NULL_EXCEPTION`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Fix the path so the value is non-null before the dereference, or handle the null case before it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_ALWAYS_NULL_EXCEPTION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#np-null-pointer-dereference-in-method-on-exception-path-np-always-null-exception)

<a id="spotbugs-np-argument-might-be-null"></a>

### `spotbugs/NP_ARGUMENT_MIGHT_BE_NULL`

A SpotBugs correctness pattern, `NP_ARGUMENT_MIGHT_BE_NULL`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Check the parameter for null inside this method before dereferencing it, since its contract allows null.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_ARGUMENT_MIGHT_BE_NULL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#np-method-does-not-check-for-null-argument-np-argument-might-be-null)

<a id="spotbugs-np-boolean-return-null"></a>

### `spotbugs/NP_BOOLEAN_RETURN_NULL`

A SpotBugs bad practice pattern, `NP_BOOLEAN_RETURN_NULL`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Return Boolean.FALSE or TRUE, or change the return type to boolean or Optional\<Boolean>.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_BOOLEAN_RETURN_NULL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#np-method-with-boolean-return-type-returns-explicit-null-np-boolean-return-null)

<a id="spotbugs-np-clone-could-return-null"></a>

### `spotbugs/NP_CLONE_COULD_RETURN_NULL`

A SpotBugs bad practice pattern, `NP_CLONE_COULD_RETURN_NULL`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Return the copy from super.clone() or throw; never return null from clone.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_CLONE_COULD_RETURN_NULL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#np-clone-method-may-return-null-np-clone-could-return-null)

<a id="spotbugs-np-closing-null"></a>

### `spotbugs/NP_CLOSING_NULL`

A SpotBugs correctness pattern, `NP_CLOSING_NULL`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Only close what was opened; open the resource in try-with-resources so it is never null at close.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_CLOSING_NULL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#np-close-invoked-on-a-value-that-is-always-null-np-closing-null)

<a id="spotbugs-np-dereference-of-readline-value"></a>

### `spotbugs/NP_DEREFERENCE_OF_READLINE_VALUE`

A SpotBugs dodgy code pattern, `NP_DEREFERENCE_OF_READLINE_VALUE`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Assign readLine() to a variable and test it for null before use, or iterate reader.lines().
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_DEREFERENCE_OF_READLINE_VALUE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#np-dereference-of-the-result-of-readline-without-nullcheck-np-dereference-of-readline-value)

<a id="spotbugs-np-equals-should-handle-null-argument"></a>

### `spotbugs/NP_EQUALS_SHOULD_HANDLE_NULL_ARGUMENT`

A SpotBugs bad practice pattern, `NP_EQUALS_SHOULD_HANDLE_NULL_ARGUMENT`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Begin equals with an instanceof check, which is false for null, or use Objects.equals for each field.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_EQUALS_SHOULD_HANDLE_NULL_ARGUMENT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#np-equals-method-does-not-check-for-null-argument-np-equals-should-handle-null-argument)

<a id="spotbugs-np-guaranteed-deref"></a>

### `spotbugs/NP_GUARANTEED_DEREF`

A SpotBugs correctness pattern, `NP_GUARANTEED_DEREF`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Check for null and return or throw before the dereference; the null path always reaches it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_GUARANTEED_DEREF","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#np-null-value-is-guaranteed-to-be-dereferenced-np-guaranteed-deref)

<a id="spotbugs-np-guaranteed-deref-on-exception-path"></a>

### `spotbugs/NP_GUARANTEED_DEREF_ON_EXCEPTION_PATH`

A SpotBugs correctness pattern, `NP_GUARANTEED_DEREF_ON_EXCEPTION_PATH`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Check for null in the catch or finally before dereferencing, or restructure with try-with-resources.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_GUARANTEED_DEREF_ON_EXCEPTION_PATH","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#np-value-is-null-and-guaranteed-to-be-dereferenced-on-exception-path-np-guaranteed-deref-on-exception-path)

<a id="spotbugs-np-immediate-dereference-of-readline"></a>

### `spotbugs/NP_IMMEDIATE_DEREFERENCE_OF_READLINE`

A SpotBugs dodgy code pattern, `NP_IMMEDIATE_DEREFERENCE_OF_READLINE`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Assign readLine() to a variable and test it for null before calling methods on it, or iterate reader.lines().
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_IMMEDIATE_DEREFERENCE_OF_READLINE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#np-immediate-dereference-of-the-result-of-readline-np-immediate-dereference-of-readline)

<a id="spotbugs-np-load-of-known-null-value"></a>

### `spotbugs/NP_LOAD_OF_KNOWN_NULL_VALUE`

A SpotBugs dodgy code pattern, `NP_LOAD_OF_KNOWN_NULL_VALUE`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove the use of the variable that is always null here, or fix the earlier branch that should have set it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_LOAD_OF_KNOWN_NULL_VALUE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#np-load-of-known-null-value-np-load-of-known-null-value)

<a id="spotbugs-np-method-parameter-relaxing-annotation"></a>

### `spotbugs/NP_METHOD_PARAMETER_RELAXING_ANNOTATION`

A SpotBugs dodgy code pattern, `NP_METHOD_PARAMETER_RELAXING_ANNOTATION`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Give the override's parameter the same nullness annotation as the method it overrides.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_METHOD_PARAMETER_RELAXING_ANNOTATION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#np-method-tightens-nullness-annotation-on-parameter-np-method-parameter-relaxing-annotation)

<a id="spotbugs-np-method-parameter-tightens-annotation"></a>

### `spotbugs/NP_METHOD_PARAMETER_TIGHTENS_ANNOTATION`

A SpotBugs dodgy code pattern, `NP_METHOD_PARAMETER_TIGHTENS_ANNOTATION`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Give the override's parameter the same nullness annotation as the method it overrides, and handle null if the parent allows it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_METHOD_PARAMETER_TIGHTENS_ANNOTATION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#np-method-tightens-nullness-annotation-on-parameter-np-method-parameter-tightens-annotation)

<a id="spotbugs-np-method-return-relaxing-annotation"></a>

### `spotbugs/NP_METHOD_RETURN_RELAXING_ANNOTATION`

A SpotBugs dodgy code pattern, `NP_METHOD_RETURN_RELAXING_ANNOTATION`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Keep the override's return nullness as strict as the parent's: return a non-null value, or change the parent's contract.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_METHOD_RETURN_RELAXING_ANNOTATION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#np-method-relaxes-nullness-annotation-on-return-value-np-method-return-relaxing-annotation)

<a id="spotbugs-np-nonnull-field-not-initialized-in-constructor"></a>

### `spotbugs/NP_NONNULL_FIELD_NOT_INITIALIZED_IN_CONSTRUCTOR`

A SpotBugs correctness pattern, `NP_NONNULL_FIELD_NOT_INITIALIZED_IN_CONSTRUCTOR`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Assign the field in every constructor, or make it a final field set from a constructor parameter.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_NONNULL_FIELD_NOT_INITIALIZED_IN_CONSTRUCTOR","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#np-non-null-field-is-not-initialized-np-nonnull-field-not-initialized-in-constructor)

<a id="spotbugs-np-nonnull-param-violation"></a>

### `spotbugs/NP_NONNULL_PARAM_VIOLATION`

A SpotBugs correctness pattern, `NP_NONNULL_PARAM_VIOLATION`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Pass a non-null value, or change the callee to accept null explicitly; the parameter is declared non-null.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_NONNULL_PARAM_VIOLATION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#np-method-call-passes-null-to-a-non-null-parameter-np-nonnull-param-violation)

<a id="spotbugs-np-nonnull-return-violation"></a>

### `spotbugs/NP_NONNULL_RETURN_VIOLATION`

A SpotBugs correctness pattern, `NP_NONNULL_RETURN_VIOLATION`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Return a non-null value, such as List.of(), Optional.empty() or an empty string, instead of null.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_NONNULL_RETURN_VIOLATION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#np-method-may-return-null-but-is-declared-nonnull-np-nonnull-return-violation)

<a id="spotbugs-np-null-instanceof"></a>

### `spotbugs/NP_NULL_INSTANCEOF`

A SpotBugs correctness pattern, `NP_NULL_INSTANCEOF`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove the instanceof test; the value is null here, so it is always false.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_NULL_INSTANCEOF","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#np-a-known-null-value-is-checked-to-see-if-it-is-an-instance-of-a-type-np-null-instanceof)

<a id="spotbugs-np-null-on-some-path"></a>

### `spotbugs/NP_NULL_ON_SOME_PATH`

A SpotBugs correctness pattern, `NP_NULL_ON_SOME_PATH`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Add a null check that returns or throws before the dereference, or make the value non-null on every path.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_NULL_ON_SOME_PATH","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#np-possible-null-pointer-dereference-np-null-on-some-path)

<a id="spotbugs-np-null-on-some-path-exception"></a>

### `spotbugs/NP_NULL_ON_SOME_PATH_EXCEPTION`

A SpotBugs correctness pattern, `NP_NULL_ON_SOME_PATH_EXCEPTION`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Check the value for null in the catch or finally block before using it, or initialize it before the try.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_NULL_ON_SOME_PATH_EXCEPTION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#np-possible-null-pointer-dereference-in-method-on-exception-path-np-null-on-some-path-exception)

<a id="spotbugs-np-null-on-some-path-from-return-value"></a>

### `spotbugs/NP_NULL_ON_SOME_PATH_FROM_RETURN_VALUE`

A SpotBugs dodgy code pattern, `NP_NULL_ON_SOME_PATH_FROM_RETURN_VALUE`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Check the returned value for null before dereferencing it, or make the callee return Optional or an empty collection.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_NULL_ON_SOME_PATH_FROM_RETURN_VALUE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#np-possible-null-pointer-dereference-due-to-return-value-of-called-method-np-null-on-some-path-from-return-value)

<a id="spotbugs-np-null-on-some-path-might-be-infeasible"></a>

### `spotbugs/NP_NULL_ON_SOME_PATH_MIGHT_BE_INFEASIBLE`

A SpotBugs dodgy code pattern, `NP_NULL_ON_SOME_PATH_MIGHT_BE_INFEASIBLE`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Guard the dereference with a null check, or restructure so the branch that can hold null never reaches it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_NULL_ON_SOME_PATH_MIGHT_BE_INFEASIBLE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#np-possible-null-pointer-dereference-on-branch-that-might-be-infeasible-np-null-on-some-path-might-be-infeasible)

<a id="spotbugs-np-null-param-deref"></a>

### `spotbugs/NP_NULL_PARAM_DEREF`

A SpotBugs correctness pattern, `NP_NULL_PARAM_DEREF`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Pass a non-null value; the callee dereferences the parameter without a null check.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_NULL_PARAM_DEREF","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#np-method-call-passes-null-for-non-null-parameter-np-null-param-deref)

<a id="spotbugs-np-null-param-deref-all-targets-dangerous"></a>

### `spotbugs/NP_NULL_PARAM_DEREF_ALL_TARGETS_DANGEROUS`

A SpotBugs correctness pattern, `NP_NULL_PARAM_DEREF_ALL_TARGETS_DANGEROUS`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Pass a non-null value; every possible target dereferences this parameter.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_NULL_PARAM_DEREF_ALL_TARGETS_DANGEROUS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#np-method-call-passes-null-for-non-null-parameter-np-null-param-deref-all-targets-dangerous)

<a id="spotbugs-np-null-param-deref-nonvirtual"></a>

### `spotbugs/NP_NULL_PARAM_DEREF_NONVIRTUAL`

A SpotBugs correctness pattern, `NP_NULL_PARAM_DEREF_NONVIRTUAL`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Pass a non-null value; the called method dereferences this parameter without a null check.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_NULL_PARAM_DEREF_NONVIRTUAL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#np-non-virtual-method-call-passes-null-for-non-null-parameter-np-null-param-deref-nonvirtual)

<a id="spotbugs-np-optional-return-null"></a>

### `spotbugs/NP_OPTIONAL_RETURN_NULL`

A SpotBugs correctness pattern, `NP_OPTIONAL_RETURN_NULL`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Return Optional.empty() instead of null from a method that returns Optional.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_OPTIONAL_RETURN_NULL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#np-method-with-optional-return-type-returns-explicit-null-np-optional-return-null)

<a id="spotbugs-np-parameter-must-be-nonnull-but-marked-as-nullable"></a>

### `spotbugs/NP_PARAMETER_MUST_BE_NONNULL_BUT_MARKED_AS_NULLABLE`

A SpotBugs dodgy code pattern, `NP_PARAMETER_MUST_BE_NONNULL_BUT_MARKED_AS_NULLABLE`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove the nullable annotation from the parameter, or check it for null before the dereference.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_PARAMETER_MUST_BE_NONNULL_BUT_MARKED_AS_NULLABLE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#np-parameter-must-be-non-null-but-is-marked-as-nullable-np-parameter-must-be-nonnull-but-marked-as-nullable)

<a id="spotbugs-np-store-into-nonnull-field"></a>

### `spotbugs/NP_STORE_INTO_NONNULL_FIELD`

A SpotBugs correctness pattern, `NP_STORE_INTO_NONNULL_FIELD`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Store a non-null value, or drop the non-null annotation if the field can legitimately be null.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_STORE_INTO_NONNULL_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#np-store-of-null-value-into-field-annotated-nonnull-np-store-into-nonnull-field)

<a id="spotbugs-np-sync-and-null-check-field"></a>

### `spotbugs/NP_SYNC_AND_NULL_CHECK_FIELD`

A SpotBugs multithreaded correctness pattern, `NP_SYNC_AND_NULL_CHECK_FIELD`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Make the field final and non-null, and synchronize on a separate private final lock Object.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_SYNC_AND_NULL_CHECK_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#np-synchronize-and-null-check-on-the-same-field-np-sync-and-null-check-field)

<a id="spotbugs-np-tostring-could-return-null"></a>

### `spotbugs/NP_TOSTRING_COULD_RETURN_NULL`

A SpotBugs bad practice pattern, `NP_TOSTRING_COULD_RETURN_NULL`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Return an empty string or String.valueOf(field) from toString, never null.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_TOSTRING_COULD_RETURN_NULL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#np-tostring-method-may-return-null-np-tostring-could-return-null)

<a id="spotbugs-np-unwritten-field"></a>

### `spotbugs/NP_UNWRITTEN_FIELD`

A SpotBugs correctness pattern, `NP_UNWRITTEN_FIELD`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Assign the field somewhere, or delete it; reading a never-written field always yields null.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_UNWRITTEN_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#np-read-of-unwritten-field-np-unwritten-field)

<a id="spotbugs-np-unwritten-public-or-protected-field"></a>

### `spotbugs/NP_UNWRITTEN_PUBLIC_OR_PROTECTED_FIELD`

A SpotBugs dodgy code pattern, `NP_UNWRITTEN_PUBLIC_OR_PROTECTED_FIELD`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Assign the field in the constructor and make it private final, or remove it if nothing sets it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_UNWRITTEN_PUBLIC_OR_PROTECTED_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#np-read-of-unwritten-public-or-protected-field-np-unwritten-public-or-protected-field)

<a id="spotbugs-ns-dangerous-non-short-circuit"></a>

### `spotbugs/NS_DANGEROUS_NON_SHORT_CIRCUIT`

A SpotBugs dodgy code pattern, `NS_DANGEROUS_NON_SHORT_CIRCUIT`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use && or || so the right side is skipped when the left side already decides the result or guards against null.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NS_DANGEROUS_NON_SHORT_CIRCUIT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ns-potentially-dangerous-use-of-non-short-circuit-logic-ns-dangerous-non-short-circuit)

<a id="spotbugs-ns-non-short-circuit"></a>

### `spotbugs/NS_NON_SHORT_CIRCUIT`

A SpotBugs dodgy code pattern, `NS_NON_SHORT_CIRCUIT`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use && or || instead of & or | on booleans, so the right side runs only when needed.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NS_NON_SHORT_CIRCUIT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ns-questionable-use-of-non-short-circuit-logic-ns-non-short-circuit)

<a id="spotbugs-obl-unsatisfied-obligation"></a>

### `spotbugs/OBL_UNSATISFIED_OBLIGATION`

A SpotBugs experimental pattern, `OBL_UNSATISFIED_OBLIGATION`.

- **Why it is on:** SpotBugs reports code that an experimental SpotBugs detector reports, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Open the stream, connection or other resource in try-with-resources so it closes on every path; a resource handed to its owner is the exception case.
- **Exception:** If this is intended, add `{"rule":"spotbugs/OBL_UNSATISFIED_OBLIGATION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#obl-method-may-fail-to-clean-up-stream-or-resource-obl-unsatisfied-obligation)

<a id="spotbugs-obl-unsatisfied-obligation-exception-edge"></a>

### `spotbugs/OBL_UNSATISFIED_OBLIGATION_EXCEPTION_EDGE`

A SpotBugs experimental pattern, `OBL_UNSATISFIED_OBLIGATION_EXCEPTION_EDGE`.

- **Why it is on:** SpotBugs reports code that an experimental SpotBugs detector reports, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Open the stream, connection or other resource in try-with-resources so it closes when an exception is thrown.
- **Exception:** If this is intended, add `{"rule":"spotbugs/OBL_UNSATISFIED_OBLIGATION_EXCEPTION_EDGE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#obl-method-may-fail-to-clean-up-stream-or-resource-on-checked-exception-obl-unsatisfied-obligation-exception-edge)

<a id="spotbugs-odr-open-database-resource"></a>

### `spotbugs/ODR_OPEN_DATABASE_RESOURCE`

A SpotBugs bad practice pattern, `ODR_OPEN_DATABASE_RESOURCE`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Open the Connection, Statement and ResultSet in try-with-resources so each closes on every path.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ODR_OPEN_DATABASE_RESOURCE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#odr-method-may-fail-to-close-database-resource-odr-open-database-resource)

<a id="spotbugs-odr-open-database-resource-exception-path"></a>

### `spotbugs/ODR_OPEN_DATABASE_RESOURCE_EXCEPTION_PATH`

A SpotBugs bad practice pattern, `ODR_OPEN_DATABASE_RESOURCE_EXCEPTION_PATH`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Open the Connection, Statement and ResultSet in try-with-resources so each closes when an exception is thrown.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ODR_OPEN_DATABASE_RESOURCE_EXCEPTION_PATH","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#odr-method-may-fail-to-close-database-resource-on-exception-odr-open-database-resource-exception-path)

<a id="spotbugs-os-open-stream"></a>

### `spotbugs/OS_OPEN_STREAM`

A SpotBugs bad practice pattern, `OS_OPEN_STREAM`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Open the stream in try-with-resources so it closes on every path.
- **Exception:** If this is intended, add `{"rule":"spotbugs/OS_OPEN_STREAM","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#os-method-may-fail-to-close-stream-os-open-stream)

<a id="spotbugs-os-open-stream-exception-path"></a>

### `spotbugs/OS_OPEN_STREAM_EXCEPTION_PATH`

A SpotBugs bad practice pattern, `OS_OPEN_STREAM_EXCEPTION_PATH`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Open the stream in try-with-resources so it closes when an exception is thrown.
- **Exception:** If this is intended, add `{"rule":"spotbugs/OS_OPEN_STREAM_EXCEPTION_PATH","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#os-method-may-fail-to-close-stream-on-exception-os-open-stream-exception-path)

<a id="spotbugs-overriding-methods-must-invoke-super"></a>

### `spotbugs/OVERRIDING_METHODS_MUST_INVOKE_SUPER`

A SpotBugs correctness pattern, `OVERRIDING_METHODS_MUST_INVOKE_SUPER`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Call super.method(...) in the override, because the overridden method is annotated to require it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/OVERRIDING_METHODS_MUST_INVOKE_SUPER","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#cn-super-method-is-annotated-with-overridingmethodsmustinvokesuper-but-the-overriding-method-isn-t-calling-the-super-method-overriding-methods-must-invoke-super)

<a id="spotbugs-pa-public-array-attribute"></a>

### `spotbugs/PA_PUBLIC_ARRAY_ATTRIBUTE`

A SpotBugs bad practice pattern, `PA_PUBLIC_ARRAY_ATTRIBUTE`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Make the array field private and final, and return a clone from an accessor or an immutable List.of(...).
- **Exception:** If this is intended, add `{"rule":"spotbugs/PA_PUBLIC_ARRAY_ATTRIBUTE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#pa-array-type-field-is-public-pa-public-array-attribute)

<a id="spotbugs-pa-public-mutable-object-attribute"></a>

### `spotbugs/PA_PUBLIC_MUTABLE_OBJECT_ATTRIBUTE`

A SpotBugs bad practice pattern, `PA_PUBLIC_MUTABLE_OBJECT_ATTRIBUTE`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Make the field private and final, and expose an immutable copy such as List.copyOf(items) from an accessor.
- **Exception:** If this is intended, add `{"rule":"spotbugs/PA_PUBLIC_MUTABLE_OBJECT_ATTRIBUTE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#pa-mutable-object-type-field-is-public-pa-public-mutable-object-attribute)

<a id="spotbugs-pa-public-primitive-attribute"></a>

### `spotbugs/PA_PUBLIC_PRIMITIVE_ATTRIBUTE`

A SpotBugs bad practice pattern, `PA_PUBLIC_PRIMITIVE_ATTRIBUTE`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Make the field private and final with an accessor, or turn the class into a record.
- **Exception:** If this is intended, add `{"rule":"spotbugs/PA_PUBLIC_PRIMITIVE_ATTRIBUTE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#pa-primitive-field-is-public-pa-public-primitive-attribute)

<a id="spotbugs-perm-super-not-called-in-getpermissions"></a>

### `spotbugs/PERM_SUPER_NOT_CALLED_IN_GETPERMISSIONS`

A SpotBugs malicious code vulnerability pattern, `PERM_SUPER_NOT_CALLED_IN_GETPERMISSIONS`.

- **Why it is on:** SpotBugs reports code that untrusted code could abuse, such as an exposed mutable field, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Call super.getPermissions(codeSource) in getPermissions and add to the permissions it returns.
- **Exception:** If this is intended, add `{"rule":"spotbugs/PERM_SUPER_NOT_CALLED_IN_GETPERMISSIONS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#perm-custom-class-loader-does-not-call-its-superclass-s-getpermissions-perm-super-not-called-in-getpermissions)

<a id="spotbugs-pi-do-not-reuse-public-identifiers-class-names"></a>

### `spotbugs/PI_DO_NOT_REUSE_PUBLIC_IDENTIFIERS_CLASS_NAMES`

A SpotBugs bad practice pattern, `PI_DO_NOT_REUSE_PUBLIC_IDENTIFIERS_CLASS_NAMES`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Rename the class so it does not match a JDK type such as List, Optional or Entry; use a domain name like OrderList.
- **Exception:** If this is intended, add `{"rule":"spotbugs/PI_DO_NOT_REUSE_PUBLIC_IDENTIFIERS_CLASS_NAMES","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#pi-do-not-reuse-public-identifiers-from-jsl-as-class-name-pi-do-not-reuse-public-identifiers-class-names)

<a id="spotbugs-pi-do-not-reuse-public-identifiers-field-names"></a>

### `spotbugs/PI_DO_NOT_REUSE_PUBLIC_IDENTIFIERS_FIELD_NAMES`

A SpotBugs bad practice pattern, `PI_DO_NOT_REUSE_PUBLIC_IDENTIFIERS_FIELD_NAMES`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Rename the field so it does not match a JDK class name; use a domain name such as orderList.
- **Exception:** If this is intended, add `{"rule":"spotbugs/PI_DO_NOT_REUSE_PUBLIC_IDENTIFIERS_FIELD_NAMES","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#pi-do-not-reuse-public-identifiers-from-jsl-as-field-name-pi-do-not-reuse-public-identifiers-field-names)

<a id="spotbugs-pi-do-not-reuse-public-identifiers-local-variable-names"></a>

### `spotbugs/PI_DO_NOT_REUSE_PUBLIC_IDENTIFIERS_LOCAL_VARIABLE_NAMES`

A SpotBugs bad practice pattern, `PI_DO_NOT_REUSE_PUBLIC_IDENTIFIERS_LOCAL_VARIABLE_NAMES`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Rename the local so it does not match a JDK class name; use a domain name such as orderList.
- **Exception:** If this is intended, add `{"rule":"spotbugs/PI_DO_NOT_REUSE_PUBLIC_IDENTIFIERS_LOCAL_VARIABLE_NAMES","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#pi-do-not-reuse-public-identifiers-from-jsl-as-method-name-pi-do-not-reuse-public-identifiers-local-variable-names)

<a id="spotbugs-pi-do-not-reuse-public-identifiers-method-names"></a>

### `spotbugs/PI_DO_NOT_REUSE_PUBLIC_IDENTIFIERS_METHOD_NAMES`

A SpotBugs bad practice pattern, `PI_DO_NOT_REUSE_PUBLIC_IDENTIFIERS_METHOD_NAMES`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Rename the method so it does not match a JDK class name; use a domain verb such as parseOrder.
- **Exception:** If this is intended, add `{"rule":"spotbugs/PI_DO_NOT_REUSE_PUBLIC_IDENTIFIERS_METHOD_NAMES","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#pi-do-not-reuse-public-identifiers-from-jsl-as-method-name-pi-do-not-reuse-public-identifiers-method-names)

<a id="spotbugs-ps-public-semaphores"></a>

### `spotbugs/PS_PUBLIC_SEMAPHORES`

A SpotBugs dodgy code pattern, `PS_PUBLIC_SEMAPHORES`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Synchronize and call wait and notify on a private final lock Object, not on this.
- **Exception:** If this is intended, add `{"rule":"spotbugs/PS_PUBLIC_SEMAPHORES","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ps-class-exposes-synchronization-and-semaphores-in-its-public-interface-ps-public-semaphores)

<a id="spotbugs-pt-absolute-path-traversal"></a>

### `spotbugs/PT_ABSOLUTE_PATH_TRAVERSAL`

A SpotBugs security pattern, `PT_ABSOLUTE_PATH_TRAVERSAL`.

- **Why it is on:** SpotBugs reports code that untrusted input can exploit, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Resolve the user value against a fixed base with Path.resolve, normalize it, and check startsWith(base) before opening.
- **Exception:** If this is intended, add `{"rule":"spotbugs/PT_ABSOLUTE_PATH_TRAVERSAL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#pt-absolute-path-traversal-in-servlet-pt-absolute-path-traversal)

<a id="spotbugs-pt-relative-path-traversal"></a>

### `spotbugs/PT_RELATIVE_PATH_TRAVERSAL`

A SpotBugs security pattern, `PT_RELATIVE_PATH_TRAVERSAL`.

- **Why it is on:** SpotBugs reports code that untrusted input can exploit, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Resolve the user value against a fixed base with Path.resolve, normalize it, and check startsWith(base) before opening.
- **Exception:** If this is intended, add `{"rule":"spotbugs/PT_RELATIVE_PATH_TRAVERSAL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#pt-relative-path-traversal-in-servlet-pt-relative-path-traversal)

<a id="spotbugs-pz-dont-reuse-entry-objects-in-iterators"></a>

### `spotbugs/PZ_DONT_REUSE_ENTRY_OBJECTS_IN_ITERATORS`

A SpotBugs bad practice pattern, `PZ_DONT_REUSE_ENTRY_OBJECTS_IN_ITERATORS`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Return a new Map.Entry on each next() call, such as Map.entry(k, v), instead of making the iterator itself the entry.
- **Exception:** If this is intended, add `{"rule":"spotbugs/PZ_DONT_REUSE_ENTRY_OBJECTS_IN_ITERATORS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#pz-don-t-reuse-entry-objects-in-iterators-pz-dont-reuse-entry-objects-in-iterators)

<a id="spotbugs-pzla-prefer-zero-length-arrays"></a>

### `spotbugs/PZLA_PREFER_ZERO_LENGTH_ARRAYS`

A SpotBugs dodgy code pattern, `PZLA_PREFER_ZERO_LENGTH_ARRAYS`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Return an empty array (a static final zero-length constant) or List.of() instead of null.
- **Exception:** If this is intended, add `{"rule":"spotbugs/PZLA_PREFER_ZERO_LENGTH_ARRAYS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#pzla-consider-returning-a-zero-length-array-rather-than-null-pzla-prefer-zero-length-arrays)

<a id="spotbugs-qba-questionable-boolean-assignment"></a>

### `spotbugs/QBA_QUESTIONABLE_BOOLEAN_ASSIGNMENT`

A SpotBugs correctness pattern, `QBA_QUESTIONABLE_BOOLEAN_ASSIGNMENT`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Write the comparison with == or just the boolean: if (flag), not if (flag = true).
- **Exception:** If this is intended, add `{"rule":"spotbugs/QBA_QUESTIONABLE_BOOLEAN_ASSIGNMENT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#qba-method-assigns-boolean-literal-in-boolean-expression-qba-questionable-boolean-assignment)

<a id="spotbugs-qf-questionable-for-loop"></a>

### `spotbugs/QF_QUESTIONABLE_FOR_LOOP`

A SpotBugs dodgy code pattern, `QF_QUESTIONABLE_FOR_LOOP`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Test and increment the same variable the loop declares, or write a for-each loop.
- **Exception:** If this is intended, add `{"rule":"spotbugs/QF_QUESTIONABLE_FOR_LOOP","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#qf-complicated-subtle-or-wrong-increment-in-for-loop-qf-questionable-for-loop)

<a id="spotbugs-range-array-index"></a>

### `spotbugs/RANGE_ARRAY_INDEX`

A SpotBugs correctness pattern, `RANGE_ARRAY_INDEX`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Check the index is within 0 and array.length - 1 before the access, or fix the index computation.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RANGE_ARRAY_INDEX","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#range-array-index-is-out-of-bounds-range-array-index)

<a id="spotbugs-range-array-length"></a>

### `spotbugs/RANGE_ARRAY_LENGTH`

A SpotBugs correctness pattern, `RANGE_ARRAY_LENGTH`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Pass a length that fits the array (offset + length \<= array.length), or fix the computation.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RANGE_ARRAY_LENGTH","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#range-array-length-is-out-of-bounds-range-array-length)

<a id="spotbugs-range-array-offset"></a>

### `spotbugs/RANGE_ARRAY_OFFSET`

A SpotBugs correctness pattern, `RANGE_ARRAY_OFFSET`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Pass an offset between 0 and array.length, or fix the computation.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RANGE_ARRAY_OFFSET","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#range-array-offset-is-out-of-bounds-range-array-offset)

<a id="spotbugs-range-string-index"></a>

### `spotbugs/RANGE_STRING_INDEX`

A SpotBugs correctness pattern, `RANGE_STRING_INDEX`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Check the index is within 0 and length() before calling charAt or substring, or fix the computation.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RANGE_STRING_INDEX","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#range-string-index-is-out-of-bounds-range-string-index)

<a id="spotbugs-rc-ref-comparison"></a>

### `spotbugs/RC_REF_COMPARISON`

A SpotBugs correctness pattern, `RC_REF_COMPARISON`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Compare boxed values with equals, or unbox them first; == on Integer, Long or Boolean compares references.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RC_REF_COMPARISON","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#rc-suspicious-reference-comparison-rc-ref-comparison)

<a id="spotbugs-rc-ref-comparison-bad-practice"></a>

### `spotbugs/RC_REF_COMPARISON_BAD_PRACTICE`

A SpotBugs bad practice pattern, `RC_REF_COMPARISON_BAD_PRACTICE`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Compare with equals, for example a.equals(b) or Objects.equals(a, b), instead of == on boxed values.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RC_REF_COMPARISON_BAD_PRACTICE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#rc-suspicious-reference-comparison-to-constant-rc-ref-comparison-bad-practice)

<a id="spotbugs-rc-ref-comparison-bad-practice-boolean"></a>

### `spotbugs/RC_REF_COMPARISON_BAD_PRACTICE_BOOLEAN`

A SpotBugs bad practice pattern, `RC_REF_COMPARISON_BAD_PRACTICE_BOOLEAN`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Compare with Boolean.TRUE.equals(x) or unbox to a primitive boolean, not == between Boolean objects.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RC_REF_COMPARISON_BAD_PRACTICE_BOOLEAN","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#rc-suspicious-reference-comparison-of-boolean-values-rc-ref-comparison-bad-practice-boolean)

<a id="spotbugs-rcn-redundant-comparison-of-null-and-nonnull-value"></a>

### `spotbugs/RCN_REDUNDANT_COMPARISON_OF_NULL_AND_NONNULL_VALUE`

A SpotBugs dodgy code pattern, `RCN_REDUNDANT_COMPARISON_OF_NULL_AND_NONNULL_VALUE`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove the null comparison on a value that cannot be null here, or fix the earlier assumption.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RCN_REDUNDANT_COMPARISON_OF_NULL_AND_NONNULL_VALUE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#rcn-redundant-comparison-of-non-null-value-to-null-rcn-redundant-comparison-of-null-and-nonnull-value)

<a id="spotbugs-rcn-redundant-comparison-two-null-values"></a>

### `spotbugs/RCN_REDUNDANT_COMPARISON_TWO_NULL_VALUES`

A SpotBugs dodgy code pattern, `RCN_REDUNDANT_COMPARISON_TWO_NULL_VALUES`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove the comparison of two values that are both null here, or fix the earlier assignment that made them so.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RCN_REDUNDANT_COMPARISON_TWO_NULL_VALUES","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#rcn-redundant-comparison-of-two-null-values-rcn-redundant-comparison-two-null-values)

<a id="spotbugs-rcn-redundant-nullcheck-of-nonnull-value"></a>

### `spotbugs/RCN_REDUNDANT_NULLCHECK_OF_NONNULL_VALUE`

A SpotBugs dodgy code pattern, `RCN_REDUNDANT_NULLCHECK_OF_NONNULL_VALUE`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove the null check on a value that cannot be null here, or fix the earlier code that made that assumption.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RCN_REDUNDANT_NULLCHECK_OF_NONNULL_VALUE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#rcn-redundant-nullcheck-of-value-known-to-be-non-null-rcn-redundant-nullcheck-of-nonnull-value)

<a id="spotbugs-rcn-redundant-nullcheck-of-null-value"></a>

### `spotbugs/RCN_REDUNDANT_NULLCHECK_OF_NULL_VALUE`

A SpotBugs dodgy code pattern, `RCN_REDUNDANT_NULLCHECK_OF_NULL_VALUE`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove the null check on a value that is always null here, and fix the earlier code that left it null.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RCN_REDUNDANT_NULLCHECK_OF_NULL_VALUE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#rcn-redundant-nullcheck-of-value-known-to-be-null-rcn-redundant-nullcheck-of-null-value)

<a id="spotbugs-rcn-redundant-nullcheck-would-have-been-a-npe"></a>

### `spotbugs/RCN_REDUNDANT_NULLCHECK_WOULD_HAVE_BEEN_A_NPE`

A SpotBugs correctness pattern, `RCN_REDUNDANT_NULLCHECK_WOULD_HAVE_BEEN_A_NPE`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Move the null check ahead of the dereference, or remove it if the value can never be null.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RCN_REDUNDANT_NULLCHECK_WOULD_HAVE_BEEN_A_NPE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#rcn-nullcheck-of-value-previously-dereferenced-rcn-redundant-nullcheck-would-have-been-a-npe)

<a id="spotbugs-re-bad-syntax-for-regular-expression"></a>

### `spotbugs/RE_BAD_SYNTAX_FOR_REGULAR_EXPRESSION`

A SpotBugs correctness pattern, `RE_BAD_SYNTAX_FOR_REGULAR_EXPRESSION`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Correct the pattern, or build it with Pattern.quote for literal text; test it with a unit test.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RE_BAD_SYNTAX_FOR_REGULAR_EXPRESSION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#re-invalid-syntax-for-regular-expression-re-bad-syntax-for-regular-expression)

<a id="spotbugs-re-cant-use-file-separator-as-regular-expression"></a>

### `spotbugs/RE_CANT_USE_FILE_SEPARATOR_AS_REGULAR_EXPRESSION`

A SpotBugs correctness pattern, `RE_CANT_USE_FILE_SEPARATOR_AS_REGULAR_EXPRESSION`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use Pattern.quote(File.separator), or work on Path and call getFileName and getParent instead of splitting.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RE_CANT_USE_FILE_SEPARATOR_AS_REGULAR_EXPRESSION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#re-file-separator-used-for-regular-expression-re-cant-use-file-separator-as-regular-expression)

<a id="spotbugs-re-possible-unintended-pattern"></a>

### `spotbugs/RE_POSSIBLE_UNINTENDED_PATTERN`

A SpotBugs correctness pattern, `RE_POSSIBLE_UNINTENDED_PATTERN`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Escape the dot or quote the text, split(Pattern.quote(".")), or pass a real regex; "." matches every character.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RE_POSSIBLE_UNINTENDED_PATTERN","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#re-or-used-for-regular-expression-re-possible-unintended-pattern)

<a id="spotbugs-rec-catch-exception"></a>

### `spotbugs/REC_CATCH_EXCEPTION`

A SpotBugs dodgy code pattern, `REC_CATCH_EXCEPTION`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Catch the specific checked exceptions the try block throws, so runtime exceptions propagate.
- **Exception:** If this is intended, add `{"rule":"spotbugs/REC_CATCH_EXCEPTION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#rec-exception-is-caught-when-exception-is-not-thrown-rec-catch-exception)

<a id="spotbugs-reflc-reflection-may-increase-accessibility-of-class"></a>

### `spotbugs/REFLC_REFLECTION_MAY_INCREASE_ACCESSIBILITY_OF_CLASS`

A SpotBugs malicious code vulnerability pattern, `REFLC_REFLECTION_MAY_INCREASE_ACCESSIBILITY_OF_CLASS`.

- **Why it is on:** SpotBugs reports code that untrusted code could abuse, such as an exposed mutable field, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Avoid reflection on classes that are not public; use a public API, a MethodHandles.Lookup, or an interface.
- **Exception:** If this is intended, add `{"rule":"spotbugs/REFLC_REFLECTION_MAY_INCREASE_ACCESSIBILITY_OF_CLASS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#reflc-public-method-uses-reflection-to-create-a-class-it-gets-in-its-parameter-which-could-increase-the-accessibility-of-any-class-reflc-reflection-may-increase-accessibility-of-class)

<a id="spotbugs-reflf-reflection-may-increase-accessibility-of-field"></a>

### `spotbugs/REFLF_REFLECTION_MAY_INCREASE_ACCESSIBILITY_OF_FIELD`

A SpotBugs malicious code vulnerability pattern, `REFLF_REFLECTION_MAY_INCREASE_ACCESSIBILITY_OF_FIELD`.

- **Why it is on:** SpotBugs reports code that untrusted code could abuse, such as an exposed mutable field, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Avoid setAccessible on fields; use a public accessor, a MethodHandles.Lookup, or a VarHandle.
- **Exception:** If this is intended, add `{"rule":"spotbugs/REFLF_REFLECTION_MAY_INCREASE_ACCESSIBILITY_OF_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#reflf-public-method-uses-reflection-to-modify-a-field-it-gets-in-its-parameter-which-could-increase-the-accessibility-of-any-class-reflf-reflection-may-increase-accessibility-of-field)

<a id="spotbugs-ri-redundant-interfaces"></a>

### `spotbugs/RI_REDUNDANT_INTERFACES`

A SpotBugs dodgy code pattern, `RI_REDUNDANT_INTERFACES`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove the interface from the implements clause, since the superclass already implements it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RI_REDUNDANT_INTERFACES","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ri-class-implements-same-interface-as-superclass-ri-redundant-interfaces)

<a id="spotbugs-rpc-repeated-conditional-test"></a>

### `spotbugs/RpC_REPEATED_CONDITIONAL_TEST`

A SpotBugs correctness pattern, `RpC_REPEATED_CONDITIONAL_TEST`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Fix the repeated condition so the second test checks something different, or delete it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RpC_REPEATED_CONDITIONAL_TEST","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#rpc-repeated-conditional-tests-rpc-repeated-conditional-test)

<a id="spotbugs-rr-not-checked"></a>

### `spotbugs/RR_NOT_CHECKED`

A SpotBugs bad practice pattern, `RR_NOT_CHECKED`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Check the count returned by read(buf) in a loop, or use readNBytes or readAllBytes, so short reads are handled.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RR_NOT_CHECKED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#rr-method-ignores-results-of-inputstream-read-rr-not-checked)

<a id="spotbugs-rs-readobject-sync"></a>

### `spotbugs/RS_READOBJECT_SYNC`

A SpotBugs multithreaded correctness pattern, `RS_READOBJECT_SYNC`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove synchronized from readObject; the object being deserialized is not shared yet.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RS_READOBJECT_SYNC","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#rs-class-s-readobject-method-is-synchronized-rs-readobject-sync)

<a id="spotbugs-ru-invoke-run"></a>

### `spotbugs/RU_INVOKE_RUN`

A SpotBugs multithreaded correctness pattern, `RU_INVOKE_RUN`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Call start() to run in a new thread, or submit the Runnable to an ExecutorService; run() executes on the current thread.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RU_INVOKE_RUN","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ru-invokes-run-on-a-thread-did-you-mean-to-start-it-instead-ru-invoke-run)

<a id="spotbugs-rv-01-to-int"></a>

### `spotbugs/RV_01_TO_INT`

A SpotBugs correctness pattern, `RV_01_TO_INT`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Cast after the multiplication: (int) (Math.random() \* n), or use ThreadLocalRandom.current().nextInt(n).
- **Exception:** If this is intended, add `{"rule":"spotbugs/RV_01_TO_INT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#rv-random-value-from-0-to-1-is-coerced-to-the-integer-0-rv-01-to-int)

<a id="spotbugs-rv-absolute-value-of-hashcode"></a>

### `spotbugs/RV_ABSOLUTE_VALUE_OF_HASHCODE`

A SpotBugs correctness pattern, `RV_ABSOLUTE_VALUE_OF_HASHCODE`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use Math.floorMod(x.hashCode(), n); Math.abs of Integer.MIN_VALUE is still negative.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RV_ABSOLUTE_VALUE_OF_HASHCODE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#rv-bad-attempt-to-compute-absolute-value-of-signed-32-bit-hashcode-rv-absolute-value-of-hashcode)

<a id="spotbugs-rv-absolute-value-of-random-int"></a>

### `spotbugs/RV_ABSOLUTE_VALUE_OF_RANDOM_INT`

A SpotBugs correctness pattern, `RV_ABSOLUTE_VALUE_OF_RANDOM_INT`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use random.nextInt(n), which is never negative, instead of Math.abs(random.nextInt()) % n.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RV_ABSOLUTE_VALUE_OF_RANDOM_INT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#rv-bad-attempt-to-compute-absolute-value-of-signed-random-integer-rv-absolute-value-of-random-int)

<a id="spotbugs-rv-check-compareto-for-specific-return-value"></a>

### `spotbugs/RV_CHECK_COMPARETO_FOR_SPECIFIC_RETURN_VALUE`

A SpotBugs correctness pattern, `RV_CHECK_COMPARETO_FOR_SPECIFIC_RETURN_VALUE`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Test only the sign: compareTo(x) \< 0, == 0 or > 0, never == 1 or == -1.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RV_CHECK_COMPARETO_FOR_SPECIFIC_RETURN_VALUE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#rv-code-checks-for-specific-values-returned-by-compareto-rv-check-compareto-for-specific-return-value)

<a id="spotbugs-rv-check-for-positive-indexof"></a>

### `spotbugs/RV_CHECK_FOR_POSITIVE_INDEXOF`

A SpotBugs dodgy code pattern, `RV_CHECK_FOR_POSITIVE_INDEXOF`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Test indexOf(x) >= 0 or use contains(x); indexOf(x) > 0 misses a match at position 0.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RV_CHECK_FOR_POSITIVE_INDEXOF","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#rv-method-checks-to-see-if-result-of-string-indexof-is-positive-rv-check-for-positive-indexof)

<a id="spotbugs-rv-dont-just-null-check-readline"></a>

### `spotbugs/RV_DONT_JUST_NULL_CHECK_READLINE`

A SpotBugs dodgy code pattern, `RV_DONT_JUST_NULL_CHECK_READLINE`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Assign readLine() to a variable in the loop condition and use that variable, so no line is discarded.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RV_DONT_JUST_NULL_CHECK_READLINE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#rv-method-discards-result-of-readline-after-checking-if-it-is-non-null-rv-dont-just-null-check-readline)

<a id="spotbugs-rv-exception-not-thrown"></a>

### `spotbugs/RV_EXCEPTION_NOT_THROWN`

A SpotBugs correctness pattern, `RV_EXCEPTION_NOT_THROWN`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Add throw before new SomeException(...), or delete the unused exception.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RV_EXCEPTION_NOT_THROWN","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#rv-exception-created-and-dropped-rather-than-thrown-rv-exception-not-thrown)

<a id="spotbugs-rv-negating-result-of-compareto"></a>

### `spotbugs/RV_NEGATING_RESULT_OF_COMPARETO`

A SpotBugs bad practice pattern, `RV_NEGATING_RESULT_OF_COMPARETO`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Swap the operands, compare(b, a) or b.compareTo(a), instead of negating a compareTo result.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RV_NEGATING_RESULT_OF_COMPARETO","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#rv-negating-the-result-of-compareto-compare-rv-negating-result-of-compareto)

<a id="spotbugs-rv-rem-of-hashcode"></a>

### `spotbugs/RV_REM_OF_HASHCODE`

A SpotBugs dodgy code pattern, `RV_REM_OF_HASHCODE`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use Math.floorMod(x.hashCode(), n), because hashCode() can be negative.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RV_REM_OF_HASHCODE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#rv-remainder-of-hashcode-could-be-negative-rv-rem-of-hashcode)

<a id="spotbugs-rv-rem-of-random-int"></a>

### `spotbugs/RV_REM_OF_RANDOM_INT`

A SpotBugs dodgy code pattern, `RV_REM_OF_RANDOM_INT`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Call random.nextInt(n) for a bounded value; nextInt() % n can be negative.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RV_REM_OF_RANDOM_INT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#rv-remainder-of-32-bit-signed-random-integer-rv-rem-of-random-int)

<a id="spotbugs-rv-return-value-ignored"></a>

### `spotbugs/RV_RETURN_VALUE_IGNORED`

A SpotBugs correctness pattern, `RV_RETURN_VALUE_IGNORED`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use the returned value, e.g. assign it: s = s.trim(); the call does not change the receiver.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RV_RETURN_VALUE_IGNORED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#rv-method-ignores-return-value-rv-return-value-ignored)

<a id="spotbugs-rv-return-value-ignored-bad-practice"></a>

### `spotbugs/RV_RETURN_VALUE_IGNORED_BAD_PRACTICE`

A SpotBugs bad practice pattern, `RV_RETURN_VALUE_IGNORED_BAD_PRACTICE`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use the return value: check the boolean from File.delete or mkdirs, or call Files.delete or Files.createDirectories, which throw.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RV_RETURN_VALUE_IGNORED_BAD_PRACTICE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#rv-method-ignores-exceptional-return-value-rv-return-value-ignored-bad-practice)

<a id="spotbugs-rv-return-value-ignored-inferred"></a>

### `spotbugs/RV_RETURN_VALUE_IGNORED_INFERRED`

A SpotBugs dodgy code pattern, `RV_RETURN_VALUE_IGNORED_INFERRED`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use the returned value, or remove the call when it only produces a value.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RV_RETURN_VALUE_IGNORED_INFERRED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#rv-method-ignores-return-value-is-this-ok-rv-return-value-ignored-inferred)

<a id="spotbugs-rv-return-value-ignored-no-side-effect"></a>

### `spotbugs/RV_RETURN_VALUE_IGNORED_NO_SIDE_EFFECT`

A SpotBugs dodgy code pattern, `RV_RETURN_VALUE_IGNORED_NO_SIDE_EFFECT`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use the returned value, or delete the call; the method has no other effect.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RV_RETURN_VALUE_IGNORED_NO_SIDE_EFFECT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#rv-return-value-of-method-without-side-effect-is-ignored-rv-return-value-ignored-no-side-effect)

<a id="spotbugs-rv-return-value-of-putifabsent-ignored"></a>

### `spotbugs/RV_RETURN_VALUE_OF_PUTIFABSENT_IGNORED`

A SpotBugs multithreaded correctness pattern, `RV_RETURN_VALUE_OF_PUTIFABSENT_IGNORED`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use the value putIfAbsent returns (the existing entry), or call computeIfAbsent and use its result.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RV_RETURN_VALUE_OF_PUTIFABSENT_IGNORED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#rv-return-value-of-putifabsent-ignored-value-passed-to-putifabsent-reused-rv-return-value-of-putifabsent-ignored)

<a id="spotbugs-sa-field-double-assignment"></a>

### `spotbugs/SA_FIELD_DOUBLE_ASSIGNMENT`

A SpotBugs dodgy code pattern, `SA_FIELD_DOUBLE_ASSIGNMENT`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Delete the first assignment to the field, or assign the other field that was meant.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SA_FIELD_DOUBLE_ASSIGNMENT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#sa-double-assignment-of-field-sa-field-double-assignment)

<a id="spotbugs-sa-field-self-assignment"></a>

### `spotbugs/SA_FIELD_SELF_ASSIGNMENT`

A SpotBugs correctness pattern, `SA_FIELD_SELF_ASSIGNMENT`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Delete the self-assignment, or assign the intended value to the field.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SA_FIELD_SELF_ASSIGNMENT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#sa-self-assignment-of-field-sa-field-self-assignment)

<a id="spotbugs-sa-field-self-comparison"></a>

### `spotbugs/SA_FIELD_SELF_COMPARISON`

A SpotBugs correctness pattern, `SA_FIELD_SELF_COMPARISON`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Compare the field with the other value you meant; comparing it with itself is constant.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SA_FIELD_SELF_COMPARISON","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#sa-self-comparison-of-field-with-itself-sa-field-self-comparison)

<a id="spotbugs-sa-field-self-computation"></a>

### `spotbugs/SA_FIELD_SELF_COMPUTATION`

A SpotBugs correctness pattern, `SA_FIELD_SELF_COMPUTATION`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Replace the self-computation (x & x, x - x) with the intended operands.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SA_FIELD_SELF_COMPUTATION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#sa-nonsensical-self-computation-involving-a-field-e-g-x-x-sa-field-self-computation)

<a id="spotbugs-sa-local-double-assignment"></a>

### `spotbugs/SA_LOCAL_DOUBLE_ASSIGNMENT`

A SpotBugs dodgy code pattern, `SA_LOCAL_DOUBLE_ASSIGNMENT`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Keep a single assignment of the local and delete the repeated one.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SA_LOCAL_DOUBLE_ASSIGNMENT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#sa-double-assignment-of-local-variable-sa-local-double-assignment)

<a id="spotbugs-sa-local-self-assignment"></a>

### `spotbugs/SA_LOCAL_SELF_ASSIGNMENT`

A SpotBugs dodgy code pattern, `SA_LOCAL_SELF_ASSIGNMENT`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove x = x, or assign from the variable that was meant; a self-assignment does nothing.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SA_LOCAL_SELF_ASSIGNMENT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#sa-self-assignment-of-local-variable-sa-local-self-assignment)

<a id="spotbugs-sa-local-self-assignment-instead-of-field"></a>

### `spotbugs/SA_LOCAL_SELF_ASSIGNMENT_INSTEAD_OF_FIELD`

A SpotBugs correctness pattern, `SA_LOCAL_SELF_ASSIGNMENT_INSTEAD_OF_FIELD`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Write this.name = name so the parameter is stored in the field.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SA_LOCAL_SELF_ASSIGNMENT_INSTEAD_OF_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#sa-self-assignment-of-local-rather-than-assignment-to-field-sa-local-self-assignment-instead-of-field)

<a id="spotbugs-sa-local-self-comparison"></a>

### `spotbugs/SA_LOCAL_SELF_COMPARISON`

A SpotBugs correctness pattern, `SA_LOCAL_SELF_COMPARISON`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Compare with the other value you meant; comparing a local with itself is constant. Use Double.isNaN for NaN.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SA_LOCAL_SELF_COMPARISON","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#sa-self-comparison-of-value-with-itself-sa-local-self-comparison)

<a id="spotbugs-sa-local-self-computation"></a>

### `spotbugs/SA_LOCAL_SELF_COMPUTATION`

A SpotBugs correctness pattern, `SA_LOCAL_SELF_COMPUTATION`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Replace the self-computation (x & x, x - x) with the intended operands.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SA_LOCAL_SELF_COMPUTATION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#sa-nonsensical-self-computation-involving-a-variable-e-g-x-x-sa-local-self-computation)

<a id="spotbugs-sbsc-use-stringbuffer-concatenation"></a>

### `spotbugs/SBSC_USE_STRINGBUFFER_CONCATENATION`

A SpotBugs performance pattern, `SBSC_USE_STRINGBUFFER_CONCATENATION`.

- **Why it is on:** SpotBugs reports code that is correct but needlessly slow or wasteful, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Append inside the loop to a StringBuilder and call toString() once after it, or use String.join or a Collectors.joining stream.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SBSC_USE_STRINGBUFFER_CONCATENATION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#sbsc-method-concatenates-strings-using-in-a-loop-sbsc-use-stringbuffer-concatenation)

<a id="spotbugs-sc-start-in-ctor"></a>

### `spotbugs/SC_START_IN_CTOR`

A SpotBugs multithreaded correctness pattern, `SC_START_IN_CTOR`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Move start() out of the constructor into a start() method or static factory called after construction.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SC_START_IN_CTOR","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#sc-constructor-invokes-thread-start-sc-start-in-ctor)

<a id="spotbugs-se-bad-field"></a>

### `spotbugs/SE_BAD_FIELD`

A SpotBugs bad practice pattern, `SE_BAD_FIELD`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Give the field a Serializable type (an id, a String or a serializable record), or mark it transient and rebuild it in readObject.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SE_BAD_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#se-non-transient-non-serializable-instance-field-in-serializable-class-se-bad-field)

<a id="spotbugs-se-bad-field-inner-class"></a>

### `spotbugs/SE_BAD_FIELD_INNER_CLASS`

A SpotBugs bad practice pattern, `SE_BAD_FIELD_INNER_CLASS`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Make the inner class a static nested class, so it does not hold a non-serializable outer instance.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SE_BAD_FIELD_INNER_CLASS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#se-non-serializable-class-has-a-serializable-inner-class-se-bad-field-inner-class)

<a id="spotbugs-se-bad-field-store"></a>

### `spotbugs/SE_BAD_FIELD_STORE`

A SpotBugs bad practice pattern, `SE_BAD_FIELD_STORE`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Store a Serializable value (an id, a String or a serializable record) in the field, or mark it transient and rebuild it in readObject.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SE_BAD_FIELD_STORE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#se-non-serializable-value-stored-into-instance-field-of-a-serializable-class-se-bad-field-store)

<a id="spotbugs-se-comparator-should-be-serializable"></a>

### `spotbugs/SE_COMPARATOR_SHOULD_BE_SERIALIZABLE`

A SpotBugs bad practice pattern, `SE_COMPARATOR_SHOULD_BE_SERIALIZABLE`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Build the comparator with Comparator.comparing(Foo::key) instead of a Comparator class, or add implements Serializable if a serialized collection holds it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SE_COMPARATOR_SHOULD_BE_SERIALIZABLE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#se-comparator-doesn-t-implement-serializable-se-comparator-should-be-serializable)

<a id="spotbugs-se-inner-class"></a>

### `spotbugs/SE_INNER_CLASS`

A SpotBugs bad practice pattern, `SE_INNER_CLASS`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Make the serializable inner class static, so it does not capture the outer instance.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SE_INNER_CLASS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#se-serializable-inner-class-se-inner-class)

<a id="spotbugs-se-method-must-be-private"></a>

### `spotbugs/SE_METHOD_MUST_BE_PRIVATE`

A SpotBugs correctness pattern, `SE_METHOD_MUST_BE_PRIVATE`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Declare writeObject, readObject, readObjectNoData as private so serialization calls them.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SE_METHOD_MUST_BE_PRIVATE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#se-method-must-be-private-in-order-for-serialization-to-work-se-method-must-be-private)

<a id="spotbugs-se-no-serialversionid"></a>

### `spotbugs/SE_NO_SERIALVERSIONID`

A SpotBugs bad practice pattern, `SE_NO_SERIALVERSIONID`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Add private static final long serialVersionUID = 1L; or stop implementing Serializable.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SE_NO_SERIALVERSIONID","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#snvi-class-is-serializable-but-doesn-t-define-serialversionuid-se-no-serialversionid)

<a id="spotbugs-se-no-suitable-constructor"></a>

### `spotbugs/SE_NO_SUITABLE_CONSTRUCTOR`

A SpotBugs bad practice pattern, `SE_NO_SUITABLE_CONSTRUCTOR`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Give the first non-serializable superclass an accessible no-argument constructor, or make that superclass serializable.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SE_NO_SUITABLE_CONSTRUCTOR","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#se-class-is-serializable-but-its-superclass-doesn-t-define-a-void-constructor-se-no-suitable-constructor)

<a id="spotbugs-se-no-suitable-constructor-for-externalization"></a>

### `spotbugs/SE_NO_SUITABLE_CONSTRUCTOR_FOR_EXTERNALIZATION`

A SpotBugs bad practice pattern, `SE_NO_SUITABLE_CONSTRUCTOR_FOR_EXTERNALIZATION`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Add a public no-argument constructor to the Externalizable class.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SE_NO_SUITABLE_CONSTRUCTOR_FOR_EXTERNALIZATION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#se-class-is-externalizable-but-doesn-t-define-a-void-constructor-se-no-suitable-constructor-for-externalization)

<a id="spotbugs-se-nonfinal-serialversionid"></a>

### `spotbugs/SE_NONFINAL_SERIALVERSIONID`

A SpotBugs bad practice pattern, `SE_NONFINAL_SERIALVERSIONID`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Declare it exactly as: private static final long serialVersionUID = 1L;
- **Exception:** If this is intended, add `{"rule":"spotbugs/SE_NONFINAL_SERIALVERSIONID","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#se-serialversionuid-isn-t-final-se-nonfinal-serialversionid)

<a id="spotbugs-se-nonlong-serialversionid"></a>

### `spotbugs/SE_NONLONG_SERIALVERSIONID`

A SpotBugs bad practice pattern, `SE_NONLONG_SERIALVERSIONID`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Declare it exactly as: private static final long serialVersionUID = 1L;
- **Exception:** If this is intended, add `{"rule":"spotbugs/SE_NONLONG_SERIALVERSIONID","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#se-serialversionuid-isn-t-long-se-nonlong-serialversionid)

<a id="spotbugs-se-nonstatic-serialversionid"></a>

### `spotbugs/SE_NONSTATIC_SERIALVERSIONID`

A SpotBugs bad practice pattern, `SE_NONSTATIC_SERIALVERSIONID`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Declare it exactly as: private static final long serialVersionUID = 1L;
- **Exception:** If this is intended, add `{"rule":"spotbugs/SE_NONSTATIC_SERIALVERSIONID","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#se-serialversionuid-isn-t-static-se-nonstatic-serialversionid)

<a id="spotbugs-se-prevent-ext-obj-overwrite"></a>

### `spotbugs/SE_PREVENT_EXT_OBJ_OVERWRITE`

A SpotBugs bad practice pattern, `SE_PREVENT_EXT_OBJ_OVERWRITE`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Guard readExternal with a private initialized flag that is set once, or stop using Externalizable.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SE_PREVENT_EXT_OBJ_OVERWRITE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#se-prevent-overwriting-of-externalizable-objects-se-prevent-ext-obj-overwrite)

<a id="spotbugs-se-private-read-resolve-not-inherited"></a>

### `spotbugs/SE_PRIVATE_READ_RESOLVE_NOT_INHERITED`

A SpotBugs dodgy code pattern, `SE_PRIVATE_READ_RESOLVE_NOT_INHERITED`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Make readResolve protected so subclasses inherit it, or make the class final.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SE_PRIVATE_READ_RESOLVE_NOT_INHERITED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#se-private-readresolve-method-not-inherited-by-subclasses-se-private-read-resolve-not-inherited)

<a id="spotbugs-se-read-resolve-is-static"></a>

### `spotbugs/SE_READ_RESOLVE_IS_STATIC`

A SpotBugs correctness pattern, `SE_READ_RESOLVE_IS_STATIC`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Make readResolve an instance method (no static) so serialization calls it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SE_READ_RESOLVE_IS_STATIC","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#se-the-readresolve-method-must-not-be-declared-as-a-static-method-se-read-resolve-is-static)

<a id="spotbugs-se-read-resolve-must-return-object"></a>

### `spotbugs/SE_READ_RESOLVE_MUST_RETURN_OBJECT`

A SpotBugs bad practice pattern, `SE_READ_RESOLVE_MUST_RETURN_OBJECT`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Declare readResolve as returning Object, with throws ObjectStreamException if needed.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SE_READ_RESOLVE_MUST_RETURN_OBJECT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#se-the-readresolve-method-must-be-declared-with-a-return-type-of-object-se-read-resolve-must-return-object)

<a id="spotbugs-se-transient-field-not-restored"></a>

### `spotbugs/SE_TRANSIENT_FIELD_NOT_RESTORED`

A SpotBugs bad practice pattern, `SE_TRANSIENT_FIELD_NOT_RESTORED`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Restore the transient field in readObject or readResolve, or make it a non-transient serializable field.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SE_TRANSIENT_FIELD_NOT_RESTORED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#se-transient-field-that-isn-t-set-by-deserialization-se-transient-field-not-restored)

<a id="spotbugs-se-transient-field-of-nonserializable-class"></a>

### `spotbugs/SE_TRANSIENT_FIELD_OF_NONSERIALIZABLE_CLASS`

A SpotBugs dodgy code pattern, `SE_TRANSIENT_FIELD_OF_NONSERIALIZABLE_CLASS`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove transient from the field, or make the class Serializable; transient has no effect in a class that is not serialized.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SE_TRANSIENT_FIELD_OF_NONSERIALIZABLE_CLASS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#se-transient-field-of-class-that-isn-t-serializable-se-transient-field-of-nonserializable-class)

<a id="spotbugs-sf-dead-store-due-to-switch-fallthrough"></a>

### `spotbugs/SF_DEAD_STORE_DUE_TO_SWITCH_FALLTHROUGH`

A SpotBugs correctness pattern, `SF_DEAD_STORE_DUE_TO_SWITCH_FALLTHROUGH`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use a switch expression with arrow cases, or end each case with break or return, so values are not overwritten.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SF_DEAD_STORE_DUE_TO_SWITCH_FALLTHROUGH","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#sf-dead-store-due-to-switch-statement-fall-through-sf-dead-store-due-to-switch-fallthrough)

<a id="spotbugs-sf-dead-store-due-to-switch-fallthrough-to-throw"></a>

### `spotbugs/SF_DEAD_STORE_DUE_TO_SWITCH_FALLTHROUGH_TO_THROW`

A SpotBugs correctness pattern, `SF_DEAD_STORE_DUE_TO_SWITCH_FALLTHROUGH_TO_THROW`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** End the case with break or return before the next case, or use arrow cases in a switch expression.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SF_DEAD_STORE_DUE_TO_SWITCH_FALLTHROUGH_TO_THROW","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#sf-dead-store-due-to-switch-statement-fall-through-to-throw-sf-dead-store-due-to-switch-fallthrough-to-throw)

<a id="spotbugs-sf-switch-fallthrough"></a>

### `spotbugs/SF_SWITCH_FALLTHROUGH`

A SpotBugs dodgy code pattern, `SF_SWITCH_FALLTHROUGH`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** End every case with break, return or throw, or use arrow-form cases, which never fall through.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SF_SWITCH_FALLTHROUGH","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#sf-switch-statement-found-where-one-case-falls-through-to-the-next-case-sf-switch-fallthrough)

<a id="spotbugs-sf-switch-no-default"></a>

### `spotbugs/SF_SWITCH_NO_DEFAULT`

A SpotBugs dodgy code pattern, `SF_SWITCH_NO_DEFAULT`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Add a default branch, or use an exhaustive switch expression over an enum or sealed type.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SF_SWITCH_NO_DEFAULT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#sf-switch-statement-found-where-default-case-is-missing-sf-switch-no-default)

<a id="spotbugs-si-instance-before-finals-assigned"></a>

### `spotbugs/SI_INSTANCE_BEFORE_FINALS_ASSIGNED`

A SpotBugs bad practice pattern, `SI_INSTANCE_BEFORE_FINALS_ASSIGNED`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Declare the instance field after every other static final field, or use a lazy holder class to create the instance.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SI_INSTANCE_BEFORE_FINALS_ASSIGNED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#si-static-initializer-creates-instance-before-all-static-final-fields-assigned-si-instance-before-finals-assigned)

<a id="spotbugs-sic-inner-should-be-static"></a>

### `spotbugs/SIC_INNER_SHOULD_BE_STATIC`

A SpotBugs performance pattern, `SIC_INNER_SHOULD_BE_STATIC`.

- **Why it is on:** SpotBugs reports code that is correct but needlessly slow or wasteful, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Declare the nested class static, since it never uses the outer instance; make it a record if it only holds data.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SIC_INNER_SHOULD_BE_STATIC","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#sic-should-be-a-static-inner-class-sic-inner-should-be-static)

<a id="spotbugs-sic-inner-should-be-static-anon"></a>

### `spotbugs/SIC_INNER_SHOULD_BE_STATIC_ANON`

A SpotBugs performance pattern, `SIC_INNER_SHOULD_BE_STATIC_ANON`.

- **Why it is on:** SpotBugs reports code that is correct but needlessly slow or wasteful, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Replace the anonymous class with a lambda or a static nested class that does not capture the outer instance.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SIC_INNER_SHOULD_BE_STATIC_ANON","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#sic-could-be-refactored-into-a-named-static-inner-class-sic-inner-should-be-static-anon)

<a id="spotbugs-sic-inner-should-be-static-needs-this"></a>

### `spotbugs/SIC_INNER_SHOULD_BE_STATIC_NEEDS_THIS`

A SpotBugs performance pattern, `SIC_INNER_SHOULD_BE_STATIC_NEEDS_THIS`.

- **Why it is on:** SpotBugs reports code that is correct but needlessly slow or wasteful, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Declare the nested class static and pass the outer instance in through its constructor.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SIC_INNER_SHOULD_BE_STATIC_NEEDS_THIS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#sic-could-be-refactored-into-a-static-inner-class-sic-inner-should-be-static-needs-this)

<a id="spotbugs-sic-threadlocal-deadly-embrace"></a>

### `spotbugs/SIC_THREADLOCAL_DEADLY_EMBRACE`

A SpotBugs correctness pattern, `SIC_THREADLOCAL_DEADLY_EMBRACE`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Make the inner class a static nested class so it does not hold the outer instance.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SIC_THREADLOCAL_DEADLY_EMBRACE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#sic-deadly-embrace-of-non-static-inner-class-and-thread-local-sic-threadlocal-deadly-embrace)

<a id="spotbugs-sing-singleton-getter-not-synchronized"></a>

### `spotbugs/SING_SINGLETON_GETTER_NOT_SYNCHRONIZED`

A SpotBugs correctness pattern, `SING_SINGLETON_GETTER_NOT_SYNCHRONIZED`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use a single-element enum, or an eager private static final instance, instead of lazy unsynchronized creation.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SING_SINGLETON_GETTER_NOT_SYNCHRONIZED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#sing-instance-getter-method-of-class-using-singleton-design-pattern-is-not-synchronized-sing-singleton-getter-not-synchronized)

<a id="spotbugs-sing-singleton-has-nonprivate-constructor"></a>

### `spotbugs/SING_SINGLETON_HAS_NONPRIVATE_CONSTRUCTOR`

A SpotBugs correctness pattern, `SING_SINGLETON_HAS_NONPRIVATE_CONSTRUCTOR`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Make the singleton's constructor private, or use a single-element enum.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SING_SINGLETON_HAS_NONPRIVATE_CONSTRUCTOR","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#sing-class-using-singleton-design-pattern-has-non-private-constructor-sing-singleton-has-nonprivate-constructor)

<a id="spotbugs-sing-singleton-implements-clone-method"></a>

### `spotbugs/SING_SINGLETON_IMPLEMENTS_CLONE_METHOD`

A SpotBugs correctness pattern, `SING_SINGLETON_IMPLEMENTS_CLONE_METHOD`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Delete clone from the singleton, or make it throw CloneNotSupportedException; a single-element enum avoids it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SING_SINGLETON_IMPLEMENTS_CLONE_METHOD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#sing-class-using-singleton-design-pattern-implements-clone-method-without-being-an-unconditional-clonenotsupportedexception-thrower-sing-singleton-implements-clone-method)

<a id="spotbugs-sing-singleton-implements-cloneable"></a>

### `spotbugs/SING_SINGLETON_IMPLEMENTS_CLONEABLE`

A SpotBugs correctness pattern, `SING_SINGLETON_IMPLEMENTS_CLONEABLE`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove Cloneable from the singleton; use a single-element enum.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SING_SINGLETON_IMPLEMENTS_CLONEABLE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#sing-class-using-singleton-design-pattern-directly-implements-cloneable-interface-sing-singleton-implements-cloneable)

<a id="spotbugs-sing-singleton-implements-serializable"></a>

### `spotbugs/SING_SINGLETON_IMPLEMENTS_SERIALIZABLE`

A SpotBugs correctness pattern, `SING_SINGLETON_IMPLEMENTS_SERIALIZABLE`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Make the singleton a single-element enum, or stop implementing Serializable; a readResolve method does not clear this finding.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SING_SINGLETON_IMPLEMENTS_SERIALIZABLE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#sing-class-using-singleton-design-pattern-directly-or-indirectly-implements-serializable-interface-sing-singleton-implements-serializable)

<a id="spotbugs-sing-singleton-indirectly-implements-cloneable"></a>

### `spotbugs/SING_SINGLETON_INDIRECTLY_IMPLEMENTS_CLONEABLE`

A SpotBugs correctness pattern, `SING_SINGLETON_INDIRECTLY_IMPLEMENTS_CLONEABLE`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Do not inherit Cloneable in a singleton; use a single-element enum or override clone to throw.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SING_SINGLETON_INDIRECTLY_IMPLEMENTS_CLONEABLE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#sing-class-using-singleton-design-pattern-indirectly-implements-cloneable-interface-sing-singleton-indirectly-implements-cloneable)

<a id="spotbugs-sio-superfluous-instanceof"></a>

### `spotbugs/SIO_SUPERFLUOUS_INSTANCEOF`

A SpotBugs correctness pattern, `SIO_SUPERFLUOUS_INSTANCEOF`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove the instanceof test; the static type already guarantees it, so it is always true.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SIO_SUPERFLUOUS_INSTANCEOF","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#sio-unnecessary-type-check-done-using-instanceof-operator-sio-superfluous-instanceof)

<a id="spotbugs-skipped-class-too-big"></a>

### `spotbugs/SKIPPED_CLASS_TOO_BIG`

A SpotBugs experimental pattern, `SKIPPED_CLASS_TOO_BIG`.

- **Why it is on:** SpotBugs reports code that an experimental SpotBugs detector reports, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Split the class into smaller classes so analysis can cover all of it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SKIPPED_CLASS_TOO_BIG","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#skipped-class-too-big-for-analysis-skipped-class-too-big)

<a id="spotbugs-sp-spin-on-field"></a>

### `spotbugs/SP_SPIN_ON_FIELD`

A SpotBugs multithreaded correctness pattern, `SP_SPIN_ON_FIELD`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Wait with a CountDownLatch, a Condition or wait and notify instead of polling a field in a loop.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SP_SPIN_ON_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#sp-method-spins-on-field-sp-spin-on-field)

<a id="spotbugs-sql-bad-prepared-statement-access"></a>

### `spotbugs/SQL_BAD_PREPARED_STATEMENT_ACCESS`

A SpotBugs correctness pattern, `SQL_BAD_PREPARED_STATEMENT_ACCESS`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Set parameters from index 1, setString(1, value); JDBC indexes start at 1, not 0.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SQL_BAD_PREPARED_STATEMENT_ACCESS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#sql-method-attempts-to-access-a-prepared-statement-parameter-with-index-0-sql-bad-prepared-statement-access)

<a id="spotbugs-sql-bad-resultset-access"></a>

### `spotbugs/SQL_BAD_RESULTSET_ACCESS`

A SpotBugs correctness pattern, `SQL_BAD_RESULTSET_ACCESS`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Read columns from index 1, rs.getString(1), or by column name; JDBC indexes start at 1.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SQL_BAD_RESULTSET_ACCESS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#sql-method-attempts-to-access-a-result-set-field-with-index-0-sql-bad-resultset-access)

<a id="spotbugs-sql-nonconstant-string-passed-to-execute"></a>

### `spotbugs/SQL_NONCONSTANT_STRING_PASSED_TO_EXECUTE`

A SpotBugs security pattern, `SQL_NONCONSTANT_STRING_PASSED_TO_EXECUTE`.

- **Why it is on:** SpotBugs reports code that untrusted input can exploit, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use a PreparedStatement with a constant SQL string and ? placeholders, and bind the values with setString and setInt.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SQL_NONCONSTANT_STRING_PASSED_TO_EXECUTE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#sql-nonconstant-string-passed-to-execute-or-addbatch-method-on-an-sql-statement-sql-nonconstant-string-passed-to-execute)

<a id="spotbugs-sql-prepared-statement-generated-from-nonconstant-string"></a>

### `spotbugs/SQL_PREPARED_STATEMENT_GENERATED_FROM_NONCONSTANT_STRING`

A SpotBugs security pattern, `SQL_PREPARED_STATEMENT_GENERATED_FROM_NONCONSTANT_STRING`.

- **Why it is on:** SpotBugs reports code that untrusted input can exploit, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use a constant SQL string with ? placeholders and bind the values; build only placeholders or allowlisted identifiers, never user text, into the SQL.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SQL_PREPARED_STATEMENT_GENERATED_FROM_NONCONSTANT_STRING","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#sql-a-prepared-statement-is-generated-from-a-nonconstant-string-sql-prepared-statement-generated-from-nonconstant-string)

<a id="spotbugs-sr-not-checked"></a>

### `spotbugs/SR_NOT_CHECKED`

A SpotBugs bad practice pattern, `SR_NOT_CHECKED`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Check the number of bytes returned by skip, or use skipNBytes, so a short skip is handled.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SR_NOT_CHECKED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#rr-method-ignores-results-of-inputstream-skip-sr-not-checked)

<a id="spotbugs-ss-should-be-static"></a>

### `spotbugs/SS_SHOULD_BE_STATIC`

A SpotBugs performance pattern, `SS_SHOULD_BE_STATIC`.

- **Why it is on:** SpotBugs reports code that is correct but needlessly slow or wasteful, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Declare the final field with a constant initializer as static final.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SS_SHOULD_BE_STATIC","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ss-unread-field-should-this-field-be-static-ss-should-be-static)

<a id="spotbugs-ssd-do-not-use-instance-lock-on-shared-static-data"></a>

### `spotbugs/SSD_DO_NOT_USE_INSTANCE_LOCK_ON_SHARED_STATIC_DATA`

A SpotBugs multithreaded correctness pattern, `SSD_DO_NOT_USE_INSTANCE_LOCK_ON_SHARED_STATIC_DATA`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Guard the static data with a private static final lock Object, not an instance lock or a synchronized instance method.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SSD_DO_NOT_USE_INSTANCE_LOCK_ON_SHARED_STATIC_DATA","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ssd-instance-level-lock-was-used-on-a-shared-static-data-ssd-do-not-use-instance-lock-on-shared-static-data)

<a id="spotbugs-st-write-to-static-from-instance-method"></a>

### `spotbugs/ST_WRITE_TO_STATIC_FROM_INSTANCE_METHOD`

A SpotBugs dodgy code pattern, `ST_WRITE_TO_STATIC_FROM_INSTANCE_METHOD`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Keep the state in an instance field, or move the write to a static method that guards it with a lock or an Atomic type.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ST_WRITE_TO_STATIC_FROM_INSTANCE_METHOD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#st-write-to-static-field-from-instance-method-st-write-to-static-from-instance-method)

<a id="spotbugs-stcal-invoke-on-static-calendar-instance"></a>

### `spotbugs/STCAL_INVOKE_ON_STATIC_CALENDAR_INSTANCE`

A SpotBugs multithreaded correctness pattern, `STCAL_INVOKE_ON_STATIC_CALENDAR_INSTANCE`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use java.time types (LocalDate, ZonedDateTime) instead of calling a shared static Calendar.
- **Exception:** If this is intended, add `{"rule":"spotbugs/STCAL_INVOKE_ON_STATIC_CALENDAR_INSTANCE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#stcal-call-to-static-calendar-stcal-invoke-on-static-calendar-instance)

<a id="spotbugs-stcal-invoke-on-static-date-format-instance"></a>

### `spotbugs/STCAL_INVOKE_ON_STATIC_DATE_FORMAT_INSTANCE`

A SpotBugs multithreaded correctness pattern, `STCAL_INVOKE_ON_STATIC_DATE_FORMAT_INSTANCE`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Format with a static final DateTimeFormatter, which is thread-safe, instead of a shared DateFormat.
- **Exception:** If this is intended, add `{"rule":"spotbugs/STCAL_INVOKE_ON_STATIC_DATE_FORMAT_INSTANCE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#stcal-call-to-static-dateformat-stcal-invoke-on-static-date-format-instance)

<a id="spotbugs-stcal-static-calendar-instance"></a>

### `spotbugs/STCAL_STATIC_CALENDAR_INSTANCE`

A SpotBugs multithreaded correctness pattern, `STCAL_STATIC_CALENDAR_INSTANCE`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Replace the static Calendar with java.time types (Instant, LocalDate, ZonedDateTime), which are immutable.
- **Exception:** If this is intended, add `{"rule":"spotbugs/STCAL_STATIC_CALENDAR_INSTANCE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#stcal-static-calendar-field-stcal-static-calendar-instance)

<a id="spotbugs-stcal-static-simple-date-format-instance"></a>

### `spotbugs/STCAL_STATIC_SIMPLE_DATE_FORMAT_INSTANCE`

A SpotBugs multithreaded correctness pattern, `STCAL_STATIC_SIMPLE_DATE_FORMAT_INSTANCE`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Replace the static SimpleDateFormat with a static final DateTimeFormatter, which is thread-safe.
- **Exception:** If this is intended, add `{"rule":"spotbugs/STCAL_STATIC_SIMPLE_DATE_FORMAT_INSTANCE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#stcal-static-dateformat-stcal-static-simple-date-format-instance)

<a id="spotbugs-sti-interrupted-on-currentthread"></a>

### `spotbugs/STI_INTERRUPTED_ON_CURRENTTHREAD`

A SpotBugs correctness pattern, `STI_INTERRUPTED_ON_CURRENTTHREAD`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Call the static Thread.interrupted() directly, or Thread.currentThread().isInterrupted() to read without clearing.
- **Exception:** If this is intended, add `{"rule":"spotbugs/STI_INTERRUPTED_ON_CURRENTTHREAD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#sti-unneeded-use-of-currentthread-call-to-call-interrupted-sti-interrupted-on-currentthread)

<a id="spotbugs-sti-interrupted-on-unknownthread"></a>

### `spotbugs/STI_INTERRUPTED_ON_UNKNOWNTHREAD`

A SpotBugs correctness pattern, `STI_INTERRUPTED_ON_UNKNOWNTHREAD`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use thread.isInterrupted() to read another thread's flag; interrupted() always checks the current thread and clears the flag.
- **Exception:** If this is intended, add `{"rule":"spotbugs/STI_INTERRUPTED_ON_UNKNOWNTHREAD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#sti-static-thread-interrupted-method-invoked-on-thread-instance-sti-interrupted-on-unknownthread)

<a id="spotbugs-sw-swing-methods-invoked-in-swing-thread"></a>

### `spotbugs/SW_SWING_METHODS_INVOKED_IN_SWING_THREAD`

A SpotBugs bad practice pattern, `SW_SWING_METHODS_INVOKED_IN_SWING_THREAD`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Build and show Swing components inside SwingUtilities.invokeLater.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SW_SWING_METHODS_INVOKED_IN_SWING_THREAD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#sw-certain-swing-methods-need-to-be-invoked-in-swing-thread-sw-swing-methods-invoked-in-swing-thread)

<a id="spotbugs-swl-sleep-with-lock-held"></a>

### `spotbugs/SWL_SLEEP_WITH_LOCK_HELD`

A SpotBugs multithreaded correctness pattern, `SWL_SLEEP_WITH_LOCK_HELD`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Release the lock before Thread.sleep, or wait with a timeout on a Condition (await(time, unit)).
- **Exception:** If this is intended, add `{"rule":"spotbugs/SWL_SLEEP_WITH_LOCK_HELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#swl-method-calls-thread-sleep-with-a-lock-held-swl-sleep-with-lock-held)

<a id="spotbugs-testing"></a>

### `spotbugs/TESTING`

A SpotBugs experimental pattern, `TESTING`.

- **Why it is on:** SpotBugs reports code that an experimental SpotBugs detector reports, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Nothing is wrong in the code: this is a SpotBugs self-test pattern, which only appears when a testing detector is enabled.
- **Exception:** If this is intended, add `{"rule":"spotbugs/TESTING","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#test-testing-testing)

<a id="spotbugs-testing1"></a>

### `spotbugs/TESTING1`

A SpotBugs experimental pattern, `TESTING1`.

- **Why it is on:** SpotBugs reports code that an experimental SpotBugs detector reports, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Nothing is wrong in the code: this is a SpotBugs self-test pattern, which only appears when a testing detector is enabled.
- **Exception:** If this is intended, add `{"rule":"spotbugs/TESTING1","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#test-testing-1-testing1)

<a id="spotbugs-testing2"></a>

### `spotbugs/TESTING2`

A SpotBugs experimental pattern, `TESTING2`.

- **Why it is on:** SpotBugs reports code that an experimental SpotBugs detector reports, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Nothing is wrong in the code: this is a SpotBugs self-test pattern, which only appears when a testing detector is enabled.
- **Exception:** If this is intended, add `{"rule":"spotbugs/TESTING2","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#test-testing-2-testing2)

<a id="spotbugs-testing3"></a>

### `spotbugs/TESTING3`

A SpotBugs experimental pattern, `TESTING3`.

- **Why it is on:** SpotBugs reports code that an experimental SpotBugs detector reports, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Nothing is wrong in the code: this is a SpotBugs self-test pattern, which only appears when a testing detector is enabled.
- **Exception:** If this is intended, add `{"rule":"spotbugs/TESTING3","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#test-testing-3-testing3)

<a id="spotbugs-throws-method-throws-clause-basic-exception"></a>

### `spotbugs/THROWS_METHOD_THROWS_CLAUSE_BASIC_EXCEPTION`

A SpotBugs bad practice pattern, `THROWS_METHOD_THROWS_CLAUSE_BASIC_EXCEPTION`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Declare the specific checked exception the method throws, such as IOException, not Exception.
- **Exception:** If this is intended, add `{"rule":"spotbugs/THROWS_METHOD_THROWS_CLAUSE_BASIC_EXCEPTION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#throws-method-lists-exception-in-its-throws-clause-but-it-could-be-more-specific-throws-method-throws-clause-basic-exception)

<a id="spotbugs-throws-method-throws-clause-throwable"></a>

### `spotbugs/THROWS_METHOD_THROWS_CLAUSE_THROWABLE`

A SpotBugs bad practice pattern, `THROWS_METHOD_THROWS_CLAUSE_THROWABLE`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Declare the specific checked exception the method throws, such as IOException, not Throwable.
- **Exception:** If this is intended, add `{"rule":"spotbugs/THROWS_METHOD_THROWS_CLAUSE_THROWABLE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#throws-method-lists-throwable-in-its-throws-clause-but-it-could-be-more-specific-throws-method-throws-clause-throwable)

<a id="spotbugs-throws-method-throws-runtimeexception"></a>

### `spotbugs/THROWS_METHOD_THROWS_RUNTIMEEXCEPTION`

A SpotBugs bad practice pattern, `THROWS_METHOD_THROWS_RUNTIMEEXCEPTION`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Throw a specific type instead of new RuntimeException(...): IllegalStateException, IllegalArgumentException, UncheckedIOException or a domain exception.
- **Exception:** If this is intended, add `{"rule":"spotbugs/THROWS_METHOD_THROWS_RUNTIMEEXCEPTION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#throws-method-intentionally-throws-runtimeexception-throws-method-throws-runtimeexception)

<a id="spotbugs-tlw-two-lock-wait"></a>

### `spotbugs/TLW_TWO_LOCK_WAIT`

A SpotBugs multithreaded correctness pattern, `TLW_TWO_LOCK_WAIT`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Wait while holding only the monitor you wait on; release the outer lock first, or use one lock.
- **Exception:** If this is intended, add `{"rule":"spotbugs/TLW_TWO_LOCK_WAIT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#tlw-wait-with-two-locks-held-tlw-two-lock-wait)

<a id="spotbugs-tq-always-value-used-where-never-required"></a>

### `spotbugs/TQ_ALWAYS_VALUE_USED_WHERE_NEVER_REQUIRED`

A SpotBugs correctness pattern, `TQ_ALWAYS_VALUE_USED_WHERE_NEVER_REQUIRED`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Pass a value that does not carry the qualifier, or fix the qualifier annotation on the parameter or field.
- **Exception:** If this is intended, add `{"rule":"spotbugs/TQ_ALWAYS_VALUE_USED_WHERE_NEVER_REQUIRED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#tq-value-annotated-as-carrying-a-type-qualifier-used-where-a-value-that-must-not-carry-that-qualifier-is-required-tq-always-value-used-where-never-required)

<a id="spotbugs-tq-comparing-values-with-incompatible-type-qualifiers"></a>

### `spotbugs/TQ_COMPARING_VALUES_WITH_INCOMPATIBLE_TYPE_QUALIFIERS`

A SpotBugs correctness pattern, `TQ_COMPARING_VALUES_WITH_INCOMPATIBLE_TYPE_QUALIFIERS`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Compare values with the same type qualifier, or fix the annotations; the two sides can never be equal.
- **Exception:** If this is intended, add `{"rule":"spotbugs/TQ_COMPARING_VALUES_WITH_INCOMPATIBLE_TYPE_QUALIFIERS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#tq-comparing-values-with-incompatible-type-qualifiers-tq-comparing-values-with-incompatible-type-qualifiers)

<a id="spotbugs-tq-explicit-unknown-source-value-reaches-always-sink"></a>

### `spotbugs/TQ_EXPLICIT_UNKNOWN_SOURCE_VALUE_REACHES_ALWAYS_SINK`

A SpotBugs dodgy code pattern, `TQ_EXPLICIT_UNKNOWN_SOURCE_VALUE_REACHES_ALWAYS_SINK`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove the unknown-source annotation from the value, or make the source carry the qualifier the sink requires.
- **Exception:** If this is intended, add `{"rule":"spotbugs/TQ_EXPLICIT_UNKNOWN_SOURCE_VALUE_REACHES_ALWAYS_SINK","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#tq-value-required-to-have-type-qualifier-but-marked-as-unknown-tq-explicit-unknown-source-value-reaches-always-sink)

<a id="spotbugs-tq-explicit-unknown-source-value-reaches-never-sink"></a>

### `spotbugs/TQ_EXPLICIT_UNKNOWN_SOURCE_VALUE_REACHES_NEVER_SINK`

A SpotBugs dodgy code pattern, `TQ_EXPLICIT_UNKNOWN_SOURCE_VALUE_REACHES_NEVER_SINK`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove the unknown-source annotation from the value, or make the source guarantee it lacks the forbidden qualifier.
- **Exception:** If this is intended, add `{"rule":"spotbugs/TQ_EXPLICIT_UNKNOWN_SOURCE_VALUE_REACHES_NEVER_SINK","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#tq-value-required-to-not-have-type-qualifier-but-marked-as-unknown-tq-explicit-unknown-source-value-reaches-never-sink)

<a id="spotbugs-tq-maybe-source-value-reaches-always-sink"></a>

### `spotbugs/TQ_MAYBE_SOURCE_VALUE_REACHES_ALWAYS_SINK`

A SpotBugs correctness pattern, `TQ_MAYBE_SOURCE_VALUE_REACHES_ALWAYS_SINK`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Make the source always carry the qualifier, or validate the value before it reaches the annotated parameter.
- **Exception:** If this is intended, add `{"rule":"spotbugs/TQ_MAYBE_SOURCE_VALUE_REACHES_ALWAYS_SINK","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#tq-value-that-might-not-carry-a-type-qualifier-is-always-used-in-a-way-requires-that-type-qualifier-tq-maybe-source-value-reaches-always-sink)

<a id="spotbugs-tq-maybe-source-value-reaches-never-sink"></a>

### `spotbugs/TQ_MAYBE_SOURCE_VALUE_REACHES_NEVER_SINK`

A SpotBugs correctness pattern, `TQ_MAYBE_SOURCE_VALUE_REACHES_NEVER_SINK`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Make sure the value never carries the qualifier before it reaches the annotated parameter, or fix the annotations.
- **Exception:** If this is intended, add `{"rule":"spotbugs/TQ_MAYBE_SOURCE_VALUE_REACHES_NEVER_SINK","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#tq-value-that-might-carry-a-type-qualifier-is-always-used-in-a-way-prohibits-it-from-having-that-type-qualifier-tq-maybe-source-value-reaches-never-sink)

<a id="spotbugs-tq-never-value-used-where-always-required"></a>

### `spotbugs/TQ_NEVER_VALUE_USED_WHERE_ALWAYS_REQUIRED`

A SpotBugs correctness pattern, `TQ_NEVER_VALUE_USED_WHERE_ALWAYS_REQUIRED`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Pass a value that carries the required qualifier, or fix the annotations on the source or the parameter.
- **Exception:** If this is intended, add `{"rule":"spotbugs/TQ_NEVER_VALUE_USED_WHERE_ALWAYS_REQUIRED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#tq-value-annotated-as-never-carrying-a-type-qualifier-used-where-value-carrying-that-qualifier-is-required-tq-never-value-used-where-always-required)

<a id="spotbugs-tq-unknown-value-used-where-always-strictly-required"></a>

### `spotbugs/TQ_UNKNOWN_VALUE_USED_WHERE_ALWAYS_STRICTLY_REQUIRED`

A SpotBugs correctness pattern, `TQ_UNKNOWN_VALUE_USED_WHERE_ALWAYS_STRICTLY_REQUIRED`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Pass a value from a source annotated with the required qualifier, or convert it through a method that returns the annotated type.
- **Exception:** If this is intended, add `{"rule":"spotbugs/TQ_UNKNOWN_VALUE_USED_WHERE_ALWAYS_STRICTLY_REQUIRED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#tq-value-without-a-type-qualifier-used-where-a-value-is-required-to-have-that-qualifier-tq-unknown-value-used-where-always-strictly-required)

<a id="spotbugs-uc-useless-condition"></a>

### `spotbugs/UC_USELESS_CONDITION`

A SpotBugs dodgy code pattern, `UC_USELESS_CONDITION`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove the condition that the known value range makes always true or false, or test the right variable.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UC_USELESS_CONDITION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#uc-condition-has-no-effect-uc-useless-condition)

<a id="spotbugs-uc-useless-condition-type"></a>

### `spotbugs/UC_USELESS_CONDITION_TYPE`

A SpotBugs dodgy code pattern, `UC_USELESS_CONDITION_TYPE`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove the comparison that the variable's type already decides, or compare against the intended variable.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UC_USELESS_CONDITION_TYPE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#uc-condition-has-no-effect-due-to-the-variable-type-uc-useless-condition-type)

<a id="spotbugs-uc-useless-object"></a>

### `spotbugs/UC_USELESS_OBJECT`

A SpotBugs dodgy code pattern, `UC_USELESS_OBJECT`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove the collection or object that is filled but never read, or return or use it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UC_USELESS_OBJECT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#uc-useless-object-created-uc-useless-object)

<a id="spotbugs-uc-useless-object-stack"></a>

### `spotbugs/UC_USELESS_OBJECT_STACK`

A SpotBugs dodgy code pattern, `UC_USELESS_OBJECT_STACK`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove the object that is only modified and never read, or use its result.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UC_USELESS_OBJECT_STACK","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#uc-useless-object-created-on-stack-uc-useless-object-stack)

<a id="spotbugs-uc-useless-void-method"></a>

### `spotbugs/UC_USELESS_VOID_METHOD`

A SpotBugs dodgy code pattern, `UC_USELESS_VOID_METHOD`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Delete the void method that does nothing, or give it the intended effect.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UC_USELESS_VOID_METHOD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#uc-useless-non-empty-void-method-uc-useless-void-method)

<a id="spotbugs-ucf-useless-control-flow"></a>

### `spotbugs/UCF_USELESS_CONTROL_FLOW`

A SpotBugs dodgy code pattern, `UCF_USELESS_CONTROL_FLOW`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove the if or loop with an empty body, or put the intended statements in it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UCF_USELESS_CONTROL_FLOW","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ucf-useless-control-flow-ucf-useless-control-flow)

<a id="spotbugs-ucf-useless-control-flow-next-line"></a>

### `spotbugs/UCF_USELESS_CONTROL_FLOW_NEXT_LINE`

A SpotBugs dodgy code pattern, `UCF_USELESS_CONTROL_FLOW_NEXT_LINE`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove the stray semicolon after the condition, so the if guards the statement on the next line.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UCF_USELESS_CONTROL_FLOW_NEXT_LINE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ucf-useless-control-flow-to-next-line-ucf-useless-control-flow-next-line)

<a id="spotbugs-ug-sync-set-unsync-get"></a>

### `spotbugs/UG_SYNC_SET_UNSYNC_GET`

A SpotBugs multithreaded correctness pattern, `UG_SYNC_SET_UNSYNC_GET`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Make the getter synchronized too, or replace both with a volatile or atomic field.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UG_SYNC_SET_UNSYNC_GET","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ug-unsynchronized-get-method-synchronized-set-method-ug-sync-set-unsync-get)

<a id="spotbugs-ui-inheritance-unsafe-getresource"></a>

### `spotbugs/UI_INHERITANCE_UNSAFE_GETRESOURCE`

A SpotBugs bad practice pattern, `UI_INHERITANCE_UNSAFE_GETRESOURCE`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Call Foo.class.getResource(name) with the class literal instead of getClass().getResource(name).
- **Exception:** If this is intended, add `{"rule":"spotbugs/UI_INHERITANCE_UNSAFE_GETRESOURCE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ui-usage-of-getresource-may-be-unsafe-if-class-is-extended-ui-inheritance-unsafe-getresource)

<a id="spotbugs-ul-unreleased-lock"></a>

### `spotbugs/UL_UNRELEASED_LOCK`

A SpotBugs multithreaded correctness pattern, `UL_UNRELEASED_LOCK`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Call lock.lock() just before a try block and put unlock() in its finally.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UL_UNRELEASED_LOCK","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ul-method-does-not-release-lock-on-all-paths-ul-unreleased-lock)

<a id="spotbugs-ul-unreleased-lock-exception-path"></a>

### `spotbugs/UL_UNRELEASED_LOCK_EXCEPTION_PATH`

A SpotBugs multithreaded correctness pattern, `UL_UNRELEASED_LOCK_EXCEPTION_PATH`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Put unlock() in a finally block so every exception path releases the lock.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UL_UNRELEASED_LOCK_EXCEPTION_PATH","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ul-method-does-not-release-lock-on-all-exception-paths-ul-unreleased-lock-exception-path)

<a id="spotbugs-um-unnecessary-math"></a>

### `spotbugs/UM_UNNECESSARY_MATH`

A SpotBugs performance pattern, `UM_UNNECESSARY_MATH`.

- **Why it is on:** SpotBugs reports code that is correct but needlessly slow or wasteful, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Replace the Math call on a constant with its literal result.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UM_UNNECESSARY_MATH","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#um-method-calls-static-math-class-method-on-a-constant-value-um-unnecessary-math)

<a id="spotbugs-umac-uncallable-method-of-anonymous-class"></a>

### `spotbugs/UMAC_UNCALLABLE_METHOD_OF_ANONYMOUS_CLASS`

A SpotBugs correctness pattern, `UMAC_UNCALLABLE_METHOD_OF_ANONYMOUS_CLASS`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Delete the unreachable method, or fix its name and signature so it overrides the supertype method; add @Override.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UMAC_UNCALLABLE_METHOD_OF_ANONYMOUS_CLASS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#umac-uncallable-method-defined-in-anonymous-class-umac-uncallable-method-of-anonymous-class)

<a id="spotbugs-unknown"></a>

### `spotbugs/UNKNOWN`

A SpotBugs experimental pattern, `UNKNOWN`.

- **Why it is on:** SpotBugs reports code that an experimental SpotBugs detector reports, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** SpotBugs reported a pattern it has no description for; read the bug type in the report and fix or except it like any other finding.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UNKNOWN","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#test-unknown-bug-pattern-unknown)

<a id="spotbugs-upm-uncalled-private-method"></a>

### `spotbugs/UPM_UNCALLED_PRIVATE_METHOD`

A SpotBugs performance pattern, `UPM_UNCALLED_PRIVATE_METHOD`.

- **Why it is on:** SpotBugs reports code that is correct but needlessly slow or wasteful, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Delete the private method that nothing calls.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UPM_UNCALLED_PRIVATE_METHOD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#upm-private-method-is-never-called-upm-uncalled-private-method)

<a id="spotbugs-ur-uninit-read"></a>

### `spotbugs/UR_UNINIT_READ`

A SpotBugs correctness pattern, `UR_UNINIT_READ`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Assign the field in the constructor before it is read, or make it final and set it from a parameter.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UR_UNINIT_READ","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ur-uninitialized-read-of-field-in-constructor-ur-uninit-read)

<a id="spotbugs-ur-uninit-read-called-from-super-constructor"></a>

### `spotbugs/UR_UNINIT_READ_CALLED_FROM_SUPER_CONSTRUCTOR`

A SpotBugs correctness pattern, `UR_UNINIT_READ_CALLED_FROM_SUPER_CONSTRUCTOR`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Do not call overridable methods from a constructor; make the method final or private, or move the call to a factory.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UR_UNINIT_READ_CALLED_FROM_SUPER_CONSTRUCTOR","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ur-uninitialized-read-of-field-method-called-from-constructor-of-superclass-ur-uninit-read-called-from-super-constructor)

<a id="spotbugs-urf-unread-field"></a>

### `spotbugs/URF_UNREAD_FIELD`

A SpotBugs performance pattern, `URF_UNREAD_FIELD`.

- **Why it is on:** SpotBugs reports code that is correct but needlessly slow or wasteful, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Delete the field that is written but never read, or read it where the value is needed.
- **Exception:** If this is intended, add `{"rule":"spotbugs/URF_UNREAD_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#urf-unread-field-urf-unread-field)

<a id="spotbugs-urf-unread-public-or-protected-field"></a>

### `spotbugs/URF_UNREAD_PUBLIC_OR_PROTECTED_FIELD`

A SpotBugs dodgy code pattern, `URF_UNREAD_PUBLIC_OR_PROTECTED_FIELD`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Delete the field that is written but never read, or read it where the value is needed.
- **Exception:** If this is intended, add `{"rule":"spotbugs/URF_UNREAD_PUBLIC_OR_PROTECTED_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#urf-unread-public-protected-field-urf-unread-public-or-protected-field)

<a id="spotbugs-us-useless-suppression-on-class"></a>

### `spotbugs/US_USELESS_SUPPRESSION_ON_CLASS`

A SpotBugs dodgy code pattern, `US_USELESS_SUPPRESSION_ON_CLASS`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Delete the SuppressFBWarnings annotation on the class; it suppresses nothing.
- **Exception:** If this is intended, add `{"rule":"spotbugs/US_USELESS_SUPPRESSION_ON_CLASS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#us-useless-suppression-on-a-class-us-useless-suppression-on-class)

<a id="spotbugs-us-useless-suppression-on-field"></a>

### `spotbugs/US_USELESS_SUPPRESSION_ON_FIELD`

A SpotBugs dodgy code pattern, `US_USELESS_SUPPRESSION_ON_FIELD`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Delete the SuppressFBWarnings annotation on the field; it suppresses nothing.
- **Exception:** If this is intended, add `{"rule":"spotbugs/US_USELESS_SUPPRESSION_ON_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#us-useless-suppression-on-a-field-us-useless-suppression-on-field)

<a id="spotbugs-us-useless-suppression-on-method"></a>

### `spotbugs/US_USELESS_SUPPRESSION_ON_METHOD`

A SpotBugs dodgy code pattern, `US_USELESS_SUPPRESSION_ON_METHOD`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Delete the SuppressFBWarnings annotation on the method; it suppresses nothing.
- **Exception:** If this is intended, add `{"rule":"spotbugs/US_USELESS_SUPPRESSION_ON_METHOD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#us-useless-suppression-on-a-method-us-useless-suppression-on-method)

<a id="spotbugs-us-useless-suppression-on-method-parameter"></a>

### `spotbugs/US_USELESS_SUPPRESSION_ON_METHOD_PARAMETER`

A SpotBugs dodgy code pattern, `US_USELESS_SUPPRESSION_ON_METHOD_PARAMETER`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Delete the SuppressFBWarnings annotation on the parameter; it suppresses nothing.
- **Exception:** If this is intended, add `{"rule":"spotbugs/US_USELESS_SUPPRESSION_ON_METHOD_PARAMETER","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#us-useless-suppression-on-a-method-parameter-us-useless-suppression-on-method-parameter)

<a id="spotbugs-us-useless-suppression-on-package"></a>

### `spotbugs/US_USELESS_SUPPRESSION_ON_PACKAGE`

A SpotBugs dodgy code pattern, `US_USELESS_SUPPRESSION_ON_PACKAGE`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Delete the SuppressFBWarnings annotation on the package; it suppresses nothing.
- **Exception:** If this is intended, add `{"rule":"spotbugs/US_USELESS_SUPPRESSION_ON_PACKAGE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#us-useless-suppression-on-a-package-us-useless-suppression-on-package)

<a id="spotbugs-usc-potential-security-check-based-on-untrusted-source"></a>

### `spotbugs/USC_POTENTIAL_SECURITY_CHECK_BASED_ON_UNTRUSTED_SOURCE`

A SpotBugs malicious code vulnerability pattern, `USC_POTENTIAL_SECURITY_CHECK_BASED_ON_UNTRUSTED_SOURCE`.

- **Why it is on:** SpotBugs reports code that untrusted code could abuse, such as an exposed mutable field, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Make a defensive copy of the untrusted value before the security check, then use only the copy afterward.
- **Exception:** If this is intended, add `{"rule":"spotbugs/USC_POTENTIAL_SECURITY_CHECK_BASED_ON_UNTRUSTED_SOURCE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#usc-potential-security-check-based-on-untrusted-source-usc-potential-security-check-based-on-untrusted-source)

<a id="spotbugs-usm-useless-abstract-method"></a>

### `spotbugs/USM_USELESS_ABSTRACT_METHOD`

A SpotBugs dodgy code pattern, `USM_USELESS_ABSTRACT_METHOD`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Delete the abstract method; the implemented interface already declares it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/USM_USELESS_ABSTRACT_METHOD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#usm-abstract-method-is-already-defined-in-implemented-interface-usm-useless-abstract-method)

<a id="spotbugs-usm-useless-subclass-method"></a>

### `spotbugs/USM_USELESS_SUBCLASS_METHOD`

A SpotBugs dodgy code pattern, `USM_USELESS_SUBCLASS_METHOD`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Delete the override that only calls super with the same arguments.
- **Exception:** If this is intended, add `{"rule":"spotbugs/USM_USELESS_SUBCLASS_METHOD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#usm-method-superfluously-delegates-to-parent-class-method-usm-useless-subclass-method)

<a id="spotbugs-uuf-unused-field"></a>

### `spotbugs/UUF_UNUSED_FIELD`

A SpotBugs performance pattern, `UUF_UNUSED_FIELD`.

- **Why it is on:** SpotBugs reports code that is correct but needlessly slow or wasteful, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Delete the field that is never used.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UUF_UNUSED_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#uuf-unused-field-uuf-unused-field)

<a id="spotbugs-uuf-unused-public-or-protected-field"></a>

### `spotbugs/UUF_UNUSED_PUBLIC_OR_PROTECTED_FIELD`

A SpotBugs dodgy code pattern, `UUF_UNUSED_PUBLIC_OR_PROTECTED_FIELD`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Delete the field that is never used, or make it private if only the class needs it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UUF_UNUSED_PUBLIC_OR_PROTECTED_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#uuf-unused-public-or-protected-field-uuf-unused-public-or-protected-field)

<a id="spotbugs-uw-uncond-wait"></a>

### `spotbugs/UW_UNCOND_WAIT`

A SpotBugs multithreaded correctness pattern, `UW_UNCOND_WAIT`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Test the condition under the lock and call wait only while it is false, inside a while loop.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UW_UNCOND_WAIT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#uw-unconditional-wait-uw-uncond-wait)

<a id="spotbugs-uwf-field-not-initialized-in-constructor"></a>

### `spotbugs/UWF_FIELD_NOT_INITIALIZED_IN_CONSTRUCTOR`

A SpotBugs dodgy code pattern, `UWF_FIELD_NOT_INITIALIZED_IN_CONSTRUCTOR`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Assign the field in every constructor and make it private final, so it is never null when dereferenced.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UWF_FIELD_NOT_INITIALIZED_IN_CONSTRUCTOR","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#uwf-field-not-initialized-in-constructor-but-dereferenced-without-null-check-uwf-field-not-initialized-in-constructor)

<a id="spotbugs-uwf-null-field"></a>

### `spotbugs/UWF_NULL_FIELD`

A SpotBugs correctness pattern, `UWF_NULL_FIELD`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Assign a non-null value to the field somewhere, or delete the field; it is only ever null.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UWF_NULL_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#uwf-field-only-ever-set-to-null-uwf-null-field)

<a id="spotbugs-uwf-unwritten-field"></a>

### `spotbugs/UWF_UNWRITTEN_FIELD`

A SpotBugs correctness pattern, `UWF_UNWRITTEN_FIELD`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Assign the field somewhere, or delete it; reading a never-written field always yields null or zero.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UWF_UNWRITTEN_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#uwf-unwritten-field-uwf-unwritten-field)

<a id="spotbugs-uwf-unwritten-public-or-protected-field"></a>

### `spotbugs/UWF_UNWRITTEN_PUBLIC_OR_PROTECTED_FIELD`

A SpotBugs dodgy code pattern, `UWF_UNWRITTEN_PUBLIC_OR_PROTECTED_FIELD`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Assign the field in the constructor and make it private final, or remove it if nothing sets it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UWF_UNWRITTEN_PUBLIC_OR_PROTECTED_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#uwf-unwritten-public-or-protected-field-uwf-unwritten-public-or-protected-field)

<a id="spotbugs-va-format-string-uses-newline"></a>

### `spotbugs/VA_FORMAT_STRING_USES_NEWLINE`

A SpotBugs bad practice pattern, `VA_FORMAT_STRING_USES_NEWLINE`.

- **Why it is on:** SpotBugs reports code that breaks a recommended Java practice, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** See the tool's documentation: [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#fs-format-string-should-use-n-rather-than-n-va-format-string-uses-newline).
- **Exception:** If this is intended, add `{"rule":"spotbugs/VA_FORMAT_STRING_USES_NEWLINE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#fs-format-string-should-use-n-rather-than-n-va-format-string-uses-newline)

<a id="spotbugs-va-primitive-array-passed-to-object-vararg"></a>

### `spotbugs/VA_PRIMITIVE_ARRAY_PASSED_TO_OBJECT_VARARG`

A SpotBugs correctness pattern, `VA_PRIMITIVE_ARRAY_PASSED_TO_OBJECT_VARARG`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Pass a boxed array (Integer[]) or the elements individually; a primitive array arrives as one Object argument.
- **Exception:** If this is intended, add `{"rule":"spotbugs/VA_PRIMITIVE_ARRAY_PASSED_TO_OBJECT_VARARG","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#va-primitive-array-passed-to-function-expecting-a-variable-number-of-object-arguments-va-primitive-array-passed-to-object-vararg)

<a id="spotbugs-vo-volatile-increment"></a>

### `spotbugs/VO_VOLATILE_INCREMENT`

A SpotBugs multithreaded correctness pattern, `VO_VOLATILE_INCREMENT`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use AtomicInteger or AtomicLong (incrementAndGet) instead of ++ on a volatile field.
- **Exception:** If this is intended, add `{"rule":"spotbugs/VO_VOLATILE_INCREMENT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#vo-an-increment-to-a-volatile-field-isn-t-atomic-vo-volatile-increment)

<a id="spotbugs-vo-volatile-reference-to-array"></a>

### `spotbugs/VO_VOLATILE_REFERENCE_TO_ARRAY`

A SpotBugs multithreaded correctness pattern, `VO_VOLATILE_REFERENCE_TO_ARRAY`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Use AtomicReferenceArray or replace the whole array with a copy; volatile covers the reference, not the elements.
- **Exception:** If this is intended, add `{"rule":"spotbugs/VO_VOLATILE_REFERENCE_TO_ARRAY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#vo-a-volatile-reference-to-an-array-doesn-t-treat-the-array-elements-as-volatile-vo-volatile-reference-to-array)

<a id="spotbugs-vr-unresolvable-reference"></a>

### `spotbugs/VR_UNRESOLVABLE_REFERENCE`

A SpotBugs correctness pattern, `VR_UNRESOLVABLE_REFERENCE`.

- **Why it is on:** SpotBugs reports code that is probably a bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Add the missing class to the analysis classpath (the dependency in build.gradle), or remove the reference to it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/VR_UNRESOLVABLE_REFERENCE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#vr-class-makes-reference-to-unresolvable-class-or-method-vr-unresolvable-reference)

<a id="spotbugs-vsc-vulnerable-security-check-methods"></a>

### `spotbugs/VSC_VULNERABLE_SECURITY_CHECK_METHODS`

A SpotBugs malicious code vulnerability pattern, `VSC_VULNERABLE_SECURITY_CHECK_METHODS`.

- **Why it is on:** SpotBugs reports code that untrusted code could abuse, such as an exposed mutable field, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Make the security-checked method private or final, so a subclass cannot override it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/VSC_VULNERABLE_SECURITY_CHECK_METHODS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#vsc-non-private-and-non-final-security-check-methods-are-vulnerable-vsc-vulnerable-security-check-methods)

<a id="spotbugs-wa-await-not-in-loop"></a>

### `spotbugs/WA_AWAIT_NOT_IN_LOOP`

A SpotBugs multithreaded correctness pattern, `WA_AWAIT_NOT_IN_LOOP`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Call Condition.await inside a while loop that rechecks the condition after waking.
- **Exception:** If this is intended, add `{"rule":"spotbugs/WA_AWAIT_NOT_IN_LOOP","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#wa-condition-await-not-in-loop-wa-await-not-in-loop)

<a id="spotbugs-wa-not-in-loop"></a>

### `spotbugs/WA_NOT_IN_LOOP`

A SpotBugs multithreaded correctness pattern, `WA_NOT_IN_LOOP`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Call wait inside a while loop that rechecks the condition after waking.
- **Exception:** If this is intended, add `{"rule":"spotbugs/WA_NOT_IN_LOOP","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#wa-wait-not-in-loop-wa-not-in-loop)

<a id="spotbugs-wl-using-getclass-rather-than-class-literal"></a>

### `spotbugs/WL_USING_GETCLASS_RATHER_THAN_CLASS_LITERAL`

A SpotBugs multithreaded correctness pattern, `WL_USING_GETCLASS_RATHER_THAN_CLASS_LITERAL`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Synchronize on the class literal Foo.class, or better a private static final lock Object, not getClass().
- **Exception:** If this is intended, add `{"rule":"spotbugs/WL_USING_GETCLASS_RATHER_THAN_CLASS_LITERAL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#wl-synchronization-on-getclass-rather-than-class-literal-wl-using-getclass-rather-than-class-literal)

<a id="spotbugs-wmi-wrong-map-iterator"></a>

### `spotbugs/WMI_WRONG_MAP_ITERATOR`

A SpotBugs performance pattern, `WMI_WRONG_MAP_ITERATOR`.

- **Why it is on:** SpotBugs reports code that is correct but needlessly slow or wasteful, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Iterate map.entrySet() and read getKey() and getValue() instead of iterating keySet() and calling get(key).
- **Exception:** If this is intended, add `{"rule":"spotbugs/WMI_WRONG_MAP_ITERATOR","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#wmi-inefficient-use-of-keyset-iterator-instead-of-entryset-iterator-wmi-wrong-map-iterator)

<a id="spotbugs-ws-writeobject-sync"></a>

### `spotbugs/WS_WRITEOBJECT_SYNC`

A SpotBugs multithreaded correctness pattern, `WS_WRITEOBJECT_SYNC`.

- **Why it is on:** SpotBugs reports code that is probably a concurrency bug, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Remove synchronized from writeObject, or synchronize the other methods that touch the same state.
- **Exception:** If this is intended, add `{"rule":"spotbugs/WS_WRITEOBJECT_SYNC","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#ws-class-s-writeobject-method-is-synchronized-but-nothing-else-is-ws-writeobject-sync)

<a id="spotbugs-xfb-xml-factory-bypass"></a>

### `spotbugs/XFB_XML_FACTORY_BYPASS`

A SpotBugs dodgy code pattern, `XFB_XML_FACTORY_BYPASS`.

- **Why it is on:** SpotBugs reports code that is confusing or likely to lead to errors, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Create XML objects through the factory (DocumentBuilderFactory, SAXParserFactory, TransformerFactory), not by instantiating an implementation class.
- **Exception:** If this is intended, add `{"rule":"spotbugs/XFB_XML_FACTORY_BYPASS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#xfb-method-directly-allocates-a-specific-implementation-of-xml-interfaces-xfb-xml-factory-bypass)

<a id="spotbugs-xss-request-parameter-to-jsp-writer"></a>

### `spotbugs/XSS_REQUEST_PARAMETER_TO_JSP_WRITER`

A SpotBugs security pattern, `XSS_REQUEST_PARAMETER_TO_JSP_WRITER`.

- **Why it is on:** SpotBugs reports code that untrusted input can exploit, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Escape the request value for HTML output, or use a templating layer that escapes by default, before writing it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/XSS_REQUEST_PARAMETER_TO_JSP_WRITER","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#xss-jsp-reflected-cross-site-scripting-vulnerability-xss-request-parameter-to-jsp-writer)

<a id="spotbugs-xss-request-parameter-to-send-error"></a>

### `spotbugs/XSS_REQUEST_PARAMETER_TO_SEND_ERROR`

A SpotBugs security pattern, `XSS_REQUEST_PARAMETER_TO_SEND_ERROR`.

- **Why it is on:** SpotBugs reports code that untrusted input can exploit, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Do not put the request value in the error message; send a fixed message, or escape the value for HTML first.
- **Exception:** If this is intended, add `{"rule":"spotbugs/XSS_REQUEST_PARAMETER_TO_SEND_ERROR","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#xss-servlet-reflected-cross-site-scripting-vulnerability-in-error-page-xss-request-parameter-to-send-error)

<a id="spotbugs-xss-request-parameter-to-servlet-writer"></a>

### `spotbugs/XSS_REQUEST_PARAMETER_TO_SERVLET_WRITER`

A SpotBugs security pattern, `XSS_REQUEST_PARAMETER_TO_SERVLET_WRITER`.

- **Why it is on:** SpotBugs reports code that untrusted input can exploit, in the compiled classes of the main sources at medium confidence and above; every pattern it reports fails the gate when the change adds it.
- **Allowed form:** Escape the request value for HTML output, or use a templating layer that escapes by default, before writing it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/XSS_REQUEST_PARAMETER_TO_SERVLET_WRITER","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [SpotBugs bug description](https://spotbugs.readthedocs.io/en/stable/bugDescriptions.html#xss-servlet-reflected-cross-site-scripting-vulnerability-xss-request-parameter-to-servlet-writer)
