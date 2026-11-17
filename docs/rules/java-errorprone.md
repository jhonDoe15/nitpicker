# Java and Kotlin: Error Prone checks A to L

The Error Prone checks from A to L that the Java and Kotlin presets compile Java sources with: Java with Gradle or Maven, Kotlin with Gradle. This page lists 310 rules. [All pages](README.md).

The guide for these rules: [docs/java-preset/error-prone-and-nullaway.md](../java-preset/error-prone-and-nullaway.md).

The summaries are from Error Prone and NullAway 2.50.0 (NullAway 0.14.2): Error Prone is under the Apache License 2.0 and NullAway under the MIT License.

In the Java preset, an entry of `exceptions` names a finding as it prints, `<tool>/<rule>` with one of the tools `pmd`, `spotbugs`, `errorprone`, `archunit`, `effects`, `google-java-format`, `palantir-java-format`, `jacoco`, `checkstyle`, `crap`, `duplicates`, `pit`, `structure`, `coupling`, `javac`, `forbiddenapis`, `dependencies`, `spring` and `test-runtime`, or one of these rules: `function-lines-limit`, `function-statements-limit`, `function-control-nesting-limit`, `function-parameters-limit`, `crap-score-limit`, `crap-coverage-unknown`, `changed-branch-coverage`, `mutant-survived`, `mutant-nocoverage`, `duplicate-clone`, `stability-direction`, `package-cycle`, `no-production-runtime`, `file-lines-limit`, `line-length-limit`, `folder-files-limit`, `slow-test`, `committed-env-file`, `committed-private-key`, `committed-binary`, `large-file`, `committed-build-output`, `migration-order`, `migration-hardcoded-name`, `start-schema-push`, `foreign-key-index`, `field-limit-mismatch`, `co-change`, `duplicate-definition`, `exported-name-collision`, `sibling-copy-edit`, `near-duplicate`, `decided-condition`, `duplicate-branch`, `result-slip`, `integer-slip`, `shorter-condition`, `shared-used-by-one-feature`, `feature-internal-import`, `shared-imports-feature`, `feature-cycle`, `foreign-feature-persistence`, `public-alternative-bypass`, `test-only-export`, `doc-comment-content`, `test-console-output`, `mutable-state-escape`, `context-threading`, `caller-protocol`, `protocol-contract`, `forwarding-chain`, `disjoint-consumer-groups`, `data-clump`, `repeated-policy-decision`, `foreign-state-decision`, `folder-depth-limit`, `class-methods-limit`, `class-fields-limit` and `inheritance-depth-limit`. The Kotlin preset takes the same `<tool>/<rule>` form for the Java sources of a mixed module.

Unless an entry says otherwise:

- **Presets:** Java and Kotlin
- **Analyzers:** `java` (Java); `kotlin` (Kotlin)
- **Builds:** Gradle and Maven

<a id="errorprone-addressselection"></a>

### `errorprone/AddressSelection`

Prefer InetAddress.getAllByName to APIs that convert a hostname to a single IP address.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AddressSelection).
- **Fix:** With `nitpicker --fix --rule errorprone/AddressSelection`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/AddressSelection","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AddressSelection)

<a id="errorprone-almostjavadoc"></a>

### `errorprone/AlmostJavadoc`

This comment contains Javadoc or HTML tags, but isn't started with a double asterisk (/\*\*); is it meant to be Javadoc?

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AlmostJavadoc).
- **Fix:** With `nitpicker --fix --rule errorprone/AlmostJavadoc`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/AlmostJavadoc","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AlmostJavadoc)

<a id="errorprone-alreadychecked"></a>

### `errorprone/AlreadyChecked`

This condition has already been checked.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AlreadyChecked).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/AlreadyChecked","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AlreadyChecked)

<a id="errorprone-alwaysthrows"></a>

### `errorprone/AlwaysThrows`

Statically detects calls that will always fail at runtime.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AlwaysThrows).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/AlwaysThrows","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AlwaysThrows)

<a id="errorprone-ambiguousmethodreference"></a>

### `errorprone/AmbiguousMethodReference`

Method reference is ambiguous.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AmbiguousMethodReference).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/AmbiguousMethodReference","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AmbiguousMethodReference)

<a id="errorprone-androidinjectionbeforesuper"></a>

### `errorprone/AndroidInjectionBeforeSuper`

AndroidInjection.inject() should always be invoked before calling super.lifecycleMethod().

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AndroidInjectionBeforeSuper).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/AndroidInjectionBeforeSuper","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AndroidInjectionBeforeSuper)

<a id="errorprone-annotationposition"></a>

### `errorprone/AnnotationPosition`

Annotations should be positioned after Javadocs, but before modifiers.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s4.8.5-annotations).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/AnnotationPosition","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s4.8.5-annotations)

<a id="errorprone-argumentselectiondefectchecker"></a>

### `errorprone/ArgumentSelectionDefectChecker`

Arguments are in the wrong order or could be commented for clarity.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ArgumentSelectionDefectChecker).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/ArgumentSelectionDefectChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ArgumentSelectionDefectChecker)

<a id="errorprone-arrayaskeyofsetormap"></a>

### `errorprone/ArrayAsKeyOfSetOrMap`

Arrays do not override equals() or hashCode, so comparisons will be done on reference equality only. If neither deduplication nor lookup are needed, consider using a List instead. Otherwise, use IdentityHashMap/Set, a Map from a library that handles object arrays, or an Iterable/List of pairs.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ArrayAsKeyOfSetOrMap).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/ArrayAsKeyOfSetOrMap","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ArrayAsKeyOfSetOrMap)

<a id="errorprone-arrayequals"></a>

### `errorprone/ArrayEquals`

Reference equality used to compare arrays.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ArrayEquals).
- **Fix:** With `nitpicker --fix --rule errorprone/ArrayEquals`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ArrayEquals","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ArrayEquals)

<a id="errorprone-arrayfillincompatibletype"></a>

### `errorprone/ArrayFillIncompatibleType`

Arrays.fill(Object[], Object) called with incompatible types.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ArrayFillIncompatibleType).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/ArrayFillIncompatibleType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ArrayFillIncompatibleType)

<a id="errorprone-arrayhashcode"></a>

### `errorprone/ArrayHashCode`

Hashcode method on array does not hash array contents.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ArrayHashCode).
- **Fix:** With `nitpicker --fix --rule errorprone/ArrayHashCode`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ArrayHashCode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ArrayHashCode)

<a id="errorprone-arrayrecordcomponent"></a>

### `errorprone/ArrayRecordComponent`

Record components should not be arrays.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ArrayRecordComponent).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/ArrayRecordComponent","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ArrayRecordComponent)

<a id="errorprone-arraysaslistprimitivearray"></a>

### `errorprone/ArraysAsListPrimitiveArray`

Arrays.asList does not autobox primitive arrays, as one might expect.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ArraysAsListPrimitiveArray).
- **Fix:** With `nitpicker --fix --rule errorprone/ArraysAsListPrimitiveArray`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ArraysAsListPrimitiveArray","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ArraysAsListPrimitiveArray)

<a id="errorprone-arraytostring"></a>

### `errorprone/ArrayToString`

Calling toString on an array does not provide useful information.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ArrayToString).
- **Fix:** With `nitpicker --fix --rule errorprone/ArrayToString`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ArrayToString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ArrayToString)

<a id="errorprone-assertequalsargumentorderchecker"></a>

### `errorprone/AssertEqualsArgumentOrderChecker`

Arguments are swapped in assertEquals-like call.

- **Labels:** bug, tests
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AssertEqualsArgumentOrderChecker).
- **Fix:** With `nitpicker --fix --rule errorprone/AssertEqualsArgumentOrderChecker`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/AssertEqualsArgumentOrderChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AssertEqualsArgumentOrderChecker)

<a id="errorprone-assertfalse"></a>

### `errorprone/AssertFalse`

Assertions may be disabled at runtime and do not guarantee that execution will halt here; consider throwing an exception instead.

- **Labels:** tests, bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AssertFalse).
- **Fix:** With `nitpicker --fix --rule errorprone/AssertFalse`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/AssertFalse","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AssertFalse)

<a id="errorprone-assertionfailureignored"></a>

### `errorprone/AssertionFailureIgnored`

This assertion throws an AssertionError if it fails, which will be caught by an enclosing try block.

- **Labels:** bug, tests
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AssertionFailureIgnored).
- **Fix:** With `nitpicker --fix --rule errorprone/AssertionFailureIgnored`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/AssertionFailureIgnored","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AssertionFailureIgnored)

<a id="errorprone-assertsameincompatible"></a>

### `errorprone/AssertSameIncompatible`

The types passed to this assertion are incompatible.

- **Labels:** bug, tests
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AssertSameIncompatible).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/AssertSameIncompatible","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AssertSameIncompatible)

<a id="errorprone-assertthrowsblocktoexpression"></a>

### `errorprone/AssertThrowsBlockToExpression`

AssertThrows calls with lambdas containing a single statement can be expressed more concisely.

- **Labels:** tests, style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AssertThrowsBlockToExpression).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/AssertThrowsBlockToExpression","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AssertThrowsBlockToExpression)

<a id="errorprone-assertthrowsminimizer"></a>

### `errorprone/AssertThrowsMinimizer`

Minimize the amount of logic in assertThrows.

- **Labels:** tests
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AssertThrowsMinimizer).
- **Fix:** With `nitpicker --fix --rule errorprone/AssertThrowsMinimizer`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/AssertThrowsMinimizer","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AssertThrowsMinimizer)

<a id="errorprone-assertthrowsmultiplestatements"></a>

### `errorprone/AssertThrowsMultipleStatements`

The lambda passed to assertThrows should contain exactly one statement.

- **Labels:** tests
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AssertThrowsMultipleStatements).
- **Fix:** With `nitpicker --fix --rule errorprone/AssertThrowsMultipleStatements`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/AssertThrowsMultipleStatements","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AssertThrowsMultipleStatements)

<a id="errorprone-assignmentexpression"></a>

### `errorprone/AssignmentExpression`

The use of an assignment expression can be surprising and hard to read; consider factoring out the assignment to a separate statement.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AssignmentExpression).
- **Fix:** With `nitpicker --fix --rule errorprone/AssignmentExpression`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/AssignmentExpression","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AssignmentExpression)

<a id="errorprone-assistedinjectandinjectonconstructors"></a>

### `errorprone/AssistedInjectAndInjectOnConstructors`

@AssistedInject and @Inject should not be used on different constructors in the same class.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AssistedInjectAndInjectOnConstructors).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/AssistedInjectAndInjectOnConstructors","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AssistedInjectAndInjectOnConstructors)

<a id="errorprone-assistedinjectandinjectonsameconstructor"></a>

### `errorprone/AssistedInjectAndInjectOnSameConstructor`

@AssistedInject and @Inject cannot be used on the same constructor.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AssistedInjectAndInjectOnSameConstructor).
- **Fix:** With `nitpicker --fix --rule errorprone/AssistedInjectAndInjectOnSameConstructor`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/AssistedInjectAndInjectOnSameConstructor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AssistedInjectAndInjectOnSameConstructor)

<a id="errorprone-asthelperssuggestions"></a>

### `errorprone/ASTHelpersSuggestions`

Prefer ASTHelpers instead of calling this API directly.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ASTHelpersSuggestions).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/ASTHelpersSuggestions","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ASTHelpersSuggestions)

<a id="errorprone-asynccallablereturnsnull"></a>

### `errorprone/AsyncCallableReturnsNull`

AsyncCallable should not return a null Future, only a Future whose result is null.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AsyncCallableReturnsNull).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/AsyncCallableReturnsNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AsyncCallableReturnsNull)

<a id="errorprone-asyncfunctionreturnsnull"></a>

### `errorprone/AsyncFunctionReturnsNull`

AsyncFunction should not return a null Future, only a Future whose result is null.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AsyncFunctionReturnsNull).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/AsyncFunctionReturnsNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AsyncFunctionReturnsNull)

<a id="errorprone-attemptednegativezero"></a>

### `errorprone/AttemptedNegativeZero`

-0 is the same as 0. For the floating-point negative zero, use -0.0.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AttemptedNegativeZero).
- **Fix:** With `nitpicker --fix --rule errorprone/AttemptedNegativeZero`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/AttemptedNegativeZero","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AttemptedNegativeZero)

<a id="errorprone-autofactoryatinject"></a>

### `errorprone/AutoFactoryAtInject`

@AutoFactory and @Inject should not be used in the same type.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AutoFactoryAtInject).
- **Fix:** With `nitpicker --fix --rule errorprone/AutoFactoryAtInject`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/AutoFactoryAtInject","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AutoFactoryAtInject)

<a id="errorprone-autovalueboxedvalues"></a>

### `errorprone/AutoValueBoxedValues`

AutoValue instances should not usually contain boxed types that are not Nullable. We recommend removing the unnecessary boxing.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AutoValueBoxedValues).
- **Fix:** With `nitpicker --fix --rule errorprone/AutoValueBoxedValues`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/AutoValueBoxedValues","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AutoValueBoxedValues)

<a id="errorprone-autovaluebuilderdefaultsinconstructor"></a>

### `errorprone/AutoValueBuilderDefaultsInConstructor`

Defaults for AutoValue Builders should be set in the factory method returning Builder instances, not the constructor.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AutoValueBuilderDefaultsInConstructor).
- **Fix:** With `nitpicker --fix --rule errorprone/AutoValueBuilderDefaultsInConstructor`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/AutoValueBuilderDefaultsInConstructor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AutoValueBuilderDefaultsInConstructor)

<a id="errorprone-autovalueconstructororderchecker"></a>

### `errorprone/AutoValueConstructorOrderChecker`

Arguments to AutoValue constructor are in the wrong order.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AutoValueConstructorOrderChecker).
- **Fix:** With `nitpicker --fix --rule errorprone/AutoValueConstructorOrderChecker`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/AutoValueConstructorOrderChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AutoValueConstructorOrderChecker)

<a id="errorprone-autovaluefinalmethods"></a>

### `errorprone/AutoValueFinalMethods`

Make toString(), hashCode() and equals() final in AutoValue classes, so it is clear to readers that AutoValue is not overriding them.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AutoValueFinalMethods).
- **Fix:** With `nitpicker --fix --rule errorprone/AutoValueFinalMethods`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/AutoValueFinalMethods","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AutoValueFinalMethods)

<a id="errorprone-autovalueimmutablefields"></a>

### `errorprone/AutoValueImmutableFields`

AutoValue recommends using immutable collections.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AutoValueImmutableFields).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/AutoValueImmutableFields","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AutoValueImmutableFields)

<a id="errorprone-autovaluesubclassleaked"></a>

### `errorprone/AutoValueSubclassLeaked`

Do not refer to the autogenerated AutoValue\_ class outside the file containing the corresponding @AutoValue base class.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AutoValueSubclassLeaked).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/AutoValueSubclassLeaked","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AutoValueSubclassLeaked)

<a id="errorprone-avoidcommontypenames"></a>

### `errorprone/AvoidCommonTypeNames`

Never reuse class names from java.lang.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AvoidCommonTypeNames).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/AvoidCommonTypeNames","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AvoidCommonTypeNames)

<a id="errorprone-avoidvaluesetter"></a>

### `errorprone/AvoidValueSetter`

Prefer using the enum-accepting rather than the int-accepting setter for enum fields.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AvoidValueSetter).
- **Fix:** With `nitpicker --fix --rule errorprone/AvoidValueSetter`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/AvoidValueSetter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AvoidValueSetter)

<a id="errorprone-badannotationimplementation"></a>

### `errorprone/BadAnnotationImplementation`

Classes that implement Annotation must override equals and hashCode. Consider using AutoAnnotation instead of implementing Annotation by hand.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BadAnnotationImplementation).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/BadAnnotationImplementation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BadAnnotationImplementation)

<a id="errorprone-badcomparable"></a>

### `errorprone/BadComparable`

Possible sign flip from narrowing conversion.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BadComparable).
- **Fix:** With `nitpicker --fix --rule errorprone/BadComparable`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/BadComparable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BadComparable)

<a id="errorprone-badimport"></a>

### `errorprone/BadImport`

Importing nested classes/static methods/static fields with commonly-used names can make code harder to read, because it may not be clear from the context exactly which type is being referred to. Qualifying the name with that of the containing class can make the code clearer.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BadImport).
- **Fix:** With `nitpicker --fix --rule errorprone/BadImport`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/BadImport","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BadImport)

<a id="errorprone-badinstanceof"></a>

### `errorprone/BadInstanceof`

Instanceof used in a way that is equivalent to a null check.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BadInstanceof).
- **Fix:** With `nitpicker --fix --rule errorprone/BadInstanceof`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/BadInstanceof","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BadInstanceof)

<a id="errorprone-badshiftamount"></a>

### `errorprone/BadShiftAmount`

Shift by an amount that is out of range.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BadShiftAmount).
- **Fix:** With `nitpicker --fix --rule errorprone/BadShiftAmount`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/BadShiftAmount","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BadShiftAmount)

<a id="errorprone-banclassloader"></a>

### `errorprone/BanClassLoader`

Using dangerous ClassLoader APIs may deserialize untrusted user input into bytecode, leading to remote code execution vulnerabilities.

- **Labels:** security
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BanClassLoader).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/BanClassLoader","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BanClassLoader)

<a id="errorprone-banjndi"></a>

### `errorprone/BanJNDI`

Using JNDI may deserialize user input via the `Serializable` API which is extremely dangerous.

- **Labels:** security
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BanJNDI).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/BanJNDI","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BanJNDI)

<a id="errorprone-banserializableread"></a>

### `errorprone/BanSerializableRead`

Deserializing user input via the `Serializable` API is extremely dangerous.

- **Labels:** security
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BanSerializableRead).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/BanSerializableRead","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BanSerializableRead)

<a id="errorprone-baredotmetacharacter"></a>

### `errorprone/BareDotMetacharacter`

"." is rarely useful as a regex, as it matches any character. To match a literal '.' character, instead write "\\.".

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BareDotMetacharacter).
- **Fix:** With `nitpicker --fix --rule errorprone/BareDotMetacharacter`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/BareDotMetacharacter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BareDotMetacharacter)

<a id="errorprone-bigdecimalequals"></a>

### `errorprone/BigDecimalEquals`

BigDecimal#equals has surprising behavior: it also compares scale.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BigDecimalEquals).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/BigDecimalEquals","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BigDecimalEquals)

<a id="errorprone-bigdecimalliteraldouble"></a>

### `errorprone/BigDecimalLiteralDouble`

New BigDecimal(double) loses precision in this case.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BigDecimalLiteralDouble).
- **Fix:** With `nitpicker --fix --rule errorprone/BigDecimalLiteralDouble`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/BigDecimalLiteralDouble","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BigDecimalLiteralDouble)

<a id="errorprone-binderidentityrestoreddangerously"></a>

### `errorprone/BinderIdentityRestoredDangerously`

A call to Binder.clearCallingIdentity() should be followed by Binder.restoreCallingIdentity() in a finally block. Otherwise the wrong Binder identity may be used by subsequent code.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BinderIdentityRestoredDangerously).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/BinderIdentityRestoredDangerously","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BinderIdentityRestoredDangerously)

<a id="errorprone-bindingtounqualifiedcommontype"></a>

### `errorprone/BindingToUnqualifiedCommonType`

This code declares a binding for a common value type without a Qualifier annotation.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BindingToUnqualifiedCommonType).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/BindingToUnqualifiedCommonType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BindingToUnqualifiedCommonType)

<a id="errorprone-booleanliteral"></a>

### `errorprone/BooleanLiteral`

This expression can be written more clearly with a boolean literal.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BooleanLiteral).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/BooleanLiteral","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BooleanLiteral)

<a id="errorprone-boxedprimitiveconstructor"></a>

### `errorprone/BoxedPrimitiveConstructor`

ValueOf or autoboxing provides better time and space performance.

- **Labels:** performance
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BoxedPrimitiveConstructor).
- **Fix:** With `nitpicker --fix --rule errorprone/BoxedPrimitiveConstructor`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/BoxedPrimitiveConstructor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BoxedPrimitiveConstructor)

<a id="errorprone-boxedprimitiveequality"></a>

### `errorprone/BoxedPrimitiveEquality`

Comparison using reference equality instead of value equality. Reference equality of boxed primitive types is usually not useful, as they are value objects, and it is bug-prone, as instances are cached for some values but not others.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BoxedPrimitiveEquality).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/BoxedPrimitiveEquality","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BoxedPrimitiveEquality)

<a id="errorprone-boxingcomparator"></a>

### `errorprone/BoxingComparator`

Comparator.comparing unnecessarily boxes numerical primitives.

- **Labels:** performance
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BoxingComparator).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/BoxingComparator","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BoxingComparator)

<a id="errorprone-bugpatternnaming"></a>

### `errorprone/BugPatternNaming`

Giving BugPatterns a name different to the enclosing class can be confusing.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BugPatternNaming).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/BugPatternNaming","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BugPatternNaming)

<a id="errorprone-builderreturnthis"></a>

### `errorprone/BuilderReturnThis`

Builder instance method does not return 'this'.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BuilderReturnThis).
- **Fix:** With `nitpicker --fix --rule errorprone/BuilderReturnThis`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/BuilderReturnThis","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BuilderReturnThis)

<a id="errorprone-bundledeserializationcast"></a>

### `errorprone/BundleDeserializationCast`

Object serialized in Bundle may have been flattened to base type.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BundleDeserializationCast).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/BundleDeserializationCast","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BundleDeserializationCast)

<a id="errorprone-bytebufferbackingarray"></a>

### `errorprone/ByteBufferBackingArray`

ByteBuffer.array() shouldn't be called unless ByteBuffer.arrayOffset() is used or if the ByteBuffer was initialized using ByteBuffer.wrap() or ByteBuffer.allocate().

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ByteBufferBackingArray).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/ByteBufferBackingArray","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ByteBufferBackingArray)

<a id="errorprone-cacheloadernull"></a>

### `errorprone/CacheLoaderNull`

The result of CacheLoader#load must be non-null.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/CacheLoaderNull).
- **Fix:** With `nitpicker --fix --rule errorprone/CacheLoaderNull`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/CacheLoaderNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CacheLoaderNull)

<a id="errorprone-canonicalduration"></a>

### `errorprone/CanonicalDuration`

Duration can be expressed more clearly with different units.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/CanonicalDuration).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/CanonicalDuration","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CanonicalDuration)

<a id="errorprone-catchandprintstacktrace"></a>

### `errorprone/CatchAndPrintStackTrace`

Logging or rethrowing exceptions should usually be preferred to catching and calling printStackTrace.

- **Labels:** reliability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/CatchAndPrintStackTrace).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/CatchAndPrintStackTrace","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CatchAndPrintStackTrace)

<a id="errorprone-catchfail"></a>

### `errorprone/CatchFail`

Ignoring exceptions and calling fail() is unnecessary, and makes test output less useful.

- **Labels:** tests, simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/CatchFail).
- **Fix:** With `nitpicker --fix --rule errorprone/CatchFail`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/CatchFail","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CatchFail)

<a id="errorprone-chainedassertionlosescontext"></a>

### `errorprone/ChainedAssertionLosesContext`

Inside a Subject, use check(...) instead of assert\*() to preserve user-supplied messages and other settings.

- **Labels:** tests
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ChainedAssertionLosesContext).
- **Fix:** With `nitpicker --fix --rule errorprone/ChainedAssertionLosesContext`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ChainedAssertionLosesContext","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ChainedAssertionLosesContext)

<a id="errorprone-chainingconstructorignoresparameter"></a>

### `errorprone/ChainingConstructorIgnoresParameter`

The called constructor accepts a parameter with the same name and type as one of its caller's parameters, but its caller doesn't pass that parameter to it. It's likely that it was intended to.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ChainingConstructorIgnoresParameter).
- **Fix:** With `nitpicker --fix --rule errorprone/ChainingConstructorIgnoresParameter`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ChainingConstructorIgnoresParameter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ChainingConstructorIgnoresParameter)

<a id="errorprone-charactergetnumericvalue"></a>

### `errorprone/CharacterGetNumericValue`

GetNumericValue has unexpected behaviour: it interprets A-Z as base-36 digits with values 10-35, but also supports non-arabic numerals and miscellaneous numeric unicode characters like ㊷; consider using Character.digit or UCharacter.getUnicodeNumericValue instead.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/CharacterGetNumericValue).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/CharacterGetNumericValue","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CharacterGetNumericValue)

<a id="errorprone-checkedexceptionnotthrown"></a>

### `errorprone/CheckedExceptionNotThrown`

This method cannot throw a checked exception that it claims to. This may cause consumers of the API to incorrectly attempt to handle, or propagate, this exception.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/CheckedExceptionNotThrown).
- **Fix:** With `nitpicker --fix --rule errorprone/CheckedExceptionNotThrown`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/CheckedExceptionNotThrown","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CheckedExceptionNotThrown)

<a id="errorprone-checknotnullmultipletimes"></a>

### `errorprone/CheckNotNullMultipleTimes`

A variable was checkNotNulled multiple times. Did you mean to check something else?

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/CheckNotNullMultipleTimes).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/CheckNotNullMultipleTimes","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CheckNotNullMultipleTimes)

<a id="errorprone-checkreturnvalue"></a>

### `errorprone/CheckReturnValue`

The result of this call must be used.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/CheckReturnValue).
- **Fix:** With `nitpicker --fix --rule errorprone/CheckReturnValue`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/CheckReturnValue","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CheckReturnValue)

<a id="errorprone-classcanbestatic"></a>

### `errorprone/ClassCanBeStatic`

Inner class is non-static but does not reference enclosing class.

- **Labels:** performance
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ClassCanBeStatic).
- **Fix:** With `nitpicker --fix --rule errorprone/ClassCanBeStatic`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ClassCanBeStatic","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ClassCanBeStatic)

<a id="errorprone-classinitializationdeadlock"></a>

### `errorprone/ClassInitializationDeadlock`

Possible class initialization deadlock.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ClassInitializationDeadlock).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/ClassInitializationDeadlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ClassInitializationDeadlock)

<a id="errorprone-classname"></a>

### `errorprone/ClassName`

The source file name should match the name of the top-level class it contains.

- **Labels:** style
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s2.1-file-name).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/ClassName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s2.1-file-name)

<a id="errorprone-classnamedliketypeparameter"></a>

### `errorprone/ClassNamedLikeTypeParameter`

This class's name looks like a Type Parameter.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ClassNamedLikeTypeParameter).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/ClassNamedLikeTypeParameter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ClassNamedLikeTypeParameter)

<a id="errorprone-classnewinstance"></a>

### `errorprone/ClassNewInstance`

Class.newInstance() bypasses exception checking; prefer getDeclaredConstructor().newInstance().

- **Labels:** reliability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ClassNewInstance).
- **Fix:** With `nitpicker --fix --rule errorprone/ClassNewInstance`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ClassNewInstance","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ClassNewInstance)

<a id="errorprone-closeableprovides"></a>

### `errorprone/CloseableProvides`

Providing Closeable resources makes their lifecycle unclear.

- **Labels:** reliability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/CloseableProvides).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/CloseableProvides","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CloseableProvides)

<a id="errorprone-closingstandardoutputstreams"></a>

### `errorprone/ClosingStandardOutputStreams`

Don't use try-with-resources to manage standard output streams, closing the stream will cause subsequent output to standard output or standard error to be lost.

- **Labels:** reliability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ClosingStandardOutputStreams).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/ClosingStandardOutputStreams","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ClosingStandardOutputStreams)

<a id="errorprone-collectionincompatibletype"></a>

### `errorprone/CollectionIncompatibleType`

Incompatible type as argument to Object-accepting Java collections method.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/CollectionIncompatibleType).
- **Fix:** With `nitpicker --fix --rule errorprone/CollectionIncompatibleType`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/CollectionIncompatibleType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CollectionIncompatibleType)

<a id="errorprone-collectiontoarraysafeparameter"></a>

### `errorprone/CollectionToArraySafeParameter`

The type of the array parameter of Collection.toArray needs to be compatible with the array type.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/CollectionToArraySafeParameter).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/CollectionToArraySafeParameter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CollectionToArraySafeParameter)

<a id="errorprone-collectionundefinedequality"></a>

### `errorprone/CollectionUndefinedEquality`

This type does not have well-defined equals behavior.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/CollectionUndefinedEquality).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/CollectionUndefinedEquality","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CollectionUndefinedEquality)

<a id="errorprone-collectorshouldnotusestate"></a>

### `errorprone/CollectorShouldNotUseState`

Collector.of() should not use state.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/CollectorShouldNotUseState).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/CollectorShouldNotUseState","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CollectorShouldNotUseState)

<a id="errorprone-comparableandcomparator"></a>

### `errorprone/ComparableAndComparator`

Class should not implement both `Comparable` and `Comparator`.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ComparableAndComparator).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/ComparableAndComparator","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ComparableAndComparator)

<a id="errorprone-comparabletype"></a>

### `errorprone/ComparableType`

Implementing 'Comparable\<T>' where T is not the same as the implementing class is incorrect, since it violates the symmetry contract of compareTo.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ComparableType).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/ComparableType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ComparableType)

<a id="errorprone-comparetozero"></a>

### `errorprone/CompareToZero`

The result of #compareTo or #compare should only be compared to 0. It is an implementation detail whether a given type returns strictly the values {-1, 0, +1} or others.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/CompareToZero).
- **Fix:** With `nitpicker --fix --rule errorprone/CompareToZero`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/CompareToZero","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CompareToZero)

<a id="errorprone-comparingthiswithnull"></a>

### `errorprone/ComparingThisWithNull`

This == null is always false, this != null is always true.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ComparingThisWithNull).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/ComparingThisWithNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ComparingThisWithNull)

<a id="errorprone-comparisoncontractviolated"></a>

### `errorprone/ComparisonContractViolated`

This comparison method violates the contract.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ComparisonContractViolated).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/ComparisonContractViolated","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ComparisonContractViolated)

<a id="errorprone-comparisonoutofrange"></a>

### `errorprone/ComparisonOutOfRange`

Comparison to value that is out of range for the compared type.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ComparisonOutOfRange).
- **Fix:** With `nitpicker --fix --rule errorprone/ComparisonOutOfRange`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ComparisonOutOfRange","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ComparisonOutOfRange)

<a id="errorprone-compatiblewithannotationmisuse"></a>

### `errorprone/CompatibleWithAnnotationMisuse`

@CompatibleWith's value is not a type argument.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/CompatibleWithAnnotationMisuse).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/CompatibleWithAnnotationMisuse","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CompatibleWithAnnotationMisuse)

<a id="errorprone-compiletimeconstant"></a>

### `errorprone/CompileTimeConstant`

Non-compile-time constant expression passed to parameter with @CompileTimeConstant type annotation.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/CompileTimeConstant).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/CompileTimeConstant","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CompileTimeConstant)

<a id="errorprone-complexbooleanconstant"></a>

### `errorprone/ComplexBooleanConstant`

Non-trivial compile time constant boolean expressions shouldn't be used.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ComplexBooleanConstant).
- **Fix:** With `nitpicker --fix --rule errorprone/ComplexBooleanConstant`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ComplexBooleanConstant","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ComplexBooleanConstant)

<a id="errorprone-computeifabsentambiguousreference"></a>

### `errorprone/ComputeIfAbsentAmbiguousReference`

ComputeIfAbsent passes the map key to the provided class's constructor.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ComputeIfAbsentAmbiguousReference).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/ComputeIfAbsentAmbiguousReference","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ComputeIfAbsentAmbiguousReference)

<a id="errorprone-conditionalexpressionnumericpromotion"></a>

### `errorprone/ConditionalExpressionNumericPromotion`

A conditional expression with numeric operands of differing types will perform binary numeric promotion of the operands; when these operands are of reference types, the expression's result may not be of the expected type.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ConditionalExpressionNumericPromotion).
- **Fix:** With `nitpicker --fix --rule errorprone/ConditionalExpressionNumericPromotion`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ConditionalExpressionNumericPromotion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ConditionalExpressionNumericPromotion)

<a id="errorprone-constantoverflow"></a>

### `errorprone/ConstantOverflow`

Compile-time constant expression overflows.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ConstantOverflow).
- **Fix:** With `nitpicker --fix --rule errorprone/ConstantOverflow`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ConstantOverflow","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ConstantOverflow)

<a id="errorprone-constantpatterncompile"></a>

### `errorprone/ConstantPatternCompile`

Variables initialized with Pattern#compile calls on constants can be constants.

- **Labels:** performance
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ConstantPatternCompile).
- **Fix:** With `nitpicker --fix --rule errorprone/ConstantPatternCompile`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ConstantPatternCompile","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ConstantPatternCompile)

<a id="errorprone-daggerprovidesnull"></a>

### `errorprone/DaggerProvidesNull`

Dagger @Provides methods may not return null unless annotated with @Nullable.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DaggerProvidesNull).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/DaggerProvidesNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DaggerProvidesNull)

<a id="errorprone-dangerousliteralnull"></a>

### `errorprone/DangerousLiteralNull`

This method is null-hostile: passing a null literal to it is always wrong.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DangerousLiteralNull).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/DangerousLiteralNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DangerousLiteralNull)

<a id="errorprone-datechecker"></a>

### `errorprone/DateChecker`

Warns against suspect looking calls to java.util.Date APIs.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DateChecker).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/DateChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DateChecker)

<a id="errorprone-dateformatconstant"></a>

### `errorprone/DateFormatConstant`

DateFormat is not thread-safe, and should not be used as a constant field.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DateFormatConstant).
- **Fix:** With `nitpicker --fix --rule errorprone/DateFormatConstant`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/DateFormatConstant","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DateFormatConstant)

<a id="errorprone-deadexception"></a>

### `errorprone/DeadException`

Exception created but not thrown.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DeadException).
- **Fix:** With `nitpicker --fix --rule errorprone/DeadException`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/DeadException","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DeadException)

<a id="errorprone-deadthread"></a>

### `errorprone/DeadThread`

Thread created but not started.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DeadThread).
- **Fix:** With `nitpicker --fix --rule errorprone/DeadThread`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/DeadThread","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DeadThread)

<a id="errorprone-deduplicateconstants"></a>

### `errorprone/DeduplicateConstants`

This expression was previously declared as a constant; consider replacing this occurrence.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DeduplicateConstants).
- **Fix:** With `nitpicker --fix --rule errorprone/DeduplicateConstants`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/DeduplicateConstants","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DeduplicateConstants)

<a id="errorprone-deeplynested"></a>

### `errorprone/DeeplyNested`

Very deeply nested code may lead to StackOverflowErrors during compilation.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DeeplyNested).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/DeeplyNested","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DeeplyNested)

<a id="errorprone-defaultcharset"></a>

### `errorprone/DefaultCharset`

Implicit use of the platform default charset, which can result in differing behaviour between JVM executions or incorrect behavior if the encoding of the data source doesn't match expectations.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DefaultCharset).
- **Fix:** With `nitpicker --fix --rule errorprone/DefaultCharset`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/DefaultCharset","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DefaultCharset)

<a id="errorprone-defaultlocale"></a>

### `errorprone/DefaultLocale`

Implicit use of the JVM default locale, which can result in differing behaviour between JVM executions.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DefaultLocale).
- **Fix:** With `nitpicker --fix --rule errorprone/DefaultLocale`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/DefaultLocale","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DefaultLocale)

<a id="errorprone-defaultpackage"></a>

### `errorprone/DefaultPackage`

Java classes shouldn't use default package.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DefaultPackage).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/DefaultPackage","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DefaultPackage)

<a id="errorprone-depann"></a>

### `errorprone/DepAnn`

Item documented with a @deprecated javadoc note is not annotated with @Deprecated.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DepAnn).
- **Fix:** With `nitpicker --fix --rule errorprone/DepAnn`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/DepAnn","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DepAnn)

<a id="errorprone-deprecatedvariable"></a>

### `errorprone/DeprecatedVariable`

Applying the @Deprecated annotation to local variables or parameters has no effect.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DeprecatedVariable).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/DeprecatedVariable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DeprecatedVariable)

<a id="errorprone-dereferencewithnullbranch"></a>

### `errorprone/DereferenceWithNullBranch`

Dereference of an expression with a null branch.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DereferenceWithNullBranch).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/DereferenceWithNullBranch","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DereferenceWithNullBranch)

<a id="errorprone-differentnamebutsame"></a>

### `errorprone/DifferentNameButSame`

This type is referred to in different ways within this file, which may be confusing.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DifferentNameButSame).
- **Fix:** With `nitpicker --fix --rule errorprone/DifferentNameButSame`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/DifferentNameButSame","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DifferentNameButSame)

<a id="errorprone-directinvocationonmock"></a>

### `errorprone/DirectInvocationOnMock`

Methods should not be directly invoked on mocks. Should this be part of a verify(..) call?

- **Labels:** bug, tests
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DirectInvocationOnMock).
- **Fix:** With `nitpicker --fix --rule errorprone/DirectInvocationOnMock`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/DirectInvocationOnMock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DirectInvocationOnMock)

<a id="errorprone-discardedpostfixexpression"></a>

### `errorprone/DiscardedPostfixExpression`

The result of this unary operation on a lambda parameter is discarded.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DiscardedPostfixExpression).
- **Fix:** With `nitpicker --fix --rule errorprone/DiscardedPostfixExpression`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/DiscardedPostfixExpression","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DiscardedPostfixExpression)

<a id="errorprone-distinctvarargschecker"></a>

### `errorprone/DistinctVarargsChecker`

Method expects distinct arguments at some/all positions.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DistinctVarargsChecker).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/DistinctVarargsChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DistinctVarargsChecker)

<a id="errorprone-donotcall"></a>

### `errorprone/DoNotCall`

This method should not be called.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DoNotCall).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/DoNotCall","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DoNotCall)

<a id="errorprone-donotclaimannotations"></a>

### `errorprone/DoNotClaimAnnotations`

Don't 'claim' annotations in annotation processors; Processor#process should unconditionally return `false`.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DoNotClaimAnnotations).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/DoNotClaimAnnotations","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DoNotClaimAnnotations)

<a id="errorprone-donotmock"></a>

### `errorprone/DoNotMock`

Identifies undesirable mocks.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DoNotMock).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/DoNotMock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DoNotMock)

<a id="errorprone-donotmockautovalue"></a>

### `errorprone/DoNotMockAutoValue`

AutoValue classes represent pure data classes, so mocking them should not be necessary. Construct a real instance of the class instead.

- **Labels:** tests
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DoNotMockAutoValue).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/DoNotMockAutoValue","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DoNotMockAutoValue)

<a id="errorprone-doublebraceinitialization"></a>

### `errorprone/DoubleBraceInitialization`

Prefer collection factory methods or builders to the double-brace initialization pattern.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DoubleBraceInitialization).
- **Fix:** With `nitpicker --fix --rule errorprone/DoubleBraceInitialization`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/DoubleBraceInitialization","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DoubleBraceInitialization)

<a id="errorprone-doublecheckedlocking"></a>

### `errorprone/DoubleCheckedLocking`

Double-checked locking on non-volatile fields is unsafe.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DoubleCheckedLocking).
- **Fix:** With `nitpicker --fix --rule errorprone/DoubleCheckedLocking`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/DoubleCheckedLocking","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DoubleCheckedLocking)

<a id="errorprone-duplicateassertion"></a>

### `errorprone/DuplicateAssertion`

This assertion is duplicate.

- **Labels:** tests, simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DuplicateAssertion).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/DuplicateAssertion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DuplicateAssertion)

<a id="errorprone-duplicatebranches"></a>

### `errorprone/DuplicateBranches`

Both branches contain identical code.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DuplicateBranches).
- **Fix:** With `nitpicker --fix --rule errorprone/DuplicateBranches`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/DuplicateBranches","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DuplicateBranches)

<a id="errorprone-duplicatedateformatfield"></a>

### `errorprone/DuplicateDateFormatField`

Reuse of DateFormat fields is most likely unintentional.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DuplicateDateFormatField).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/DuplicateDateFormatField","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DuplicateDateFormatField)

<a id="errorprone-duplicatemapkeys"></a>

### `errorprone/DuplicateMapKeys`

Map#ofEntries will throw an IllegalArgumentException if there are any duplicate keys.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DuplicateMapKeys).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/DuplicateMapKeys","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DuplicateMapKeys)

<a id="errorprone-durationfrom"></a>

### `errorprone/DurationFrom`

Duration.from(Duration) returns itself; from(Period) throws a runtime exception.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DurationFrom).
- **Fix:** With `nitpicker --fix --rule errorprone/DurationFrom`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/DurationFrom","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DurationFrom)

<a id="errorprone-durationgettemporalunit"></a>

### `errorprone/DurationGetTemporalUnit`

Duration.get() only works with SECONDS or NANOS.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DurationGetTemporalUnit).
- **Fix:** With `nitpicker --fix --rule errorprone/DurationGetTemporalUnit`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/DurationGetTemporalUnit","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DurationGetTemporalUnit)

<a id="errorprone-durationtemporalunit"></a>

### `errorprone/DurationTemporalUnit`

Duration APIs only work for DAYS or exact durations.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DurationTemporalUnit).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/DurationTemporalUnit","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DurationTemporalUnit)

<a id="errorprone-durationtolongtimeunit"></a>

### `errorprone/DurationToLongTimeUnit`

Unit mismatch when decomposing a Duration or Instant to call a \<long, TimeUnit> API.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DurationToLongTimeUnit).
- **Fix:** With `nitpicker --fix --rule errorprone/DurationToLongTimeUnit`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/DurationToLongTimeUnit","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DurationToLongTimeUnit)

<a id="errorprone-effectivelyprivate"></a>

### `errorprone/EffectivelyPrivate`

This declaration has public or protected modifiers, but is effectively private.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/EffectivelyPrivate).
- **Fix:** With `nitpicker --fix --rule errorprone/EffectivelyPrivate`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/EffectivelyPrivate","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EffectivelyPrivate)

<a id="errorprone-emptyblocktag"></a>

### `errorprone/EmptyBlockTag`

A block tag (@param, @return, @throws, @deprecated) has an empty description. Block tags without descriptions don't add much value for future readers of the code; consider removing the tag entirely or adding a description.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s7.1.3-javadoc-block-tags).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/EmptyBlockTag","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s7.1.3-javadoc-block-tags)

<a id="errorprone-emptycatch"></a>

### `errorprone/EmptyCatch`

Caught exceptions should not be ignored.

- **Labels:** reliability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s6.2-caught-exceptions).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/EmptyCatch","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s6.2-caught-exceptions)

<a id="errorprone-emptysetmultibindingcontributions"></a>

### `errorprone/EmptySetMultibindingContributions`

@Multibinds is a more efficient and declarative mechanism for ensuring that a set multibinding is present in the graph.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/EmptySetMultibindingContributions).
- **Fix:** With `nitpicker --fix --rule errorprone/EmptySetMultibindingContributions`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/EmptySetMultibindingContributions","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EmptySetMultibindingContributions)

<a id="errorprone-emptytopleveldeclaration"></a>

### `errorprone/EmptyTopLevelDeclaration`

Empty top-level type declarations should be omitted.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/EmptyTopLevelDeclaration).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/EmptyTopLevelDeclaration","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EmptyTopLevelDeclaration)

<a id="errorprone-enumordinal"></a>

### `errorprone/EnumOrdinal`

You should almost never invoke the Enum.ordinal() method or depend on the enum values by index.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/EnumOrdinal).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/EnumOrdinal","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EnumOrdinal)

<a id="errorprone-equalsbrokenfornull"></a>

### `errorprone/EqualsBrokenForNull`

Equals() implementation may throw NullPointerException when given null.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsBrokenForNull).
- **Fix:** With `nitpicker --fix --rule errorprone/EqualsBrokenForNull`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/EqualsBrokenForNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsBrokenForNull)

<a id="errorprone-equalshashcode"></a>

### `errorprone/EqualsHashCode`

Classes that override equals should also override hashCode.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsHashCode).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/EqualsHashCode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsHashCode)

<a id="errorprone-equalsincompatibletype"></a>

### `errorprone/EqualsIncompatibleType`

An equality test between objects with incompatible types always returns false.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsIncompatibleType).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/EqualsIncompatibleType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsIncompatibleType)

<a id="errorprone-equalsnan"></a>

### `errorprone/EqualsNaN`

== NaN always returns false; use the isNaN methods instead.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsNaN).
- **Fix:** With `nitpicker --fix --rule errorprone/EqualsNaN`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/EqualsNaN","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsNaN)

<a id="errorprone-equalsnull"></a>

### `errorprone/EqualsNull`

The contract of Object.equals() states that for any non-null reference value x, x.equals(null) should return false. If x is null, a NullPointerException is thrown. Consider replacing equals() with the == operator.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsNull).
- **Fix:** With `nitpicker --fix --rule errorprone/EqualsNull`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/EqualsNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsNull)

<a id="errorprone-equalsreference"></a>

### `errorprone/EqualsReference`

== must be used in equals method to check equality to itself or an infinite loop will occur.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsReference).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/EqualsReference","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsReference)

<a id="errorprone-equalsunsafecast"></a>

### `errorprone/EqualsUnsafeCast`

The contract of #equals states that it should return false for incompatible types, while this implementation may throw ClassCastException.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsUnsafeCast).
- **Fix:** With `nitpicker --fix --rule errorprone/EqualsUnsafeCast`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/EqualsUnsafeCast","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsUnsafeCast)

<a id="errorprone-equalsusinghashcode"></a>

### `errorprone/EqualsUsingHashCode`

Implementing #equals by just comparing hashCodes is fragile. Hashes collide frequently, and this will lead to false positives in #equals.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsUsingHashCode).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/EqualsUsingHashCode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsUsingHashCode)

<a id="errorprone-equalswrongthing"></a>

### `errorprone/EqualsWrongThing`

Comparing different pairs of fields/getters in an equals implementation is probably a mistake.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsWrongThing).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/EqualsWrongThing","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsWrongThing)

<a id="errorprone-erroneousbitwiseexpression"></a>

### `errorprone/ErroneousBitwiseExpression`

This expression evaluates to 0. If this isn't an error, consider expressing it as a literal 0.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ErroneousBitwiseExpression).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/ErroneousBitwiseExpression","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ErroneousBitwiseExpression)

<a id="errorprone-erroneousthreadpoolconstructorchecker"></a>

### `errorprone/ErroneousThreadPoolConstructorChecker`

Thread pool size will never go beyond corePoolSize if an unbounded queue is used.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ErroneousThreadPoolConstructorChecker).
- **Fix:** With `nitpicker --fix --rule errorprone/ErroneousThreadPoolConstructorChecker`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ErroneousThreadPoolConstructorChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ErroneousThreadPoolConstructorChecker)

<a id="errorprone-escapedentity"></a>

### `errorprone/EscapedEntity`

HTML entities in @code/@literal tags will appear literally in the rendered javadoc.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/EscapedEntity).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/EscapedEntity","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EscapedEntity)

<a id="errorprone-expectedexceptionchecker"></a>

### `errorprone/ExpectedExceptionChecker`

Prefer assertThrows to ExpectedException.

- **Labels:** tests
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ExpectedExceptionChecker).
- **Fix:** With `nitpicker --fix --rule errorprone/ExpectedExceptionChecker`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ExpectedExceptionChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ExpectedExceptionChecker)

<a id="errorprone-expensivelenientformatstring"></a>

### `errorprone/ExpensiveLenientFormatString`

String.format is passed to a lenient formatting method, which can be unwrapped to improve efficiency.

- **Labels:** performance
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ExpensiveLenientFormatString).
- **Fix:** With `nitpicker --fix --rule errorprone/ExpensiveLenientFormatString`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ExpensiveLenientFormatString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ExpensiveLenientFormatString)

<a id="errorprone-explicitarrayforvarargs"></a>

### `errorprone/ExplicitArrayForVarargs`

Avoid explicit array creation for varargs.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ExplicitArrayForVarargs).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/ExplicitArrayForVarargs","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ExplicitArrayForVarargs)

<a id="errorprone-exposedprivatetype"></a>

### `errorprone/ExposedPrivateType`

Private member classes should not be referenced in signatures of non-private members.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ExposedPrivateType).
- **Fix:** With `nitpicker --fix --rule errorprone/ExposedPrivateType`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ExposedPrivateType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ExposedPrivateType)

<a id="errorprone-extendingjunitassert"></a>

### `errorprone/ExtendingJUnitAssert`

When only using JUnit Assert's static methods, you should import statically instead of extending.

- **Labels:** tests
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ExtendingJUnitAssert).
- **Fix:** With `nitpicker --fix --rule errorprone/ExtendingJUnitAssert`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ExtendingJUnitAssert","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ExtendingJUnitAssert)

<a id="errorprone-extendsautovalue"></a>

### `errorprone/ExtendsAutoValue`

Do not extend an @AutoValue-like classes in non-generated code.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ExtendsAutoValue).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/ExtendsAutoValue","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ExtendsAutoValue)

<a id="errorprone-extendsobject"></a>

### `errorprone/ExtendsObject`

`T extends Object` is redundant (unless you are using the Checker Framework).

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ExtendsObject).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/ExtendsObject","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ExtendsObject)

<a id="errorprone-fallthrough"></a>

### `errorprone/FallThrough`

Switch case may fall through.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FallThrough).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/FallThrough","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FallThrough)

<a id="errorprone-fieldcanbefinal"></a>

### `errorprone/FieldCanBeFinal`

This field is only assigned during initialization; consider making it final.

- **Labels:** simplification
- **Scope:** Not reported in classes annotated jakarta.persistence.Embeddable, jakarta.persistence.Entity, jakarta.persistence.MappedSuperclass, javax.persistence.Embeddable, javax.persistence.Entity, javax.persistence.MappedSuperclass.
- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FieldCanBeFinal).
- **Fix:** With `nitpicker --fix --rule errorprone/FieldCanBeFinal`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/FieldCanBeFinal","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FieldCanBeFinal)

<a id="errorprone-fieldcanbelocal"></a>

### `errorprone/FieldCanBeLocal`

This field can be replaced with a local variable in the methods that use it.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FieldCanBeLocal).
- **Fix:** With `nitpicker --fix --rule errorprone/FieldCanBeLocal`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/FieldCanBeLocal","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FieldCanBeLocal)

<a id="errorprone-finalize"></a>

### `errorprone/Finalize`

Do not override finalize.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/Finalize).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/Finalize","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/Finalize)

<a id="errorprone-finally"></a>

### `errorprone/Finally`

If you return or throw from a finally, then values returned or thrown from the try-catch block will be ignored. Consider using try-with-resources instead.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/Finally).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/Finally","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/Finally)

<a id="errorprone-floatcast"></a>

### `errorprone/FloatCast`

Use parentheses to make the precedence explicit.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FloatCast).
- **Fix:** With `nitpicker --fix --rule errorprone/FloatCast`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/FloatCast","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloatCast)

<a id="errorprone-floatingpointassertionwithinepsilon"></a>

### `errorprone/FloatingPointAssertionWithinEpsilon`

This fuzzy equality check is using a tolerance less than the gap to the next number. You may want a less restrictive tolerance, or to assert equality.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FloatingPointAssertionWithinEpsilon).
- **Fix:** With `nitpicker --fix --rule errorprone/FloatingPointAssertionWithinEpsilon`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/FloatingPointAssertionWithinEpsilon","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloatingPointAssertionWithinEpsilon)

<a id="errorprone-floatingpointliteralprecision"></a>

### `errorprone/FloatingPointLiteralPrecision`

Floating point literal loses precision.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FloatingPointLiteralPrecision).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/FloatingPointLiteralPrecision","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloatingPointLiteralPrecision)

<a id="errorprone-floggerargumenttostring"></a>

### `errorprone/FloggerArgumentToString`

Use Flogger's printf-style formatting instead of explicitly converting arguments to strings. Note that Flogger does more than just call toString; for instance, it formats arrays sensibly.

- **Labels:** performance
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerArgumentToString).
- **Fix:** With `nitpicker --fix --rule errorprone/FloggerArgumentToString`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerArgumentToString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerArgumentToString)

<a id="errorprone-floggerformatstring"></a>

### `errorprone/FloggerFormatString`

Invalid printf-style format string.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerFormatString).
- **Fix:** With `nitpicker --fix --rule errorprone/FloggerFormatString`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerFormatString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerFormatString)

<a id="errorprone-floggerlogstring"></a>

### `errorprone/FloggerLogString`

Arguments to log(String) must be compile-time constants or parameters annotated with @CompileTimeConstant. If possible, use Flogger's formatting log methods instead.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerLogString).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerLogString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerLogString)

<a id="errorprone-floggerlogvarargs"></a>

### `errorprone/FloggerLogVarargs`

LogVarargs should be used to pass through format strings and arguments.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerLogVarargs).
- **Fix:** With `nitpicker --fix --rule errorprone/FloggerLogVarargs`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerLogVarargs","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerLogVarargs)

<a id="errorprone-floggerlogwithcause"></a>

### `errorprone/FloggerLogWithCause`

Setting the caught exception as the cause of the log message may provide more context for anyone debugging errors.

- **Labels:** reliability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerLogWithCause).
- **Fix:** With `nitpicker --fix --rule errorprone/FloggerLogWithCause`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerLogWithCause","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerLogWithCause)

<a id="errorprone-floggermessageformat"></a>

### `errorprone/FloggerMessageFormat`

Invalid message format-style format specifier ({0}), expected printf-style (%s).

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerMessageFormat).
- **Fix:** With `nitpicker --fix --rule errorprone/FloggerMessageFormat`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerMessageFormat","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerMessageFormat)

<a id="errorprone-floggerperwithoutratelimit"></a>

### `errorprone/FloggerPerWithoutRateLimit`

Per() methods are no-ops unless combined with atMostEvery(), every(), or onAverageEvery().

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerPerWithoutRateLimit).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerPerWithoutRateLimit","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerPerWithoutRateLimit)

<a id="errorprone-floggerredundantisenabled"></a>

### `errorprone/FloggerRedundantIsEnabled`

Logger level check is already implied in the log() call. An explicit atLEVEL().isEnabled() check is redundant.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerRedundantIsEnabled).
- **Fix:** With `nitpicker --fix --rule errorprone/FloggerRedundantIsEnabled`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerRedundantIsEnabled","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerRedundantIsEnabled)

<a id="errorprone-floggerrequiredmodifiers"></a>

### `errorprone/FloggerRequiredModifiers`

FluentLogger.forEnclosingClass should always be saved to a private static final field.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://google.github.io/flogger/best_practice#modifiers).
- **Fix:** With `nitpicker --fix --rule errorprone/FloggerRequiredModifiers`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerRequiredModifiers","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://google.github.io/flogger/best_practice#modifiers)

<a id="errorprone-floggersplitlogstatement"></a>

### `errorprone/FloggerSplitLogStatement`

Splitting log statements and using Api instances directly breaks logging.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://google.github.io/flogger/best_practice#no-split).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerSplitLogStatement","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://google.github.io/flogger/best_practice#no-split)

<a id="errorprone-floggerstringconcatenation"></a>

### `errorprone/FloggerStringConcatenation`

Prefer string formatting using printf placeholders (e.g. %s) instead of string concatenation.

- **Labels:** performance
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerStringConcatenation).
- **Fix:** With `nitpicker --fix --rule errorprone/FloggerStringConcatenation`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerStringConcatenation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerStringConcatenation)

<a id="errorprone-floggerwithcause"></a>

### `errorprone/FloggerWithCause`

Calling withCause(Throwable) with an inline allocated Throwable is discouraged. Consider using withStackTrace(StackSize) instead, and specifying a reduced stack size (e.g. SMALL, MEDIUM or LARGE) instead of FULL, to improve performance.

- **Labels:** reliability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://google.github.io/flogger/best_practice#stack-trace).
- **Fix:** With `nitpicker --fix --rule errorprone/FloggerWithCause`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerWithCause","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://google.github.io/flogger/best_practice#stack-trace)

<a id="errorprone-floggerwithoutcause"></a>

### `errorprone/FloggerWithoutCause`

Use withCause to associate Exceptions with log statements.

- **Labels:** reliability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerWithoutCause).
- **Fix:** With `nitpicker --fix --rule errorprone/FloggerWithoutCause`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerWithoutCause","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerWithoutCause)

<a id="errorprone-formatstring"></a>

### `errorprone/FormatString`

Invalid printf-style format string.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FormatString).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/FormatString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FormatString)

<a id="errorprone-formatstringannotation"></a>

### `errorprone/FormatStringAnnotation`

Invalid format string passed to formatting method.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FormatStringAnnotation).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/FormatStringAnnotation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FormatStringAnnotation)

<a id="errorprone-formatstringshoulduseplaceholders"></a>

### `errorprone/FormatStringShouldUsePlaceholders`

Using a format string avoids string concatenation in the common case.

- **Labels:** performance
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FormatStringShouldUsePlaceholders).
- **Fix:** With `nitpicker --fix --rule errorprone/FormatStringShouldUsePlaceholders`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/FormatStringShouldUsePlaceholders","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FormatStringShouldUsePlaceholders)

<a id="errorprone-foroverride"></a>

### `errorprone/ForOverride`

Method annotated @ForOverride must be protected or package-private and only invoked from declaring class, or from an override of the method.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ForOverride).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/ForOverride","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ForOverride)

<a id="errorprone-fragmentinjection"></a>

### `errorprone/FragmentInjection`

Classes extending PreferenceActivity must implement isValidFragment such that it does not unconditionally return true to prevent vulnerability to fragment injection attacks.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FragmentInjection).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/FragmentInjection","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FragmentInjection)

<a id="errorprone-fragmentnotinstantiable"></a>

### `errorprone/FragmentNotInstantiable`

Subclasses of Fragment must be instantiable via Class#newInstance(): the class must be public, static and have a public nullary constructor.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FragmentNotInstantiable).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/FragmentNotInstantiable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FragmentNotInstantiable)

<a id="errorprone-fromtemporalaccessor"></a>

### `errorprone/FromTemporalAccessor`

Certain combinations of javaTimeType.from(TemporalAccessor) will always throw a DateTimeException or return the parameter directly.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FromTemporalAccessor).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/FromTemporalAccessor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FromTemporalAccessor)

<a id="errorprone-functionalinterfaceclash"></a>

### `errorprone/FunctionalInterfaceClash`

Overloads will be ambiguous when passing lambda arguments.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FunctionalInterfaceClash).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/FunctionalInterfaceClash","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FunctionalInterfaceClash)

<a id="errorprone-functionalinterfacemethodchanged"></a>

### `errorprone/FunctionalInterfaceMethodChanged`

Casting a lambda to this @FunctionalInterface can cause a behavior change from casting to a functional superinterface, which is surprising to users. Prefer decorator methods to this surprising behavior.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FunctionalInterfaceMethodChanged).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/FunctionalInterfaceMethodChanged","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FunctionalInterfaceMethodChanged)

<a id="errorprone-futurereturnvalueignored"></a>

### `errorprone/FutureReturnValueIgnored`

Return value of methods returning Future must be checked. Ignoring returned Futures suppresses exceptions thrown from the code that completes the Future.

- **Labels:** bug, async
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FutureReturnValueIgnored).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/FutureReturnValueIgnored","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FutureReturnValueIgnored)

<a id="errorprone-futuresgetcheckedillegalexceptiontype"></a>

### `errorprone/FuturesGetCheckedIllegalExceptionType`

Futures.getChecked requires a checked exception type with a standard constructor.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FuturesGetCheckedIllegalExceptionType).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/FuturesGetCheckedIllegalExceptionType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FuturesGetCheckedIllegalExceptionType)

<a id="errorprone-futuretransformasync"></a>

### `errorprone/FutureTransformAsync`

Use transform instead of transformAsync when all returns are an immediate future.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FutureTransformAsync).
- **Fix:** With `nitpicker --fix --rule errorprone/FutureTransformAsync`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/FutureTransformAsync","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FutureTransformAsync)

<a id="errorprone-fuzzyequalsshouldnotbeusedinequalsmethod"></a>

### `errorprone/FuzzyEqualsShouldNotBeUsedInEqualsMethod`

DoubleMath.fuzzyEquals should never be used in an Object.equals() method.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FuzzyEqualsShouldNotBeUsedInEqualsMethod).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/FuzzyEqualsShouldNotBeUsedInEqualsMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FuzzyEqualsShouldNotBeUsedInEqualsMethod)

<a id="errorprone-getclassonannotation"></a>

### `errorprone/GetClassOnAnnotation`

Calling getClass() on an annotation may return a proxy class.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/GetClassOnAnnotation).
- **Fix:** With `nitpicker --fix --rule errorprone/GetClassOnAnnotation`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/GetClassOnAnnotation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/GetClassOnAnnotation)

<a id="errorprone-getclassonclass"></a>

### `errorprone/GetClassOnClass`

Calling getClass() on an object of type Class returns the Class object for java.lang.Class; you probably meant to operate on the object directly.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/GetClassOnClass).
- **Fix:** With `nitpicker --fix --rule errorprone/GetClassOnClass`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/GetClassOnClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/GetClassOnClass)

<a id="errorprone-getclassonenum"></a>

### `errorprone/GetClassOnEnum`

Calling getClass() on an enum may return a subclass of the enum type.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/GetClassOnEnum).
- **Fix:** With `nitpicker --fix --rule errorprone/GetClassOnEnum`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/GetClassOnEnum","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/GetClassOnEnum)

<a id="errorprone-guardedby"></a>

### `errorprone/GuardedBy`

Checks for unguarded accesses to fields and methods with @GuardedBy annotations.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/GuardedBy).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/GuardedBy","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/GuardedBy)

<a id="errorprone-guiceassistedinjectscoping"></a>

### `errorprone/GuiceAssistedInjectScoping`

Scope annotation on implementation class of AssistedInject factory is not allowed.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/GuiceAssistedInjectScoping).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/GuiceAssistedInjectScoping","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/GuiceAssistedInjectScoping)

<a id="errorprone-guiceassistedparameters"></a>

### `errorprone/GuiceAssistedParameters`

A constructor cannot have two @Assisted parameters of the same type unless they are disambiguated with named @Assisted annotations.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/GuiceAssistedParameters).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/GuiceAssistedParameters","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/GuiceAssistedParameters)

<a id="errorprone-guiceinjectonfinalfield"></a>

### `errorprone/GuiceInjectOnFinalField`

Although Guice allows injecting final fields, doing so is disallowed because the injected value may not be visible to other threads.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/GuiceInjectOnFinalField).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/GuiceInjectOnFinalField","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/GuiceInjectOnFinalField)

<a id="errorprone-guicenestedcombine"></a>

### `errorprone/GuiceNestedCombine`

Nesting Modules.combine() here is unnecessary.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/GuiceNestedCombine).
- **Fix:** With `nitpicker --fix --rule errorprone/GuiceNestedCombine`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/GuiceNestedCombine","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/GuiceNestedCombine)

<a id="errorprone-hardcodedsdcardpath"></a>

### `errorprone/HardCodedSdCardPath`

Hardcoded reference to /sdcard.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/HardCodedSdCardPath).
- **Fix:** With `nitpicker --fix --rule errorprone/HardCodedSdCardPath`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/HardCodedSdCardPath","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/HardCodedSdCardPath)

<a id="errorprone-hashtablecontains"></a>

### `errorprone/HashtableContains`

Contains() is a legacy method that is equivalent to containsValue().

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/HashtableContains).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/HashtableContains","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/HashtableContains)

<a id="errorprone-hidingfield"></a>

### `errorprone/HidingField`

Hiding fields of superclasses may cause confusion and errors.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/HidingField).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/HidingField","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/HidingField)

<a id="errorprone-iccprofilegetinstance"></a>

### `errorprone/ICCProfileGetInstance`

This method searches the class path for the given file, prefer to read the file and call getInstance(byte[]) or getInstance(InputStream).

- **Labels:** performance
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ICCProfileGetInstance).
- **Fix:** With `nitpicker --fix --rule errorprone/ICCProfileGetInstance`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ICCProfileGetInstance","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ICCProfileGetInstance)

<a id="errorprone-identifiername"></a>

### `errorprone/IdentifierName`

Methods and non-static variables should be named in lowerCamelCase.

- **Labels:** style
- **Scope:** Not reported in classes annotated com.tngtech.archunit.junit.AnalyzeClasses.
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s5.2-specific-identifier-names).
- **Fix:** With `nitpicker --fix --rule errorprone/IdentifierName`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/IdentifierName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s5.2-specific-identifier-names)

<a id="errorprone-identitybinaryexpression"></a>

### `errorprone/IdentityBinaryExpression`

A binary expression where both operands are the same is usually incorrect.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/IdentityBinaryExpression).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/IdentityBinaryExpression","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IdentityBinaryExpression)

<a id="errorprone-identityhashmapboxing"></a>

### `errorprone/IdentityHashMapBoxing`

Using IdentityHashMap with a boxed type as the key is risky since boxing may produce distinct instances.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/IdentityHashMapBoxing).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/IdentityHashMapBoxing","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IdentityHashMapBoxing)

<a id="errorprone-identityhashmapusage"></a>

### `errorprone/IdentityHashMapUsage`

IdentityHashMap usage shouldn't be intermingled with Map.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/IdentityHashMapUsage).
- **Fix:** With `nitpicker --fix --rule errorprone/IdentityHashMapUsage`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/IdentityHashMapUsage","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IdentityHashMapUsage)

<a id="errorprone-ignoredpuregetter"></a>

### `errorprone/IgnoredPureGetter`

Getters on AutoValues, AutoBuilders, and Protobuf Messages are side-effect free, so there is no point in calling them if the return value is ignored. While there are no side effects from the getter, the receiver may have side effects.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/IgnoredPureGetter).
- **Fix:** With `nitpicker --fix --rule errorprone/IgnoredPureGetter`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/IgnoredPureGetter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IgnoredPureGetter)

<a id="errorprone-immutable"></a>

### `errorprone/Immutable`

Type declaration annotated with @Immutable is not immutable.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/Immutable).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/Immutable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/Immutable)

<a id="errorprone-immutableannotationchecker"></a>

### `errorprone/ImmutableAnnotationChecker`

Annotations should always be immutable.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ImmutableAnnotationChecker).
- **Fix:** With `nitpicker --fix --rule errorprone/ImmutableAnnotationChecker`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ImmutableAnnotationChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ImmutableAnnotationChecker)

<a id="errorprone-immutableenumchecker"></a>

### `errorprone/ImmutableEnumChecker`

Enums should always be immutable.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ImmutableEnumChecker).
- **Fix:** With `nitpicker --fix --rule errorprone/ImmutableEnumChecker`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ImmutableEnumChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ImmutableEnumChecker)

<a id="errorprone-immutablesetforcontains"></a>

### `errorprone/ImmutableSetForContains`

This private static ImmutableList is only used for contains, containsAll or isEmpty checks; prefer ImmutableSet.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ImmutableSetForContains).
- **Fix:** With `nitpicker --fix --rule errorprone/ImmutableSetForContains`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ImmutableSetForContains","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ImmutableSetForContains)

<a id="errorprone-implementassertionwithchaining"></a>

### `errorprone/ImplementAssertionWithChaining`

Prefer check(...), which usually generates more readable failure messages.

- **Labels:** tests
- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ImplementAssertionWithChaining).
- **Fix:** With `nitpicker --fix --rule errorprone/ImplementAssertionWithChaining`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ImplementAssertionWithChaining","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ImplementAssertionWithChaining)

<a id="errorprone-impossiblenullcomparison"></a>

### `errorprone/ImpossibleNullComparison`

This value cannot be null, and comparing it to null may be misleading.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ImpossibleNullComparison).
- **Fix:** With `nitpicker --fix --rule errorprone/ImpossibleNullComparison`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ImpossibleNullComparison","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ImpossibleNullComparison)

<a id="errorprone-incomparable"></a>

### `errorprone/Incomparable`

Types contained in sorted collections must implement Comparable.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/Incomparable).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/Incomparable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/Incomparable)

<a id="errorprone-incompatibleargumenttype"></a>

### `errorprone/IncompatibleArgumentType`

Passing argument to a generic method with an incompatible type.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/IncompatibleArgumentType).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/IncompatibleArgumentType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IncompatibleArgumentType)

<a id="errorprone-incompatiblemodifiers"></a>

### `errorprone/IncompatibleModifiers`

This annotation has incompatible modifiers as specified by its @IncompatibleModifiers annotation.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/IncompatibleModifiers).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/IncompatibleModifiers","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IncompatibleModifiers)

<a id="errorprone-inconsistentcapitalization"></a>

### `errorprone/InconsistentCapitalization`

It is confusing to have a field and a parameter under the same scope that differ only in capitalization.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InconsistentCapitalization).
- **Fix:** With `nitpicker --fix --rule errorprone/InconsistentCapitalization`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/InconsistentCapitalization","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InconsistentCapitalization)

<a id="errorprone-inconsistenthashcode"></a>

### `errorprone/InconsistentHashCode`

Including fields in hashCode which are not compared in equals violates the contract of hashCode.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InconsistentHashCode).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/InconsistentHashCode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InconsistentHashCode)

<a id="errorprone-inconsistentoverloads"></a>

### `errorprone/InconsistentOverloads`

The ordering of parameters in overloaded methods should be as consistent as possible (when viewed from left to right).

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InconsistentOverloads).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/InconsistentOverloads","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InconsistentOverloads)

<a id="errorprone-incorrectmainmethod"></a>

### `errorprone/IncorrectMainMethod`

'main' methods must be public, static, and void.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/IncorrectMainMethod).
- **Fix:** With `nitpicker --fix --rule errorprone/IncorrectMainMethod`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/IncorrectMainMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IncorrectMainMethod)

<a id="errorprone-incrementinforloopandheader"></a>

### `errorprone/IncrementInForLoopAndHeader`

This for loop increments the same variable in the header and in the body.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/IncrementInForLoopAndHeader).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/IncrementInForLoopAndHeader","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IncrementInForLoopAndHeader)

<a id="errorprone-indexofchar"></a>

### `errorprone/IndexOfChar`

The first argument to indexOf is a Unicode code point, and the second is the index to start the search from.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/IndexOfChar).
- **Fix:** With `nitpicker --fix --rule errorprone/IndexOfChar`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/IndexOfChar","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IndexOfChar)

<a id="errorprone-inexactvarargsconditional"></a>

### `errorprone/InexactVarargsConditional`

Conditional expression in varargs call contains array and non-array arguments.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InexactVarargsConditional).
- **Fix:** With `nitpicker --fix --rule errorprone/InexactVarargsConditional`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/InexactVarargsConditional","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InexactVarargsConditional)

<a id="errorprone-infiniterecursion"></a>

### `errorprone/InfiniteRecursion`

This method calls itself unconditionally; it will throw StackOverflowError.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InfiniteRecursion).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/InfiniteRecursion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InfiniteRecursion)

<a id="errorprone-inheritdoc"></a>

### `errorprone/InheritDoc`

Invalid use of @inheritDoc.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InheritDoc).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/InheritDoc","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InheritDoc)

<a id="errorprone-initializeinline"></a>

### `errorprone/InitializeInline`

Initializing variables in their declaring statement is clearer, where possible.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InitializeInline).
- **Fix:** With `nitpicker --fix --rule errorprone/InitializeInline`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/InitializeInline","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InitializeInline)

<a id="errorprone-injectedconstructorannotations"></a>

### `errorprone/InjectedConstructorAnnotations`

Injected constructors cannot be optional nor have binding annotations.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InjectedConstructorAnnotations).
- **Fix:** With `nitpicker --fix --rule errorprone/InjectedConstructorAnnotations`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/InjectedConstructorAnnotations","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InjectedConstructorAnnotations)

<a id="errorprone-injectinvalidtargetingonscopingannotation"></a>

### `errorprone/InjectInvalidTargetingOnScopingAnnotation`

A scoping annotation's Target should include TYPE and METHOD.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InjectInvalidTargetingOnScopingAnnotation).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/InjectInvalidTargetingOnScopingAnnotation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InjectInvalidTargetingOnScopingAnnotation)

<a id="errorprone-injectmorethanonescopeannotationonclass"></a>

### `errorprone/InjectMoreThanOneScopeAnnotationOnClass`

A class can be annotated with at most one scope annotation.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InjectMoreThanOneScopeAnnotationOnClass).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/InjectMoreThanOneScopeAnnotationOnClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InjectMoreThanOneScopeAnnotationOnClass)

<a id="errorprone-injectonbugcheckers"></a>

### `errorprone/InjectOnBugCheckers`

BugChecker constructors should be marked @Inject.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InjectOnBugCheckers).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/InjectOnBugCheckers","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InjectOnBugCheckers)

<a id="errorprone-injectonconstructorofabstractclass"></a>

### `errorprone/InjectOnConstructorOfAbstractClass`

Constructors on abstract classes are never directly @Inject'ed, only the constructors of their subclasses can be @Inject'ed.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InjectOnConstructorOfAbstractClass).
- **Fix:** With `nitpicker --fix --rule errorprone/InjectOnConstructorOfAbstractClass`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/InjectOnConstructorOfAbstractClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InjectOnConstructorOfAbstractClass)

<a id="errorprone-injectonmemberandconstructor"></a>

### `errorprone/InjectOnMemberAndConstructor`

Members shouldn't be annotated with @Inject if constructor is already annotated @Inject.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InjectOnMemberAndConstructor).
- **Fix:** With `nitpicker --fix --rule errorprone/InjectOnMemberAndConstructor`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/InjectOnMemberAndConstructor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InjectOnMemberAndConstructor)

<a id="errorprone-injectscopeannotationoninterfaceorabstractclass"></a>

### `errorprone/InjectScopeAnnotationOnInterfaceOrAbstractClass`

Scope annotation on an interface or abstract class is not allowed.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InjectScopeAnnotationOnInterfaceOrAbstractClass).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/InjectScopeAnnotationOnInterfaceOrAbstractClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InjectScopeAnnotationOnInterfaceOrAbstractClass)

<a id="errorprone-inlinemeinliner"></a>

### `errorprone/InlineMeInliner`

Callers of this API should be inlined.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InlineMeInliner).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/InlineMeInliner","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InlineMeInliner)

<a id="errorprone-inlinemevalidator"></a>

### `errorprone/InlineMeValidator`

Ensures that the @InlineMe annotation is used correctly.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InlineMeValidator).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/InlineMeValidator","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InlineMeValidator)

<a id="errorprone-inlinetrivialconstant"></a>

### `errorprone/InlineTrivialConstant`

Consider inlining this constant.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InlineTrivialConstant).
- **Fix:** With `nitpicker --fix --rule errorprone/InlineTrivialConstant`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/InlineTrivialConstant","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InlineTrivialConstant)

<a id="errorprone-inputstreamslowmultibyteread"></a>

### `errorprone/InputStreamSlowMultibyteRead`

Please also override int read(byte[], int, int), otherwise multi-byte reads from this input stream are likely to be slow.

- **Labels:** performance
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InputStreamSlowMultibyteRead).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/InputStreamSlowMultibyteRead","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InputStreamSlowMultibyteRead)

<a id="errorprone-insecurecryptousage"></a>

### `errorprone/InsecureCryptoUsage`

A standard cryptographic operation is used in a mode that is prone to vulnerabilities.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InsecureCryptoUsage).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/InsecureCryptoUsage","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InsecureCryptoUsage)

<a id="errorprone-instanceofandcastmatchwrongtype"></a>

### `errorprone/InstanceOfAndCastMatchWrongType`

Casting inside an if block should be plausibly consistent with the instanceof type.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InstanceOfAndCastMatchWrongType).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/InstanceOfAndCastMatchWrongType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InstanceOfAndCastMatchWrongType)

<a id="errorprone-instanttemporalunit"></a>

### `errorprone/InstantTemporalUnit`

Instant APIs only work for NANOS, MICROS, MILLIS, SECONDS, MINUTES, HOURS, HALF_DAYS and DAYS.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InstantTemporalUnit).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/InstantTemporalUnit","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InstantTemporalUnit)

<a id="errorprone-interruptedexceptionswallowed"></a>

### `errorprone/InterruptedExceptionSwallowed`

This catch block appears to be catching an explicitly declared InterruptedException as an Exception/Throwable and not handling the interruption separately.

- **Labels:** reliability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InterruptedExceptionSwallowed).
- **Fix:** With `nitpicker --fix --rule errorprone/InterruptedExceptionSwallowed`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/InterruptedExceptionSwallowed","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InterruptedExceptionSwallowed)

<a id="errorprone-interruptedincatchblock"></a>

### `errorprone/InterruptedInCatchBlock`

Did you mean to call Thread.currentThread().interrupt() instead of Thread.interrupted()?

- **Labels:** reliability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InterruptedInCatchBlock).
- **Fix:** With `nitpicker --fix --rule errorprone/InterruptedInCatchBlock`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/InterruptedInCatchBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InterruptedInCatchBlock)

<a id="errorprone-interruption"></a>

### `errorprone/Interruption`

Always pass 'false' to 'Future.cancel()', unless you are propagating a cancellation-with-interrupt from another caller.

- **Labels:** bug, async
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/Interruption).
- **Fix:** With `nitpicker --fix --rule errorprone/Interruption`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/Interruption","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/Interruption)

<a id="errorprone-intfloatconversion"></a>

### `errorprone/IntFloatConversion`

Conversion from int to float may lose precision; use an explicit cast to float if this was intentional.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/IntFloatConversion).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/IntFloatConversion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IntFloatConversion)

<a id="errorprone-intliteralcast"></a>

### `errorprone/IntLiteralCast`

Consider using a literal of the desired type instead of casting an int literal.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/IntLiteralCast).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/IntLiteralCast","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IntLiteralCast)

<a id="errorprone-intlongmath"></a>

### `errorprone/IntLongMath`

Expression of type int may overflow before being assigned to a long.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/IntLongMath).
- **Fix:** With `nitpicker --fix --rule errorprone/IntLongMath`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/IntLongMath","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IntLongMath)

<a id="errorprone-invalidblocktag"></a>

### `errorprone/InvalidBlockTag`

This tag is invalid.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidBlockTag).
- **Fix:** With `nitpicker --fix --rule errorprone/InvalidBlockTag`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/InvalidBlockTag","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidBlockTag)

<a id="errorprone-invalidinlinetag"></a>

### `errorprone/InvalidInlineTag`

This tag is invalid.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidInlineTag).
- **Fix:** With `nitpicker --fix --rule errorprone/InvalidInlineTag`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/InvalidInlineTag","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidInlineTag)

<a id="errorprone-invalidjavatimeconstant"></a>

### `errorprone/InvalidJavaTimeConstant`

This checker errors on calls to java.time methods using values that are guaranteed to throw a DateTimeException.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidJavaTimeConstant).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/InvalidJavaTimeConstant","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidJavaTimeConstant)

<a id="errorprone-invalidlink"></a>

### `errorprone/InvalidLink`

This @link tag looks wrong.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidLink).
- **Fix:** With `nitpicker --fix --rule errorprone/InvalidLink`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/InvalidLink","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidLink)

<a id="errorprone-invalidparam"></a>

### `errorprone/InvalidParam`

This @param tag doesn't refer to a parameter of the method.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidParam).
- **Fix:** With `nitpicker --fix --rule errorprone/InvalidParam`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/InvalidParam","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidParam)

<a id="errorprone-invalidpatternsyntax"></a>

### `errorprone/InvalidPatternSyntax`

Invalid syntax used for a regular expression.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidPatternSyntax).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/InvalidPatternSyntax","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidPatternSyntax)

<a id="errorprone-invalidsnippet"></a>

### `errorprone/InvalidSnippet`

This tag is invalid.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidSnippet).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/InvalidSnippet","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidSnippet)

<a id="errorprone-invalidthrows"></a>

### `errorprone/InvalidThrows`

The documented method doesn't actually throw this checked exception.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidThrows).
- **Fix:** With `nitpicker --fix --rule errorprone/InvalidThrows`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/InvalidThrows","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidThrows)

<a id="errorprone-invalidthrowslink"></a>

### `errorprone/InvalidThrowsLink`

Don't use {@link} or {@code} in @throws tags; mention the exception name directly (e.g., @throws IOException, not @throws {@link IOException}).

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidThrowsLink).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/InvalidThrowsLink","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidThrowsLink)

<a id="errorprone-invalidtimezoneid"></a>

### `errorprone/InvalidTimeZoneID`

Invalid time zone identifier. TimeZone.getTimeZone(String) will silently return GMT instead of the time zone you intended.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidTimeZoneID).
- **Fix:** With `nitpicker --fix --rule errorprone/InvalidTimeZoneID`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/InvalidTimeZoneID","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidTimeZoneID)

<a id="errorprone-invalidzoneid"></a>

### `errorprone/InvalidZoneId`

Invalid zone identifier. ZoneId.of(String) will throw exception at runtime.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidZoneId).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/InvalidZoneId","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidZoneId)

<a id="errorprone-isinstanceincompatibletype"></a>

### `errorprone/IsInstanceIncompatibleType`

This use of isInstance will always evaluate to false.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/IsInstanceIncompatibleType).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/IsInstanceIncompatibleType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IsInstanceIncompatibleType)

<a id="errorprone-isinstanceofclass"></a>

### `errorprone/IsInstanceOfClass`

The argument to Class#isInstance(Object) should not be a Class.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/IsInstanceOfClass).
- **Fix:** With `nitpicker --fix --rule errorprone/IsInstanceOfClass`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/IsInstanceOfClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IsInstanceOfClass)

<a id="errorprone-isloggabletaglength"></a>

### `errorprone/IsLoggableTagLength`

Log tag too long, cannot exceed 23 characters.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/IsLoggableTagLength).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/IsLoggableTagLength","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IsLoggableTagLength)

<a id="errorprone-iterableanditerator"></a>

### `errorprone/IterableAndIterator`

Class should not implement both `Iterable` and `Iterator`.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/IterableAndIterator).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/IterableAndIterator","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IterableAndIterator)

<a id="errorprone-iterablepathparameter"></a>

### `errorprone/IterablePathParameter`

Path implements Iterable\<Path>; prefer Collection\<Path> for clarity.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/IterablePathParameter).
- **Fix:** With `nitpicker --fix --rule errorprone/IterablePathParameter`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/IterablePathParameter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IterablePathParameter)

<a id="errorprone-javadurationgetsecondsgetnano"></a>

### `errorprone/JavaDurationGetSecondsGetNano`

Duration.getNano() only accesses the underlying nanosecond adjustment from the whole second.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaDurationGetSecondsGetNano).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/JavaDurationGetSecondsGetNano","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaDurationGetSecondsGetNano)

<a id="errorprone-javadurationgetsecondstotoseconds"></a>

### `errorprone/JavaDurationGetSecondsToToSeconds`

Prefer duration.toSeconds() over duration.getSeconds().

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaDurationGetSecondsToToSeconds).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/JavaDurationGetSecondsToToSeconds","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaDurationGetSecondsToToSeconds)

<a id="errorprone-javadurationwithnanos"></a>

### `errorprone/JavaDurationWithNanos`

Use of java.time.Duration.withNanos(int) is not allowed.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaDurationWithNanos).
- **Fix:** With `nitpicker --fix --rule errorprone/JavaDurationWithNanos`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/JavaDurationWithNanos","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaDurationWithNanos)

<a id="errorprone-javadurationwithseconds"></a>

### `errorprone/JavaDurationWithSeconds`

Use of java.time.Duration.withSeconds(long) is not allowed.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaDurationWithSeconds).
- **Fix:** With `nitpicker --fix --rule errorprone/JavaDurationWithSeconds`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/JavaDurationWithSeconds","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaDurationWithSeconds)

<a id="errorprone-javainstantgetsecondsgetnano"></a>

### `errorprone/JavaInstantGetSecondsGetNano`

Instant.getNano() only accesses the underlying nanosecond adjustment from the whole second.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaInstantGetSecondsGetNano).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/JavaInstantGetSecondsGetNano","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaInstantGetSecondsGetNano)

<a id="errorprone-javalocaldatetimegetnano"></a>

### `errorprone/JavaLocalDateTimeGetNano`

LocalDateTime.getNano() only access the nanos-of-second field. It's rare to only use getNano() without a nearby getSecond() call.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaLocalDateTimeGetNano).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/JavaLocalDateTimeGetNano","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaLocalDateTimeGetNano)

<a id="errorprone-javalocaltimegetnano"></a>

### `errorprone/JavaLocalTimeGetNano`

LocalTime.getNano() only accesses the nanos-of-second field. It's rare to only use getNano() without a nearby getSecond() call.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaLocalTimeGetNano).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/JavaLocalTimeGetNano","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaLocalTimeGetNano)

<a id="errorprone-javaperiodgetdays"></a>

### `errorprone/JavaPeriodGetDays`

Period.getDays() only accesses the "days" portion of the Period, and doesn't represent the total span of time of the period. Consider using org.threeten.extra.Days to extract the difference between two civil dates if you want the whole time.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaPeriodGetDays).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/JavaPeriodGetDays","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaPeriodGetDays)

<a id="errorprone-javatimedefaulttimezone"></a>

### `errorprone/JavaTimeDefaultTimeZone`

Java.time APIs that silently use the default system time-zone are not allowed.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaTimeDefaultTimeZone).
- **Fix:** With `nitpicker --fix --rule errorprone/JavaTimeDefaultTimeZone`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/JavaTimeDefaultTimeZone","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaTimeDefaultTimeZone)

<a id="errorprone-javautildate"></a>

### `errorprone/JavaUtilDate`

Date has a bad API that leads to bugs; prefer java.time.Instant or LocalDate.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaUtilDate).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/JavaUtilDate","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaUtilDate)

<a id="errorprone-javaxinjectonabstractmethod"></a>

### `errorprone/JavaxInjectOnAbstractMethod`

Abstract and default methods are not injectable with javax.inject.Inject.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaxInjectOnAbstractMethod).
- **Fix:** With `nitpicker --fix --rule errorprone/JavaxInjectOnAbstractMethod`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/JavaxInjectOnAbstractMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaxInjectOnAbstractMethod)

<a id="errorprone-javaxinjectonfinalfield"></a>

### `errorprone/JavaxInjectOnFinalField`

@javax.inject.Inject cannot be put on a final field.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaxInjectOnFinalField).
- **Fix:** With `nitpicker --fix --rule errorprone/JavaxInjectOnFinalField`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/JavaxInjectOnFinalField","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaxInjectOnFinalField)

<a id="errorprone-jdkobsolete"></a>

### `errorprone/JdkObsolete`

Suggests alternatives to obsolete JDK classes.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JdkObsolete).
- **Fix:** With `nitpicker --fix --rule errorprone/JdkObsolete`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/JdkObsolete","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JdkObsolete)

<a id="errorprone-jodaconstructors"></a>

### `errorprone/JodaConstructors`

Use of certain JodaTime constructors are not allowed.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaConstructors).
- **Fix:** With `nitpicker --fix --rule errorprone/JodaConstructors`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/JodaConstructors","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaConstructors)

<a id="errorprone-jodadatetimeconstants"></a>

### `errorprone/JodaDateTimeConstants`

Using the `_PER_` constants in `DateTimeConstants` is problematic because they encourage manual date/time math.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaDateTimeConstants).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/JodaDateTimeConstants","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaDateTimeConstants)

<a id="errorprone-jodadurationwithmillis"></a>

### `errorprone/JodaDurationWithMillis`

Use of duration.withMillis(long) is not allowed. Please use Duration.millis(long) instead.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaDurationWithMillis).
- **Fix:** With `nitpicker --fix --rule errorprone/JodaDurationWithMillis`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/JodaDurationWithMillis","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaDurationWithMillis)

<a id="errorprone-jodainstantwithmillis"></a>

### `errorprone/JodaInstantWithMillis`

Use of instant.withMillis(long) is not allowed. Use Instant.ofEpochMilli(long) instead.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaInstantWithMillis).
- **Fix:** With `nitpicker --fix --rule errorprone/JodaInstantWithMillis`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/JodaInstantWithMillis","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaInstantWithMillis)

<a id="errorprone-jodanewperiod"></a>

### `errorprone/JodaNewPeriod`

This may have surprising semantics, e.g. new Period(LocalDate.parse("1970-01-01"), LocalDate.parse("1970-02-02")).getDays() == 1, not 32.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaNewPeriod).
- **Fix:** With `nitpicker --fix --rule errorprone/JodaNewPeriod`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/JodaNewPeriod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaNewPeriod)

<a id="errorprone-jodaplusminuslong"></a>

### `errorprone/JodaPlusMinusLong`

Use of JodaTime's type.plus(long) or type.minus(long) is not allowed (where \<type> = {Duration,Instant,DateTime,DateMidnight}). Please use type.plus(Duration.millis(long)) or type.minus(Duration.millis(long)) instead.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaPlusMinusLong).
- **Fix:** With `nitpicker --fix --rule errorprone/JodaPlusMinusLong`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/JodaPlusMinusLong","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaPlusMinusLong)

<a id="errorprone-jodatimeconvertermanager"></a>

### `errorprone/JodaTimeConverterManager`

Joda-Time's ConverterManager makes the semantics of DateTime/Instant/etc construction subject to global static state. If you need to define your own converters, use a helper.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaTimeConverterManager).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/JodaTimeConverterManager","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaTimeConverterManager)

<a id="errorprone-jodatoself"></a>

### `errorprone/JodaToSelf`

Use of Joda-Time's DateTime.toDateTime(), Duration.toDuration(), Instant.toInstant(), Interval.toInterval(), and Period.toPeriod() are not allowed.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaToSelf).
- **Fix:** With `nitpicker --fix --rule errorprone/JodaToSelf`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/JodaToSelf","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaToSelf)

<a id="errorprone-jodawithdurationaddedlong"></a>

### `errorprone/JodaWithDurationAddedLong`

Use of JodaTime's type.withDurationAdded(long, int) (where \<type> = {Duration,Instant,DateTime}). Please use type.withDurationAdded(Duration.millis(long), int) instead.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaWithDurationAddedLong).
- **Fix:** With `nitpicker --fix --rule errorprone/JodaWithDurationAddedLong`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/JodaWithDurationAddedLong","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaWithDurationAddedLong)

<a id="errorprone-junit3floatingpointcomparisonwithoutdelta"></a>

### `errorprone/JUnit3FloatingPointComparisonWithoutDelta`

Floating-point comparison without error tolerance.

- **Labels:** bug, tests
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit3FloatingPointComparisonWithoutDelta).
- **Fix:** With `nitpicker --fix --rule errorprone/JUnit3FloatingPointComparisonWithoutDelta`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/JUnit3FloatingPointComparisonWithoutDelta","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit3FloatingPointComparisonWithoutDelta)

<a id="errorprone-junit3testnotrun"></a>

### `errorprone/JUnit3TestNotRun`

Test method will not be run; please correct method signature (Should be public, non-static, and method name should begin with "test").

- **Labels:** bug, tests
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit3TestNotRun).
- **Fix:** With `nitpicker --fix --rule errorprone/JUnit3TestNotRun`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/JUnit3TestNotRun","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit3TestNotRun)

<a id="errorprone-junit4classannotationnonstatic"></a>

### `errorprone/JUnit4ClassAnnotationNonStatic`

This method should be static.

- **Labels:** bug, tests
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit4ClassAnnotationNonStatic).
- **Fix:** With `nitpicker --fix --rule errorprone/JUnit4ClassAnnotationNonStatic`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/JUnit4ClassAnnotationNonStatic","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit4ClassAnnotationNonStatic)

<a id="errorprone-junit4classusedinjunit3"></a>

### `errorprone/JUnit4ClassUsedInJUnit3`

Some JUnit4 construct cannot be used in a JUnit3 context. Convert your class to JUnit4 style to use them.

- **Labels:** bug, tests
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit4ClassUsedInJUnit3).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/JUnit4ClassUsedInJUnit3","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit4ClassUsedInJUnit3)

<a id="errorprone-junit4emptymethods"></a>

### `errorprone/JUnit4EmptyMethods`

Empty JUnit4 @Before, @After, @BeforeClass, and @AfterClass methods are unnecessary and should be deleted.

- **Labels:** tests
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit4EmptyMethods).
- **Fix:** With `nitpicker --fix --rule errorprone/JUnit4EmptyMethods`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/JUnit4EmptyMethods","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit4EmptyMethods)

<a id="errorprone-junit4setupnotrun"></a>

### `errorprone/JUnit4SetUpNotRun`

SetUp() method will not be run; please add JUnit's @Before annotation.

- **Labels:** bug, tests
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit4SetUpNotRun).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/JUnit4SetUpNotRun","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit4SetUpNotRun)

<a id="errorprone-junit4teardownnotrun"></a>

### `errorprone/JUnit4TearDownNotRun`

TearDown() method will not be run; please add JUnit's @After annotation.

- **Labels:** bug, tests
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit4TearDownNotRun).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/JUnit4TearDownNotRun","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit4TearDownNotRun)

<a id="errorprone-junit4testnotrun"></a>

### `errorprone/JUnit4TestNotRun`

This looks like a test method but is not run; please add @Test and @Ignore, or, if this is a helper method, reduce its visibility.

- **Labels:** bug, tests
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit4TestNotRun).
- **Fix:** With `nitpicker --fix --rule errorprone/JUnit4TestNotRun`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/JUnit4TestNotRun","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit4TestNotRun)

<a id="errorprone-junit4testsnotrunwithinenclosed"></a>

### `errorprone/JUnit4TestsNotRunWithinEnclosed`

This test is annotated @Test, but given it's within a class using the Enclosed runner, will not run.

- **Labels:** bug, tests
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit4TestsNotRunWithinEnclosed).
- **Fix:** With `nitpicker --fix --rule errorprone/JUnit4TestsNotRunWithinEnclosed`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/JUnit4TestsNotRunWithinEnclosed","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit4TestsNotRunWithinEnclosed)

<a id="errorprone-junitambiguoustestclass"></a>

### `errorprone/JUnitAmbiguousTestClass`

Test class inherits from JUnit 3's TestCase but has JUnit 4 @Test or @RunWith annotations.

- **Labels:** bug, tests
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnitAmbiguousTestClass).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/JUnitAmbiguousTestClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnitAmbiguousTestClass)

<a id="errorprone-junitassertsamecheck"></a>

### `errorprone/JUnitAssertSameCheck`

An object is tested for reference equality to itself using JUnit library.

- **Labels:** bug, tests
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnitAssertSameCheck).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/JUnitAssertSameCheck","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnitAssertSameCheck)

<a id="errorprone-junitincompatibletype"></a>

### `errorprone/JUnitIncompatibleType`

The types passed to this assertion are incompatible.

- **Labels:** bug, tests
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnitIncompatibleType).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/JUnitIncompatibleType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnitIncompatibleType)

<a id="errorprone-junitmethodinvoked"></a>

### `errorprone/JUnitMethodInvoked`

Directly invoking a JUnit test method is discouraged; only the JUnit test runner should call these methods. If you need to share logic between tests, extract a helper method or class.

- **Labels:** tests
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnitMethodInvoked).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/JUnitMethodInvoked","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnitMethodInvoked)

<a id="errorprone-junitparametermethodnotfound"></a>

### `errorprone/JUnitParameterMethodNotFound`

The method for providing parameters was not found.

- **Labels:** bug, tests
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnitParameterMethodNotFound).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/JUnitParameterMethodNotFound","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnitParameterMethodNotFound)

<a id="errorprone-labelledbreaktarget"></a>

### `errorprone/LabelledBreakTarget`

Labels should only be used on loops.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/LabelledBreakTarget).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/LabelledBreakTarget","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LabelledBreakTarget)

<a id="errorprone-lambdafunctionalinterface"></a>

### `errorprone/LambdaFunctionalInterface`

Use Java's utility functional interfaces instead of Function\<A, B> for primitive types.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/LambdaFunctionalInterface).
- **Fix:** With `nitpicker --fix --rule errorprone/LambdaFunctionalInterface`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/LambdaFunctionalInterface","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LambdaFunctionalInterface)

<a id="errorprone-lenientformatstringvalidation"></a>

### `errorprone/LenientFormatStringValidation`

The number of arguments provided to lenient format methods should match the positional specifiers.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/LenientFormatStringValidation).
- **Fix:** With `nitpicker --fix --rule errorprone/LenientFormatStringValidation`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/LenientFormatStringValidation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LenientFormatStringValidation)

<a id="errorprone-listremoveambiguous"></a>

### `errorprone/ListRemoveAmbiguous`

Ambiguous call to List.remove; clarify if index-based or value-based removal was intended by adding a comment.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ListRemoveAmbiguous).
- **Fix:** With `nitpicker --fix --rule errorprone/ListRemoveAmbiguous`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ListRemoveAmbiguous","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ListRemoveAmbiguous)

<a id="errorprone-litebytestringutf8"></a>

### `errorprone/LiteByteStringUtf8`

This pattern will silently corrupt certain byte sequences from the serialized protocol message. Use ByteString or byte[] directly.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/LiteByteStringUtf8).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/LiteByteStringUtf8","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LiteByteStringUtf8)

<a id="errorprone-liteenumvalueof"></a>

### `errorprone/LiteEnumValueOf`

Instead of looking up a lite enum by name, use its numeric value since that is the stable part of the protocol defined by the enum.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/LiteEnumValueOf).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/LiteEnumValueOf","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LiteEnumValueOf)

<a id="errorprone-liteprototostring"></a>

### `errorprone/LiteProtoToString`

ToString() on lite protos will not generate a useful representation of the proto from optimized builds. Consider whether using some subset of fields instead would provide useful information.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/LiteProtoToString).
- **Fix:** With `nitpicker --fix --rule errorprone/LiteProtoToString`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/LiteProtoToString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LiteProtoToString)

<a id="errorprone-localdatetemporalamount"></a>

### `errorprone/LocalDateTemporalAmount`

LocalDate.plus() and minus() does not work with Durations. LocalDate represents civil time (years/months/days), so java.time.Period is the appropriate thing to add or subtract instead.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/LocalDateTemporalAmount).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/LocalDateTemporalAmount","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LocalDateTemporalAmount)

<a id="errorprone-locknotbeforetry"></a>

### `errorprone/LockNotBeforeTry`

Calls to Lock#lock should be immediately followed by a try block which releases the lock.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/LockNotBeforeTry).
- **Fix:** With `nitpicker --fix --rule errorprone/LockNotBeforeTry`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/LockNotBeforeTry","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LockNotBeforeTry)

<a id="errorprone-lockonboxedprimitive"></a>

### `errorprone/LockOnBoxedPrimitive`

It is dangerous to use a boxed primitive as a lock as it can unintentionally lead to sharing a lock with another piece of code.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/LockOnBoxedPrimitive).
- **Fix:** With `nitpicker --fix --rule errorprone/LockOnBoxedPrimitive`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/LockOnBoxedPrimitive","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LockOnBoxedPrimitive)

<a id="errorprone-lockonnonenclosingclassliteral"></a>

### `errorprone/LockOnNonEnclosingClassLiteral`

Lock on the class other than the enclosing class of the code block can unintentionally prevent the locked class being used properly.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/LockOnNonEnclosingClassLiteral).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/LockOnNonEnclosingClassLiteral","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LockOnNonEnclosingClassLiteral)

<a id="errorprone-logicalassignment"></a>

### `errorprone/LogicalAssignment`

Assignment where a boolean expression was expected; use == if this assignment wasn't expected or add parentheses for clarity.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/LogicalAssignment).
- **Fix:** With `nitpicker --fix --rule errorprone/LogicalAssignment`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/LogicalAssignment","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LogicalAssignment)

<a id="errorprone-longdoubleconversion"></a>

### `errorprone/LongDoubleConversion`

Conversion from long to double may lose precision; use an explicit cast to double if this was intentional.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/LongDoubleConversion).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/LongDoubleConversion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LongDoubleConversion)

<a id="errorprone-longfloatconversion"></a>

### `errorprone/LongFloatConversion`

Conversion from long to float may lose precision; use an explicit cast to float if this was intentional.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/LongFloatConversion).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/LongFloatConversion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LongFloatConversion)

<a id="errorprone-longliterallowercasesuffix"></a>

### `errorprone/LongLiteralLowerCaseSuffix`

Prefer 'L' to 'l' for the suffix to long literals.

- **Labels:** style
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/LongLiteralLowerCaseSuffix).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/LongLiteralLowerCaseSuffix","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LongLiteralLowerCaseSuffix)

<a id="errorprone-loopconditionchecker"></a>

### `errorprone/LoopConditionChecker`

Loop condition is never modified in loop body.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/LoopConditionChecker).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/LoopConditionChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LoopConditionChecker)

<a id="errorprone-loopoverchararray"></a>

### `errorprone/LoopOverCharArray`

ToCharArray allocates a new array, using charAt is more efficient.

- **Labels:** performance
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/LoopOverCharArray).
- **Fix:** With `nitpicker --fix --rule errorprone/LoopOverCharArray`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/LoopOverCharArray","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LoopOverCharArray)

<a id="errorprone-lossyprimitivecompare"></a>

### `errorprone/LossyPrimitiveCompare`

Using an unnecessarily-wide comparison method can lead to lossy comparison.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/LossyPrimitiveCompare).
- **Fix:** With `nitpicker --fix --rule errorprone/LossyPrimitiveCompare`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/LossyPrimitiveCompare","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LossyPrimitiveCompare)
