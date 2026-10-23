# Java and Kotlin: SpotBugs rules

The SpotBugs bug patterns, with find-sec-bugs, that the Java and Kotlin presets run on compiled classes, with Gradle and Maven. This page lists 504 rules. [All pages](README.md).

The guide for these rules: [docs/java-preset.md](../java-preset.md).

Unless an entry says otherwise:

- **Presets:** Java and Kotlin
- **Analyzers:** `java` (Java); `kotlin` (Kotlin)
- **Builds:** Gradle and Maven
- **Why it is on:** SpotBugs reports a bug pattern in the compiled classes of the main sources, at medium confidence and above. Every pattern it reports is a finding that fails the gate when the change adds it.

<a id="spotbugs-aa-assertion-of-arguments"></a>

### `spotbugs/AA_ASSERTION_OF_ARGUMENTS`

Aa assertion of arguments.

- **Allowed form:** Validate public arguments with Objects.requireNonNull or an explicit check that throws IllegalArgumentException; assert is skipped when assertions are off.
- **Exception:** If this is intended, add `{"rule":"spotbugs/AA_ASSERTION_OF_ARGUMENTS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-am-creates-empty-jar-file-entry"></a>

### `spotbugs/AM_CREATES_EMPTY_JAR_FILE_ENTRY`

Am creates empty jar file entry.

- **Allowed form:** Write the entry's bytes between putNextEntry and closeEntry, or drop the entry if it is not needed.
- **Exception:** If this is intended, add `{"rule":"spotbugs/AM_CREATES_EMPTY_JAR_FILE_ENTRY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-am-creates-empty-zip-file-entry"></a>

### `spotbugs/AM_CREATES_EMPTY_ZIP_FILE_ENTRY`

Am creates empty zip file entry.

- **Allowed form:** Write the entry's bytes between putNextEntry and closeEntry, or drop the entry if it is not needed.
- **Exception:** If this is intended, add `{"rule":"spotbugs/AM_CREATES_EMPTY_ZIP_FILE_ENTRY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-ase-assertion-with-side-effect"></a>

### `spotbugs/ASE_ASSERTION_WITH_SIDE_EFFECT`

Ase assertion with side effect.

- **Allowed form:** Run the state-changing call on its own line, store the result in a local, and assert on the local.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ASE_ASSERTION_WITH_SIDE_EFFECT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ase-assertion-with-side-effect-method"></a>

### `spotbugs/ASE_ASSERTION_WITH_SIDE_EFFECT_METHOD`

Ase assertion with side effect method.

- **Allowed form:** Call the mutating method outside the assert, keep the result in a local, and assert on that local.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ASE_ASSERTION_WITH_SIDE_EFFECT_METHOD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-at-nonatomic-64bit-primitive"></a>

### `spotbugs/AT_NONATOMIC_64BIT_PRIMITIVE`

At nonatomic 64bit primitive.

- **Allowed form:** Make the long or double field volatile, use AtomicLong, or guard every read and write with the same lock.
- **Exception:** If this is intended, add `{"rule":"spotbugs/AT_NONATOMIC_64BIT_PRIMITIVE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-at-nonatomic-operations-on-shared-variable"></a>

### `spotbugs/AT_NONATOMIC_OPERATIONS_ON_SHARED_VARIABLE`

At nonatomic operations on shared variable.

- **Allowed form:** Use AtomicInteger or AtomicReference (incrementAndGet, updateAndGet), or hold one lock across the whole read-modify-write.
- **Exception:** If this is intended, add `{"rule":"spotbugs/AT_NONATOMIC_OPERATIONS_ON_SHARED_VARIABLE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-at-operation-sequence-on-concurrent-abstraction"></a>

### `spotbugs/AT_OPERATION_SEQUENCE_ON_CONCURRENT_ABSTRACTION`

At operation sequence on concurrent abstraction.

- **Allowed form:** Replace the check-then-act on the concurrent map with one atomic call: putIfAbsent, computeIfAbsent, compute or merge.
- **Exception:** If this is intended, add `{"rule":"spotbugs/AT_OPERATION_SEQUENCE_ON_CONCURRENT_ABSTRACTION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-at-stale-thread-write-of-primitive"></a>

### `spotbugs/AT_STALE_THREAD_WRITE_OF_PRIMITIVE`

At stale thread write of primitive.

- **Allowed form:** Make the field volatile or an atomic type, or guard every read and write of it with the same lock.
- **Exception:** If this is intended, add `{"rule":"spotbugs/AT_STALE_THREAD_WRITE_OF_PRIMITIVE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-at-unsafe-resource-access-in-thread"></a>

### `spotbugs/AT_UNSAFE_RESOURCE_ACCESS_IN_THREAD`

At unsafe resource access in thread.

- **Allowed form:** Guard the shared resource with one lock around each use, or open a separate instance per thread in try-with-resources.
- **Exception:** If this is intended, add `{"rule":"spotbugs/AT_UNSAFE_RESOURCE_ACCESS_IN_THREAD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-bac-bad-applet-constructor"></a>

### `spotbugs/BAC_BAD_APPLET_CONSTRUCTOR`

Bac bad applet constructor.

- **Allowed form:** Move the work that needs the AppletStub (getParameter, getCodeBase, getDocumentBase) out of the constructor into init().
- **Exception:** If this is intended, add `{"rule":"spotbugs/BAC_BAD_APPLET_CONSTRUCTOR","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-bc-bad-cast-to-abstract-collection"></a>

### `spotbugs/BC_BAD_CAST_TO_ABSTRACT_COLLECTION`

Bc bad cast to abstract collection.

- **Allowed form:** Declare the parameter or return type as List, Set or Map instead of Collection, or copy with List.copyOf(c) rather than casting.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BC_BAD_CAST_TO_ABSTRACT_COLLECTION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-bc-bad-cast-to-concrete-collection"></a>

### `spotbugs/BC_BAD_CAST_TO_CONCRETE_COLLECTION`

Bc bad cast to concrete collection.

- **Allowed form:** Declare the type as the interface (List, Set, Map) and drop the cast to ArrayList or HashMap.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BC_BAD_CAST_TO_CONCRETE_COLLECTION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-bc-equals-method-should-work-for-all-objects"></a>

### `spotbugs/BC_EQUALS_METHOD_SHOULD_WORK_FOR_ALL_OBJECTS`

Bc equals method should work for all objects.

- **Allowed form:** Start equals with a pattern-matching instanceof check and return false for other types instead of casting or throwing.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BC_EQUALS_METHOD_SHOULD_WORK_FOR_ALL_OBJECTS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-bc-impossible-cast"></a>

### `spotbugs/BC_IMPOSSIBLE_CAST`

Bc impossible cast.

- **Allowed form:** Remove the cast or fix the variable's declared type so the cast can succeed; otherwise it always throws ClassCastException.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BC_IMPOSSIBLE_CAST","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-bc-impossible-cast-primitive-array"></a>

### `spotbugs/BC_IMPOSSIBLE_CAST_PRIMITIVE_ARRAY`

Bc impossible cast primitive array.

- **Allowed form:** Cast to the array type the value really has, or change the declared type; a primitive array never casts to another array type.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BC_IMPOSSIBLE_CAST_PRIMITIVE_ARRAY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-bc-impossible-downcast"></a>

### `spotbugs/BC_IMPOSSIBLE_DOWNCAST`

Bc impossible downcast.

- **Allowed form:** Drop the downcast or build the value as the subtype; check the runtime type with instanceof pattern matching before casting.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BC_IMPOSSIBLE_DOWNCAST","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-bc-impossible-downcast-of-toarray"></a>

### `spotbugs/BC_IMPOSSIBLE_DOWNCAST_OF_TOARRAY`

Bc impossible downcast of toarray.

- **Allowed form:** Call toArray(new String[0]) with a typed array argument instead of casting the Object[] result.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BC_IMPOSSIBLE_DOWNCAST_OF_TOARRAY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-bc-impossible-instanceof"></a>

### `spotbugs/BC_IMPOSSIBLE_INSTANCEOF`

Bc impossible instanceof.

- **Allowed form:** Delete the instanceof test or fix the types; the compared types are unrelated, so the check is always false.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BC_IMPOSSIBLE_INSTANCEOF","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-bc-unconfirmed-cast"></a>

### `spotbugs/BC_UNCONFIRMED_CAST`

Bc unconfirmed cast.

- **Allowed form:** Guard the cast with a pattern instanceof (if (o instanceof Foo foo)), or change the declared type so no cast is needed.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BC_UNCONFIRMED_CAST","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-bc-unconfirmed-cast-of-return-value"></a>

### `spotbugs/BC_UNCONFIRMED_CAST_OF_RETURN_VALUE`

Bc unconfirmed cast of return value.

- **Allowed form:** Check the returned value with a pattern instanceof before using it as the subtype, or make the method return the subtype.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BC_UNCONFIRMED_CAST_OF_RETURN_VALUE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-bc-vacuous-instanceof"></a>

### `spotbugs/BC_VACUOUS_INSTANCEOF`

Bc vacuous instanceof.

- **Allowed form:** Remove the instanceof test, since the static type already guarantees it; use == null if a null check was meant.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BC_VACUOUS_INSTANCEOF","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-bit-add-of-signed-byte"></a>

### `spotbugs/BIT_ADD_OF_SIGNED_BYTE`

Bit add of signed byte.

- **Allowed form:** Mask the byte before combining: (b & 0xFF) in the addition or OR.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BIT_ADD_OF_SIGNED_BYTE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-bit-and"></a>

### `spotbugs/BIT_AND`

Bit and.

- **Allowed form:** Fix the mask or the compared constant so the test can match; then compare (flags & MASK) != 0 for a membership check.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BIT_AND","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-bit-and-zz"></a>

### `spotbugs/BIT_AND_ZZ`

Bit and zz.

- **Allowed form:** The mask is 0, so (e & 0) == 0 is always true: use the intended non-zero mask, or delete the test.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BIT_AND_ZZ","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-bit-ior"></a>

### `spotbugs/BIT_IOR`

Bit ior.

- **Allowed form:** Use & to test bits, (flags & MASK) != 0, and parenthesize mixed expressions like (e & (A | B)) == C.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BIT_IOR","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-bit-ior-of-signed-byte"></a>

### `spotbugs/BIT_IOR_OF_SIGNED_BYTE`

Bit ior of signed byte.

- **Allowed form:** Mask the byte before ORing it into a wider value: (b & 0xFF) \<\< 8 | (c & 0xFF).
- **Exception:** If this is intended, add `{"rule":"spotbugs/BIT_IOR_OF_SIGNED_BYTE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-bit-signed-check"></a>

### `spotbugs/BIT_SIGNED_CHECK`

Bit signed check.

- **Allowed form:** Compare the masked value against 0 with != 0, not > 0, because the sign bit makes > 0 wrong: (flags & MASK) != 0.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BIT_SIGNED_CHECK","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-bit-signed-check-high-bit"></a>

### `spotbugs/BIT_SIGNED_CHECK_HIGH_BIT`

Bit signed check high bit.

- **Allowed form:** Test the bit with (x & MASK) != 0 instead of > 0, since the mask's high bit makes the result negative.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BIT_SIGNED_CHECK_HIGH_BIT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-boa-badly-overridden-adapter"></a>

### `spotbugs/BOA_BADLY_OVERRIDDEN_ADAPTER`

Boa badly overridden adapter.

- **Allowed form:** Fix the method signature so it overrides the listener adapter method, and add @Override so the compiler checks it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BOA_BADLY_OVERRIDDEN_ADAPTER","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-bshift-wrong-add-priority"></a>

### `spotbugs/BSHIFT_WRONG_ADD_PRIORITY`

Bshift wrong add priority.

- **Allowed form:** Add parentheses to say which you mean: (a \<\< 8) + b or a \<\< (8 + b); + binds tighter than \<\<.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BSHIFT_WRONG_ADD_PRIORITY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-bx-boxing-immediately-unboxed"></a>

### `spotbugs/BX_BOXING_IMMEDIATELY_UNBOXED`

Bx boxing immediately unboxed.

- **Allowed form:** Use the primitive directly (Integer.parseInt, an int variable) instead of boxing a value and calling intValue() on it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BX_BOXING_IMMEDIATELY_UNBOXED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-bx-boxing-immediately-unboxed-to-perform-coercion"></a>

### `spotbugs/BX_BOXING_IMMEDIATELY_UNBOXED_TO_PERFORM_COERCION`

Bx boxing immediately unboxed to perform coercion.

- **Allowed form:** Convert with a cast such as (double) count instead of boxing and unboxing the value.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BX_BOXING_IMMEDIATELY_UNBOXED_TO_PERFORM_COERCION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-bx-unboxed-and-coerced-for-ternary-operator"></a>

### `spotbugs/BX_UNBOXED_AND_COERCED_FOR_TERNARY_OPERATOR`

Bx unboxed and coerced for ternary operator.

- **Allowed form:** Give both ternary branches the same type, all boxed or all primitive, so no hidden unboxing or numeric promotion happens.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BX_UNBOXED_AND_COERCED_FOR_TERNARY_OPERATOR","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-bx-unboxing-immediately-reboxed"></a>

### `spotbugs/BX_UNBOXING_IMMEDIATELY_REBOXED`

Bx unboxing immediately reboxed.

- **Allowed form:** Keep the value as the boxed type and pass it along; do not call intValue() and box it again.
- **Exception:** If this is intended, add `{"rule":"spotbugs/BX_UNBOXING_IMMEDIATELY_REBOXED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-caa-covariant-array-element-store"></a>

### `spotbugs/CAA_COVARIANT_ARRAY_ELEMENT_STORE`

Caa covariant array element store.

- **Allowed form:** Use a List\<T> or an array of the exact element type so stores cannot hit ArrayStoreException.
- **Exception:** If this is intended, add `{"rule":"spotbugs/CAA_COVARIANT_ARRAY_ELEMENT_STORE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-caa-covariant-array-field"></a>

### `spotbugs/CAA_COVARIANT_ARRAY_FIELD`

Caa covariant array field.

- **Allowed form:** Declare the field with the element type you actually store (String[], not Object[]), or hold a List instead of an array.
- **Exception:** If this is intended, add `{"rule":"spotbugs/CAA_COVARIANT_ARRAY_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-caa-covariant-array-local"></a>

### `spotbugs/CAA_COVARIANT_ARRAY_LOCAL`

Caa covariant array local.

- **Allowed form:** Declare the local with the element type you actually store (String[], not Object[]), or use a List.
- **Exception:** If this is intended, add `{"rule":"spotbugs/CAA_COVARIANT_ARRAY_LOCAL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-caa-covariant-array-return"></a>

### `spotbugs/CAA_COVARIANT_ARRAY_RETURN`

Caa covariant array return.

- **Allowed form:** Declare the return type with the element type you actually return (String[], not Object[]), or return a List.
- **Exception:** If this is intended, add `{"rule":"spotbugs/CAA_COVARIANT_ARRAY_RETURN","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-cd-circular-dependency"></a>

### `spotbugs/CD_CIRCULAR_DEPENDENCY`

Cd circular dependency.

- **Allowed form:** Break the cycle: move the shared logic into a third class or behind an interface that both classes depend on.
- **Exception:** If this is intended, add `{"rule":"spotbugs/CD_CIRCULAR_DEPENDENCY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-ci-confused-inheritance"></a>

### `spotbugs/CI_CONFUSED_INHERITANCE`

Ci confused inheritance.

- **Allowed form:** Make the protected member of the final class private, since nothing can inherit it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/CI_CONFUSED_INHERITANCE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-cn-idiom"></a>

### `spotbugs/CN_IDIOM`

Cn idiom.

- **Allowed form:** Remove implements Cloneable and offer a copy constructor or static copy factory; if clone is needed, override it calling super.clone().
- **Exception:** If this is intended, add `{"rule":"spotbugs/CN_IDIOM","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-cn-idiom-no-super-call"></a>

### `spotbugs/CN_IDIOM_NO_SUPER_CALL`

Cn idiom no super call.

- **Allowed form:** Obtain the copy through super.clone() in clone, or drop clone and use a copy constructor.
- **Exception:** If this is intended, add `{"rule":"spotbugs/CN_IDIOM_NO_SUPER_CALL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-cn-implements-clone-but-not-cloneable"></a>

### `spotbugs/CN_IMPLEMENTS_CLONE_BUT_NOT_CLONEABLE`

Cn implements clone but not cloneable.

- **Allowed form:** Replace clone with a copy constructor or static factory, or declare implements Cloneable and call super.clone().
- **Exception:** If this is intended, add `{"rule":"spotbugs/CN_IMPLEMENTS_CLONE_BUT_NOT_CLONEABLE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-cnt-rough-constant-value"></a>

### `spotbugs/CNT_ROUGH_CONSTANT_VALUE`

Cnt rough constant value.

- **Allowed form:** Use the exact constant, such as Math.PI or Math.E, instead of a rounded literal.
- **Exception:** If this is intended, add `{"rule":"spotbugs/CNT_ROUGH_CONSTANT_VALUE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-co-abstract-self"></a>

### `spotbugs/CO_ABSTRACT_SELF`

Co abstract self.

- **Allowed form:** Declare the abstract class implements Comparable\<ItsType>, so compareTo(ItsType) overrides it, and mark it @Override.
- **Exception:** If this is intended, add `{"rule":"spotbugs/CO_ABSTRACT_SELF","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-co-compareto-incorrect-floating"></a>

### `spotbugs/CO_COMPARETO_INCORRECT_FLOATING`

Co compareto incorrect floating.

- **Allowed form:** Compare floating-point values with Double.compare or Float.compare, not by subtracting or casting the difference to int.
- **Exception:** If this is intended, add `{"rule":"spotbugs/CO_COMPARETO_INCORRECT_FLOATING","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-co-compareto-results-min-value"></a>

### `spotbugs/CO_COMPARETO_RESULTS_MIN_VALUE`

Co compareto results min value.

- **Allowed form:** Return -1, 0 or 1, or use Integer.compare, instead of Integer.MIN_VALUE from compareTo.
- **Exception:** If this is intended, add `{"rule":"spotbugs/CO_COMPARETO_RESULTS_MIN_VALUE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-co-self-no-object"></a>

### `spotbugs/CO_SELF_NO_OBJECT`

Co self no object.

- **Allowed form:** Declare implements Comparable\<Foo>, so compareTo(Foo) overrides the interface method, and mark it @Override.
- **Exception:** If this is intended, add `{"rule":"spotbugs/CO_SELF_NO_OBJECT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ct-constructor-throw"></a>

### `spotbugs/CT_CONSTRUCTOR_THROW`

Ct constructor throw.

- **Allowed form:** Make the class final (records already are), or validate in a static factory method before calling a private constructor.
- **Exception:** If this is intended, add `{"rule":"spotbugs/CT_CONSTRUCTOR_THROW","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-db-duplicate-branches"></a>

### `spotbugs/DB_DUPLICATE_BRANCHES`

Db duplicate branches.

- **Allowed form:** Drop the condition and keep one copy of the code, or fix the branch that was meant to differ.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DB_DUPLICATE_BRANCHES","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-db-duplicate-switch-clauses"></a>

### `spotbugs/DB_DUPLICATE_SWITCH_CLAUSES`

Db duplicate switch clauses.

- **Allowed form:** Merge the identical cases into one arrow label (case A, B -> ...), or fix the clause that was meant to differ.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DB_DUPLICATE_SWITCH_CLAUSES","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dc-doublecheck"></a>

### `spotbugs/DC_DOUBLECHECK`

Dc doublecheck.

- **Allowed form:** Use an eager static final field or a holder class for lazy init, or make the field volatile; do not rely on an unsynchronized first check.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DC_DOUBLECHECK","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dc-partially-constructed"></a>

### `spotbugs/DC_PARTIALLY_CONSTRUCTED`

Dc partially constructed.

- **Allowed form:** Build the object in a local variable and assign it to the field last, and make that field volatile.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DC_PARTIALLY_CONSTRUCTED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dcn-nullpointer-exception"></a>

### `spotbugs/DCN_NULLPOINTER_EXCEPTION`

Dcn nullpointer exception.

- **Allowed form:** Test the reference with an explicit null check, or Objects.requireNonNull at the entry, instead of catching NullPointerException.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DCN_NULLPOINTER_EXCEPTION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-de-might-drop"></a>

### `spotbugs/DE_MIGHT_DROP`

De might drop.

- **Allowed form:** Handle the exception: log it, return a failure value, or rethrow wrapped as new IllegalStateException(msg, e).
- **Exception:** If this is intended, add `{"rule":"spotbugs/DE_MIGHT_DROP","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-de-might-ignore"></a>

### `spotbugs/DE_MIGHT_IGNORE`

De might ignore.

- **Allowed form:** Handle the exception: log it, return a failure value, or rethrow wrapped as new IllegalStateException(msg, e).
- **Exception:** If this is intended, add `{"rule":"spotbugs/DE_MIGHT_IGNORE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dl-synchronization-on-boolean"></a>

### `spotbugs/DL_SYNCHRONIZATION_ON_BOOLEAN`

Dl synchronization on boolean.

- **Allowed form:** Synchronize on a private final Object lock = new Object() field instead of a Boolean.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DL_SYNCHRONIZATION_ON_BOOLEAN","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dl-synchronization-on-boxed-primitive"></a>

### `spotbugs/DL_SYNCHRONIZATION_ON_BOXED_PRIMITIVE`

Dl synchronization on boxed primitive.

- **Allowed form:** Synchronize on a private final Object lock = new Object() field instead of a boxed number that may be shared.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DL_SYNCHRONIZATION_ON_BOXED_PRIMITIVE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dl-synchronization-on-interned-string"></a>

### `spotbugs/DL_SYNCHRONIZATION_ON_INTERNED_STRING`

Dl synchronization on interned string.

- **Allowed form:** Synchronize on a private final Object lock = new Object() field instead of a String literal or interned string.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DL_SYNCHRONIZATION_ON_INTERNED_STRING","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dl-synchronization-on-shared-constant"></a>

### `spotbugs/DL_SYNCHRONIZATION_ON_SHARED_CONSTANT`

Dl synchronization on shared constant.

- **Allowed form:** Synchronize on a private final Object lock = new Object() field instead of a constant other code can also reach.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DL_SYNCHRONIZATION_ON_SHARED_CONSTANT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dl-synchronization-on-unshared-boxed-primitive"></a>

### `spotbugs/DL_SYNCHRONIZATION_ON_UNSHARED_BOXED_PRIMITIVE`

Dl synchronization on unshared boxed primitive.

- **Allowed form:** Synchronize on a private final Object lock = new Object() field instead of a boxed number whose identity changes on reassignment.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DL_SYNCHRONIZATION_ON_UNSHARED_BOXED_PRIMITIVE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dls-dead-local-increment-in-return"></a>

### `spotbugs/DLS_DEAD_LOCAL_INCREMENT_IN_RETURN`

Dls dead local increment in return.

- **Allowed form:** Return the new value with return i + 1; or increment the field, not a local that is discarded.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DLS_DEAD_LOCAL_INCREMENT_IN_RETURN","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dls-dead-local-store"></a>

### `spotbugs/DLS_DEAD_LOCAL_STORE`

Dls dead local store.

- **Allowed form:** Delete the assignment whose value is never read, or use the value; keep just the call if its side effect is needed.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DLS_DEAD_LOCAL_STORE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dls-dead-local-store-in-return"></a>

### `spotbugs/DLS_DEAD_LOCAL_STORE_IN_RETURN`

Dls dead local store in return.

- **Allowed form:** Return the expression directly instead of assigning it to a local that is then not used.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DLS_DEAD_LOCAL_STORE_IN_RETURN","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dls-dead-local-store-of-null"></a>

### `spotbugs/DLS_DEAD_LOCAL_STORE_OF_NULL`

Dls dead local store of null.

- **Allowed form:** Delete the assignment of null to the local; narrow the variable's scope so it goes out of scope by itself.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DLS_DEAD_LOCAL_STORE_OF_NULL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dls-dead-local-store-shadows-field"></a>

### `spotbugs/DLS_DEAD_LOCAL_STORE_SHADOWS_FIELD`

Dls dead local store shadows field.

- **Allowed form:** Assign the field as this.name, or rename the local so it no longer hides the field.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DLS_DEAD_LOCAL_STORE_SHADOWS_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dls-dead-store-of-class-literal"></a>

### `spotbugs/DLS_DEAD_STORE_OF_CLASS_LITERAL`

Dls dead store of class literal.

- **Allowed form:** Delete the unused assignment of the class literal; to force class initialization use Class.forName(name, true, loader).
- **Exception:** If this is intended, add `{"rule":"spotbugs/DLS_DEAD_STORE_OF_CLASS_LITERAL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dls-overwritten-increment"></a>

### `spotbugs/DLS_OVERWRITTEN_INCREMENT`

Dls overwritten increment.

- **Allowed form:** Write i++ alone, not i = i++; the assignment overwrites the increment.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DLS_OVERWRITTEN_INCREMENT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dm-boolean-ctor"></a>

### `spotbugs/DM_BOOLEAN_CTOR`

Dm boolean ctor.

- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_BOOLEAN_CTOR","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dm-boxed-primitive-for-compare"></a>

### `spotbugs/DM_BOXED_PRIMITIVE_FOR_COMPARE`

Dm boxed primitive for compare.

- **Allowed form:** Compare primitives with Integer.compare(a, b) or Double.compare(a, b) instead of boxing one side to call compareTo.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_BOXED_PRIMITIVE_FOR_COMPARE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dm-boxed-primitive-for-parsing"></a>

### `spotbugs/DM_BOXED_PRIMITIVE_FOR_PARSING`

Dm boxed primitive for parsing.

- **Allowed form:** Call the primitive parser, such as Integer.parseInt(s), instead of Integer.valueOf(s) followed by intValue().
- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_BOXED_PRIMITIVE_FOR_PARSING","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dm-boxed-primitive-tostring"></a>

### `spotbugs/DM_BOXED_PRIMITIVE_TOSTRING`

Dm boxed primitive tostring.

- **Allowed form:** Call the static Integer.toString(x) or String.valueOf(x) instead of boxing the value to call toString().
- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_BOXED_PRIMITIVE_TOSTRING","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dm-convert-case"></a>

### `spotbugs/DM_CONVERT_CASE`

Dm convert case.

- **Allowed form:** Pass a locale: s.toUpperCase(Locale.ROOT) or s.toLowerCase(Locale.ROOT).
- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_CONVERT_CASE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dm-default-encoding"></a>

### `spotbugs/DM_DEFAULT_ENCODING`

Dm default encoding.

- **Allowed form:** Pass a charset explicitly, such as StandardCharsets.UTF_8 to getBytes, InputStreamReader, FileReader or new String.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_DEFAULT_ENCODING","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dm-exit"></a>

### `spotbugs/DM_EXIT`

Dm exit.

- **Allowed form:** Return a result or throw an exception and let main alone decide the exit status.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_EXIT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-dm-fp-number-ctor"></a>

### `spotbugs/DM_FP_NUMBER_CTOR`

Dm fp number ctor.

- **Allowed form:** Use Double.valueOf(x) or Float.valueOf(x), or keep the primitive, instead of the Double or Float constructor.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_FP_NUMBER_CTOR","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dm-gc"></a>

### `spotbugs/DM_GC`

Dm gc.

- **Allowed form:** Delete the System.gc() or Runtime.gc() call and let the JVM schedule collection.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_GC","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-dm-invalid-min-max"></a>

### `spotbugs/DM_INVALID_MIN_MAX`

Dm invalid min max.

- **Allowed form:** Swap the clamp so the lower bound goes in Math.max and the upper in Math.min: Math.max(lo, Math.min(hi, x)).
- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_INVALID_MIN_MAX","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dm-monitor-wait-on-condition"></a>

### `spotbugs/DM_MONITOR_WAIT_ON_CONDITION`

Dm monitor wait on condition.

- **Allowed form:** Call await() on the Condition instead of wait(), which waits on the Condition object's own monitor.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_MONITOR_WAIT_ON_CONDITION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dm-new-for-getclass"></a>

### `spotbugs/DM_NEW_FOR_GETCLASS`

Dm new for getclass.

- **Allowed form:** Write Foo.class, or call getClass() on an object you already have, instead of creating an object only to call getClass().
- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_NEW_FOR_GETCLASS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dm-nextint-via-nextdouble"></a>

### `spotbugs/DM_NEXTINT_VIA_NEXTDOUBLE`

Dm nextint via nextdouble.

- **Allowed form:** Call random.nextInt(n) instead of (int) (random.nextDouble() \* n).
- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_NEXTINT_VIA_NEXTDOUBLE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dm-number-ctor"></a>

### `spotbugs/DM_NUMBER_CTOR`

Dm number ctor.

- **Allowed form:** Use Integer.valueOf(x) or the primitive instead of new Integer(x), new Long(x) and similar constructors.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_NUMBER_CTOR","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dm-run-finalizers-on-exit"></a>

### `spotbugs/DM_RUN_FINALIZERS_ON_EXIT`

Dm run finalizers on exit.

- **Allowed form:** Remove the call; register a shutdown hook with Runtime.addShutdownHook or use try-with-resources for cleanup.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_RUN_FINALIZERS_ON_EXIT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dm-string-ctor"></a>

### `spotbugs/DM_STRING_CTOR`

Dm string ctor.

- **Allowed form:** Use the String or literal directly; drop the new String(s) copy.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_STRING_CTOR","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dm-string-tostring"></a>

### `spotbugs/DM_STRING_TOSTRING`

Dm string tostring.

- **Allowed form:** Use the String itself; drop the toString() call on a String.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_STRING_TOSTRING","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dm-string-void-ctor"></a>

### `spotbugs/DM_STRING_VOID_CTOR`

Dm string void ctor.

- **Allowed form:** Write the empty literal "" instead of new String().
- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_STRING_VOID_CTOR","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dm-useless-thread"></a>

### `spotbugs/DM_USELESS_THREAD`

Dm useless thread.

- **Allowed form:** Give the Thread a Runnable (new Thread(() -> work())), or submit the task to an ExecutorService.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DM_USELESS_THREAD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dmi-annotation-is-not-visible-to-reflection"></a>

### `spotbugs/DMI_ANNOTATION_IS_NOT_VISIBLE_TO_REFLECTION`

Dmi annotation is not visible to reflection.

- **Allowed form:** Add @Retention(RetentionPolicy.RUNTIME) to the annotation type being looked up through reflection.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_ANNOTATION_IS_NOT_VISIBLE_TO_REFLECTION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dmi-arguments-wrong-order"></a>

### `spotbugs/DMI_ARGUMENTS_WRONG_ORDER`

Dmi arguments wrong order.

- **Allowed form:** Pass the arguments in the order the method declares them; swap the call's arguments.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_ARGUMENTS_WRONG_ORDER","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dmi-bad-month"></a>

### `spotbugs/DMI_BAD_MONTH`

Dmi bad month.

- **Allowed form:** Use java.time (LocalDate.of(2024, Month.MARCH, 1)) or Calendar.MARCH; Calendar months run 0 to 11.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_BAD_MONTH","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dmi-bigdecimal-constructed-from-double"></a>

### `spotbugs/DMI_BIGDECIMAL_CONSTRUCTED_FROM_DOUBLE`

Dmi bigdecimal constructed from double.

- **Allowed form:** Build it with BigDecimal.valueOf(d) or new BigDecimal("0.1") from a string, not new BigDecimal(double).
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_BIGDECIMAL_CONSTRUCTED_FROM_DOUBLE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dmi-blocking-methods-on-url"></a>

### `spotbugs/DMI_BLOCKING_METHODS_ON_URL`

Dmi blocking methods on url.

- **Allowed form:** Use java.net.URI for equals, hashCode and map keys; build a URL from the URI only when opening a connection.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_BLOCKING_METHODS_ON_URL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dmi-calling-next-from-hasnext"></a>

### `spotbugs/DMI_CALLING_NEXT_FROM_HASNEXT`

Dmi calling next from hasnext.

- **Allowed form:** Make hasNext() side-effect free; read ahead into a field and have next() return it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_CALLING_NEXT_FROM_HASNEXT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dmi-collection-of-urls"></a>

### `spotbugs/DMI_COLLECTION_OF_URLS`

Dmi collection of urls.

- **Allowed form:** Store URI values in the Set or Map keys instead of URL, and convert with uri.toURL() only when connecting.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_COLLECTION_OF_URLS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dmi-collections-should-not-contain-themselves"></a>

### `spotbugs/DMI_COLLECTIONS_SHOULD_NOT_CONTAIN_THEMSELVES`

Dmi collections should not contain themselves.

- **Allowed form:** Pass a different collection to contains, remove, or containsAll; a collection is not an element of itself.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_COLLECTIONS_SHOULD_NOT_CONTAIN_THEMSELVES","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dmi-constant-db-password"></a>

### `spotbugs/DMI_CONSTANT_DB_PASSWORD`

Dmi constant db password.

- **Allowed form:** Read the database password from the environment or a secrets store at startup and pass it in as a parameter.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_CONSTANT_DB_PASSWORD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dmi-doh"></a>

### `spotbugs/DMI_DOH`

Dmi doh.

- **Allowed form:** Remove or correct the call; with these arguments it has no effect or always fails.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_DOH","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dmi-empty-db-password"></a>

### `spotbugs/DMI_EMPTY_DB_PASSWORD`

Dmi empty db password.

- **Allowed form:** Configure a real database password from the environment or a secrets store and pass it in as a parameter.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_EMPTY_DB_PASSWORD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dmi-entry-sets-may-reuse-entry-objects"></a>

### `spotbugs/DMI_ENTRY_SETS_MAY_REUSE_ENTRY_OBJECTS`

Dmi entry sets may reuse entry objects.

- **Allowed form:** Copy each entry with Map.entry(e.getKey(), e.getValue()) before collecting it, or collect keys and values separately.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_ENTRY_SETS_MAY_REUSE_ENTRY_OBJECTS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dmi-futile-attempt-to-change-maxpool-size-of-scheduled-thread-pool-executor"></a>

### `spotbugs/DMI_FUTILE_ATTEMPT_TO_CHANGE_MAXPOOL_SIZE_OF_SCHEDULED_THREAD_POOL_EXECUTOR`

Dmi futile attempt to change maxpool size of scheduled thread pool executor.

- **Allowed form:** Call setCorePoolSize on the ScheduledThreadPoolExecutor; setMaximumPoolSize does nothing there.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_FUTILE_ATTEMPT_TO_CHANGE_MAXPOOL_SIZE_OF_SCHEDULED_THREAD_POOL_EXECUTOR","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dmi-hardcoded-absolute-filename"></a>

### `spotbugs/DMI_HARDCODED_ABSOLUTE_FILENAME`

Dmi hardcoded absolute filename.

- **Allowed form:** Take the path as a parameter or a configuration value, or resolve it against Path.of with a relative or temp directory.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_HARDCODED_ABSOLUTE_FILENAME","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-dmi-invoking-hashcode-on-array"></a>

### `spotbugs/DMI_INVOKING_HASHCODE_ON_ARRAY`

Dmi invoking hashcode on array.

- **Allowed form:** Use Arrays.hashCode(array), or Arrays.deepHashCode for nested arrays.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_INVOKING_HASHCODE_ON_ARRAY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dmi-invoking-tostring-on-anonymous-array"></a>

### `spotbugs/DMI_INVOKING_TOSTRING_ON_ANONYMOUS_ARRAY`

Dmi invoking tostring on anonymous array.

- **Allowed form:** Use Arrays.toString(new String[] {...}) or just pass the values to List.of.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_INVOKING_TOSTRING_ON_ANONYMOUS_ARRAY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dmi-invoking-tostring-on-array"></a>

### `spotbugs/DMI_INVOKING_TOSTRING_ON_ARRAY`

Dmi invoking tostring on array.

- **Allowed form:** Use Arrays.toString(array), or Arrays.deepToString for nested arrays.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_INVOKING_TOSTRING_ON_ARRAY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dmi-long-bits-to-double-invoked-on-int"></a>

### `spotbugs/DMI_LONG_BITS_TO_DOUBLE_INVOKED_ON_INT`

Dmi long bits to double invoked on int.

- **Allowed form:** Pass a long to Double.longBitsToDouble, or use Float.intBitsToFloat for an int.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_LONG_BITS_TO_DOUBLE_INVOKED_ON_INT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dmi-nonserializable-object-written"></a>

### `spotbugs/DMI_NONSERIALIZABLE_OBJECT_WRITTEN`

Dmi nonserializable object written.

- **Allowed form:** Make the written class implement Serializable, or write a serializable copy (a record of the needed fields).
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_NONSERIALIZABLE_OBJECT_WRITTEN","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dmi-random-used-only-once"></a>

### `spotbugs/DMI_RANDOM_USED_ONLY_ONCE`

Dmi random used only once.

- **Allowed form:** Create one Random and reuse it as a field, or call ThreadLocalRandom.current().nextInt(bound).
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_RANDOM_USED_ONLY_ONCE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dmi-scheduled-thread-pool-executor-with-zero-core-threads"></a>

### `spotbugs/DMI_SCHEDULED_THREAD_POOL_EXECUTOR_WITH_ZERO_CORE_THREADS`

Dmi scheduled thread pool executor with zero core threads.

- **Allowed form:** Give ScheduledThreadPoolExecutor a core pool size of at least 1, or use Executors.newSingleThreadScheduledExecutor().
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_SCHEDULED_THREAD_POOL_EXECUTOR_WITH_ZERO_CORE_THREADS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dmi-thread-passed-where-runnable-expected"></a>

### `spotbugs/DMI_THREAD_PASSED_WHERE_RUNNABLE_EXPECTED`

Dmi thread passed where runnable expected.

- **Allowed form:** Pass a Runnable lambda or method reference to the executor or Thread constructor instead of a Thread object.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_THREAD_PASSED_WHERE_RUNNABLE_EXPECTED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dmi-unsupported-method"></a>

### `spotbugs/DMI_UNSUPPORTED_METHOD`

Dmi unsupported method.

- **Allowed form:** Call the supported API instead of the method that always throws UnsupportedOperationException.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_UNSUPPORTED_METHOD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dmi-useless-substring"></a>

### `spotbugs/DMI_USELESS_SUBSTRING`

Dmi useless substring.

- **Allowed form:** Use the original String directly instead of substring(0), which returns the same content.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_USELESS_SUBSTRING","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dmi-using-removeall-to-clear-collection"></a>

### `spotbugs/DMI_USING_REMOVEALL_TO_CLEAR_COLLECTION`

Dmi using removeall to clear collection.

- **Allowed form:** Call clear() on the collection instead of removeAll(sameCollection).
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_USING_REMOVEALL_TO_CLEAR_COLLECTION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dmi-vacuous-call-to-easymock-method"></a>

### `spotbugs/DMI_VACUOUS_CALL_TO_EASYMOCK_METHOD`

Dmi vacuous call to easymock method.

- **Allowed form:** Pass the mock object to replay, verify or reset; with no mock argument the call does nothing. Prefer Mockito.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_VACUOUS_CALL_TO_EASYMOCK_METHOD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dmi-vacuous-self-collection-call"></a>

### `spotbugs/DMI_VACUOUS_SELF_COLLECTION_CALL`

Dmi vacuous self collection call.

- **Allowed form:** Remove the call or pass a different collection; calling containsAll, removeAll or retainAll with itself does nothing useful.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DMI_VACUOUS_SELF_COLLECTION_CALL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-dp-create-classloader-inside-do-privileged"></a>

### `spotbugs/DP_CREATE_CLASSLOADER_INSIDE_DO_PRIVILEGED`

Dp create classloader inside do privileged.

- **Allowed form:** Use the existing context or application class loader instead of creating one; do not wrap it in AccessController, which is deprecated for removal.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DP_CREATE_CLASSLOADER_INSIDE_DO_PRIVILEGED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-dp-do-inside-do-privileged"></a>

### `spotbugs/DP_DO_INSIDE_DO_PRIVILEGED`

Dp do inside do privileged.

- **Allowed form:** Avoid setAccessible and other reflective access; use the public API or MethodHandles.privateLookupIn. Do not add AccessController, which is deprecated.
- **Exception:** If this is intended, add `{"rule":"spotbugs/DP_DO_INSIDE_DO_PRIVILEGED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-ec-array-and-nonarray"></a>

### `spotbugs/EC_ARRAY_AND_NONARRAY`

Ec array and nonarray.

- **Allowed form:** Compare values of the same kind; use Arrays.equals(a, b) for arrays, never array.equals(object).
- **Exception:** If this is intended, add `{"rule":"spotbugs/EC_ARRAY_AND_NONARRAY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ec-bad-array-compare"></a>

### `spotbugs/EC_BAD_ARRAY_COMPARE`

Ec bad array compare.

- **Allowed form:** Use Arrays.equals(a, b), or Arrays.deepEquals for nested arrays, not array.equals(other).
- **Exception:** If this is intended, add `{"rule":"spotbugs/EC_BAD_ARRAY_COMPARE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ec-incompatible-array-compare"></a>

### `spotbugs/EC_INCOMPATIBLE_ARRAY_COMPARE`

Ec incompatible array compare.

- **Allowed form:** Compare arrays of the same element type with Arrays.equals; arrays of different types are never equal.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EC_INCOMPATIBLE_ARRAY_COMPARE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ec-null-arg"></a>

### `spotbugs/EC_NULL_ARG`

Ec null arg.

- **Allowed form:** Remove the equals(null) call; use x == null for a null test.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EC_NULL_ARG","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ec-unrelated-class-and-interface"></a>

### `spotbugs/EC_UNRELATED_CLASS_AND_INTERFACE`

Ec unrelated class and interface.

- **Allowed form:** Compare values of related types, or fix the declared types; equals between the class and interface is always false.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EC_UNRELATED_CLASS_AND_INTERFACE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ec-unrelated-interfaces"></a>

### `spotbugs/EC_UNRELATED_INTERFACES`

Ec unrelated interfaces.

- **Allowed form:** Compare values of related types, or fix the declared types; no class implements both interfaces, so equals is always false.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EC_UNRELATED_INTERFACES","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ec-unrelated-types"></a>

### `spotbugs/EC_UNRELATED_TYPES`

Ec unrelated types.

- **Allowed form:** Compare values of the same type, or convert one side first; equals on unrelated types is always false.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EC_UNRELATED_TYPES","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ec-unrelated-types-using-pointer-equality"></a>

### `spotbugs/EC_UNRELATED_TYPES_USING_POINTER_EQUALITY`

Ec unrelated types using pointer equality.

- **Allowed form:** Compare values of related types, or fix the declared types; == between unrelated types is always false.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EC_UNRELATED_TYPES_USING_POINTER_EQUALITY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ei-expose-buf"></a>

### `spotbugs/EI_EXPOSE_BUF`

Ei expose buf.

- **Allowed form:** Return buf.asReadOnlyBuffer() or a copy instead of the stored buffer.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EI_EXPOSE_BUF","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ei-expose-buf2"></a>

### `spotbugs/EI_EXPOSE_BUF2`

Ei expose buf2.

- **Allowed form:** Store buf.asReadOnlyBuffer() or a copy of the buffer instead of the caller's buffer.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EI_EXPOSE_BUF2","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ei-expose-rep"></a>

### `spotbugs/EI_EXPOSE_REP`

Ei expose rep.

- **Allowed form:** Return a copy at the return statement: List.copyOf(items), Map.copyOf(m), array.clone(); returning a shared collaborator is the exception case.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EI_EXPOSE_REP","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-ei-expose-rep2"></a>

### `spotbugs/EI_EXPOSE_REP2`

Ei expose rep2.

- **Allowed form:** Store a copy of caller data (List.copyOf(items), array.clone(), Instant instead of Date); a shared injected collaborator is the exception case.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EI_EXPOSE_REP2","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-ei-expose-static-buf2"></a>

### `spotbugs/EI_EXPOSE_STATIC_BUF2`

Ei expose static buf2.

- **Allowed form:** Store a read-only or copied buffer in the static field, not the caller's buffer.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EI_EXPOSE_STATIC_BUF2","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ei-expose-static-rep2"></a>

### `spotbugs/EI_EXPOSE_STATIC_REP2`

Ei expose static rep2.

- **Allowed form:** Store an immutable copy such as List.copyOf(items) in the static field, not the caller's object.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EI_EXPOSE_STATIC_REP2","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-env-use-property-instead-of-env"></a>

### `spotbugs/ENV_USE_PROPERTY_INSTEAD_OF_ENV`

Env use property instead of env.

- **Allowed form:** Read a system property with System.getProperty, or take the setting through a config parameter instead of System.getenv.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ENV_USE_PROPERTY_INSTEAD_OF_ENV","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-eos-bad-end-of-stream-check"></a>

### `spotbugs/EOS_BAD_END_OF_STREAM_CHECK`

Eos bad end of stream check.

- **Allowed form:** Store read() in an int and compare that with -1 before casting to byte or char.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EOS_BAD_END_OF_STREAM_CHECK","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-eq-abstract-self"></a>

### `spotbugs/EQ_ABSTRACT_SELF`

Eq abstract self.

- **Allowed form:** Declare equals(Object) in the abstract class, or implement it there, instead of an abstract equals taking the class type.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EQ_ABSTRACT_SELF","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-eq-always-false"></a>

### `spotbugs/EQ_ALWAYS_FALSE`

Eq always false.

- **Allowed form:** Compare the fields that define equality in equals; do not return false unconditionally.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EQ_ALWAYS_FALSE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-eq-always-true"></a>

### `spotbugs/EQ_ALWAYS_TRUE`

Eq always true.

- **Allowed form:** Compare the fields that define equality in equals; do not return true unconditionally.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EQ_ALWAYS_TRUE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-eq-check-for-operand-not-compatible-with-this"></a>

### `spotbugs/EQ_CHECK_FOR_OPERAND_NOT_COMPATIBLE_WITH_THIS`

Eq check for operand not compatible with this.

- **Allowed form:** Compare only with arguments that are instances of this class: use if (!(o instanceof Foo other)) return false.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EQ_CHECK_FOR_OPERAND_NOT_COMPATIBLE_WITH_THIS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-eq-compareto-use-object-equals"></a>

### `spotbugs/EQ_COMPARETO_USE_OBJECT_EQUALS`

Eq compareto use object equals.

- **Allowed form:** Override equals so it agrees with compareTo, for example return o instanceof Foo f && compareTo(f) == 0.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EQ_COMPARETO_USE_OBJECT_EQUALS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-eq-comparing-class-names"></a>

### `spotbugs/EQ_COMPARING_CLASS_NAMES`

Eq comparing class names.

- **Allowed form:** Compare classes with getClass() != o.getClass(), not by class name strings.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EQ_COMPARING_CLASS_NAMES","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-eq-doesnt-override-equals"></a>

### `spotbugs/EQ_DOESNT_OVERRIDE_EQUALS`

Eq doesnt override equals.

- **Allowed form:** Override equals and hashCode in the subclass to include its added fields, or hold the superclass as a field instead of extending it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EQ_DOESNT_OVERRIDE_EQUALS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-eq-dont-define-equals-for-enum"></a>

### `spotbugs/EQ_DONT_DEFINE_EQUALS_FOR_ENUM`

Eq dont define equals for enum.

- **Allowed form:** Delete the equals override in the enum; enum constants are compared by ==.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EQ_DONT_DEFINE_EQUALS_FOR_ENUM","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-eq-getclass-and-class-constant"></a>

### `spotbugs/EQ_GETCLASS_AND_CLASS_CONSTANT`

Eq getclass and class constant.

- **Allowed form:** Make the class final or compare with getClass() == o.getClass(), so a subclass does not break equals symmetry.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EQ_GETCLASS_AND_CLASS_CONSTANT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-eq-other-no-object"></a>

### `spotbugs/EQ_OTHER_NO_OBJECT`

Eq other no object.

- **Allowed form:** Change the parameter to Object: public boolean equals(Object o), then cast after an instanceof check.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EQ_OTHER_NO_OBJECT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-eq-other-use-object"></a>

### `spotbugs/EQ_OTHER_USE_OBJECT`

Eq other use object.

- **Allowed form:** Replace the differently named equals with public boolean equals(Object o).
- **Exception:** If this is intended, add `{"rule":"spotbugs/EQ_OTHER_USE_OBJECT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-eq-overriding-equals-not-symmetric"></a>

### `spotbugs/EQ_OVERRIDING_EQUALS_NOT_SYMMETRIC`

Eq overriding equals not symmetric.

- **Allowed form:** Make equals symmetric: compare getClass() on both sides, or make equals final in the base class.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EQ_OVERRIDING_EQUALS_NOT_SYMMETRIC","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-eq-self-no-object"></a>

### `spotbugs/EQ_SELF_NO_OBJECT`

Eq self no object.

- **Allowed form:** Override equals(Object) with the exact signature and mark it @Override instead of equals taking the class type.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EQ_SELF_NO_OBJECT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-eq-self-use-object"></a>

### `spotbugs/EQ_SELF_USE_OBJECT`

Eq self use object.

- **Allowed form:** Change equals(Foo) to public boolean equals(Object o) with an instanceof check and @Override.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EQ_SELF_USE_OBJECT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-eq-unusual"></a>

### `spotbugs/EQ_UNUSUAL`

Eq unusual.

- **Allowed form:** Write equals(Object) in the standard form: pattern instanceof check, then compare the fields with Objects.equals, or use a record.
- **Exception:** If this is intended, add `{"rule":"spotbugs/EQ_UNUSUAL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-es-comparing-parameter-string-with-eq"></a>

### `spotbugs/ES_COMPARING_PARAMETER_STRING_WITH_EQ`

Es comparing parameter string with eq.

- **Allowed form:** Compare strings with equals: CONSTANT.equals(param) or Objects.equals(a, b).
- **Exception:** If this is intended, add `{"rule":"spotbugs/ES_COMPARING_PARAMETER_STRING_WITH_EQ","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-es-comparing-strings-with-eq"></a>

### `spotbugs/ES_COMPARING_STRINGS_WITH_EQ`

Es comparing strings with eq.

- **Allowed form:** Compare strings with equals: CONSTANT.equals(s) or Objects.equals(a, b).
- **Exception:** If this is intended, add `{"rule":"spotbugs/ES_COMPARING_STRINGS_WITH_EQ","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-esync-empty-sync"></a>

### `spotbugs/ESync_EMPTY_SYNC`

Esync empty sync.

- **Allowed form:** Remove the empty synchronized block, or move the code it was meant to protect inside it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ESync_EMPTY_SYNC","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-fb-missing-expected-warning"></a>

### `spotbugs/FB_MISSING_EXPECTED_WARNING`

Fb missing expected warning.

- **Allowed form:** Remove the stale @ExpectWarning annotation or restore the code that triggers the expected warning.
- **Exception:** If this is intended, add `{"rule":"spotbugs/FB_MISSING_EXPECTED_WARNING","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-fb-unexpected-warning"></a>

### `spotbugs/FB_UNEXPECTED_WARNING`

Fb unexpected warning.

- **Allowed form:** Fix the code that triggers the warning, or remove the @NoWarning annotation if the warning is accepted.
- **Exception:** If this is intended, add `{"rule":"spotbugs/FB_UNEXPECTED_WARNING","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-fe-floating-point-equality"></a>

### `spotbugs/FE_FLOATING_POINT_EQUALITY`

Fe floating point equality.

- **Allowed form:** Compare doubles with Math.abs(a - b) \< EPSILON, or use BigDecimal.compareTo for exact values.
- **Exception:** If this is intended, add `{"rule":"spotbugs/FE_FLOATING_POINT_EQUALITY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-fe-test-if-equal-to-not-a-number"></a>

### `spotbugs/FE_TEST_IF_EQUAL_TO_NOT_A_NUMBER`

Fe test if equal to not a number.

- **Allowed form:** Test with Double.isNaN(x) (or Float.isNaN); x == Double.NaN is always false.
- **Exception:** If this is intended, add `{"rule":"spotbugs/FE_TEST_IF_EQUAL_TO_NOT_A_NUMBER","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-fi-empty"></a>

### `spotbugs/FI_EMPTY`

Fi empty.

- **Allowed form:** Delete the empty finalize method; use try-with-resources or java.lang.ref.Cleaner for cleanup.
- **Exception:** If this is intended, add `{"rule":"spotbugs/FI_EMPTY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-fi-explicit-invocation"></a>

### `spotbugs/FI_EXPLICIT_INVOCATION`

Fi explicit invocation.

- **Allowed form:** Remove the direct finalize() call and expose an explicit close() method that implements AutoCloseable.
- **Exception:** If this is intended, add `{"rule":"spotbugs/FI_EXPLICIT_INVOCATION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-fi-finalizer-nulls-fields"></a>

### `spotbugs/FI_FINALIZER_NULLS_FIELDS`

Fi finalizer nulls fields.

- **Allowed form:** Delete the finalizer; nulling fields does nothing for the garbage collector.
- **Exception:** If this is intended, add `{"rule":"spotbugs/FI_FINALIZER_NULLS_FIELDS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-fi-finalizer-only-nulls-fields"></a>

### `spotbugs/FI_FINALIZER_ONLY_NULLS_FIELDS`

Fi finalizer only nulls fields.

- **Allowed form:** Delete the finalizer; nulling fields does nothing for the garbage collector.
- **Exception:** If this is intended, add `{"rule":"spotbugs/FI_FINALIZER_ONLY_NULLS_FIELDS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-fi-missing-super-call"></a>

### `spotbugs/FI_MISSING_SUPER_CALL`

Fi missing super call.

- **Allowed form:** Delete finalize and use AutoCloseable or Cleaner; if it stays, end it with super.finalize() in a finally block.
- **Exception:** If this is intended, add `{"rule":"spotbugs/FI_MISSING_SUPER_CALL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-fi-nullify-super"></a>

### `spotbugs/FI_NULLIFY_SUPER`

Fi nullify super.

- **Allowed form:** Delete the finalizer that suppresses the superclass finalizer; cleanup belongs in AutoCloseable or Cleaner.
- **Exception:** If this is intended, add `{"rule":"spotbugs/FI_NULLIFY_SUPER","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-fi-public-should-be-protected"></a>

### `spotbugs/FI_PUBLIC_SHOULD_BE_PROTECTED`

Fi public should be protected.

- **Allowed form:** Delete finalize and use AutoCloseable or Cleaner; do not widen it to public.
- **Exception:** If this is intended, add `{"rule":"spotbugs/FI_PUBLIC_SHOULD_BE_PROTECTED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-fi-useless"></a>

### `spotbugs/FI_USELESS`

Fi useless.

- **Exception:** If this is intended, add `{"rule":"spotbugs/FI_USELESS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-fl-floats-as-loop-counters"></a>

### `spotbugs/FL_FLOATS_AS_LOOP_COUNTERS`

Fl floats as loop counters.

- **Allowed form:** Loop on an int counter and compute the float value from it: for (int i = 0; i \< n; i++) { double x = i \* step; }.
- **Exception:** If this is intended, add `{"rule":"spotbugs/FL_FLOATS_AS_LOOP_COUNTERS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-fl-math-using-float-precision"></a>

### `spotbugs/FL_MATH_USING_FLOAT_PRECISION`

Fl math using float precision.

- **Allowed form:** Use double for the arithmetic, or BigDecimal when exact decimals matter.
- **Exception:** If this is intended, add `{"rule":"spotbugs/FL_MATH_USING_FLOAT_PRECISION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-fs-bad-date-format-flag-combo"></a>

### `spotbugs/FS_BAD_DATE_FORMAT_FLAG_COMBO`

Fs bad date format flag combo.

- **Allowed form:** Fix the pattern letters: pair h or K with a, use H without a, and yyyy (not YYYY) with MM and dd; build it with DateTimeFormatter.ofPattern.
- **Exception:** If this is intended, add `{"rule":"spotbugs/FS_BAD_DATE_FORMAT_FLAG_COMBO","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-gc-unchecked-type-in-generic-call"></a>

### `spotbugs/GC_UNCHECKED_TYPE_IN_GENERIC_CALL`

Gc unchecked type in generic call.

- **Allowed form:** Pass an argument of the collection's element type to contains, remove or get, or fix the declared generic type.
- **Exception:** If this is intended, add `{"rule":"spotbugs/GC_UNCHECKED_TYPE_IN_GENERIC_CALL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-gc-unrelated-types"></a>

### `spotbugs/GC_UNRELATED_TYPES`

Gc unrelated types.

- **Allowed form:** Pass an argument of the collection's element or key type to contains, remove or get; unrelated types never match.
- **Exception:** If this is intended, add `{"rule":"spotbugs/GC_UNRELATED_TYPES","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-he-equals-no-hashcode"></a>

### `spotbugs/HE_EQUALS_NO_HASHCODE`

He equals no hashcode.

- **Allowed form:** Add hashCode that uses the same fields as equals: return Objects.hash(a, b), or make the class a record.
- **Exception:** If this is intended, add `{"rule":"spotbugs/HE_EQUALS_NO_HASHCODE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-he-equals-use-hashcode"></a>

### `spotbugs/HE_EQUALS_USE_HASHCODE`

He equals use hashcode.

- **Allowed form:** Add hashCode that uses the same fields as equals: return Objects.hash(a, b), or make the class a record.
- **Exception:** If this is intended, add `{"rule":"spotbugs/HE_EQUALS_USE_HASHCODE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-he-hashcode-no-equals"></a>

### `spotbugs/HE_HASHCODE_NO_EQUALS`

He hashcode no equals.

- **Allowed form:** Add an equals method over the same fields that hashCode uses, or make the class a record.
- **Exception:** If this is intended, add `{"rule":"spotbugs/HE_HASHCODE_NO_EQUALS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-he-hashcode-use-object-equals"></a>

### `spotbugs/HE_HASHCODE_USE_OBJECT_EQUALS`

He hashcode use object equals.

- **Allowed form:** Add an equals method over the same fields that hashCode uses, or make the class a record.
- **Exception:** If this is intended, add `{"rule":"spotbugs/HE_HASHCODE_USE_OBJECT_EQUALS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-he-inherits-equals-use-hashcode"></a>

### `spotbugs/HE_INHERITS_EQUALS_USE_HASHCODE`

He inherits equals use hashcode.

- **Allowed form:** Override hashCode together with equals using the same fields, or make the class a record.
- **Exception:** If this is intended, add `{"rule":"spotbugs/HE_INHERITS_EQUALS_USE_HASHCODE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-he-signature-declares-hashing-of-unhashable-class"></a>

### `spotbugs/HE_SIGNATURE_DECLARES_HASHING_OF_UNHASHABLE_CLASS`

He signature declares hashing of unhashable class.

- **Allowed form:** Define hashCode in the key class, or change the signature to a type that defines it, before using it in a HashMap or HashSet.
- **Exception:** If this is intended, add `{"rule":"spotbugs/HE_SIGNATURE_DECLARES_HASHING_OF_UNHASHABLE_CLASS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-he-use-of-unhashable-class"></a>

### `spotbugs/HE_USE_OF_UNHASHABLE_CLASS`

He use of unhashable class.

- **Allowed form:** Define hashCode (and equals) in the class, or use IdentityHashMap if identity keys are wanted.
- **Exception:** If this is intended, add `{"rule":"spotbugs/HE_USE_OF_UNHASHABLE_CLASS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-hrs-request-parameter-to-cookie"></a>

### `spotbugs/HRS_REQUEST_PARAMETER_TO_COOKIE`

Hrs request parameter to cookie.

- **Allowed form:** Validate the request value against an allowlist or strict pattern before putting it in a Cookie.
- **Exception:** If this is intended, add `{"rule":"spotbugs/HRS_REQUEST_PARAMETER_TO_COOKIE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-hrs-request-parameter-to-http-header"></a>

### `spotbugs/HRS_REQUEST_PARAMETER_TO_HTTP_HEADER`

Hrs request parameter to http header.

- **Allowed form:** Validate the request value against an allowlist or strict pattern, rejecting CR and LF, before setting a header.
- **Exception:** If this is intended, add `{"rule":"spotbugs/HRS_REQUEST_PARAMETER_TO_HTTP_HEADER","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-hsc-huge-shared-string-constant"></a>

### `spotbugs/HSC_HUGE_SHARED_STRING_CONSTANT`

Hsc huge shared string constant.

- **Allowed form:** Load the large text from a resource file at startup instead of embedding it as a string constant in the class.
- **Exception:** If this is intended, add `{"rule":"spotbugs/HSC_HUGE_SHARED_STRING_CONSTANT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-hsm-hiding-method"></a>

### `spotbugs/HSM_HIDING_METHOD`

Hsm hiding method.

- **Allowed form:** Rename the static method, or make it an instance method, so it no longer hides the superclass method.
- **Exception:** If this is intended, add `{"rule":"spotbugs/HSM_HIDING_METHOD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ia-ambiguous-invocation-of-inherited-or-outer-method"></a>

### `spotbugs/IA_AMBIGUOUS_INVOCATION_OF_INHERITED_OR_OUTER_METHOD`

Ia ambiguous invocation of inherited or outer method.

- **Allowed form:** Call super.run() for the inherited method or Outer.this.run() for the outer one; this.run() compiles to the same call and keeps the finding.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IA_AMBIGUOUS_INVOCATION_OF_INHERITED_OR_OUTER_METHOD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ic-init-circularity"></a>

### `spotbugs/IC_INIT_CIRCULARITY`

Ic init circularity.

- **Allowed form:** Move the shared constants or setup into a third class so the two classes no longer initialize each other.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IC_INIT_CIRCULARITY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ic-superclass-uses-subclass-during-initialization"></a>

### `spotbugs/IC_SUPERCLASS_USES_SUBCLASS_DURING_INITIALIZATION`

Ic superclass uses subclass during initialization.

- **Allowed form:** Move the subclass reference out of the superclass static initializer into a lazy holder class or a method.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IC_SUPERCLASS_USES_SUBCLASS_DURING_INITIALIZATION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-icast-bad-shift-amount"></a>

### `spotbugs/ICAST_BAD_SHIFT_AMOUNT`

Icast bad shift amount.

- **Allowed form:** Shift by an amount from 0 to 31 for int, or make the value a long, e.g. 1L \<\< n.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ICAST_BAD_SHIFT_AMOUNT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-icast-idiv-cast-to-double"></a>

### `spotbugs/ICAST_IDIV_CAST_TO_DOUBLE`

Icast idiv cast to double.

- **Allowed form:** Convert an operand before dividing, as in (double) a / b, so the division is not done in integers.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ICAST_IDIV_CAST_TO_DOUBLE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-icast-int-2-long-as-instant"></a>

### `spotbugs/ICAST_INT_2_LONG_AS_INSTANT`

Icast int 2 long as instant.

- **Allowed form:** Convert to long before multiplying, e.g. Instant.ofEpochMilli(seconds \* 1000L), or use Instant.ofEpochSecond.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ICAST_INT_2_LONG_AS_INSTANT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-icast-int-cast-to-double-passed-to-ceil"></a>

### `spotbugs/ICAST_INT_CAST_TO_DOUBLE_PASSED_TO_CEIL`

Icast int cast to double passed to ceil.

- **Allowed form:** Divide as doubles, Math.ceil((double) a / b), or use Math.ceilDiv(a, b).
- **Exception:** If this is intended, add `{"rule":"spotbugs/ICAST_INT_CAST_TO_DOUBLE_PASSED_TO_CEIL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-icast-int-cast-to-float-passed-to-round"></a>

### `spotbugs/ICAST_INT_CAST_TO_FLOAT_PASSED_TO_ROUND`

Icast int cast to float passed to round.

- **Allowed form:** Divide as floats or doubles before Math.round, e.g. Math.round((double) a / b); integer division already truncated.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ICAST_INT_CAST_TO_FLOAT_PASSED_TO_ROUND","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-icast-integer-multiply-cast-to-long"></a>

### `spotbugs/ICAST_INTEGER_MULTIPLY_CAST_TO_LONG`

Icast integer multiply cast to long.

- **Allowed form:** Widen an operand before multiplying, as in (long) a \* b, or use Math.multiplyExact.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ICAST_INTEGER_MULTIPLY_CAST_TO_LONG","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-icast-questionable-unsigned-right-shift"></a>

### `spotbugs/ICAST_QUESTIONABLE_UNSIGNED_RIGHT_SHIFT`

Icast questionable unsigned right shift.

- **Allowed form:** Use >> when the cast keeps only bits the sign cannot reach, or keep an int with (x >>> n) & 0xFF instead of casting to byte or short.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ICAST_QUESTIONABLE_UNSIGNED_RIGHT_SHIFT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-iil-elements-get-length-in-loop"></a>

### `spotbugs/IIL_ELEMENTS_GET_LENGTH_IN_LOOP`

Iil elements get length in loop.

- **Allowed form:** Read nodes.getLength() once into a local int before the loop and use that local in the loop condition.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IIL_ELEMENTS_GET_LENGTH_IN_LOOP","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-iil-pattern-compile-in-loop"></a>

### `spotbugs/IIL_PATTERN_COMPILE_IN_LOOP`

Iil pattern compile in loop.

- **Allowed form:** Compile the regex once into a private static final Pattern field and reuse it inside the loop.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IIL_PATTERN_COMPILE_IN_LOOP","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-iil-pattern-compile-in-loop-indirect"></a>

### `spotbugs/IIL_PATTERN_COMPILE_IN_LOOP_INDIRECT`

Iil pattern compile in loop indirect.

- **Allowed form:** Compile the regex once into a private static final Pattern field, and use that field in the method the loop calls.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IIL_PATTERN_COMPILE_IN_LOOP_INDIRECT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-iil-prepare-statement-in-loop"></a>

### `spotbugs/IIL_PREPARE_STATEMENT_IN_LOOP`

Iil prepare statement in loop.

- **Allowed form:** Prepare the statement once before the loop in try-with-resources, then set parameters and call addBatch inside the loop.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IIL_PREPARE_STATEMENT_IN_LOOP","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-iio-inefficient-index-of"></a>

### `spotbugs/IIO_INEFFICIENT_INDEX_OF`

Iio inefficient index of.

- **Allowed form:** Pass a char to indexOf (s.indexOf('x')) instead of a one-character String.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IIO_INEFFICIENT_INDEX_OF","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-iio-inefficient-last-index-of"></a>

### `spotbugs/IIO_INEFFICIENT_LAST_INDEX_OF`

Iio inefficient last index of.

- **Allowed form:** Pass a char to lastIndexOf (s.lastIndexOf('x')) instead of a one-character String.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IIO_INEFFICIENT_LAST_INDEX_OF","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-iju-assert-method-invoked-from-run-method"></a>

### `spotbugs/IJU_ASSERT_METHOD_INVOKED_FROM_RUN_METHOD`

Iju assert method invoked from run method.

- **Allowed form:** Do not assert inside a run method; capture the result or exception and assert it on the test thread after join.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IJU_ASSERT_METHOD_INVOKED_FROM_RUN_METHOD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-iju-bad-suite-method"></a>

### `spotbugs/IJU_BAD_SUITE_METHOD`

Iju bad suite method.

- **Allowed form:** Replace the JUnit 3 suite method with JUnit 5 @Test methods; use @Suite or @Nested for grouping.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IJU_BAD_SUITE_METHOD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-iju-no-tests"></a>

### `spotbugs/IJU_NO_TESTS`

Iju no tests.

- **Allowed form:** Stop extending TestCase: write JUnit 5 @Test methods in a plain class, or delete the class.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IJU_NO_TESTS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-iju-setup-no-super"></a>

### `spotbugs/IJU_SETUP_NO_SUPER`

Iju setup no super.

- **Allowed form:** Move to JUnit 5 and use @BeforeEach with no inheritance; if staying on TestCase, call super.setUp().
- **Exception:** If this is intended, add `{"rule":"spotbugs/IJU_SETUP_NO_SUPER","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-iju-suite-not-static"></a>

### `spotbugs/IJU_SUITE_NOT_STATIC`

Iju suite not static.

- **Allowed form:** Replace the JUnit 3 suite method with JUnit 5 @Test methods; if staying on TestCase, make suite() public static.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IJU_SUITE_NOT_STATIC","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-iju-teardown-no-super"></a>

### `spotbugs/IJU_TEARDOWN_NO_SUPER`

Iju teardown no super.

- **Allowed form:** Move to JUnit 5 and use @AfterEach with no inheritance; if staying on TestCase, call super.tearDown().
- **Exception:** If this is intended, add `{"rule":"spotbugs/IJU_TEARDOWN_NO_SUPER","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-il-container-added-to-itself"></a>

### `spotbugs/IL_CONTAINER_ADDED_TO_ITSELF`

Il container added to itself.

- **Allowed form:** Add a different collection or element; a collection added to itself breaks hashCode and toString.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IL_CONTAINER_ADDED_TO_ITSELF","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-il-infinite-loop"></a>

### `spotbugs/IL_INFINITE_LOOP`

Il infinite loop.

- **Allowed form:** Make the loop condition depend on a variable the body changes, or add a break or return that ends it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IL_INFINITE_LOOP","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-il-infinite-recursive-loop"></a>

### `spotbugs/IL_INFINITE_RECURSIVE_LOOP`

Il infinite recursive loop.

- **Allowed form:** Give the method a base case, or call a different method; it currently calls itself with no way to stop.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IL_INFINITE_RECURSIVE_LOOP","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-im-average-computation-could-overflow"></a>

### `spotbugs/IM_AVERAGE_COMPUTATION_COULD_OVERFLOW`

Im average computation could overflow.

- **Allowed form:** Compute the midpoint as (low + high) >>> 1, or low + (high - low) / 2.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IM_AVERAGE_COMPUTATION_COULD_OVERFLOW","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-im-bad-check-for-odd"></a>

### `spotbugs/IM_BAD_CHECK_FOR_ODD`

Im bad check for odd.

- **Allowed form:** Test oddness with x % 2 != 0, because x % 2 == 1 is false for negative odd numbers.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IM_BAD_CHECK_FOR_ODD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-im-multiplying-result-of-irem"></a>

### `spotbugs/IM_MULTIPLYING_RESULT_OF_IREM`

Im multiplying result of irem.

- **Allowed form:** Add parentheses to show the intent: (i % 60) \* 1000 or i % (60 \* 1000).
- **Exception:** If this is intended, add `{"rule":"spotbugs/IM_MULTIPLYING_RESULT_OF_IREM","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ima-inefficient-member-access"></a>

### `spotbugs/IMA_INEFFICIENT_MEMBER_ACCESS`

Ima inefficient member access.

- **Allowed form:** Keep the member private; since Java 11 nested classes reach private members directly, without the accessor this rule measures.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IMA_INEFFICIENT_MEMBER_ACCESS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-imse-dont-catch-imse"></a>

### `spotbugs/IMSE_DONT_CATCH_IMSE`

Imse dont catch imse.

- **Allowed form:** Fix the code so no IllegalMonitorStateException occurs: call wait, notify and unlock only while holding the monitor or lock.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IMSE_DONT_CATCH_IMSE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-int-bad-comparison-with-int-value"></a>

### `spotbugs/INT_BAD_COMPARISON_WITH_INT_VALUE`

Int bad comparison with int value.

- **Allowed form:** Fix the constant to a value in int range, or declare the variable long if it must hold values that large.
- **Exception:** If this is intended, add `{"rule":"spotbugs/INT_BAD_COMPARISON_WITH_INT_VALUE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-int-bad-comparison-with-nonnegative-value"></a>

### `spotbugs/INT_BAD_COMPARISON_WITH_NONNEGATIVE_VALUE`

Int bad comparison with nonnegative value.

- **Allowed form:** Remove the comparison; a value that cannot be negative never satisfies it, or fix which value is tested.
- **Exception:** If this is intended, add `{"rule":"spotbugs/INT_BAD_COMPARISON_WITH_NONNEGATIVE_VALUE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-int-bad-comparison-with-signed-byte"></a>

### `spotbugs/INT_BAD_COMPARISON_WITH_SIGNED_BYTE`

Int bad comparison with signed byte.

- **Allowed form:** Mask the byte first: (b & 0xFF) == 0x80, since a signed byte is never above 127.
- **Exception:** If this is intended, add `{"rule":"spotbugs/INT_BAD_COMPARISON_WITH_SIGNED_BYTE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-int-bad-rem-by-1"></a>

### `spotbugs/INT_BAD_REM_BY_1`

Int bad rem by 1.

- **Allowed form:** Remove the % 1 operation, which is always 0, or use the divisor that was intended.
- **Exception:** If this is intended, add `{"rule":"spotbugs/INT_BAD_REM_BY_1","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-int-vacuous-bit-operation"></a>

### `spotbugs/INT_VACUOUS_BIT_OPERATION`

Int vacuous bit operation.

- **Allowed form:** Remove the bit operation that never changes the value, or correct the mask or operand.
- **Exception:** If this is intended, add `{"rule":"spotbugs/INT_VACUOUS_BIT_OPERATION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-int-vacuous-comparison"></a>

### `spotbugs/INT_VACUOUS_COMPARISON`

Int vacuous comparison.

- **Allowed form:** Remove the comparison that the value's range makes always true or false, or compare the right operand.
- **Exception:** If this is intended, add `{"rule":"spotbugs/INT_VACUOUS_COMPARISON","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-io-appending-to-object-output-stream"></a>

### `spotbugs/IO_APPENDING_TO_OBJECT_OUTPUT_STREAM`

Io appending to object output stream.

- **Allowed form:** Write a new file for each ObjectOutputStream, or keep one stream open for all writes; appending corrupts the stream header.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IO_APPENDING_TO_OBJECT_OUTPUT_STREAM","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ip-parameter-is-dead-but-overwritten"></a>

### `spotbugs/IP_PARAMETER_IS_DEAD_BUT_OVERWRITTEN`

Ip parameter is dead but overwritten.

- **Allowed form:** Use the parameter's value before assigning it, or remove the parameter and use a local.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IP_PARAMETER_IS_DEAD_BUT_OVERWRITTEN","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-is-field-not-guarded"></a>

### `spotbugs/IS_FIELD_NOT_GUARDED`

Is field not guarded.

- **Allowed form:** Hold the lock named in the @GuardedBy annotation around every access to the field.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IS_FIELD_NOT_GUARDED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-is-inconsistent-sync"></a>

### `spotbugs/IS_INCONSISTENT_SYNC`

Is inconsistent sync.

- **Allowed form:** Guard every read and write of the field with the same lock, or make it final, volatile or an atomic type.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IS_INCONSISTENT_SYNC","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-is2-inconsistent-sync"></a>

### `spotbugs/IS2_INCONSISTENT_SYNC`

Is2 inconsistent sync.

- **Allowed form:** Guard every read and write of the field with the same lock, or make it final, volatile or an atomic type.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IS2_INCONSISTENT_SYNC","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-isc-instantiate-static-class"></a>

### `spotbugs/ISC_INSTANTIATE_STATIC_CLASS`

Isc instantiate static class.

- **Allowed form:** Call the static methods on the class name, for example Util.parse(x), instead of creating an instance.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ISC_INSTANTIATE_STATIC_CLASS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-it-no-such-element"></a>

### `spotbugs/IT_NO_SUCH_ELEMENT`

It no such element.

- **Allowed form:** Throw NoSuchElementException from next() when hasNext() would be false.
- **Exception:** If this is intended, add `{"rule":"spotbugs/IT_NO_SUCH_ELEMENT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ita-inefficient-to-array"></a>

### `spotbugs/ITA_INEFFICIENT_TO_ARRAY`

Ita inefficient to array.

- **Allowed form:** Pass the array constructor, list.toArray(String[]::new); toArray(new String[0]) is the form this rule flags.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ITA_INEFFICIENT_TO_ARRAY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-j2ee-store-of-non-serializable-object-into-session"></a>

### `spotbugs/J2EE_STORE_OF_NON_SERIALIZABLE_OBJECT_INTO_SESSION`

J2ee store of non serializable object into session.

- **Allowed form:** Store only Serializable values, such as records of strings and numbers, in the HttpSession.
- **Exception:** If this is intended, add `{"rule":"spotbugs/J2EE_STORE_OF_NON_SERIALIZABLE_OBJECT_INTO_SESSION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-jcip-field-isnt-final-in-immutable-class"></a>

### `spotbugs/JCIP_FIELD_ISNT_FINAL_IN_IMMUTABLE_CLASS`

Jcip field isnt final in immutable class.

- **Allowed form:** Declare every field of the @Immutable class final, or make the class a record.
- **Exception:** If this is intended, add `{"rule":"spotbugs/JCIP_FIELD_ISNT_FINAL_IN_IMMUTABLE_CLASS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-jlm-jsr166-lock-monitorenter"></a>

### `spotbugs/JLM_JSR166_LOCK_MONITORENTER`

Jlm jsr166 lock monitorenter.

- **Allowed form:** Call lock.lock() and unlock() in try/finally instead of using synchronized on a Lock object.
- **Exception:** If this is intended, add `{"rule":"spotbugs/JLM_JSR166_LOCK_MONITORENTER","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-jlm-jsr166-utilconcurrent-monitorenter"></a>

### `spotbugs/JLM_JSR166_UTILCONCURRENT_MONITORENTER`

Jlm jsr166 utilconcurrent monitorenter.

- **Allowed form:** Use the concurrent class's own atomic methods, or a separate private lock Object, instead of synchronized on it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/JLM_JSR166_UTILCONCURRENT_MONITORENTER","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-jml-jsr166-calling-wait-rather-than-await"></a>

### `spotbugs/JML_JSR166_CALLING_WAIT_RATHER_THAN_AWAIT`

Jml jsr166 calling wait rather than await.

- **Allowed form:** Call await(), signal() and signalAll() on the Condition instead of wait(), notify() and notifyAll().
- **Exception:** If this is intended, add `{"rule":"spotbugs/JML_JSR166_CALLING_WAIT_RATHER_THAN_AWAIT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-jua-dont-assert-instanceof-in-tests"></a>

### `spotbugs/JUA_DONT_ASSERT_INSTANCEOF_IN_TESTS`

Jua dont assert instanceof in tests.

- **Allowed form:** Write assertInstanceOf(Foo.class, value), which fails with the actual type and returns the cast value, instead of assertTrue(value instanceof Foo).
- **Exception:** If this is intended, add `{"rule":"spotbugs/JUA_DONT_ASSERT_INSTANCEOF_IN_TESTS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-lg-lost-logger-due-to-weak-reference"></a>

### `spotbugs/LG_LOST_LOGGER_DUE_TO_WEAK_REFERENCE`

Lg lost logger due to weak reference.

- **Allowed form:** Hold the Logger in a private static final field, so it is not garbage collected with its configuration.
- **Exception:** If this is intended, add `{"rule":"spotbugs/LG_LOST_LOGGER_DUE_TO_WEAK_REFERENCE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-li-lazy-init-static"></a>

### `spotbugs/LI_LAZY_INIT_STATIC`

Li lazy init static.

- **Allowed form:** Initialize the static field eagerly as static final, or use a holder class, instead of unsynchronized lazy init.
- **Exception:** If this is intended, add `{"rule":"spotbugs/LI_LAZY_INIT_STATIC","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-li-lazy-init-update-static"></a>

### `spotbugs/LI_LAZY_INIT_UPDATE_STATIC`

Li lazy init update static.

- **Allowed form:** Build the object completely in a local, then assign the static field once; or initialize it eagerly as static final.
- **Exception:** If this is intended, add `{"rule":"spotbugs/LI_LAZY_INIT_UPDATE_STATIC","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-mc-overridable-method-call-in-clone"></a>

### `spotbugs/MC_OVERRIDABLE_METHOD_CALL_IN_CLONE`

Mc overridable method call in clone.

- **Allowed form:** Call only private, static or final methods from clone, or replace clone with a copy constructor.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MC_OVERRIDABLE_METHOD_CALL_IN_CLONE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-mc-overridable-method-call-in-constructor"></a>

### `spotbugs/MC_OVERRIDABLE_METHOD_CALL_IN_CONSTRUCTOR`

Mc overridable method call in constructor.

- **Allowed form:** Call only private, static or final methods from the constructor, or make the class final.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MC_OVERRIDABLE_METHOD_CALL_IN_CONSTRUCTOR","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-mc-overridable-method-call-in-read-object"></a>

### `spotbugs/MC_OVERRIDABLE_METHOD_CALL_IN_READ_OBJECT`

Mc overridable method call in read object.

- **Allowed form:** Call only private, static or final methods from readObject, or make the class final.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MC_OVERRIDABLE_METHOD_CALL_IN_READ_OBJECT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-me-enum-field-setter"></a>

### `spotbugs/ME_ENUM_FIELD_SETTER`

Me enum field setter.

- **Allowed form:** Remove the public setter and give the enum final fields set in its constructor.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ME_ENUM_FIELD_SETTER","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-me-mutable-enum-field"></a>

### `spotbugs/ME_MUTABLE_ENUM_FIELD`

Me mutable enum field.

- **Allowed form:** Declare the enum field final and use an immutable type such as List.of(...) instead of a mutable one.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ME_MUTABLE_ENUM_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-mf-class-masks-field"></a>

### `spotbugs/MF_CLASS_MASKS_FIELD`

Mf class masks field.

- **Allowed form:** Rename the subclass field, or remove it and use the inherited one; the duplicate name hides the superclass field.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MF_CLASS_MASKS_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-mf-method-masks-field"></a>

### `spotbugs/MF_METHOD_MASKS_FIELD`

Mf method masks field.

- **Allowed form:** Rename the local variable so it does not shadow the field, or assign this.field when the field is meant.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MF_METHOD_MASKS_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ml-sync-on-field-to-guard-changing-that-field"></a>

### `spotbugs/ML_SYNC_ON_FIELD_TO_GUARD_CHANGING_THAT_FIELD`

Ml sync on field to guard changing that field.

- **Allowed form:** Synchronize on a separate private final Object lock, not on the field being reassigned.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ML_SYNC_ON_FIELD_TO_GUARD_CHANGING_THAT_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ml-sync-on-updated-field"></a>

### `spotbugs/ML_SYNC_ON_UPDATED_FIELD`

Ml sync on updated field.

- **Allowed form:** Synchronize on a separate private final Object lock, not on a field whose value is changed.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ML_SYNC_ON_UPDATED_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ms-cannot-be-final"></a>

### `spotbugs/MS_CANNOT_BE_FINAL`

Ms cannot be final.

- **Allowed form:** Make the static field private and change it only through methods of its own class, or move the state into an instance field.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MS_CANNOT_BE_FINAL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ms-expose-buf"></a>

### `spotbugs/MS_EXPOSE_BUF`

Ms expose buf.

- **Allowed form:** Expose a read-only view with buf.asReadOnlyBuffer() instead of the shared static buffer.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MS_EXPOSE_BUF","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ms-expose-rep"></a>

### `spotbugs/MS_EXPOSE_REP`

Ms expose rep.

- **Allowed form:** Return a copy from the static accessor, such as array.clone() or List.copyOf(items); a deliberately shared singleton instance is the exception case.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MS_EXPOSE_REP","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-ms-final-pkgprotect"></a>

### `spotbugs/MS_FINAL_PKGPROTECT`

Ms final pkgprotect.

- **Allowed form:** Make the field private and final, or hold an immutable value (List.of, a record) so protection is unnecessary.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MS_FINAL_PKGPROTECT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ms-mutable-array"></a>

### `spotbugs/MS_MUTABLE_ARRAY`

Ms mutable array.

- **Allowed form:** Make the array private and return a clone from a method, or expose an immutable List.of(...) instead.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MS_MUTABLE_ARRAY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ms-mutable-collection"></a>

### `spotbugs/MS_MUTABLE_COLLECTION`

Ms mutable collection.

- **Allowed form:** Declare the field as List.of(...), Set.of(...) or Map.of(...) so the collection is immutable.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MS_MUTABLE_COLLECTION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ms-mutable-collection-pkgprotect"></a>

### `spotbugs/MS_MUTABLE_COLLECTION_PKGPROTECT`

Ms mutable collection pkgprotect.

- **Allowed form:** Declare the field as List.of(...), Set.of(...) or Map.of(...) so the collection is immutable.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MS_MUTABLE_COLLECTION_PKGPROTECT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ms-mutable-hashtable"></a>

### `spotbugs/MS_MUTABLE_HASHTABLE`

Ms mutable hashtable.

- **Allowed form:** Declare the field as Map.of(...) or Map.copyOf(m) so the table is immutable.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MS_MUTABLE_HASHTABLE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ms-ooi-pkgprotect"></a>

### `spotbugs/MS_OOI_PKGPROTECT`

Ms ooi pkgprotect.

- **Allowed form:** Replace the interface's array or mutable collection constant with List.of(...) or Map.of(...), or move it into a class as a private field.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MS_OOI_PKGPROTECT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ms-pkgprotect"></a>

### `spotbugs/MS_PKGPROTECT`

Ms pkgprotect.

- **Allowed form:** Make the static field private and add an accessor that returns a copy, or hold an immutable value such as List.of(...).
- **Exception:** If this is intended, add `{"rule":"spotbugs/MS_PKGPROTECT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ms-should-be-final"></a>

### `spotbugs/MS_SHOULD_BE_FINAL`

Ms should be final.

- **Allowed form:** Add final to the static field and assign it once at declaration.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MS_SHOULD_BE_FINAL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ms-should-be-refactored-to-be-final"></a>

### `spotbugs/MS_SHOULD_BE_REFACTORED_TO_BE_FINAL`

Ms should be refactored to be final.

- **Allowed form:** Assign the static field once in a static initializer and declare it final.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MS_SHOULD_BE_REFACTORED_TO_BE_FINAL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-msf-mutable-servlet-field"></a>

### `spotbugs/MSF_MUTABLE_SERVLET_FIELD`

Msf mutable servlet field.

- **Allowed form:** Keep request state in local variables, or make the servlet field final and immutable; servlet instances are shared by threads.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MSF_MUTABLE_SERVLET_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-mtia-suspect-servlet-instance-field"></a>

### `spotbugs/MTIA_SUSPECT_SERVLET_INSTANCE_FIELD`

Mtia suspect servlet instance field.

- **Allowed form:** Move the instance field into doGet or doPost as a local variable; servlet instances are shared by all request threads.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MTIA_SUSPECT_SERVLET_INSTANCE_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-mtia-suspect-struts-instance-field"></a>

### `spotbugs/MTIA_SUSPECT_STRUTS_INSTANCE_FIELD`

Mtia suspect struts instance field.

- **Allowed form:** Remove the instance field from the Action and keep that state in locals or the form bean; Actions are shared across requests.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MTIA_SUSPECT_STRUTS_INSTANCE_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-mwn-mismatched-notify"></a>

### `spotbugs/MWN_MISMATCHED_NOTIFY`

Mwn mismatched notify.

- **Allowed form:** Call notify or notifyAll on the same object whose synchronized block you are in.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MWN_MISMATCHED_NOTIFY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-mwn-mismatched-wait"></a>

### `spotbugs/MWN_MISMATCHED_WAIT`

Mwn mismatched wait.

- **Allowed form:** Call wait on the same object whose synchronized block you are in, inside a while loop.
- **Exception:** If this is intended, add `{"rule":"spotbugs/MWN_MISMATCHED_WAIT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-nm-bad-equal"></a>

### `spotbugs/NM_BAD_EQUAL`

Nm bad equal.

- **Allowed form:** Rename equal(Object) to equals(Object) and add @Override.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NM_BAD_EQUAL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-nm-class-naming-convention"></a>

### `spotbugs/NM_CLASS_NAMING_CONVENTION`

Nm class naming convention.

- **Allowed form:** Name the class in UpperCamelCase, such as OrderService.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NM_CLASS_NAMING_CONVENTION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-nm-class-not-exception"></a>

### `spotbugs/NM_CLASS_NOT_EXCEPTION`

Nm class not exception.

- **Allowed form:** Rename the class so it does not end in Exception, or make it extend Exception or RuntimeException.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NM_CLASS_NOT_EXCEPTION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-nm-confusing"></a>

### `spotbugs/NM_CONFUSING`

Nm confusing.

- **Allowed form:** Rename one of the two methods so they differ by more than letter case.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NM_CONFUSING","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-nm-field-naming-convention"></a>

### `spotbugs/NM_FIELD_NAMING_CONVENTION`

Nm field naming convention.

- **Allowed form:** Name fields in lowerCamelCase, and static final constants in UPPER_SNAKE_CASE.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NM_FIELD_NAMING_CONVENTION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-nm-future-keyword-used-as-identifier"></a>

### `spotbugs/NM_FUTURE_KEYWORD_USED_AS_IDENTIFIER`

Nm future keyword used as identifier.

- **Allowed form:** Rename the identifier, since it is a reserved word in newer Java versions (assert, enum, var, record, yield).
- **Exception:** If this is intended, add `{"rule":"spotbugs/NM_FUTURE_KEYWORD_USED_AS_IDENTIFIER","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-nm-future-keyword-used-as-member-identifier"></a>

### `spotbugs/NM_FUTURE_KEYWORD_USED_AS_MEMBER_IDENTIFIER`

Nm future keyword used as member identifier.

- **Allowed form:** Rename the member, since its name is a reserved word in newer Java versions (assert, enum, var, record, yield).
- **Exception:** If this is intended, add `{"rule":"spotbugs/NM_FUTURE_KEYWORD_USED_AS_MEMBER_IDENTIFIER","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-nm-lcase-hashcode"></a>

### `spotbugs/NM_LCASE_HASHCODE`

Nm lcase hashcode.

- **Allowed form:** Rename hashcode() to hashCode() and add @Override.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NM_LCASE_HASHCODE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-nm-lcase-tostring"></a>

### `spotbugs/NM_LCASE_TOSTRING`

Nm lcase tostring.

- **Allowed form:** Rename tostring() to toString() and add @Override.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NM_LCASE_TOSTRING","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-nm-method-constructor-confusion"></a>

### `spotbugs/NM_METHOD_CONSTRUCTOR_CONFUSION`

Nm method constructor confusion.

- **Allowed form:** Rename the method, or drop the return type if it is meant to be a constructor.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NM_METHOD_CONSTRUCTOR_CONFUSION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-nm-method-naming-convention"></a>

### `spotbugs/NM_METHOD_NAMING_CONVENTION`

Nm method naming convention.

- **Allowed form:** Name methods in lowerCamelCase, starting with a verb, such as parseOrder.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NM_METHOD_NAMING_CONVENTION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-nm-same-simple-name-as-interface"></a>

### `spotbugs/NM_SAME_SIMPLE_NAME_AS_INTERFACE`

Nm same simple name as interface.

- **Allowed form:** Give the class a name different from the interface it extends or implements in another package, such as DefaultOrderStore.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NM_SAME_SIMPLE_NAME_AS_INTERFACE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-nm-same-simple-name-as-superclass"></a>

### `spotbugs/NM_SAME_SIMPLE_NAME_AS_SUPERCLASS`

Nm same simple name as superclass.

- **Allowed form:** Give the class a name different from its superclass in another package, such as ExtendedOrder.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NM_SAME_SIMPLE_NAME_AS_SUPERCLASS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-nm-very-confusing"></a>

### `spotbugs/NM_VERY_CONFUSING`

Nm very confusing.

- **Allowed form:** Rename one of the two methods so their names differ by more than capitalization.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NM_VERY_CONFUSING","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-nm-very-confusing-intentional"></a>

### `spotbugs/NM_VERY_CONFUSING_INTENTIONAL`

Nm very confusing intentional.

- **Allowed form:** Rename one of the two methods so they differ by more than letter case.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NM_VERY_CONFUSING_INTENTIONAL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-nm-wrong-package"></a>

### `spotbugs/NM_WRONG_PACKAGE`

Nm wrong package.

- **Allowed form:** Import the parameter type from the same package the superclass method uses, and add @Override so the compiler checks it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NM_WRONG_PACKAGE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-nm-wrong-package-intentional"></a>

### `spotbugs/NM_WRONG_PACKAGE_INTENTIONAL`

Nm wrong package intentional.

- **Allowed form:** Import the same type the superclass method declares and add @Override, so the method really overrides it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NM_WRONG_PACKAGE_INTENTIONAL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-nn-naked-notify"></a>

### `spotbugs/NN_NAKED_NOTIFY`

Nn naked notify.

- **Allowed form:** Change the shared state under the lock right before notify or notifyAll, so the waiter can see the new condition.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NN_NAKED_NOTIFY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-no-notify-not-notifyall"></a>

### `spotbugs/NO_NOTIFY_NOT_NOTIFYALL`

No notify not notifyall.

- **Allowed form:** Call notifyAll() instead of notify(), or use a Condition per predicate.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NO_NOTIFY_NOT_NOTIFYALL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-noise-field-reference"></a>

### `spotbugs/NOISE_FIELD_REFERENCE`

Noise field reference.

- **Allowed form:** Nothing is wrong in the code: this is SpotBugs' random noise detector, which only appears when that detector is enabled.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NOISE_FIELD_REFERENCE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-noise-method-call"></a>

### `spotbugs/NOISE_METHOD_CALL`

Noise method call.

- **Allowed form:** Nothing is wrong in the code: this is SpotBugs' random noise detector, which only appears when that detector is enabled.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NOISE_METHOD_CALL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-noise-null-dereference"></a>

### `spotbugs/NOISE_NULL_DEREFERENCE`

Noise null dereference.

- **Allowed form:** Nothing is wrong in the code: this is SpotBugs' random noise detector, which only appears when that detector is enabled.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NOISE_NULL_DEREFERENCE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-noise-operation"></a>

### `spotbugs/NOISE_OPERATION`

Noise operation.

- **Allowed form:** Nothing is wrong in the code: this is SpotBugs' random noise detector, which only appears when that detector is enabled.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NOISE_OPERATION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-np-always-null"></a>

### `spotbugs/NP_ALWAYS_NULL`

Np always null.

- **Allowed form:** Assign a real value before the dereference, or delete the dead branch; the variable is null on this path.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_ALWAYS_NULL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-np-always-null-exception"></a>

### `spotbugs/NP_ALWAYS_NULL_EXCEPTION`

Np always null exception.

- **Allowed form:** Fix the path so the value is non-null before the dereference, or handle the null case before it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_ALWAYS_NULL_EXCEPTION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-np-argument-might-be-null"></a>

### `spotbugs/NP_ARGUMENT_MIGHT_BE_NULL`

Np argument might be null.

- **Allowed form:** Check the parameter for null inside this method before dereferencing it, since its contract allows null.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_ARGUMENT_MIGHT_BE_NULL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-np-boolean-return-null"></a>

### `spotbugs/NP_BOOLEAN_RETURN_NULL`

Np boolean return null.

- **Allowed form:** Return Boolean.FALSE or TRUE, or change the return type to boolean or Optional\<Boolean>.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_BOOLEAN_RETURN_NULL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-np-clone-could-return-null"></a>

### `spotbugs/NP_CLONE_COULD_RETURN_NULL`

Np clone could return null.

- **Allowed form:** Return the copy from super.clone() or throw; never return null from clone.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_CLONE_COULD_RETURN_NULL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-np-closing-null"></a>

### `spotbugs/NP_CLOSING_NULL`

Np closing null.

- **Allowed form:** Only close what was opened; open the resource in try-with-resources so it is never null at close.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_CLOSING_NULL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-np-dereference-of-readline-value"></a>

### `spotbugs/NP_DEREFERENCE_OF_READLINE_VALUE`

Np dereference of readline value.

- **Allowed form:** Assign readLine() to a variable and test it for null before use, or iterate reader.lines().
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_DEREFERENCE_OF_READLINE_VALUE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-np-equals-should-handle-null-argument"></a>

### `spotbugs/NP_EQUALS_SHOULD_HANDLE_NULL_ARGUMENT`

Np equals should handle null argument.

- **Allowed form:** Begin equals with an instanceof check, which is false for null, or use Objects.equals for each field.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_EQUALS_SHOULD_HANDLE_NULL_ARGUMENT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-np-guaranteed-deref"></a>

### `spotbugs/NP_GUARANTEED_DEREF`

Np guaranteed deref.

- **Allowed form:** Check for null and return or throw before the dereference; the null path always reaches it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_GUARANTEED_DEREF","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-np-guaranteed-deref-on-exception-path"></a>

### `spotbugs/NP_GUARANTEED_DEREF_ON_EXCEPTION_PATH`

Np guaranteed deref on exception path.

- **Allowed form:** Check for null in the catch or finally before dereferencing, or restructure with try-with-resources.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_GUARANTEED_DEREF_ON_EXCEPTION_PATH","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-np-immediate-dereference-of-readline"></a>

### `spotbugs/NP_IMMEDIATE_DEREFERENCE_OF_READLINE`

Np immediate dereference of readline.

- **Allowed form:** Assign readLine() to a variable and test it for null before calling methods on it, or iterate reader.lines().
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_IMMEDIATE_DEREFERENCE_OF_READLINE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-np-load-of-known-null-value"></a>

### `spotbugs/NP_LOAD_OF_KNOWN_NULL_VALUE`

Np load of known null value.

- **Allowed form:** Remove the use of the variable that is always null here, or fix the earlier branch that should have set it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_LOAD_OF_KNOWN_NULL_VALUE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-np-method-parameter-relaxing-annotation"></a>

### `spotbugs/NP_METHOD_PARAMETER_RELAXING_ANNOTATION`

Np method parameter relaxing annotation.

- **Allowed form:** Give the override's parameter the same nullness annotation as the method it overrides.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_METHOD_PARAMETER_RELAXING_ANNOTATION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-np-method-parameter-tightens-annotation"></a>

### `spotbugs/NP_METHOD_PARAMETER_TIGHTENS_ANNOTATION`

Np method parameter tightens annotation.

- **Allowed form:** Give the override's parameter the same nullness annotation as the method it overrides, and handle null if the parent allows it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_METHOD_PARAMETER_TIGHTENS_ANNOTATION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-np-method-return-relaxing-annotation"></a>

### `spotbugs/NP_METHOD_RETURN_RELAXING_ANNOTATION`

Np method return relaxing annotation.

- **Allowed form:** Keep the override's return nullness as strict as the parent's: return a non-null value, or change the parent's contract.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_METHOD_RETURN_RELAXING_ANNOTATION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-np-nonnull-field-not-initialized-in-constructor"></a>

### `spotbugs/NP_NONNULL_FIELD_NOT_INITIALIZED_IN_CONSTRUCTOR`

Np nonnull field not initialized in constructor.

- **Allowed form:** Assign the field in every constructor, or make it a final field set from a constructor parameter.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_NONNULL_FIELD_NOT_INITIALIZED_IN_CONSTRUCTOR","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-np-nonnull-param-violation"></a>

### `spotbugs/NP_NONNULL_PARAM_VIOLATION`

Np nonnull param violation.

- **Allowed form:** Pass a non-null value, or change the callee to accept null explicitly; the parameter is declared non-null.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_NONNULL_PARAM_VIOLATION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-np-nonnull-return-violation"></a>

### `spotbugs/NP_NONNULL_RETURN_VIOLATION`

Np nonnull return violation.

- **Allowed form:** Return a non-null value, such as List.of(), Optional.empty() or an empty string, instead of null.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_NONNULL_RETURN_VIOLATION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-np-null-instanceof"></a>

### `spotbugs/NP_NULL_INSTANCEOF`

Np null instanceof.

- **Allowed form:** Remove the instanceof test; the value is null here, so it is always false.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_NULL_INSTANCEOF","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-np-null-on-some-path"></a>

### `spotbugs/NP_NULL_ON_SOME_PATH`

Np null on some path.

- **Allowed form:** Add a null check that returns or throws before the dereference, or make the value non-null on every path.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_NULL_ON_SOME_PATH","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-np-null-on-some-path-exception"></a>

### `spotbugs/NP_NULL_ON_SOME_PATH_EXCEPTION`

Np null on some path exception.

- **Allowed form:** Check the value for null in the catch or finally block before using it, or initialize it before the try.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_NULL_ON_SOME_PATH_EXCEPTION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-np-null-on-some-path-from-return-value"></a>

### `spotbugs/NP_NULL_ON_SOME_PATH_FROM_RETURN_VALUE`

Np null on some path from return value.

- **Allowed form:** Check the returned value for null before dereferencing it, or make the callee return Optional or an empty collection.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_NULL_ON_SOME_PATH_FROM_RETURN_VALUE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-np-null-on-some-path-might-be-infeasible"></a>

### `spotbugs/NP_NULL_ON_SOME_PATH_MIGHT_BE_INFEASIBLE`

Np null on some path might be infeasible.

- **Allowed form:** Guard the dereference with a null check, or restructure so the branch that can hold null never reaches it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_NULL_ON_SOME_PATH_MIGHT_BE_INFEASIBLE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-np-null-param-deref"></a>

### `spotbugs/NP_NULL_PARAM_DEREF`

Np null param deref.

- **Allowed form:** Pass a non-null value; the callee dereferences the parameter without a null check.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_NULL_PARAM_DEREF","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-np-null-param-deref-all-targets-dangerous"></a>

### `spotbugs/NP_NULL_PARAM_DEREF_ALL_TARGETS_DANGEROUS`

Np null param deref all targets dangerous.

- **Allowed form:** Pass a non-null value; every possible target dereferences this parameter.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_NULL_PARAM_DEREF_ALL_TARGETS_DANGEROUS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-np-null-param-deref-nonvirtual"></a>

### `spotbugs/NP_NULL_PARAM_DEREF_NONVIRTUAL`

Np null param deref nonvirtual.

- **Allowed form:** Pass a non-null value; the called method dereferences this parameter without a null check.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_NULL_PARAM_DEREF_NONVIRTUAL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-np-optional-return-null"></a>

### `spotbugs/NP_OPTIONAL_RETURN_NULL`

Np optional return null.

- **Allowed form:** Return Optional.empty() instead of null from a method that returns Optional.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_OPTIONAL_RETURN_NULL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-np-parameter-must-be-nonnull-but-marked-as-nullable"></a>

### `spotbugs/NP_PARAMETER_MUST_BE_NONNULL_BUT_MARKED_AS_NULLABLE`

Np parameter must be nonnull but marked as nullable.

- **Allowed form:** Remove the nullable annotation from the parameter, or check it for null before the dereference.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_PARAMETER_MUST_BE_NONNULL_BUT_MARKED_AS_NULLABLE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-np-store-into-nonnull-field"></a>

### `spotbugs/NP_STORE_INTO_NONNULL_FIELD`

Np store into nonnull field.

- **Allowed form:** Store a non-null value, or drop the non-null annotation if the field can legitimately be null.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_STORE_INTO_NONNULL_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-np-sync-and-null-check-field"></a>

### `spotbugs/NP_SYNC_AND_NULL_CHECK_FIELD`

Np sync and null check field.

- **Allowed form:** Make the field final and non-null, and synchronize on a separate private final lock Object.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_SYNC_AND_NULL_CHECK_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-np-tostring-could-return-null"></a>

### `spotbugs/NP_TOSTRING_COULD_RETURN_NULL`

Np tostring could return null.

- **Allowed form:** Return an empty string or String.valueOf(field) from toString, never null.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_TOSTRING_COULD_RETURN_NULL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-np-unwritten-field"></a>

### `spotbugs/NP_UNWRITTEN_FIELD`

Np unwritten field.

- **Allowed form:** Assign the field somewhere, or delete it; reading a never-written field always yields null.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_UNWRITTEN_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-np-unwritten-public-or-protected-field"></a>

### `spotbugs/NP_UNWRITTEN_PUBLIC_OR_PROTECTED_FIELD`

Np unwritten public or protected field.

- **Allowed form:** Assign the field in the constructor and make it private final, or remove it if nothing sets it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NP_UNWRITTEN_PUBLIC_OR_PROTECTED_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-ns-dangerous-non-short-circuit"></a>

### `spotbugs/NS_DANGEROUS_NON_SHORT_CIRCUIT`

Ns dangerous non short circuit.

- **Allowed form:** Use && or || so the right side is skipped when the left side already decides the result or guards against null.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NS_DANGEROUS_NON_SHORT_CIRCUIT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ns-non-short-circuit"></a>

### `spotbugs/NS_NON_SHORT_CIRCUIT`

Ns non short circuit.

- **Allowed form:** Use && or || instead of & or | on booleans, so the right side runs only when needed.
- **Exception:** If this is intended, add `{"rule":"spotbugs/NS_NON_SHORT_CIRCUIT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-obl-unsatisfied-obligation"></a>

### `spotbugs/OBL_UNSATISFIED_OBLIGATION`

Obl unsatisfied obligation.

- **Allowed form:** Open the stream, connection or other resource in try-with-resources so it closes on every path; a resource handed to its owner is the exception case.
- **Exception:** If this is intended, add `{"rule":"spotbugs/OBL_UNSATISFIED_OBLIGATION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-obl-unsatisfied-obligation-exception-edge"></a>

### `spotbugs/OBL_UNSATISFIED_OBLIGATION_EXCEPTION_EDGE`

Obl unsatisfied obligation exception edge.

- **Allowed form:** Open the stream, connection or other resource in try-with-resources so it closes when an exception is thrown.
- **Exception:** If this is intended, add `{"rule":"spotbugs/OBL_UNSATISFIED_OBLIGATION_EXCEPTION_EDGE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-odr-open-database-resource"></a>

### `spotbugs/ODR_OPEN_DATABASE_RESOURCE`

Odr open database resource.

- **Allowed form:** Open the Connection, Statement and ResultSet in try-with-resources so each closes on every path.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ODR_OPEN_DATABASE_RESOURCE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-odr-open-database-resource-exception-path"></a>

### `spotbugs/ODR_OPEN_DATABASE_RESOURCE_EXCEPTION_PATH`

Odr open database resource exception path.

- **Allowed form:** Open the Connection, Statement and ResultSet in try-with-resources so each closes when an exception is thrown.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ODR_OPEN_DATABASE_RESOURCE_EXCEPTION_PATH","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-os-open-stream"></a>

### `spotbugs/OS_OPEN_STREAM`

Os open stream.

- **Allowed form:** Open the stream in try-with-resources so it closes on every path.
- **Exception:** If this is intended, add `{"rule":"spotbugs/OS_OPEN_STREAM","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-os-open-stream-exception-path"></a>

### `spotbugs/OS_OPEN_STREAM_EXCEPTION_PATH`

Os open stream exception path.

- **Allowed form:** Open the stream in try-with-resources so it closes when an exception is thrown.
- **Exception:** If this is intended, add `{"rule":"spotbugs/OS_OPEN_STREAM_EXCEPTION_PATH","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-overriding-methods-must-invoke-super"></a>

### `spotbugs/OVERRIDING_METHODS_MUST_INVOKE_SUPER`

Overriding methods must invoke super.

- **Allowed form:** Call super.method(...) in the override, because the overridden method is annotated to require it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/OVERRIDING_METHODS_MUST_INVOKE_SUPER","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-pa-public-array-attribute"></a>

### `spotbugs/PA_PUBLIC_ARRAY_ATTRIBUTE`

Pa public array attribute.

- **Allowed form:** Make the array field private and final, and return a clone from an accessor or an immutable List.of(...).
- **Exception:** If this is intended, add `{"rule":"spotbugs/PA_PUBLIC_ARRAY_ATTRIBUTE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-pa-public-mutable-object-attribute"></a>

### `spotbugs/PA_PUBLIC_MUTABLE_OBJECT_ATTRIBUTE`

Pa public mutable object attribute.

- **Allowed form:** Make the field private and final, and expose an immutable copy such as List.copyOf(items) from an accessor.
- **Exception:** If this is intended, add `{"rule":"spotbugs/PA_PUBLIC_MUTABLE_OBJECT_ATTRIBUTE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-pa-public-primitive-attribute"></a>

### `spotbugs/PA_PUBLIC_PRIMITIVE_ATTRIBUTE`

Pa public primitive attribute.

- **Allowed form:** Make the field private and final with an accessor, or turn the class into a record.
- **Exception:** If this is intended, add `{"rule":"spotbugs/PA_PUBLIC_PRIMITIVE_ATTRIBUTE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-perm-super-not-called-in-getpermissions"></a>

### `spotbugs/PERM_SUPER_NOT_CALLED_IN_GETPERMISSIONS`

Perm super not called in getpermissions.

- **Allowed form:** Call super.getPermissions(codeSource) in getPermissions and add to the permissions it returns.
- **Exception:** If this is intended, add `{"rule":"spotbugs/PERM_SUPER_NOT_CALLED_IN_GETPERMISSIONS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-pi-do-not-reuse-public-identifiers-class-names"></a>

### `spotbugs/PI_DO_NOT_REUSE_PUBLIC_IDENTIFIERS_CLASS_NAMES`

Pi do not reuse public identifiers class names.

- **Allowed form:** Rename the class so it does not match a JDK type such as List, Optional or Entry; use a domain name like OrderList.
- **Exception:** If this is intended, add `{"rule":"spotbugs/PI_DO_NOT_REUSE_PUBLIC_IDENTIFIERS_CLASS_NAMES","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-pi-do-not-reuse-public-identifiers-field-names"></a>

### `spotbugs/PI_DO_NOT_REUSE_PUBLIC_IDENTIFIERS_FIELD_NAMES`

Pi do not reuse public identifiers field names.

- **Allowed form:** Rename the field so it does not match a JDK class name; use a domain name such as orderList.
- **Exception:** If this is intended, add `{"rule":"spotbugs/PI_DO_NOT_REUSE_PUBLIC_IDENTIFIERS_FIELD_NAMES","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-pi-do-not-reuse-public-identifiers-local-variable-names"></a>

### `spotbugs/PI_DO_NOT_REUSE_PUBLIC_IDENTIFIERS_LOCAL_VARIABLE_NAMES`

Pi do not reuse public identifiers local variable names.

- **Allowed form:** Rename the local so it does not match a JDK class name; use a domain name such as orderList.
- **Exception:** If this is intended, add `{"rule":"spotbugs/PI_DO_NOT_REUSE_PUBLIC_IDENTIFIERS_LOCAL_VARIABLE_NAMES","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-pi-do-not-reuse-public-identifiers-method-names"></a>

### `spotbugs/PI_DO_NOT_REUSE_PUBLIC_IDENTIFIERS_METHOD_NAMES`

Pi do not reuse public identifiers method names.

- **Allowed form:** Rename the method so it does not match a JDK class name; use a domain verb such as parseOrder.
- **Exception:** If this is intended, add `{"rule":"spotbugs/PI_DO_NOT_REUSE_PUBLIC_IDENTIFIERS_METHOD_NAMES","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ps-public-semaphores"></a>

### `spotbugs/PS_PUBLIC_SEMAPHORES`

Ps public semaphores.

- **Allowed form:** Synchronize and call wait and notify on a private final lock Object, not on this.
- **Exception:** If this is intended, add `{"rule":"spotbugs/PS_PUBLIC_SEMAPHORES","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-pt-absolute-path-traversal"></a>

### `spotbugs/PT_ABSOLUTE_PATH_TRAVERSAL`

Pt absolute path traversal.

- **Allowed form:** Resolve the user value against a fixed base with Path.resolve, normalize it, and check startsWith(base) before opening.
- **Exception:** If this is intended, add `{"rule":"spotbugs/PT_ABSOLUTE_PATH_TRAVERSAL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-pt-relative-path-traversal"></a>

### `spotbugs/PT_RELATIVE_PATH_TRAVERSAL`

Pt relative path traversal.

- **Allowed form:** Resolve the user value against a fixed base with Path.resolve, normalize it, and check startsWith(base) before opening.
- **Exception:** If this is intended, add `{"rule":"spotbugs/PT_RELATIVE_PATH_TRAVERSAL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-pz-dont-reuse-entry-objects-in-iterators"></a>

### `spotbugs/PZ_DONT_REUSE_ENTRY_OBJECTS_IN_ITERATORS`

Pz dont reuse entry objects in iterators.

- **Allowed form:** Return a new Map.Entry on each next() call, such as Map.entry(k, v), instead of making the iterator itself the entry.
- **Exception:** If this is intended, add `{"rule":"spotbugs/PZ_DONT_REUSE_ENTRY_OBJECTS_IN_ITERATORS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-pzla-prefer-zero-length-arrays"></a>

### `spotbugs/PZLA_PREFER_ZERO_LENGTH_ARRAYS`

Pzla prefer zero length arrays.

- **Allowed form:** Return an empty array (a static final zero-length constant) or List.of() instead of null.
- **Exception:** If this is intended, add `{"rule":"spotbugs/PZLA_PREFER_ZERO_LENGTH_ARRAYS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-qba-questionable-boolean-assignment"></a>

### `spotbugs/QBA_QUESTIONABLE_BOOLEAN_ASSIGNMENT`

Qba questionable boolean assignment.

- **Allowed form:** Write the comparison with == or just the boolean: if (flag), not if (flag = true).
- **Exception:** If this is intended, add `{"rule":"spotbugs/QBA_QUESTIONABLE_BOOLEAN_ASSIGNMENT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-qf-questionable-for-loop"></a>

### `spotbugs/QF_QUESTIONABLE_FOR_LOOP`

Qf questionable for loop.

- **Allowed form:** Test and increment the same variable the loop declares, or write a for-each loop.
- **Exception:** If this is intended, add `{"rule":"spotbugs/QF_QUESTIONABLE_FOR_LOOP","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-range-array-index"></a>

### `spotbugs/RANGE_ARRAY_INDEX`

Range array index.

- **Allowed form:** Check the index is within 0 and array.length - 1 before the access, or fix the index computation.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RANGE_ARRAY_INDEX","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-range-array-length"></a>

### `spotbugs/RANGE_ARRAY_LENGTH`

Range array length.

- **Allowed form:** Pass a length that fits the array (offset + length \<= array.length), or fix the computation.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RANGE_ARRAY_LENGTH","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-range-array-offset"></a>

### `spotbugs/RANGE_ARRAY_OFFSET`

Range array offset.

- **Allowed form:** Pass an offset between 0 and array.length, or fix the computation.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RANGE_ARRAY_OFFSET","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-range-string-index"></a>

### `spotbugs/RANGE_STRING_INDEX`

Range string index.

- **Allowed form:** Check the index is within 0 and length() before calling charAt or substring, or fix the computation.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RANGE_STRING_INDEX","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-rc-ref-comparison"></a>

### `spotbugs/RC_REF_COMPARISON`

Rc ref comparison.

- **Allowed form:** Compare boxed values with equals, or unbox them first; == on Integer, Long or Boolean compares references.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RC_REF_COMPARISON","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-rc-ref-comparison-bad-practice"></a>

### `spotbugs/RC_REF_COMPARISON_BAD_PRACTICE`

Rc ref comparison bad practice.

- **Allowed form:** Compare with equals, for example a.equals(b) or Objects.equals(a, b), instead of == on boxed values.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RC_REF_COMPARISON_BAD_PRACTICE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-rc-ref-comparison-bad-practice-boolean"></a>

### `spotbugs/RC_REF_COMPARISON_BAD_PRACTICE_BOOLEAN`

Rc ref comparison bad practice boolean.

- **Allowed form:** Compare with Boolean.TRUE.equals(x) or unbox to a primitive boolean, not == between Boolean objects.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RC_REF_COMPARISON_BAD_PRACTICE_BOOLEAN","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-rcn-redundant-comparison-of-null-and-nonnull-value"></a>

### `spotbugs/RCN_REDUNDANT_COMPARISON_OF_NULL_AND_NONNULL_VALUE`

Rcn redundant comparison of null and nonnull value.

- **Allowed form:** Remove the null comparison on a value that cannot be null here, or fix the earlier assumption.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RCN_REDUNDANT_COMPARISON_OF_NULL_AND_NONNULL_VALUE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-rcn-redundant-comparison-two-null-values"></a>

### `spotbugs/RCN_REDUNDANT_COMPARISON_TWO_NULL_VALUES`

Rcn redundant comparison two null values.

- **Allowed form:** Remove the comparison of two values that are both null here, or fix the earlier assignment that made them so.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RCN_REDUNDANT_COMPARISON_TWO_NULL_VALUES","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-rcn-redundant-nullcheck-of-nonnull-value"></a>

### `spotbugs/RCN_REDUNDANT_NULLCHECK_OF_NONNULL_VALUE`

Rcn redundant nullcheck of nonnull value.

- **Allowed form:** Remove the null check on a value that cannot be null here, or fix the earlier code that made that assumption.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RCN_REDUNDANT_NULLCHECK_OF_NONNULL_VALUE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-rcn-redundant-nullcheck-of-null-value"></a>

### `spotbugs/RCN_REDUNDANT_NULLCHECK_OF_NULL_VALUE`

Rcn redundant nullcheck of null value.

- **Allowed form:** Remove the null check on a value that is always null here, and fix the earlier code that left it null.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RCN_REDUNDANT_NULLCHECK_OF_NULL_VALUE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-rcn-redundant-nullcheck-would-have-been-a-npe"></a>

### `spotbugs/RCN_REDUNDANT_NULLCHECK_WOULD_HAVE_BEEN_A_NPE`

Rcn redundant nullcheck would have been a npe.

- **Allowed form:** Move the null check ahead of the dereference, or remove it if the value can never be null.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RCN_REDUNDANT_NULLCHECK_WOULD_HAVE_BEEN_A_NPE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-re-bad-syntax-for-regular-expression"></a>

### `spotbugs/RE_BAD_SYNTAX_FOR_REGULAR_EXPRESSION`

Re bad syntax for regular expression.

- **Allowed form:** Correct the pattern, or build it with Pattern.quote for literal text; test it with a unit test.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RE_BAD_SYNTAX_FOR_REGULAR_EXPRESSION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-re-cant-use-file-separator-as-regular-expression"></a>

### `spotbugs/RE_CANT_USE_FILE_SEPARATOR_AS_REGULAR_EXPRESSION`

Re cant use file separator as regular expression.

- **Allowed form:** Use Pattern.quote(File.separator), or work on Path and call getFileName and getParent instead of splitting.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RE_CANT_USE_FILE_SEPARATOR_AS_REGULAR_EXPRESSION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-re-possible-unintended-pattern"></a>

### `spotbugs/RE_POSSIBLE_UNINTENDED_PATTERN`

Re possible unintended pattern.

- **Allowed form:** Escape the dot or quote the text, split(Pattern.quote(".")), or pass a real regex; "." matches every character.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RE_POSSIBLE_UNINTENDED_PATTERN","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-rec-catch-exception"></a>

### `spotbugs/REC_CATCH_EXCEPTION`

Rec catch exception.

- **Allowed form:** Catch the specific checked exceptions the try block throws, so runtime exceptions propagate.
- **Exception:** If this is intended, add `{"rule":"spotbugs/REC_CATCH_EXCEPTION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-reflc-reflection-may-increase-accessibility-of-class"></a>

### `spotbugs/REFLC_REFLECTION_MAY_INCREASE_ACCESSIBILITY_OF_CLASS`

Reflc reflection may increase accessibility of class.

- **Allowed form:** Avoid reflection on classes that are not public; use a public API, a MethodHandles.Lookup, or an interface.
- **Exception:** If this is intended, add `{"rule":"spotbugs/REFLC_REFLECTION_MAY_INCREASE_ACCESSIBILITY_OF_CLASS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-reflf-reflection-may-increase-accessibility-of-field"></a>

### `spotbugs/REFLF_REFLECTION_MAY_INCREASE_ACCESSIBILITY_OF_FIELD`

Reflf reflection may increase accessibility of field.

- **Allowed form:** Avoid setAccessible on fields; use a public accessor, a MethodHandles.Lookup, or a VarHandle.
- **Exception:** If this is intended, add `{"rule":"spotbugs/REFLF_REFLECTION_MAY_INCREASE_ACCESSIBILITY_OF_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-ri-redundant-interfaces"></a>

### `spotbugs/RI_REDUNDANT_INTERFACES`

Ri redundant interfaces.

- **Allowed form:** Remove the interface from the implements clause, since the superclass already implements it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RI_REDUNDANT_INTERFACES","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-rpc-repeated-conditional-test"></a>

### `spotbugs/RpC_REPEATED_CONDITIONAL_TEST`

Rpc repeated conditional test.

- **Allowed form:** Fix the repeated condition so the second test checks something different, or delete it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RpC_REPEATED_CONDITIONAL_TEST","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-rr-not-checked"></a>

### `spotbugs/RR_NOT_CHECKED`

Rr not checked.

- **Allowed form:** Check the count returned by read(buf) in a loop, or use readNBytes or readAllBytes, so short reads are handled.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RR_NOT_CHECKED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-rs-readobject-sync"></a>

### `spotbugs/RS_READOBJECT_SYNC`

Rs readobject sync.

- **Allowed form:** Remove synchronized from readObject; the object being deserialized is not shared yet.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RS_READOBJECT_SYNC","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ru-invoke-run"></a>

### `spotbugs/RU_INVOKE_RUN`

Ru invoke run.

- **Allowed form:** Call start() to run in a new thread, or submit the Runnable to an ExecutorService; run() executes on the current thread.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RU_INVOKE_RUN","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-rv-01-to-int"></a>

### `spotbugs/RV_01_TO_INT`

Rv 01 to int.

- **Allowed form:** Cast after the multiplication: (int) (Math.random() \* n), or use ThreadLocalRandom.current().nextInt(n).
- **Exception:** If this is intended, add `{"rule":"spotbugs/RV_01_TO_INT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-rv-absolute-value-of-hashcode"></a>

### `spotbugs/RV_ABSOLUTE_VALUE_OF_HASHCODE`

Rv absolute value of hashcode.

- **Allowed form:** Use Math.floorMod(x.hashCode(), n); Math.abs of Integer.MIN_VALUE is still negative.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RV_ABSOLUTE_VALUE_OF_HASHCODE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-rv-absolute-value-of-random-int"></a>

### `spotbugs/RV_ABSOLUTE_VALUE_OF_RANDOM_INT`

Rv absolute value of random int.

- **Allowed form:** Use random.nextInt(n), which is never negative, instead of Math.abs(random.nextInt()) % n.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RV_ABSOLUTE_VALUE_OF_RANDOM_INT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-rv-check-compareto-for-specific-return-value"></a>

### `spotbugs/RV_CHECK_COMPARETO_FOR_SPECIFIC_RETURN_VALUE`

Rv check compareto for specific return value.

- **Allowed form:** Test only the sign: compareTo(x) \< 0, == 0 or > 0, never == 1 or == -1.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RV_CHECK_COMPARETO_FOR_SPECIFIC_RETURN_VALUE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-rv-check-for-positive-indexof"></a>

### `spotbugs/RV_CHECK_FOR_POSITIVE_INDEXOF`

Rv check for positive indexof.

- **Allowed form:** Test indexOf(x) >= 0 or use contains(x); indexOf(x) > 0 misses a match at position 0.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RV_CHECK_FOR_POSITIVE_INDEXOF","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-rv-dont-just-null-check-readline"></a>

### `spotbugs/RV_DONT_JUST_NULL_CHECK_READLINE`

Rv dont just null check readline.

- **Allowed form:** Assign readLine() to a variable in the loop condition and use that variable, so no line is discarded.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RV_DONT_JUST_NULL_CHECK_READLINE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-rv-exception-not-thrown"></a>

### `spotbugs/RV_EXCEPTION_NOT_THROWN`

Rv exception not thrown.

- **Allowed form:** Add throw before new SomeException(...), or delete the unused exception.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RV_EXCEPTION_NOT_THROWN","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-rv-negating-result-of-compareto"></a>

### `spotbugs/RV_NEGATING_RESULT_OF_COMPARETO`

Rv negating result of compareto.

- **Allowed form:** Swap the operands, compare(b, a) or b.compareTo(a), instead of negating a compareTo result.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RV_NEGATING_RESULT_OF_COMPARETO","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-rv-rem-of-hashcode"></a>

### `spotbugs/RV_REM_OF_HASHCODE`

Rv rem of hashcode.

- **Allowed form:** Use Math.floorMod(x.hashCode(), n), because hashCode() can be negative.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RV_REM_OF_HASHCODE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-rv-rem-of-random-int"></a>

### `spotbugs/RV_REM_OF_RANDOM_INT`

Rv rem of random int.

- **Allowed form:** Call random.nextInt(n) for a bounded value; nextInt() % n can be negative.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RV_REM_OF_RANDOM_INT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-rv-return-value-ignored"></a>

### `spotbugs/RV_RETURN_VALUE_IGNORED`

Rv return value ignored.

- **Allowed form:** Use the returned value, e.g. assign it: s = s.trim(); the call does not change the receiver.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RV_RETURN_VALUE_IGNORED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-rv-return-value-ignored-bad-practice"></a>

### `spotbugs/RV_RETURN_VALUE_IGNORED_BAD_PRACTICE`

Rv return value ignored bad practice.

- **Allowed form:** Use the return value: check the boolean from File.delete or mkdirs, or call Files.delete or Files.createDirectories, which throw.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RV_RETURN_VALUE_IGNORED_BAD_PRACTICE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-rv-return-value-ignored-inferred"></a>

### `spotbugs/RV_RETURN_VALUE_IGNORED_INFERRED`

Rv return value ignored inferred.

- **Allowed form:** Use the returned value, or remove the call when it only produces a value.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RV_RETURN_VALUE_IGNORED_INFERRED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-rv-return-value-ignored-no-side-effect"></a>

### `spotbugs/RV_RETURN_VALUE_IGNORED_NO_SIDE_EFFECT`

Rv return value ignored no side effect.

- **Allowed form:** Use the returned value, or delete the call; the method has no other effect.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RV_RETURN_VALUE_IGNORED_NO_SIDE_EFFECT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-rv-return-value-of-putifabsent-ignored"></a>

### `spotbugs/RV_RETURN_VALUE_OF_PUTIFABSENT_IGNORED`

Rv return value of putifabsent ignored.

- **Allowed form:** Use the value putIfAbsent returns (the existing entry), or call computeIfAbsent and use its result.
- **Exception:** If this is intended, add `{"rule":"spotbugs/RV_RETURN_VALUE_OF_PUTIFABSENT_IGNORED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-sa-field-double-assignment"></a>

### `spotbugs/SA_FIELD_DOUBLE_ASSIGNMENT`

Sa field double assignment.

- **Allowed form:** Delete the first assignment to the field, or assign the other field that was meant.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SA_FIELD_DOUBLE_ASSIGNMENT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-sa-field-self-assignment"></a>

### `spotbugs/SA_FIELD_SELF_ASSIGNMENT`

Sa field self assignment.

- **Allowed form:** Delete the self-assignment, or assign the intended value to the field.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SA_FIELD_SELF_ASSIGNMENT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-sa-field-self-comparison"></a>

### `spotbugs/SA_FIELD_SELF_COMPARISON`

Sa field self comparison.

- **Allowed form:** Compare the field with the other value you meant; comparing it with itself is constant.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SA_FIELD_SELF_COMPARISON","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-sa-field-self-computation"></a>

### `spotbugs/SA_FIELD_SELF_COMPUTATION`

Sa field self computation.

- **Allowed form:** Replace the self-computation (x & x, x - x) with the intended operands.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SA_FIELD_SELF_COMPUTATION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-sa-local-double-assignment"></a>

### `spotbugs/SA_LOCAL_DOUBLE_ASSIGNMENT`

Sa local double assignment.

- **Allowed form:** Keep a single assignment of the local and delete the repeated one.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SA_LOCAL_DOUBLE_ASSIGNMENT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-sa-local-self-assignment"></a>

### `spotbugs/SA_LOCAL_SELF_ASSIGNMENT`

Sa local self assignment.

- **Allowed form:** Remove x = x, or assign from the variable that was meant; a self-assignment does nothing.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SA_LOCAL_SELF_ASSIGNMENT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-sa-local-self-assignment-instead-of-field"></a>

### `spotbugs/SA_LOCAL_SELF_ASSIGNMENT_INSTEAD_OF_FIELD`

Sa local self assignment instead of field.

- **Allowed form:** Write this.name = name so the parameter is stored in the field.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SA_LOCAL_SELF_ASSIGNMENT_INSTEAD_OF_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-sa-local-self-comparison"></a>

### `spotbugs/SA_LOCAL_SELF_COMPARISON`

Sa local self comparison.

- **Allowed form:** Compare with the other value you meant; comparing a local with itself is constant. Use Double.isNaN for NaN.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SA_LOCAL_SELF_COMPARISON","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-sa-local-self-computation"></a>

### `spotbugs/SA_LOCAL_SELF_COMPUTATION`

Sa local self computation.

- **Allowed form:** Replace the self-computation (x & x, x - x) with the intended operands.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SA_LOCAL_SELF_COMPUTATION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-sbsc-use-stringbuffer-concatenation"></a>

### `spotbugs/SBSC_USE_STRINGBUFFER_CONCATENATION`

Sbsc use stringbuffer concatenation.

- **Allowed form:** Append inside the loop to a StringBuilder and call toString() once after it, or use String.join or a Collectors.joining stream.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SBSC_USE_STRINGBUFFER_CONCATENATION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-sc-start-in-ctor"></a>

### `spotbugs/SC_START_IN_CTOR`

Sc start in ctor.

- **Allowed form:** Move start() out of the constructor into a start() method or static factory called after construction.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SC_START_IN_CTOR","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-se-bad-field"></a>

### `spotbugs/SE_BAD_FIELD`

Se bad field.

- **Allowed form:** Give the field a Serializable type (an id, a String or a serializable record), or mark it transient and rebuild it in readObject.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SE_BAD_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-se-bad-field-inner-class"></a>

### `spotbugs/SE_BAD_FIELD_INNER_CLASS`

Se bad field inner class.

- **Allowed form:** Make the inner class a static nested class, so it does not hold a non-serializable outer instance.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SE_BAD_FIELD_INNER_CLASS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-se-bad-field-store"></a>

### `spotbugs/SE_BAD_FIELD_STORE`

Se bad field store.

- **Allowed form:** Store a Serializable value (an id, a String or a serializable record) in the field, or mark it transient and rebuild it in readObject.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SE_BAD_FIELD_STORE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-se-comparator-should-be-serializable"></a>

### `spotbugs/SE_COMPARATOR_SHOULD_BE_SERIALIZABLE`

Se comparator should be serializable.

- **Allowed form:** Build the comparator with Comparator.comparing(Foo::key) instead of a Comparator class, or add implements Serializable if a serialized collection holds it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SE_COMPARATOR_SHOULD_BE_SERIALIZABLE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-se-inner-class"></a>

### `spotbugs/SE_INNER_CLASS`

Se inner class.

- **Allowed form:** Make the serializable inner class static, so it does not capture the outer instance.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SE_INNER_CLASS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-se-method-must-be-private"></a>

### `spotbugs/SE_METHOD_MUST_BE_PRIVATE`

Se method must be private.

- **Allowed form:** Declare writeObject, readObject, readObjectNoData as private so serialization calls them.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SE_METHOD_MUST_BE_PRIVATE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-se-no-serialversionid"></a>

### `spotbugs/SE_NO_SERIALVERSIONID`

Se no serialversionid.

- **Allowed form:** Add private static final long serialVersionUID = 1L; or stop implementing Serializable.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SE_NO_SERIALVERSIONID","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-se-no-suitable-constructor"></a>

### `spotbugs/SE_NO_SUITABLE_CONSTRUCTOR`

Se no suitable constructor.

- **Allowed form:** Give the first non-serializable superclass an accessible no-argument constructor, or make that superclass serializable.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SE_NO_SUITABLE_CONSTRUCTOR","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-se-no-suitable-constructor-for-externalization"></a>

### `spotbugs/SE_NO_SUITABLE_CONSTRUCTOR_FOR_EXTERNALIZATION`

Se no suitable constructor for externalization.

- **Allowed form:** Add a public no-argument constructor to the Externalizable class.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SE_NO_SUITABLE_CONSTRUCTOR_FOR_EXTERNALIZATION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-se-nonfinal-serialversionid"></a>

### `spotbugs/SE_NONFINAL_SERIALVERSIONID`

Se nonfinal serialversionid.

- **Allowed form:** Declare it exactly as: private static final long serialVersionUID = 1L;
- **Exception:** If this is intended, add `{"rule":"spotbugs/SE_NONFINAL_SERIALVERSIONID","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-se-nonlong-serialversionid"></a>

### `spotbugs/SE_NONLONG_SERIALVERSIONID`

Se nonlong serialversionid.

- **Allowed form:** Declare it exactly as: private static final long serialVersionUID = 1L;
- **Exception:** If this is intended, add `{"rule":"spotbugs/SE_NONLONG_SERIALVERSIONID","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-se-nonstatic-serialversionid"></a>

### `spotbugs/SE_NONSTATIC_SERIALVERSIONID`

Se nonstatic serialversionid.

- **Allowed form:** Declare it exactly as: private static final long serialVersionUID = 1L;
- **Exception:** If this is intended, add `{"rule":"spotbugs/SE_NONSTATIC_SERIALVERSIONID","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-se-prevent-ext-obj-overwrite"></a>

### `spotbugs/SE_PREVENT_EXT_OBJ_OVERWRITE`

Se prevent ext obj overwrite.

- **Allowed form:** Guard readExternal with a private initialized flag that is set once, or stop using Externalizable.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SE_PREVENT_EXT_OBJ_OVERWRITE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-se-private-read-resolve-not-inherited"></a>

### `spotbugs/SE_PRIVATE_READ_RESOLVE_NOT_INHERITED`

Se private read resolve not inherited.

- **Allowed form:** Make readResolve protected so subclasses inherit it, or make the class final.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SE_PRIVATE_READ_RESOLVE_NOT_INHERITED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-se-read-resolve-is-static"></a>

### `spotbugs/SE_READ_RESOLVE_IS_STATIC`

Se read resolve is static.

- **Allowed form:** Make readResolve an instance method (no static) so serialization calls it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SE_READ_RESOLVE_IS_STATIC","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-se-read-resolve-must-return-object"></a>

### `spotbugs/SE_READ_RESOLVE_MUST_RETURN_OBJECT`

Se read resolve must return object.

- **Allowed form:** Declare readResolve as returning Object, with throws ObjectStreamException if needed.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SE_READ_RESOLVE_MUST_RETURN_OBJECT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-se-transient-field-not-restored"></a>

### `spotbugs/SE_TRANSIENT_FIELD_NOT_RESTORED`

Se transient field not restored.

- **Allowed form:** Restore the transient field in readObject or readResolve, or make it a non-transient serializable field.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SE_TRANSIENT_FIELD_NOT_RESTORED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-se-transient-field-of-nonserializable-class"></a>

### `spotbugs/SE_TRANSIENT_FIELD_OF_NONSERIALIZABLE_CLASS`

Se transient field of nonserializable class.

- **Allowed form:** Remove transient from the field, or make the class Serializable; transient has no effect in a class that is not serialized.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SE_TRANSIENT_FIELD_OF_NONSERIALIZABLE_CLASS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-sf-dead-store-due-to-switch-fallthrough"></a>

### `spotbugs/SF_DEAD_STORE_DUE_TO_SWITCH_FALLTHROUGH`

Sf dead store due to switch fallthrough.

- **Allowed form:** Use a switch expression with arrow cases, or end each case with break or return, so values are not overwritten.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SF_DEAD_STORE_DUE_TO_SWITCH_FALLTHROUGH","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-sf-dead-store-due-to-switch-fallthrough-to-throw"></a>

### `spotbugs/SF_DEAD_STORE_DUE_TO_SWITCH_FALLTHROUGH_TO_THROW`

Sf dead store due to switch fallthrough to throw.

- **Allowed form:** End the case with break or return before the next case, or use arrow cases in a switch expression.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SF_DEAD_STORE_DUE_TO_SWITCH_FALLTHROUGH_TO_THROW","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-sf-switch-fallthrough"></a>

### `spotbugs/SF_SWITCH_FALLTHROUGH`

Sf switch fallthrough.

- **Allowed form:** End every case with break, return or throw, or use arrow-form cases, which never fall through.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SF_SWITCH_FALLTHROUGH","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-sf-switch-no-default"></a>

### `spotbugs/SF_SWITCH_NO_DEFAULT`

Sf switch no default.

- **Allowed form:** Add a default branch, or use an exhaustive switch expression over an enum or sealed type.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SF_SWITCH_NO_DEFAULT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-si-instance-before-finals-assigned"></a>

### `spotbugs/SI_INSTANCE_BEFORE_FINALS_ASSIGNED`

Si instance before finals assigned.

- **Allowed form:** Declare the instance field after every other static final field, or use a lazy holder class to create the instance.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SI_INSTANCE_BEFORE_FINALS_ASSIGNED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-sic-inner-should-be-static"></a>

### `spotbugs/SIC_INNER_SHOULD_BE_STATIC`

Sic inner should be static.

- **Allowed form:** Declare the nested class static, since it never uses the outer instance; make it a record if it only holds data.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SIC_INNER_SHOULD_BE_STATIC","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-sic-inner-should-be-static-anon"></a>

### `spotbugs/SIC_INNER_SHOULD_BE_STATIC_ANON`

Sic inner should be static anon.

- **Allowed form:** Replace the anonymous class with a lambda or a static nested class that does not capture the outer instance.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SIC_INNER_SHOULD_BE_STATIC_ANON","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-sic-inner-should-be-static-needs-this"></a>

### `spotbugs/SIC_INNER_SHOULD_BE_STATIC_NEEDS_THIS`

Sic inner should be static needs this.

- **Allowed form:** Declare the nested class static and pass the outer instance in through its constructor.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SIC_INNER_SHOULD_BE_STATIC_NEEDS_THIS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-sic-threadlocal-deadly-embrace"></a>

### `spotbugs/SIC_THREADLOCAL_DEADLY_EMBRACE`

Sic threadlocal deadly embrace.

- **Allowed form:** Make the inner class a static nested class so it does not hold the outer instance.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SIC_THREADLOCAL_DEADLY_EMBRACE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-sing-singleton-getter-not-synchronized"></a>

### `spotbugs/SING_SINGLETON_GETTER_NOT_SYNCHRONIZED`

Sing singleton getter not synchronized.

- **Allowed form:** Use a single-element enum, or an eager private static final instance, instead of lazy unsynchronized creation.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SING_SINGLETON_GETTER_NOT_SYNCHRONIZED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-sing-singleton-has-nonprivate-constructor"></a>

### `spotbugs/SING_SINGLETON_HAS_NONPRIVATE_CONSTRUCTOR`

Sing singleton has nonprivate constructor.

- **Allowed form:** Make the singleton's constructor private, or use a single-element enum.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SING_SINGLETON_HAS_NONPRIVATE_CONSTRUCTOR","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-sing-singleton-implements-clone-method"></a>

### `spotbugs/SING_SINGLETON_IMPLEMENTS_CLONE_METHOD`

Sing singleton implements clone method.

- **Allowed form:** Delete clone from the singleton, or make it throw CloneNotSupportedException; a single-element enum avoids it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SING_SINGLETON_IMPLEMENTS_CLONE_METHOD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-sing-singleton-implements-cloneable"></a>

### `spotbugs/SING_SINGLETON_IMPLEMENTS_CLONEABLE`

Sing singleton implements cloneable.

- **Allowed form:** Remove Cloneable from the singleton; use a single-element enum.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SING_SINGLETON_IMPLEMENTS_CLONEABLE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-sing-singleton-implements-serializable"></a>

### `spotbugs/SING_SINGLETON_IMPLEMENTS_SERIALIZABLE`

Sing singleton implements serializable.

- **Allowed form:** Make the singleton a single-element enum, or stop implementing Serializable; a readResolve method does not clear this finding.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SING_SINGLETON_IMPLEMENTS_SERIALIZABLE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-sing-singleton-indirectly-implements-cloneable"></a>

### `spotbugs/SING_SINGLETON_INDIRECTLY_IMPLEMENTS_CLONEABLE`

Sing singleton indirectly implements cloneable.

- **Allowed form:** Do not inherit Cloneable in a singleton; use a single-element enum or override clone to throw.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SING_SINGLETON_INDIRECTLY_IMPLEMENTS_CLONEABLE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-sio-superfluous-instanceof"></a>

### `spotbugs/SIO_SUPERFLUOUS_INSTANCEOF`

Sio superfluous instanceof.

- **Allowed form:** Remove the instanceof test; the static type already guarantees it, so it is always true.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SIO_SUPERFLUOUS_INSTANCEOF","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-skipped-class-too-big"></a>

### `spotbugs/SKIPPED_CLASS_TOO_BIG`

Skipped class too big.

- **Allowed form:** Split the class into smaller classes so analysis can cover all of it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SKIPPED_CLASS_TOO_BIG","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-sp-spin-on-field"></a>

### `spotbugs/SP_SPIN_ON_FIELD`

Sp spin on field.

- **Allowed form:** Wait with a CountDownLatch, a Condition or wait and notify instead of polling a field in a loop.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SP_SPIN_ON_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-sql-bad-prepared-statement-access"></a>

### `spotbugs/SQL_BAD_PREPARED_STATEMENT_ACCESS`

Sql bad prepared statement access.

- **Allowed form:** Set parameters from index 1, setString(1, value); JDBC indexes start at 1, not 0.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SQL_BAD_PREPARED_STATEMENT_ACCESS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-sql-bad-resultset-access"></a>

### `spotbugs/SQL_BAD_RESULTSET_ACCESS`

Sql bad resultset access.

- **Allowed form:** Read columns from index 1, rs.getString(1), or by column name; JDBC indexes start at 1.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SQL_BAD_RESULTSET_ACCESS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-sql-nonconstant-string-passed-to-execute"></a>

### `spotbugs/SQL_NONCONSTANT_STRING_PASSED_TO_EXECUTE`

Sql nonconstant string passed to execute.

- **Allowed form:** Use a PreparedStatement with a constant SQL string and ? placeholders, and bind the values with setString and setInt.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SQL_NONCONSTANT_STRING_PASSED_TO_EXECUTE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-sql-prepared-statement-generated-from-nonconstant-string"></a>

### `spotbugs/SQL_PREPARED_STATEMENT_GENERATED_FROM_NONCONSTANT_STRING`

Sql prepared statement generated from nonconstant string.

- **Allowed form:** Use a constant SQL string with ? placeholders and bind the values; build only placeholders or allowlisted identifiers, never user text, into the SQL.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SQL_PREPARED_STATEMENT_GENERATED_FROM_NONCONSTANT_STRING","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-sr-not-checked"></a>

### `spotbugs/SR_NOT_CHECKED`

Sr not checked.

- **Allowed form:** Check the number of bytes returned by skip, or use skipNBytes, so a short skip is handled.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SR_NOT_CHECKED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ss-should-be-static"></a>

### `spotbugs/SS_SHOULD_BE_STATIC`

Ss should be static.

- **Allowed form:** Declare the final field with a constant initializer as static final.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SS_SHOULD_BE_STATIC","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ssd-do-not-use-instance-lock-on-shared-static-data"></a>

### `spotbugs/SSD_DO_NOT_USE_INSTANCE_LOCK_ON_SHARED_STATIC_DATA`

Ssd do not use instance lock on shared static data.

- **Allowed form:** Guard the static data with a private static final lock Object, not an instance lock or a synchronized instance method.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SSD_DO_NOT_USE_INSTANCE_LOCK_ON_SHARED_STATIC_DATA","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-st-write-to-static-from-instance-method"></a>

### `spotbugs/ST_WRITE_TO_STATIC_FROM_INSTANCE_METHOD`

St write to static from instance method.

- **Allowed form:** Keep the state in an instance field, or move the write to a static method that guards it with a lock or an Atomic type.
- **Exception:** If this is intended, add `{"rule":"spotbugs/ST_WRITE_TO_STATIC_FROM_INSTANCE_METHOD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-stcal-invoke-on-static-calendar-instance"></a>

### `spotbugs/STCAL_INVOKE_ON_STATIC_CALENDAR_INSTANCE`

Stcal invoke on static calendar instance.

- **Allowed form:** Use java.time types (LocalDate, ZonedDateTime) instead of calling a shared static Calendar.
- **Exception:** If this is intended, add `{"rule":"spotbugs/STCAL_INVOKE_ON_STATIC_CALENDAR_INSTANCE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-stcal-invoke-on-static-date-format-instance"></a>

### `spotbugs/STCAL_INVOKE_ON_STATIC_DATE_FORMAT_INSTANCE`

Stcal invoke on static date format instance.

- **Allowed form:** Format with a static final DateTimeFormatter, which is thread-safe, instead of a shared DateFormat.
- **Exception:** If this is intended, add `{"rule":"spotbugs/STCAL_INVOKE_ON_STATIC_DATE_FORMAT_INSTANCE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-stcal-static-calendar-instance"></a>

### `spotbugs/STCAL_STATIC_CALENDAR_INSTANCE`

Stcal static calendar instance.

- **Allowed form:** Replace the static Calendar with java.time types (Instant, LocalDate, ZonedDateTime), which are immutable.
- **Exception:** If this is intended, add `{"rule":"spotbugs/STCAL_STATIC_CALENDAR_INSTANCE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-stcal-static-simple-date-format-instance"></a>

### `spotbugs/STCAL_STATIC_SIMPLE_DATE_FORMAT_INSTANCE`

Stcal static simple date format instance.

- **Allowed form:** Replace the static SimpleDateFormat with a static final DateTimeFormatter, which is thread-safe.
- **Exception:** If this is intended, add `{"rule":"spotbugs/STCAL_STATIC_SIMPLE_DATE_FORMAT_INSTANCE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-sti-interrupted-on-currentthread"></a>

### `spotbugs/STI_INTERRUPTED_ON_CURRENTTHREAD`

Sti interrupted on currentthread.

- **Allowed form:** Call the static Thread.interrupted() directly, or Thread.currentThread().isInterrupted() to read without clearing.
- **Exception:** If this is intended, add `{"rule":"spotbugs/STI_INTERRUPTED_ON_CURRENTTHREAD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-sti-interrupted-on-unknownthread"></a>

### `spotbugs/STI_INTERRUPTED_ON_UNKNOWNTHREAD`

Sti interrupted on unknownthread.

- **Allowed form:** Use thread.isInterrupted() to read another thread's flag; interrupted() always checks the current thread and clears the flag.
- **Exception:** If this is intended, add `{"rule":"spotbugs/STI_INTERRUPTED_ON_UNKNOWNTHREAD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-sw-swing-methods-invoked-in-swing-thread"></a>

### `spotbugs/SW_SWING_METHODS_INVOKED_IN_SWING_THREAD`

Sw swing methods invoked in swing thread.

- **Allowed form:** Build and show Swing components inside SwingUtilities.invokeLater.
- **Exception:** If this is intended, add `{"rule":"spotbugs/SW_SWING_METHODS_INVOKED_IN_SWING_THREAD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-swl-sleep-with-lock-held"></a>

### `spotbugs/SWL_SLEEP_WITH_LOCK_HELD`

Swl sleep with lock held.

- **Allowed form:** Release the lock before Thread.sleep, or wait with a timeout on a Condition (await(time, unit)).
- **Exception:** If this is intended, add `{"rule":"spotbugs/SWL_SLEEP_WITH_LOCK_HELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-testing"></a>

### `spotbugs/TESTING`

Testing.

- **Allowed form:** Nothing is wrong in the code: this is a SpotBugs self-test pattern, which only appears when a testing detector is enabled.
- **Exception:** If this is intended, add `{"rule":"spotbugs/TESTING","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-testing1"></a>

### `spotbugs/TESTING1`

Testing1.

- **Allowed form:** Nothing is wrong in the code: this is a SpotBugs self-test pattern, which only appears when a testing detector is enabled.
- **Exception:** If this is intended, add `{"rule":"spotbugs/TESTING1","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-testing2"></a>

### `spotbugs/TESTING2`

Testing2.

- **Allowed form:** Nothing is wrong in the code: this is a SpotBugs self-test pattern, which only appears when a testing detector is enabled.
- **Exception:** If this is intended, add `{"rule":"spotbugs/TESTING2","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-testing3"></a>

### `spotbugs/TESTING3`

Testing3.

- **Allowed form:** Nothing is wrong in the code: this is a SpotBugs self-test pattern, which only appears when a testing detector is enabled.
- **Exception:** If this is intended, add `{"rule":"spotbugs/TESTING3","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-throws-method-throws-clause-basic-exception"></a>

### `spotbugs/THROWS_METHOD_THROWS_CLAUSE_BASIC_EXCEPTION`

Throws method throws clause basic exception.

- **Allowed form:** Declare the specific checked exception the method throws, such as IOException, not Exception.
- **Exception:** If this is intended, add `{"rule":"spotbugs/THROWS_METHOD_THROWS_CLAUSE_BASIC_EXCEPTION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-throws-method-throws-clause-throwable"></a>

### `spotbugs/THROWS_METHOD_THROWS_CLAUSE_THROWABLE`

Throws method throws clause throwable.

- **Allowed form:** Declare the specific checked exception the method throws, such as IOException, not Throwable.
- **Exception:** If this is intended, add `{"rule":"spotbugs/THROWS_METHOD_THROWS_CLAUSE_THROWABLE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-throws-method-throws-runtimeexception"></a>

### `spotbugs/THROWS_METHOD_THROWS_RUNTIMEEXCEPTION`

Throws method throws runtimeexception.

- **Allowed form:** Throw a specific type instead of new RuntimeException(...): IllegalStateException, IllegalArgumentException, UncheckedIOException or a domain exception.
- **Exception:** If this is intended, add `{"rule":"spotbugs/THROWS_METHOD_THROWS_RUNTIMEEXCEPTION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-tlw-two-lock-wait"></a>

### `spotbugs/TLW_TWO_LOCK_WAIT`

Tlw two lock wait.

- **Allowed form:** Wait while holding only the monitor you wait on; release the outer lock first, or use one lock.
- **Exception:** If this is intended, add `{"rule":"spotbugs/TLW_TWO_LOCK_WAIT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-tq-always-value-used-where-never-required"></a>

### `spotbugs/TQ_ALWAYS_VALUE_USED_WHERE_NEVER_REQUIRED`

Tq always value used where never required.

- **Allowed form:** Pass a value that does not carry the qualifier, or fix the qualifier annotation on the parameter or field.
- **Exception:** If this is intended, add `{"rule":"spotbugs/TQ_ALWAYS_VALUE_USED_WHERE_NEVER_REQUIRED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-tq-comparing-values-with-incompatible-type-qualifiers"></a>

### `spotbugs/TQ_COMPARING_VALUES_WITH_INCOMPATIBLE_TYPE_QUALIFIERS`

Tq comparing values with incompatible type qualifiers.

- **Allowed form:** Compare values with the same type qualifier, or fix the annotations; the two sides can never be equal.
- **Exception:** If this is intended, add `{"rule":"spotbugs/TQ_COMPARING_VALUES_WITH_INCOMPATIBLE_TYPE_QUALIFIERS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-tq-explicit-unknown-source-value-reaches-always-sink"></a>

### `spotbugs/TQ_EXPLICIT_UNKNOWN_SOURCE_VALUE_REACHES_ALWAYS_SINK`

Tq explicit unknown source value reaches always sink.

- **Allowed form:** Remove the unknown-source annotation from the value, or make the source carry the qualifier the sink requires.
- **Exception:** If this is intended, add `{"rule":"spotbugs/TQ_EXPLICIT_UNKNOWN_SOURCE_VALUE_REACHES_ALWAYS_SINK","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-tq-explicit-unknown-source-value-reaches-never-sink"></a>

### `spotbugs/TQ_EXPLICIT_UNKNOWN_SOURCE_VALUE_REACHES_NEVER_SINK`

Tq explicit unknown source value reaches never sink.

- **Allowed form:** Remove the unknown-source annotation from the value, or make the source guarantee it lacks the forbidden qualifier.
- **Exception:** If this is intended, add `{"rule":"spotbugs/TQ_EXPLICIT_UNKNOWN_SOURCE_VALUE_REACHES_NEVER_SINK","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-tq-maybe-source-value-reaches-always-sink"></a>

### `spotbugs/TQ_MAYBE_SOURCE_VALUE_REACHES_ALWAYS_SINK`

Tq maybe source value reaches always sink.

- **Allowed form:** Make the source always carry the qualifier, or validate the value before it reaches the annotated parameter.
- **Exception:** If this is intended, add `{"rule":"spotbugs/TQ_MAYBE_SOURCE_VALUE_REACHES_ALWAYS_SINK","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-tq-maybe-source-value-reaches-never-sink"></a>

### `spotbugs/TQ_MAYBE_SOURCE_VALUE_REACHES_NEVER_SINK`

Tq maybe source value reaches never sink.

- **Allowed form:** Make sure the value never carries the qualifier before it reaches the annotated parameter, or fix the annotations.
- **Exception:** If this is intended, add `{"rule":"spotbugs/TQ_MAYBE_SOURCE_VALUE_REACHES_NEVER_SINK","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-tq-never-value-used-where-always-required"></a>

### `spotbugs/TQ_NEVER_VALUE_USED_WHERE_ALWAYS_REQUIRED`

Tq never value used where always required.

- **Allowed form:** Pass a value that carries the required qualifier, or fix the annotations on the source or the parameter.
- **Exception:** If this is intended, add `{"rule":"spotbugs/TQ_NEVER_VALUE_USED_WHERE_ALWAYS_REQUIRED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-tq-unknown-value-used-where-always-strictly-required"></a>

### `spotbugs/TQ_UNKNOWN_VALUE_USED_WHERE_ALWAYS_STRICTLY_REQUIRED`

Tq unknown value used where always strictly required.

- **Allowed form:** Pass a value from a source annotated with the required qualifier, or convert it through a method that returns the annotated type.
- **Exception:** If this is intended, add `{"rule":"spotbugs/TQ_UNKNOWN_VALUE_USED_WHERE_ALWAYS_STRICTLY_REQUIRED","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-uc-useless-condition"></a>

### `spotbugs/UC_USELESS_CONDITION`

Uc useless condition.

- **Allowed form:** Remove the condition that the known value range makes always true or false, or test the right variable.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UC_USELESS_CONDITION","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-uc-useless-condition-type"></a>

### `spotbugs/UC_USELESS_CONDITION_TYPE`

Uc useless condition type.

- **Allowed form:** Remove the comparison that the variable's type already decides, or compare against the intended variable.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UC_USELESS_CONDITION_TYPE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-uc-useless-object"></a>

### `spotbugs/UC_USELESS_OBJECT`

Uc useless object.

- **Allowed form:** Remove the collection or object that is filled but never read, or return or use it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UC_USELESS_OBJECT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-uc-useless-object-stack"></a>

### `spotbugs/UC_USELESS_OBJECT_STACK`

Uc useless object stack.

- **Allowed form:** Remove the object that is only modified and never read, or use its result.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UC_USELESS_OBJECT_STACK","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-uc-useless-void-method"></a>

### `spotbugs/UC_USELESS_VOID_METHOD`

Uc useless void method.

- **Allowed form:** Delete the void method that does nothing, or give it the intended effect.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UC_USELESS_VOID_METHOD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-ucf-useless-control-flow"></a>

### `spotbugs/UCF_USELESS_CONTROL_FLOW`

Ucf useless control flow.

- **Allowed form:** Remove the if or loop with an empty body, or put the intended statements in it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UCF_USELESS_CONTROL_FLOW","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ucf-useless-control-flow-next-line"></a>

### `spotbugs/UCF_USELESS_CONTROL_FLOW_NEXT_LINE`

Ucf useless control flow next line.

- **Allowed form:** Remove the stray semicolon after the condition, so the if guards the statement on the next line.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UCF_USELESS_CONTROL_FLOW_NEXT_LINE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ug-sync-set-unsync-get"></a>

### `spotbugs/UG_SYNC_SET_UNSYNC_GET`

Ug sync set unsync get.

- **Allowed form:** Make the getter synchronized too, or replace both with a volatile or atomic field.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UG_SYNC_SET_UNSYNC_GET","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ui-inheritance-unsafe-getresource"></a>

### `spotbugs/UI_INHERITANCE_UNSAFE_GETRESOURCE`

Ui inheritance unsafe getresource.

- **Allowed form:** Call Foo.class.getResource(name) with the class literal instead of getClass().getResource(name).
- **Exception:** If this is intended, add `{"rule":"spotbugs/UI_INHERITANCE_UNSAFE_GETRESOURCE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ul-unreleased-lock"></a>

### `spotbugs/UL_UNRELEASED_LOCK`

Ul unreleased lock.

- **Allowed form:** Call lock.lock() just before a try block and put unlock() in its finally.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UL_UNRELEASED_LOCK","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ul-unreleased-lock-exception-path"></a>

### `spotbugs/UL_UNRELEASED_LOCK_EXCEPTION_PATH`

Ul unreleased lock exception path.

- **Allowed form:** Put unlock() in a finally block so every exception path releases the lock.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UL_UNRELEASED_LOCK_EXCEPTION_PATH","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-um-unnecessary-math"></a>

### `spotbugs/UM_UNNECESSARY_MATH`

Um unnecessary math.

- **Allowed form:** Replace the Math call on a constant with its literal result.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UM_UNNECESSARY_MATH","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-umac-uncallable-method-of-anonymous-class"></a>

### `spotbugs/UMAC_UNCALLABLE_METHOD_OF_ANONYMOUS_CLASS`

Umac uncallable method of anonymous class.

- **Allowed form:** Delete the unreachable method, or fix its name and signature so it overrides the supertype method; add @Override.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UMAC_UNCALLABLE_METHOD_OF_ANONYMOUS_CLASS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-unknown"></a>

### `spotbugs/UNKNOWN`

Unknown.

- **Allowed form:** SpotBugs reported a pattern it has no description for; read the bug type in the report and fix or except it like any other finding.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UNKNOWN","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-upm-uncalled-private-method"></a>

### `spotbugs/UPM_UNCALLED_PRIVATE_METHOD`

Upm uncalled private method.

- **Allowed form:** Delete the private method that nothing calls.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UPM_UNCALLED_PRIVATE_METHOD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-ur-uninit-read"></a>

### `spotbugs/UR_UNINIT_READ`

Ur uninit read.

- **Allowed form:** Assign the field in the constructor before it is read, or make it final and set it from a parameter.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UR_UNINIT_READ","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ur-uninit-read-called-from-super-constructor"></a>

### `spotbugs/UR_UNINIT_READ_CALLED_FROM_SUPER_CONSTRUCTOR`

Ur uninit read called from super constructor.

- **Allowed form:** Do not call overridable methods from a constructor; make the method final or private, or move the call to a factory.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UR_UNINIT_READ_CALLED_FROM_SUPER_CONSTRUCTOR","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-urf-unread-field"></a>

### `spotbugs/URF_UNREAD_FIELD`

Urf unread field.

- **Allowed form:** Delete the field that is written but never read, or read it where the value is needed.
- **Exception:** If this is intended, add `{"rule":"spotbugs/URF_UNREAD_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-urf-unread-public-or-protected-field"></a>

### `spotbugs/URF_UNREAD_PUBLIC_OR_PROTECTED_FIELD`

Urf unread public or protected field.

- **Allowed form:** Delete the field that is written but never read, or read it where the value is needed.
- **Exception:** If this is intended, add `{"rule":"spotbugs/URF_UNREAD_PUBLIC_OR_PROTECTED_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-us-useless-suppression-on-class"></a>

### `spotbugs/US_USELESS_SUPPRESSION_ON_CLASS`

Us useless suppression on class.

- **Allowed form:** Delete the SuppressFBWarnings annotation on the class; it suppresses nothing.
- **Exception:** If this is intended, add `{"rule":"spotbugs/US_USELESS_SUPPRESSION_ON_CLASS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-us-useless-suppression-on-field"></a>

### `spotbugs/US_USELESS_SUPPRESSION_ON_FIELD`

Us useless suppression on field.

- **Allowed form:** Delete the SuppressFBWarnings annotation on the field; it suppresses nothing.
- **Exception:** If this is intended, add `{"rule":"spotbugs/US_USELESS_SUPPRESSION_ON_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-us-useless-suppression-on-method"></a>

### `spotbugs/US_USELESS_SUPPRESSION_ON_METHOD`

Us useless suppression on method.

- **Allowed form:** Delete the SuppressFBWarnings annotation on the method; it suppresses nothing.
- **Exception:** If this is intended, add `{"rule":"spotbugs/US_USELESS_SUPPRESSION_ON_METHOD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-us-useless-suppression-on-method-parameter"></a>

### `spotbugs/US_USELESS_SUPPRESSION_ON_METHOD_PARAMETER`

Us useless suppression on method parameter.

- **Allowed form:** Delete the SuppressFBWarnings annotation on the parameter; it suppresses nothing.
- **Exception:** If this is intended, add `{"rule":"spotbugs/US_USELESS_SUPPRESSION_ON_METHOD_PARAMETER","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-us-useless-suppression-on-package"></a>

### `spotbugs/US_USELESS_SUPPRESSION_ON_PACKAGE`

Us useless suppression on package.

- **Allowed form:** Delete the SuppressFBWarnings annotation on the package; it suppresses nothing.
- **Exception:** If this is intended, add `{"rule":"spotbugs/US_USELESS_SUPPRESSION_ON_PACKAGE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-usc-potential-security-check-based-on-untrusted-source"></a>

### `spotbugs/USC_POTENTIAL_SECURITY_CHECK_BASED_ON_UNTRUSTED_SOURCE`

Usc potential security check based on untrusted source.

- **Allowed form:** Make a defensive copy of the untrusted value before the security check, then use only the copy afterward.
- **Exception:** If this is intended, add `{"rule":"spotbugs/USC_POTENTIAL_SECURITY_CHECK_BASED_ON_UNTRUSTED_SOURCE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-usm-useless-abstract-method"></a>

### `spotbugs/USM_USELESS_ABSTRACT_METHOD`

Usm useless abstract method.

- **Allowed form:** Delete the abstract method; the implemented interface already declares it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/USM_USELESS_ABSTRACT_METHOD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-usm-useless-subclass-method"></a>

### `spotbugs/USM_USELESS_SUBCLASS_METHOD`

Usm useless subclass method.

- **Allowed form:** Delete the override that only calls super with the same arguments.
- **Exception:** If this is intended, add `{"rule":"spotbugs/USM_USELESS_SUBCLASS_METHOD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-uuf-unused-field"></a>

### `spotbugs/UUF_UNUSED_FIELD`

Uuf unused field.

- **Allowed form:** Delete the field that is never used.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UUF_UNUSED_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-uuf-unused-public-or-protected-field"></a>

### `spotbugs/UUF_UNUSED_PUBLIC_OR_PROTECTED_FIELD`

Uuf unused public or protected field.

- **Allowed form:** Delete the field that is never used, or make it private if only the class needs it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UUF_UNUSED_PUBLIC_OR_PROTECTED_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-uw-uncond-wait"></a>

### `spotbugs/UW_UNCOND_WAIT`

Uw uncond wait.

- **Allowed form:** Test the condition under the lock and call wait only while it is false, inside a while loop.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UW_UNCOND_WAIT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-uwf-field-not-initialized-in-constructor"></a>

### `spotbugs/UWF_FIELD_NOT_INITIALIZED_IN_CONSTRUCTOR`

Uwf field not initialized in constructor.

- **Allowed form:** Assign the field in every constructor and make it private final, so it is never null when dereferenced.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UWF_FIELD_NOT_INITIALIZED_IN_CONSTRUCTOR","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-uwf-null-field"></a>

### `spotbugs/UWF_NULL_FIELD`

Uwf null field.

- **Allowed form:** Assign a non-null value to the field somewhere, or delete the field; it is only ever null.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UWF_NULL_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-uwf-unwritten-field"></a>

### `spotbugs/UWF_UNWRITTEN_FIELD`

Uwf unwritten field.

- **Allowed form:** Assign the field somewhere, or delete it; reading a never-written field always yields null or zero.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UWF_UNWRITTEN_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-uwf-unwritten-public-or-protected-field"></a>

### `spotbugs/UWF_UNWRITTEN_PUBLIC_OR_PROTECTED_FIELD`

Uwf unwritten public or protected field.

- **Allowed form:** Assign the field in the constructor and make it private final, or remove it if nothing sets it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/UWF_UNWRITTEN_PUBLIC_OR_PROTECTED_FIELD","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-va-format-string-uses-newline"></a>

### `spotbugs/VA_FORMAT_STRING_USES_NEWLINE`

Va format string uses newline.

- **Exception:** If this is intended, add `{"rule":"spotbugs/VA_FORMAT_STRING_USES_NEWLINE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-va-primitive-array-passed-to-object-vararg"></a>

### `spotbugs/VA_PRIMITIVE_ARRAY_PASSED_TO_OBJECT_VARARG`

Va primitive array passed to object vararg.

- **Allowed form:** Pass a boxed array (Integer[]) or the elements individually; a primitive array arrives as one Object argument.
- **Exception:** If this is intended, add `{"rule":"spotbugs/VA_PRIMITIVE_ARRAY_PASSED_TO_OBJECT_VARARG","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-vo-volatile-increment"></a>

### `spotbugs/VO_VOLATILE_INCREMENT`

Vo volatile increment.

- **Allowed form:** Use AtomicInteger or AtomicLong (incrementAndGet) instead of ++ on a volatile field.
- **Exception:** If this is intended, add `{"rule":"spotbugs/VO_VOLATILE_INCREMENT","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-vo-volatile-reference-to-array"></a>

### `spotbugs/VO_VOLATILE_REFERENCE_TO_ARRAY`

Vo volatile reference to array.

- **Allowed form:** Use AtomicReferenceArray or replace the whole array with a copy; volatile covers the reference, not the elements.
- **Exception:** If this is intended, add `{"rule":"spotbugs/VO_VOLATILE_REFERENCE_TO_ARRAY","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-vr-unresolvable-reference"></a>

### `spotbugs/VR_UNRESOLVABLE_REFERENCE`

Vr unresolvable reference.

- **Allowed form:** Add the missing class to the analysis classpath (the dependency in build.gradle), or remove the reference to it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/VR_UNRESOLVABLE_REFERENCE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-vsc-vulnerable-security-check-methods"></a>

### `spotbugs/VSC_VULNERABLE_SECURITY_CHECK_METHODS`

Vsc vulnerable security check methods.

- **Allowed form:** Make the security-checked method private or final, so a subclass cannot override it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/VSC_VULNERABLE_SECURITY_CHECK_METHODS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-wa-await-not-in-loop"></a>

### `spotbugs/WA_AWAIT_NOT_IN_LOOP`

Wa await not in loop.

- **Allowed form:** Call Condition.await inside a while loop that rechecks the condition after waking.
- **Exception:** If this is intended, add `{"rule":"spotbugs/WA_AWAIT_NOT_IN_LOOP","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-wa-not-in-loop"></a>

### `spotbugs/WA_NOT_IN_LOOP`

Wa not in loop.

- **Allowed form:** Call wait inside a while loop that rechecks the condition after waking.
- **Exception:** If this is intended, add `{"rule":"spotbugs/WA_NOT_IN_LOOP","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-wl-using-getclass-rather-than-class-literal"></a>

### `spotbugs/WL_USING_GETCLASS_RATHER_THAN_CLASS_LITERAL`

Wl using getclass rather than class literal.

- **Allowed form:** Synchronize on the class literal Foo.class, or better a private static final lock Object, not getClass().
- **Exception:** If this is intended, add `{"rule":"spotbugs/WL_USING_GETCLASS_RATHER_THAN_CLASS_LITERAL","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-wmi-wrong-map-iterator"></a>

### `spotbugs/WMI_WRONG_MAP_ITERATOR`

Wmi wrong map iterator.

- **Allowed form:** Iterate map.entrySet() and read getKey() and getValue() instead of iterating keySet() and calling get(key).
- **Exception:** If this is intended, add `{"rule":"spotbugs/WMI_WRONG_MAP_ITERATOR","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-ws-writeobject-sync"></a>

### `spotbugs/WS_WRITEOBJECT_SYNC`

Ws writeobject sync.

- **Allowed form:** Remove synchronized from writeObject, or synchronize the other methods that touch the same state.
- **Exception:** If this is intended, add `{"rule":"spotbugs/WS_WRITEOBJECT_SYNC","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-xfb-xml-factory-bypass"></a>

### `spotbugs/XFB_XML_FACTORY_BYPASS`

Xfb xml factory bypass.

- **Allowed form:** Create XML objects through the factory (DocumentBuilderFactory, SAXParserFactory, TransformerFactory), not by instantiating an implementation class.
- **Exception:** If this is intended, add `{"rule":"spotbugs/XFB_XML_FACTORY_BYPASS","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-xss-request-parameter-to-jsp-writer"></a>

### `spotbugs/XSS_REQUEST_PARAMETER_TO_JSP_WRITER`

Xss request parameter to jsp writer.

- **Allowed form:** Escape the request value for HTML output, or use a templating layer that escapes by default, before writing it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/XSS_REQUEST_PARAMETER_TO_JSP_WRITER","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-xss-request-parameter-to-send-error"></a>

### `spotbugs/XSS_REQUEST_PARAMETER_TO_SEND_ERROR`

Xss request parameter to send error.

- **Allowed form:** Do not put the request value in the error message; send a fixed message, or escape the value for HTML first.
- **Exception:** If this is intended, add `{"rule":"spotbugs/XSS_REQUEST_PARAMETER_TO_SEND_ERROR","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="spotbugs-xss-request-parameter-to-servlet-writer"></a>

### `spotbugs/XSS_REQUEST_PARAMETER_TO_SERVLET_WRITER`

Xss request parameter to servlet writer.

- **Allowed form:** Escape the request value for HTML output, or use a templating layer that escapes by default, before writing it.
- **Exception:** If this is intended, add `{"rule":"spotbugs/XSS_REQUEST_PARAMETER_TO_SERVLET_WRITER","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
