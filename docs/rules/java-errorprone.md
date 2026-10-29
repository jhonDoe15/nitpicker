# Java and Kotlin: Error Prone and NullAway checks

The Error Prone checks and NullAway that the Java and Kotlin presets compile Java sources with, with Gradle and Maven. This page lists 596 rules. [All pages](README.md).

The guide for these rules: [docs/java-preset.md#error-prone-and-nullaway](../java-preset.md#error-prone-and-nullaway).

The summaries are from Error Prone and NullAway 2.50.0 (NullAway 0.14.2): Error Prone is under the Apache License 2.0 and NullAway under the MIT License.

In the Java preset, an entry of `exceptions` names a finding as it prints, `<tool>/<rule>` with one of the tools `pmd`, `spotbugs`, `errorprone`, `archunit`, `google-java-format`, `palantir-java-format`, `jacoco`, `checkstyle`, `crap`, `duplicates`, `pit`, `structure`, `coupling`, `spring` and `test-runtime`, or one of these rules: `function-lines-limit`, `function-statements-limit`, `function-control-nesting-limit`, `function-parameters-limit`, `crap-score-limit`, `crap-coverage-unknown`, `changed-branch-coverage`, `mutant-survived`, `mutant-nocoverage`, `duplicate-clone`, `stability-direction`, `file-lines-limit`, `line-length-limit`, `folder-files-limit`, `slow-test`, `committed-env-file`, `committed-private-key`, `committed-binary`, `large-file`, `committed-build-output`, `co-change`, `test-only-export`, `test-console-output`, `folder-depth-limit`, `class-methods-limit`, `class-fields-limit` and `inheritance-depth-limit`. The Kotlin preset takes the same `<tool>/<rule>` form for the Java sources of a mixed module.

Unless an entry says otherwise:

- **Presets:** Java and Kotlin
- **Analyzers:** `java` (Java); `kotlin` (Kotlin)
- **Builds:** Gradle and Maven (Java); Gradle (Kotlin)

<a id="errorprone-addressselection"></a>

### `errorprone/AddressSelection`

Prefer InetAddress.getAllByName to APIs that convert a hostname to a single IP address.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AddressSelection).
- **Exception:** If this is intended, add `{"rule":"errorprone/AddressSelection","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AddressSelection)

<a id="errorprone-almostjavadoc"></a>

### `errorprone/AlmostJavadoc`

This comment contains Javadoc or HTML tags, but isn't started with a double asterisk (/\*\*); is it meant to be Javadoc?

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AlmostJavadoc).
- **Exception:** If this is intended, add `{"rule":"errorprone/AlmostJavadoc","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AlmostJavadoc)

<a id="errorprone-alreadychecked"></a>

### `errorprone/AlreadyChecked`

This condition has already been checked.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AlreadyChecked).
- **Exception:** If this is intended, add `{"rule":"errorprone/AlreadyChecked","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AlreadyChecked)

<a id="errorprone-alwaysthrows"></a>

### `errorprone/AlwaysThrows`

Statically detects calls that will always fail at runtime.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AlwaysThrows).
- **Exception:** If this is intended, add `{"rule":"errorprone/AlwaysThrows","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AlwaysThrows)

<a id="errorprone-ambiguousmethodreference"></a>

### `errorprone/AmbiguousMethodReference`

Method reference is ambiguous.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AmbiguousMethodReference).
- **Exception:** If this is intended, add `{"rule":"errorprone/AmbiguousMethodReference","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AmbiguousMethodReference)

<a id="errorprone-androidinjectionbeforesuper"></a>

### `errorprone/AndroidInjectionBeforeSuper`

AndroidInjection.inject() should always be invoked before calling super.lifecycleMethod().

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AndroidInjectionBeforeSuper).
- **Exception:** If this is intended, add `{"rule":"errorprone/AndroidInjectionBeforeSuper","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AndroidInjectionBeforeSuper)

<a id="errorprone-annotationposition"></a>

### `errorprone/AnnotationPosition`

Annotations should be positioned after Javadocs, but before modifiers.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s4.8.5-annotations).
- **Exception:** If this is intended, add `{"rule":"errorprone/AnnotationPosition","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s4.8.5-annotations)

<a id="errorprone-argumentselectiondefectchecker"></a>

### `errorprone/ArgumentSelectionDefectChecker`

Arguments are in the wrong order or could be commented for clarity.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ArgumentSelectionDefectChecker).
- **Exception:** If this is intended, add `{"rule":"errorprone/ArgumentSelectionDefectChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ArgumentSelectionDefectChecker)

<a id="errorprone-arrayaskeyofsetormap"></a>

### `errorprone/ArrayAsKeyOfSetOrMap`

Arrays do not override equals() or hashCode, so comparisons will be done on reference equality only. If neither deduplication nor lookup are needed, consider using a List instead. Otherwise, use IdentityHashMap/Set, a Map from a library that handles object arrays, or an Iterable/List of pairs.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ArrayAsKeyOfSetOrMap).
- **Exception:** If this is intended, add `{"rule":"errorprone/ArrayAsKeyOfSetOrMap","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ArrayAsKeyOfSetOrMap)

<a id="errorprone-arrayequals"></a>

### `errorprone/ArrayEquals`

Reference equality used to compare arrays.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ArrayEquals).
- **Exception:** If this is intended, add `{"rule":"errorprone/ArrayEquals","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ArrayEquals)

<a id="errorprone-arrayfillincompatibletype"></a>

### `errorprone/ArrayFillIncompatibleType`

Arrays.fill(Object[], Object) called with incompatible types.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ArrayFillIncompatibleType).
- **Exception:** If this is intended, add `{"rule":"errorprone/ArrayFillIncompatibleType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ArrayFillIncompatibleType)

<a id="errorprone-arrayhashcode"></a>

### `errorprone/ArrayHashCode`

Hashcode method on array does not hash array contents.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ArrayHashCode).
- **Exception:** If this is intended, add `{"rule":"errorprone/ArrayHashCode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ArrayHashCode)

<a id="errorprone-arrayrecordcomponent"></a>

### `errorprone/ArrayRecordComponent`

Record components should not be arrays.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ArrayRecordComponent).
- **Exception:** If this is intended, add `{"rule":"errorprone/ArrayRecordComponent","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ArrayRecordComponent)

<a id="errorprone-arraysaslistprimitivearray"></a>

### `errorprone/ArraysAsListPrimitiveArray`

Arrays.asList does not autobox primitive arrays, as one might expect.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ArraysAsListPrimitiveArray).
- **Exception:** If this is intended, add `{"rule":"errorprone/ArraysAsListPrimitiveArray","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ArraysAsListPrimitiveArray)

<a id="errorprone-arraytostring"></a>

### `errorprone/ArrayToString`

Calling toString on an array does not provide useful information.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ArrayToString).
- **Exception:** If this is intended, add `{"rule":"errorprone/ArrayToString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ArrayToString)

<a id="errorprone-assertequalsargumentorderchecker"></a>

### `errorprone/AssertEqualsArgumentOrderChecker`

Arguments are swapped in assertEquals-like call.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AssertEqualsArgumentOrderChecker).
- **Exception:** If this is intended, add `{"rule":"errorprone/AssertEqualsArgumentOrderChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AssertEqualsArgumentOrderChecker)

<a id="errorprone-assertfalse"></a>

### `errorprone/AssertFalse`

Assertions may be disabled at runtime and do not guarantee that execution will halt here; consider throwing an exception instead.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AssertFalse).
- **Exception:** If this is intended, add `{"rule":"errorprone/AssertFalse","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AssertFalse)

<a id="errorprone-assertionfailureignored"></a>

### `errorprone/AssertionFailureIgnored`

This assertion throws an AssertionError if it fails, which will be caught by an enclosing try block.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AssertionFailureIgnored).
- **Exception:** If this is intended, add `{"rule":"errorprone/AssertionFailureIgnored","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AssertionFailureIgnored)

<a id="errorprone-assertsameincompatible"></a>

### `errorprone/AssertSameIncompatible`

The types passed to this assertion are incompatible.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AssertSameIncompatible).
- **Exception:** If this is intended, add `{"rule":"errorprone/AssertSameIncompatible","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AssertSameIncompatible)

<a id="errorprone-assertthrowsblocktoexpression"></a>

### `errorprone/AssertThrowsBlockToExpression`

AssertThrows calls with lambdas containing a single statement can be expressed more concisely.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AssertThrowsBlockToExpression).
- **Exception:** If this is intended, add `{"rule":"errorprone/AssertThrowsBlockToExpression","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AssertThrowsBlockToExpression)

<a id="errorprone-assertthrowsminimizer"></a>

### `errorprone/AssertThrowsMinimizer`

Minimize the amount of logic in assertThrows.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AssertThrowsMinimizer).
- **Exception:** If this is intended, add `{"rule":"errorprone/AssertThrowsMinimizer","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AssertThrowsMinimizer)

<a id="errorprone-assertthrowsmultiplestatements"></a>

### `errorprone/AssertThrowsMultipleStatements`

The lambda passed to assertThrows should contain exactly one statement.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AssertThrowsMultipleStatements).
- **Exception:** If this is intended, add `{"rule":"errorprone/AssertThrowsMultipleStatements","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AssertThrowsMultipleStatements)

<a id="errorprone-assignmentexpression"></a>

### `errorprone/AssignmentExpression`

The use of an assignment expression can be surprising and hard to read; consider factoring out the assignment to a separate statement.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AssignmentExpression).
- **Exception:** If this is intended, add `{"rule":"errorprone/AssignmentExpression","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AssignmentExpression)

<a id="errorprone-assistedinjectandinjectonconstructors"></a>

### `errorprone/AssistedInjectAndInjectOnConstructors`

@AssistedInject and @Inject should not be used on different constructors in the same class.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AssistedInjectAndInjectOnConstructors).
- **Exception:** If this is intended, add `{"rule":"errorprone/AssistedInjectAndInjectOnConstructors","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AssistedInjectAndInjectOnConstructors)

<a id="errorprone-assistedinjectandinjectonsameconstructor"></a>

### `errorprone/AssistedInjectAndInjectOnSameConstructor`

@AssistedInject and @Inject cannot be used on the same constructor.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AssistedInjectAndInjectOnSameConstructor).
- **Exception:** If this is intended, add `{"rule":"errorprone/AssistedInjectAndInjectOnSameConstructor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AssistedInjectAndInjectOnSameConstructor)

<a id="errorprone-asthelperssuggestions"></a>

### `errorprone/ASTHelpersSuggestions`

Prefer ASTHelpers instead of calling this API directly.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ASTHelpersSuggestions).
- **Exception:** If this is intended, add `{"rule":"errorprone/ASTHelpersSuggestions","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ASTHelpersSuggestions)

<a id="errorprone-asynccallablereturnsnull"></a>

### `errorprone/AsyncCallableReturnsNull`

AsyncCallable should not return a null Future, only a Future whose result is null.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AsyncCallableReturnsNull).
- **Exception:** If this is intended, add `{"rule":"errorprone/AsyncCallableReturnsNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AsyncCallableReturnsNull)

<a id="errorprone-asyncfunctionreturnsnull"></a>

### `errorprone/AsyncFunctionReturnsNull`

AsyncFunction should not return a null Future, only a Future whose result is null.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AsyncFunctionReturnsNull).
- **Exception:** If this is intended, add `{"rule":"errorprone/AsyncFunctionReturnsNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AsyncFunctionReturnsNull)

<a id="errorprone-attemptednegativezero"></a>

### `errorprone/AttemptedNegativeZero`

-0 is the same as 0. For the floating-point negative zero, use -0.0.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AttemptedNegativeZero).
- **Exception:** If this is intended, add `{"rule":"errorprone/AttemptedNegativeZero","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AttemptedNegativeZero)

<a id="errorprone-autofactoryatinject"></a>

### `errorprone/AutoFactoryAtInject`

@AutoFactory and @Inject should not be used in the same type.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AutoFactoryAtInject).
- **Exception:** If this is intended, add `{"rule":"errorprone/AutoFactoryAtInject","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AutoFactoryAtInject)

<a id="errorprone-autovalueboxedvalues"></a>

### `errorprone/AutoValueBoxedValues`

AutoValue instances should not usually contain boxed types that are not Nullable. We recommend removing the unnecessary boxing.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AutoValueBoxedValues).
- **Exception:** If this is intended, add `{"rule":"errorprone/AutoValueBoxedValues","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AutoValueBoxedValues)

<a id="errorprone-autovaluebuilderdefaultsinconstructor"></a>

### `errorprone/AutoValueBuilderDefaultsInConstructor`

Defaults for AutoValue Builders should be set in the factory method returning Builder instances, not the constructor.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AutoValueBuilderDefaultsInConstructor).
- **Exception:** If this is intended, add `{"rule":"errorprone/AutoValueBuilderDefaultsInConstructor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AutoValueBuilderDefaultsInConstructor)

<a id="errorprone-autovalueconstructororderchecker"></a>

### `errorprone/AutoValueConstructorOrderChecker`

Arguments to AutoValue constructor are in the wrong order.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AutoValueConstructorOrderChecker).
- **Exception:** If this is intended, add `{"rule":"errorprone/AutoValueConstructorOrderChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AutoValueConstructorOrderChecker)

<a id="errorprone-autovaluefinalmethods"></a>

### `errorprone/AutoValueFinalMethods`

Make toString(), hashCode() and equals() final in AutoValue classes, so it is clear to readers that AutoValue is not overriding them.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AutoValueFinalMethods).
- **Exception:** If this is intended, add `{"rule":"errorprone/AutoValueFinalMethods","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AutoValueFinalMethods)

<a id="errorprone-autovalueimmutablefields"></a>

### `errorprone/AutoValueImmutableFields`

AutoValue recommends using immutable collections.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AutoValueImmutableFields).
- **Exception:** If this is intended, add `{"rule":"errorprone/AutoValueImmutableFields","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AutoValueImmutableFields)

<a id="errorprone-autovaluesubclassleaked"></a>

### `errorprone/AutoValueSubclassLeaked`

Do not refer to the autogenerated AutoValue\_ class outside the file containing the corresponding @AutoValue base class.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AutoValueSubclassLeaked).
- **Exception:** If this is intended, add `{"rule":"errorprone/AutoValueSubclassLeaked","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AutoValueSubclassLeaked)

<a id="errorprone-avoidcommontypenames"></a>

### `errorprone/AvoidCommonTypeNames`

Never reuse class names from java.lang.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AvoidCommonTypeNames).
- **Exception:** If this is intended, add `{"rule":"errorprone/AvoidCommonTypeNames","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AvoidCommonTypeNames)

<a id="errorprone-avoidvaluesetter"></a>

### `errorprone/AvoidValueSetter`

Prefer using the enum-accepting rather than the int-accepting setter for enum fields.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/AvoidValueSetter).
- **Exception:** If this is intended, add `{"rule":"errorprone/AvoidValueSetter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AvoidValueSetter)

<a id="errorprone-badannotationimplementation"></a>

### `errorprone/BadAnnotationImplementation`

Classes that implement Annotation must override equals and hashCode. Consider using AutoAnnotation instead of implementing Annotation by hand.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BadAnnotationImplementation).
- **Exception:** If this is intended, add `{"rule":"errorprone/BadAnnotationImplementation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BadAnnotationImplementation)

<a id="errorprone-badcomparable"></a>

### `errorprone/BadComparable`

Possible sign flip from narrowing conversion.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BadComparable).
- **Exception:** If this is intended, add `{"rule":"errorprone/BadComparable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BadComparable)

<a id="errorprone-badimport"></a>

### `errorprone/BadImport`

Importing nested classes/static methods/static fields with commonly-used names can make code harder to read, because it may not be clear from the context exactly which type is being referred to. Qualifying the name with that of the containing class can make the code clearer.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BadImport).
- **Exception:** If this is intended, add `{"rule":"errorprone/BadImport","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BadImport)

<a id="errorprone-badinstanceof"></a>

### `errorprone/BadInstanceof`

Instanceof used in a way that is equivalent to a null check.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BadInstanceof).
- **Exception:** If this is intended, add `{"rule":"errorprone/BadInstanceof","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BadInstanceof)

<a id="errorprone-badshiftamount"></a>

### `errorprone/BadShiftAmount`

Shift by an amount that is out of range.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BadShiftAmount).
- **Exception:** If this is intended, add `{"rule":"errorprone/BadShiftAmount","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BadShiftAmount)

<a id="errorprone-banclassloader"></a>

### `errorprone/BanClassLoader`

Using dangerous ClassLoader APIs may deserialize untrusted user input into bytecode, leading to remote code execution vulnerabilities.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BanClassLoader).
- **Exception:** If this is intended, add `{"rule":"errorprone/BanClassLoader","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BanClassLoader)

<a id="errorprone-banjndi"></a>

### `errorprone/BanJNDI`

Using JNDI may deserialize user input via the `Serializable` API which is extremely dangerous.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BanJNDI).
- **Exception:** If this is intended, add `{"rule":"errorprone/BanJNDI","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BanJNDI)

<a id="errorprone-banserializableread"></a>

### `errorprone/BanSerializableRead`

Deserializing user input via the `Serializable` API is extremely dangerous.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BanSerializableRead).
- **Exception:** If this is intended, add `{"rule":"errorprone/BanSerializableRead","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BanSerializableRead)

<a id="errorprone-baredotmetacharacter"></a>

### `errorprone/BareDotMetacharacter`

"." is rarely useful as a regex, as it matches any character. To match a literal '.' character, instead write "\\.".

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BareDotMetacharacter).
- **Exception:** If this is intended, add `{"rule":"errorprone/BareDotMetacharacter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BareDotMetacharacter)

<a id="errorprone-bigdecimalequals"></a>

### `errorprone/BigDecimalEquals`

BigDecimal#equals has surprising behavior: it also compares scale.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BigDecimalEquals).
- **Exception:** If this is intended, add `{"rule":"errorprone/BigDecimalEquals","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BigDecimalEquals)

<a id="errorprone-bigdecimalliteraldouble"></a>

### `errorprone/BigDecimalLiteralDouble`

New BigDecimal(double) loses precision in this case.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BigDecimalLiteralDouble).
- **Exception:** If this is intended, add `{"rule":"errorprone/BigDecimalLiteralDouble","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BigDecimalLiteralDouble)

<a id="errorprone-binderidentityrestoreddangerously"></a>

### `errorprone/BinderIdentityRestoredDangerously`

A call to Binder.clearCallingIdentity() should be followed by Binder.restoreCallingIdentity() in a finally block. Otherwise the wrong Binder identity may be used by subsequent code.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BinderIdentityRestoredDangerously).
- **Exception:** If this is intended, add `{"rule":"errorprone/BinderIdentityRestoredDangerously","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BinderIdentityRestoredDangerously)

<a id="errorprone-bindingtounqualifiedcommontype"></a>

### `errorprone/BindingToUnqualifiedCommonType`

This code declares a binding for a common value type without a Qualifier annotation.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BindingToUnqualifiedCommonType).
- **Exception:** If this is intended, add `{"rule":"errorprone/BindingToUnqualifiedCommonType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BindingToUnqualifiedCommonType)

<a id="errorprone-booleanliteral"></a>

### `errorprone/BooleanLiteral`

This expression can be written more clearly with a boolean literal.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BooleanLiteral).
- **Exception:** If this is intended, add `{"rule":"errorprone/BooleanLiteral","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BooleanLiteral)

<a id="errorprone-boxedprimitiveconstructor"></a>

### `errorprone/BoxedPrimitiveConstructor`

ValueOf or autoboxing provides better time and space performance.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BoxedPrimitiveConstructor).
- **Exception:** If this is intended, add `{"rule":"errorprone/BoxedPrimitiveConstructor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BoxedPrimitiveConstructor)

<a id="errorprone-boxedprimitiveequality"></a>

### `errorprone/BoxedPrimitiveEquality`

Comparison using reference equality instead of value equality. Reference equality of boxed primitive types is usually not useful, as they are value objects, and it is bug-prone, as instances are cached for some values but not others.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BoxedPrimitiveEquality).
- **Exception:** If this is intended, add `{"rule":"errorprone/BoxedPrimitiveEquality","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BoxedPrimitiveEquality)

<a id="errorprone-boxingcomparator"></a>

### `errorprone/BoxingComparator`

Comparator.comparing unnecessarily boxes numerical primitives.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BoxingComparator).
- **Exception:** If this is intended, add `{"rule":"errorprone/BoxingComparator","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BoxingComparator)

<a id="errorprone-bugpatternnaming"></a>

### `errorprone/BugPatternNaming`

Giving BugPatterns a name different to the enclosing class can be confusing.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BugPatternNaming).
- **Exception:** If this is intended, add `{"rule":"errorprone/BugPatternNaming","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BugPatternNaming)

<a id="errorprone-builderreturnthis"></a>

### `errorprone/BuilderReturnThis`

Builder instance method does not return 'this'.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BuilderReturnThis).
- **Exception:** If this is intended, add `{"rule":"errorprone/BuilderReturnThis","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BuilderReturnThis)

<a id="errorprone-bundledeserializationcast"></a>

### `errorprone/BundleDeserializationCast`

Object serialized in Bundle may have been flattened to base type.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/BundleDeserializationCast).
- **Exception:** If this is intended, add `{"rule":"errorprone/BundleDeserializationCast","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BundleDeserializationCast)

<a id="errorprone-bytebufferbackingarray"></a>

### `errorprone/ByteBufferBackingArray`

ByteBuffer.array() shouldn't be called unless ByteBuffer.arrayOffset() is used or if the ByteBuffer was initialized using ByteBuffer.wrap() or ByteBuffer.allocate().

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ByteBufferBackingArray).
- **Exception:** If this is intended, add `{"rule":"errorprone/ByteBufferBackingArray","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ByteBufferBackingArray)

<a id="errorprone-cacheloadernull"></a>

### `errorprone/CacheLoaderNull`

The result of CacheLoader#load must be non-null.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/CacheLoaderNull).
- **Exception:** If this is intended, add `{"rule":"errorprone/CacheLoaderNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CacheLoaderNull)

<a id="errorprone-canonicalduration"></a>

### `errorprone/CanonicalDuration`

Duration can be expressed more clearly with different units.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/CanonicalDuration).
- **Exception:** If this is intended, add `{"rule":"errorprone/CanonicalDuration","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CanonicalDuration)

<a id="errorprone-catchandprintstacktrace"></a>

### `errorprone/CatchAndPrintStackTrace`

Logging or rethrowing exceptions should usually be preferred to catching and calling printStackTrace.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/CatchAndPrintStackTrace).
- **Exception:** If this is intended, add `{"rule":"errorprone/CatchAndPrintStackTrace","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CatchAndPrintStackTrace)

<a id="errorprone-catchfail"></a>

### `errorprone/CatchFail`

Ignoring exceptions and calling fail() is unnecessary, and makes test output less useful.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/CatchFail).
- **Exception:** If this is intended, add `{"rule":"errorprone/CatchFail","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CatchFail)

<a id="errorprone-chainedassertionlosescontext"></a>

### `errorprone/ChainedAssertionLosesContext`

Inside a Subject, use check(...) instead of assert\*() to preserve user-supplied messages and other settings.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ChainedAssertionLosesContext).
- **Exception:** If this is intended, add `{"rule":"errorprone/ChainedAssertionLosesContext","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ChainedAssertionLosesContext)

<a id="errorprone-chainingconstructorignoresparameter"></a>

### `errorprone/ChainingConstructorIgnoresParameter`

The called constructor accepts a parameter with the same name and type as one of its caller's parameters, but its caller doesn't pass that parameter to it. It's likely that it was intended to.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ChainingConstructorIgnoresParameter).
- **Exception:** If this is intended, add `{"rule":"errorprone/ChainingConstructorIgnoresParameter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ChainingConstructorIgnoresParameter)

<a id="errorprone-charactergetnumericvalue"></a>

### `errorprone/CharacterGetNumericValue`

GetNumericValue has unexpected behaviour: it interprets A-Z as base-36 digits with values 10-35, but also supports non-arabic numerals and miscellaneous numeric unicode characters like ?; consider using Character.digit or UCharacter.getUnicodeNumericValue instead.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/CharacterGetNumericValue).
- **Exception:** If this is intended, add `{"rule":"errorprone/CharacterGetNumericValue","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CharacterGetNumericValue)

<a id="errorprone-checkedexceptionnotthrown"></a>

### `errorprone/CheckedExceptionNotThrown`

This method cannot throw a checked exception that it claims to. This may cause consumers of the API to incorrectly attempt to handle, or propagate, this exception.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/CheckedExceptionNotThrown).
- **Exception:** If this is intended, add `{"rule":"errorprone/CheckedExceptionNotThrown","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CheckedExceptionNotThrown)

<a id="errorprone-checknotnullmultipletimes"></a>

### `errorprone/CheckNotNullMultipleTimes`

A variable was checkNotNulled multiple times. Did you mean to check something else?

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/CheckNotNullMultipleTimes).
- **Exception:** If this is intended, add `{"rule":"errorprone/CheckNotNullMultipleTimes","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CheckNotNullMultipleTimes)

<a id="errorprone-checkreturnvalue"></a>

### `errorprone/CheckReturnValue`

The result of this call must be used.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/CheckReturnValue).
- **Exception:** If this is intended, add `{"rule":"errorprone/CheckReturnValue","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CheckReturnValue)

<a id="errorprone-classcanbestatic"></a>

### `errorprone/ClassCanBeStatic`

Inner class is non-static but does not reference enclosing class.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ClassCanBeStatic).
- **Exception:** If this is intended, add `{"rule":"errorprone/ClassCanBeStatic","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ClassCanBeStatic)

<a id="errorprone-classinitializationdeadlock"></a>

### `errorprone/ClassInitializationDeadlock`

Possible class initialization deadlock.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ClassInitializationDeadlock).
- **Exception:** If this is intended, add `{"rule":"errorprone/ClassInitializationDeadlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ClassInitializationDeadlock)

<a id="errorprone-classname"></a>

### `errorprone/ClassName`

The source file name should match the name of the top-level class it contains.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s2.1-file-name).
- **Exception:** If this is intended, add `{"rule":"errorprone/ClassName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s2.1-file-name)

<a id="errorprone-classnamedliketypeparameter"></a>

### `errorprone/ClassNamedLikeTypeParameter`

This class's name looks like a Type Parameter.

- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ClassNamedLikeTypeParameter).
- **Exception:** If this is intended, add `{"rule":"errorprone/ClassNamedLikeTypeParameter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ClassNamedLikeTypeParameter)

<a id="errorprone-classnewinstance"></a>

### `errorprone/ClassNewInstance`

Class.newInstance() bypasses exception checking; prefer getDeclaredConstructor().newInstance().

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ClassNewInstance).
- **Exception:** If this is intended, add `{"rule":"errorprone/ClassNewInstance","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ClassNewInstance)

<a id="errorprone-closeableprovides"></a>

### `errorprone/CloseableProvides`

Providing Closeable resources makes their lifecycle unclear.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/CloseableProvides).
- **Exception:** If this is intended, add `{"rule":"errorprone/CloseableProvides","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CloseableProvides)

<a id="errorprone-closingstandardoutputstreams"></a>

### `errorprone/ClosingStandardOutputStreams`

Don't use try-with-resources to manage standard output streams, closing the stream will cause subsequent output to standard output or standard error to be lost.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ClosingStandardOutputStreams).
- **Exception:** If this is intended, add `{"rule":"errorprone/ClosingStandardOutputStreams","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ClosingStandardOutputStreams)

<a id="errorprone-collectionincompatibletype"></a>

### `errorprone/CollectionIncompatibleType`

Incompatible type as argument to Object-accepting Java collections method.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/CollectionIncompatibleType).
- **Exception:** If this is intended, add `{"rule":"errorprone/CollectionIncompatibleType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CollectionIncompatibleType)

<a id="errorprone-collectiontoarraysafeparameter"></a>

### `errorprone/CollectionToArraySafeParameter`

The type of the array parameter of Collection.toArray needs to be compatible with the array type.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/CollectionToArraySafeParameter).
- **Exception:** If this is intended, add `{"rule":"errorprone/CollectionToArraySafeParameter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CollectionToArraySafeParameter)

<a id="errorprone-collectionundefinedequality"></a>

### `errorprone/CollectionUndefinedEquality`

This type does not have well-defined equals behavior.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/CollectionUndefinedEquality).
- **Exception:** If this is intended, add `{"rule":"errorprone/CollectionUndefinedEquality","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CollectionUndefinedEquality)

<a id="errorprone-collectorshouldnotusestate"></a>

### `errorprone/CollectorShouldNotUseState`

Collector.of() should not use state.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/CollectorShouldNotUseState).
- **Exception:** If this is intended, add `{"rule":"errorprone/CollectorShouldNotUseState","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CollectorShouldNotUseState)

<a id="errorprone-comparableandcomparator"></a>

### `errorprone/ComparableAndComparator`

Class should not implement both `Comparable` and `Comparator`.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ComparableAndComparator).
- **Exception:** If this is intended, add `{"rule":"errorprone/ComparableAndComparator","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ComparableAndComparator)

<a id="errorprone-comparabletype"></a>

### `errorprone/ComparableType`

Implementing 'Comparable\<T>' where T is not the same as the implementing class is incorrect, since it violates the symmetry contract of compareTo.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ComparableType).
- **Exception:** If this is intended, add `{"rule":"errorprone/ComparableType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ComparableType)

<a id="errorprone-comparetozero"></a>

### `errorprone/CompareToZero`

The result of #compareTo or #compare should only be compared to 0. It is an implementation detail whether a given type returns strictly the values {-1, 0, +1} or others.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/CompareToZero).
- **Exception:** If this is intended, add `{"rule":"errorprone/CompareToZero","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CompareToZero)

<a id="errorprone-comparingthiswithnull"></a>

### `errorprone/ComparingThisWithNull`

This == null is always false, this != null is always true.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ComparingThisWithNull).
- **Exception:** If this is intended, add `{"rule":"errorprone/ComparingThisWithNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ComparingThisWithNull)

<a id="errorprone-comparisoncontractviolated"></a>

### `errorprone/ComparisonContractViolated`

This comparison method violates the contract.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ComparisonContractViolated).
- **Exception:** If this is intended, add `{"rule":"errorprone/ComparisonContractViolated","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ComparisonContractViolated)

<a id="errorprone-comparisonoutofrange"></a>

### `errorprone/ComparisonOutOfRange`

Comparison to value that is out of range for the compared type.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ComparisonOutOfRange).
- **Exception:** If this is intended, add `{"rule":"errorprone/ComparisonOutOfRange","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ComparisonOutOfRange)

<a id="errorprone-compatiblewithannotationmisuse"></a>

### `errorprone/CompatibleWithAnnotationMisuse`

@CompatibleWith's value is not a type argument.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/CompatibleWithAnnotationMisuse).
- **Exception:** If this is intended, add `{"rule":"errorprone/CompatibleWithAnnotationMisuse","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CompatibleWithAnnotationMisuse)

<a id="errorprone-compiletimeconstant"></a>

### `errorprone/CompileTimeConstant`

Non-compile-time constant expression passed to parameter with @CompileTimeConstant type annotation.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/CompileTimeConstant).
- **Exception:** If this is intended, add `{"rule":"errorprone/CompileTimeConstant","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CompileTimeConstant)

<a id="errorprone-complexbooleanconstant"></a>

### `errorprone/ComplexBooleanConstant`

Non-trivial compile time constant boolean expressions shouldn't be used.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ComplexBooleanConstant).
- **Exception:** If this is intended, add `{"rule":"errorprone/ComplexBooleanConstant","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ComplexBooleanConstant)

<a id="errorprone-computeifabsentambiguousreference"></a>

### `errorprone/ComputeIfAbsentAmbiguousReference`

ComputeIfAbsent passes the map key to the provided class's constructor.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ComputeIfAbsentAmbiguousReference).
- **Exception:** If this is intended, add `{"rule":"errorprone/ComputeIfAbsentAmbiguousReference","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ComputeIfAbsentAmbiguousReference)

<a id="errorprone-conditionalexpressionnumericpromotion"></a>

### `errorprone/ConditionalExpressionNumericPromotion`

A conditional expression with numeric operands of differing types will perform binary numeric promotion of the operands; when these operands are of reference types, the expression's result may not be of the expected type.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ConditionalExpressionNumericPromotion).
- **Exception:** If this is intended, add `{"rule":"errorprone/ConditionalExpressionNumericPromotion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ConditionalExpressionNumericPromotion)

<a id="errorprone-constantoverflow"></a>

### `errorprone/ConstantOverflow`

Compile-time constant expression overflows.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ConstantOverflow).
- **Exception:** If this is intended, add `{"rule":"errorprone/ConstantOverflow","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ConstantOverflow)

<a id="errorprone-constantpatterncompile"></a>

### `errorprone/ConstantPatternCompile`

Variables initialized with Pattern#compile calls on constants can be constants.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ConstantPatternCompile).
- **Exception:** If this is intended, add `{"rule":"errorprone/ConstantPatternCompile","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ConstantPatternCompile)

<a id="errorprone-daggerprovidesnull"></a>

### `errorprone/DaggerProvidesNull`

Dagger @Provides methods may not return null unless annotated with @Nullable.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DaggerProvidesNull).
- **Exception:** If this is intended, add `{"rule":"errorprone/DaggerProvidesNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DaggerProvidesNull)

<a id="errorprone-dangerousliteralnull"></a>

### `errorprone/DangerousLiteralNull`

This method is null-hostile: passing a null literal to it is always wrong.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DangerousLiteralNull).
- **Exception:** If this is intended, add `{"rule":"errorprone/DangerousLiteralNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DangerousLiteralNull)

<a id="errorprone-datechecker"></a>

### `errorprone/DateChecker`

Warns against suspect looking calls to java.util.Date APIs.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DateChecker).
- **Exception:** If this is intended, add `{"rule":"errorprone/DateChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DateChecker)

<a id="errorprone-dateformatconstant"></a>

### `errorprone/DateFormatConstant`

DateFormat is not thread-safe, and should not be used as a constant field.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DateFormatConstant).
- **Exception:** If this is intended, add `{"rule":"errorprone/DateFormatConstant","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DateFormatConstant)

<a id="errorprone-deadexception"></a>

### `errorprone/DeadException`

Exception created but not thrown.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DeadException).
- **Exception:** If this is intended, add `{"rule":"errorprone/DeadException","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DeadException)

<a id="errorprone-deadthread"></a>

### `errorprone/DeadThread`

Thread created but not started.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DeadThread).
- **Exception:** If this is intended, add `{"rule":"errorprone/DeadThread","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DeadThread)

<a id="errorprone-deduplicateconstants"></a>

### `errorprone/DeduplicateConstants`

This expression was previously declared as a constant; consider replacing this occurrence.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DeduplicateConstants).
- **Exception:** If this is intended, add `{"rule":"errorprone/DeduplicateConstants","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DeduplicateConstants)

<a id="errorprone-deeplynested"></a>

### `errorprone/DeeplyNested`

Very deeply nested code may lead to StackOverflowErrors during compilation.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DeeplyNested).
- **Exception:** If this is intended, add `{"rule":"errorprone/DeeplyNested","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DeeplyNested)

<a id="errorprone-defaultcharset"></a>

### `errorprone/DefaultCharset`

Implicit use of the platform default charset, which can result in differing behaviour between JVM executions or incorrect behavior if the encoding of the data source doesn't match expectations.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DefaultCharset).
- **Exception:** If this is intended, add `{"rule":"errorprone/DefaultCharset","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DefaultCharset)

<a id="errorprone-defaultlocale"></a>

### `errorprone/DefaultLocale`

Implicit use of the JVM default locale, which can result in differing behaviour between JVM executions.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DefaultLocale).
- **Exception:** If this is intended, add `{"rule":"errorprone/DefaultLocale","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DefaultLocale)

<a id="errorprone-defaultpackage"></a>

### `errorprone/DefaultPackage`

Java classes shouldn't use default package.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DefaultPackage).
- **Exception:** If this is intended, add `{"rule":"errorprone/DefaultPackage","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DefaultPackage)

<a id="errorprone-depann"></a>

### `errorprone/DepAnn`

Item documented with a @deprecated javadoc note is not annotated with @Deprecated.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DepAnn).
- **Exception:** If this is intended, add `{"rule":"errorprone/DepAnn","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DepAnn)

<a id="errorprone-deprecatedvariable"></a>

### `errorprone/DeprecatedVariable`

Applying the @Deprecated annotation to local variables or parameters has no effect.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DeprecatedVariable).
- **Exception:** If this is intended, add `{"rule":"errorprone/DeprecatedVariable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DeprecatedVariable)

<a id="errorprone-dereferencewithnullbranch"></a>

### `errorprone/DereferenceWithNullBranch`

Dereference of an expression with a null branch.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DereferenceWithNullBranch).
- **Exception:** If this is intended, add `{"rule":"errorprone/DereferenceWithNullBranch","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DereferenceWithNullBranch)

<a id="errorprone-differentnamebutsame"></a>

### `errorprone/DifferentNameButSame`

This type is referred to in different ways within this file, which may be confusing.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DifferentNameButSame).
- **Exception:** If this is intended, add `{"rule":"errorprone/DifferentNameButSame","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DifferentNameButSame)

<a id="errorprone-directinvocationonmock"></a>

### `errorprone/DirectInvocationOnMock`

Methods should not be directly invoked on mocks. Should this be part of a verify(..) call?

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DirectInvocationOnMock).
- **Exception:** If this is intended, add `{"rule":"errorprone/DirectInvocationOnMock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DirectInvocationOnMock)

<a id="errorprone-discardedpostfixexpression"></a>

### `errorprone/DiscardedPostfixExpression`

The result of this unary operation on a lambda parameter is discarded.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DiscardedPostfixExpression).
- **Exception:** If this is intended, add `{"rule":"errorprone/DiscardedPostfixExpression","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DiscardedPostfixExpression)

<a id="errorprone-distinctvarargschecker"></a>

### `errorprone/DistinctVarargsChecker`

Method expects distinct arguments at some/all positions.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DistinctVarargsChecker).
- **Exception:** If this is intended, add `{"rule":"errorprone/DistinctVarargsChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DistinctVarargsChecker)

<a id="errorprone-donotcall"></a>

### `errorprone/DoNotCall`

This method should not be called.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DoNotCall).
- **Exception:** If this is intended, add `{"rule":"errorprone/DoNotCall","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DoNotCall)

<a id="errorprone-donotclaimannotations"></a>

### `errorprone/DoNotClaimAnnotations`

Don't 'claim' annotations in annotation processors; Processor#process should unconditionally return `false`.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DoNotClaimAnnotations).
- **Exception:** If this is intended, add `{"rule":"errorprone/DoNotClaimAnnotations","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DoNotClaimAnnotations)

<a id="errorprone-donotmock"></a>

### `errorprone/DoNotMock`

Identifies undesirable mocks.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DoNotMock).
- **Exception:** If this is intended, add `{"rule":"errorprone/DoNotMock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DoNotMock)

<a id="errorprone-donotmockautovalue"></a>

### `errorprone/DoNotMockAutoValue`

AutoValue classes represent pure data classes, so mocking them should not be necessary. Construct a real instance of the class instead.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DoNotMockAutoValue).
- **Exception:** If this is intended, add `{"rule":"errorprone/DoNotMockAutoValue","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DoNotMockAutoValue)

<a id="errorprone-doublebraceinitialization"></a>

### `errorprone/DoubleBraceInitialization`

Prefer collection factory methods or builders to the double-brace initialization pattern.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DoubleBraceInitialization).
- **Exception:** If this is intended, add `{"rule":"errorprone/DoubleBraceInitialization","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DoubleBraceInitialization)

<a id="errorprone-doublecheckedlocking"></a>

### `errorprone/DoubleCheckedLocking`

Double-checked locking on non-volatile fields is unsafe.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DoubleCheckedLocking).
- **Exception:** If this is intended, add `{"rule":"errorprone/DoubleCheckedLocking","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DoubleCheckedLocking)

<a id="errorprone-duplicateassertion"></a>

### `errorprone/DuplicateAssertion`

This assertion is duplicate.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DuplicateAssertion).
- **Exception:** If this is intended, add `{"rule":"errorprone/DuplicateAssertion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DuplicateAssertion)

<a id="errorprone-duplicatebranches"></a>

### `errorprone/DuplicateBranches`

Both branches contain identical code.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DuplicateBranches).
- **Exception:** If this is intended, add `{"rule":"errorprone/DuplicateBranches","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DuplicateBranches)

<a id="errorprone-duplicatedateformatfield"></a>

### `errorprone/DuplicateDateFormatField`

Reuse of DateFormat fields is most likely unintentional.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DuplicateDateFormatField).
- **Exception:** If this is intended, add `{"rule":"errorprone/DuplicateDateFormatField","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DuplicateDateFormatField)

<a id="errorprone-duplicatemapkeys"></a>

### `errorprone/DuplicateMapKeys`

Map#ofEntries will throw an IllegalArgumentException if there are any duplicate keys.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DuplicateMapKeys).
- **Exception:** If this is intended, add `{"rule":"errorprone/DuplicateMapKeys","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DuplicateMapKeys)

<a id="errorprone-durationfrom"></a>

### `errorprone/DurationFrom`

Duration.from(Duration) returns itself; from(Period) throws a runtime exception.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DurationFrom).
- **Exception:** If this is intended, add `{"rule":"errorprone/DurationFrom","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DurationFrom)

<a id="errorprone-durationgettemporalunit"></a>

### `errorprone/DurationGetTemporalUnit`

Duration.get() only works with SECONDS or NANOS.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DurationGetTemporalUnit).
- **Exception:** If this is intended, add `{"rule":"errorprone/DurationGetTemporalUnit","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DurationGetTemporalUnit)

<a id="errorprone-durationtemporalunit"></a>

### `errorprone/DurationTemporalUnit`

Duration APIs only work for DAYS or exact durations.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DurationTemporalUnit).
- **Exception:** If this is intended, add `{"rule":"errorprone/DurationTemporalUnit","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DurationTemporalUnit)

<a id="errorprone-durationtolongtimeunit"></a>

### `errorprone/DurationToLongTimeUnit`

Unit mismatch when decomposing a Duration or Instant to call a \<long, TimeUnit> API.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/DurationToLongTimeUnit).
- **Exception:** If this is intended, add `{"rule":"errorprone/DurationToLongTimeUnit","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DurationToLongTimeUnit)

<a id="errorprone-effectivelyprivate"></a>

### `errorprone/EffectivelyPrivate`

This declaration has public or protected modifiers, but is effectively private.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/EffectivelyPrivate).
- **Exception:** If this is intended, add `{"rule":"errorprone/EffectivelyPrivate","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EffectivelyPrivate)

<a id="errorprone-emptyblocktag"></a>

### `errorprone/EmptyBlockTag`

A block tag (@param, @return, @throws, @deprecated) has an empty description. Block tags without descriptions don't add much value for future readers of the code; consider removing the tag entirely or adding a description.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s7.1.3-javadoc-block-tags).
- **Exception:** If this is intended, add `{"rule":"errorprone/EmptyBlockTag","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s7.1.3-javadoc-block-tags)

<a id="errorprone-emptycatch"></a>

### `errorprone/EmptyCatch`

Caught exceptions should not be ignored.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s6.2-caught-exceptions).
- **Exception:** If this is intended, add `{"rule":"errorprone/EmptyCatch","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s6.2-caught-exceptions)

<a id="errorprone-emptysetmultibindingcontributions"></a>

### `errorprone/EmptySetMultibindingContributions`

@Multibinds is a more efficient and declarative mechanism for ensuring that a set multibinding is present in the graph.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/EmptySetMultibindingContributions).
- **Exception:** If this is intended, add `{"rule":"errorprone/EmptySetMultibindingContributions","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EmptySetMultibindingContributions)

<a id="errorprone-emptytopleveldeclaration"></a>

### `errorprone/EmptyTopLevelDeclaration`

Empty top-level type declarations should be omitted.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/EmptyTopLevelDeclaration).
- **Exception:** If this is intended, add `{"rule":"errorprone/EmptyTopLevelDeclaration","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EmptyTopLevelDeclaration)

<a id="errorprone-enumordinal"></a>

### `errorprone/EnumOrdinal`

You should almost never invoke the Enum.ordinal() method or depend on the enum values by index.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/EnumOrdinal).
- **Exception:** If this is intended, add `{"rule":"errorprone/EnumOrdinal","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EnumOrdinal)

<a id="errorprone-equalsbrokenfornull"></a>

### `errorprone/EqualsBrokenForNull`

Equals() implementation may throw NullPointerException when given null.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsBrokenForNull).
- **Exception:** If this is intended, add `{"rule":"errorprone/EqualsBrokenForNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsBrokenForNull)

<a id="errorprone-equalshashcode"></a>

### `errorprone/EqualsHashCode`

Classes that override equals should also override hashCode.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsHashCode).
- **Exception:** If this is intended, add `{"rule":"errorprone/EqualsHashCode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsHashCode)

<a id="errorprone-equalsincompatibletype"></a>

### `errorprone/EqualsIncompatibleType`

An equality test between objects with incompatible types always returns false.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsIncompatibleType).
- **Exception:** If this is intended, add `{"rule":"errorprone/EqualsIncompatibleType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsIncompatibleType)

<a id="errorprone-equalsnan"></a>

### `errorprone/EqualsNaN`

== NaN always returns false; use the isNaN methods instead.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsNaN).
- **Exception:** If this is intended, add `{"rule":"errorprone/EqualsNaN","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsNaN)

<a id="errorprone-equalsnull"></a>

### `errorprone/EqualsNull`

The contract of Object.equals() states that for any non-null reference value x, x.equals(null) should return false. If x is null, a NullPointerException is thrown. Consider replacing equals() with the == operator.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsNull).
- **Exception:** If this is intended, add `{"rule":"errorprone/EqualsNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsNull)

<a id="errorprone-equalsreference"></a>

### `errorprone/EqualsReference`

== must be used in equals method to check equality to itself or an infinite loop will occur.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsReference).
- **Exception:** If this is intended, add `{"rule":"errorprone/EqualsReference","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsReference)

<a id="errorprone-equalsunsafecast"></a>

### `errorprone/EqualsUnsafeCast`

The contract of #equals states that it should return false for incompatible types, while this implementation may throw ClassCastException.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsUnsafeCast).
- **Exception:** If this is intended, add `{"rule":"errorprone/EqualsUnsafeCast","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsUnsafeCast)

<a id="errorprone-equalsusinghashcode"></a>

### `errorprone/EqualsUsingHashCode`

Implementing #equals by just comparing hashCodes is fragile. Hashes collide frequently, and this will lead to false positives in #equals.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsUsingHashCode).
- **Exception:** If this is intended, add `{"rule":"errorprone/EqualsUsingHashCode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsUsingHashCode)

<a id="errorprone-equalswrongthing"></a>

### `errorprone/EqualsWrongThing`

Comparing different pairs of fields/getters in an equals implementation is probably a mistake.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsWrongThing).
- **Exception:** If this is intended, add `{"rule":"errorprone/EqualsWrongThing","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsWrongThing)

<a id="errorprone-erroneousbitwiseexpression"></a>

### `errorprone/ErroneousBitwiseExpression`

This expression evaluates to 0. If this isn't an error, consider expressing it as a literal 0.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ErroneousBitwiseExpression).
- **Exception:** If this is intended, add `{"rule":"errorprone/ErroneousBitwiseExpression","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ErroneousBitwiseExpression)

<a id="errorprone-erroneousthreadpoolconstructorchecker"></a>

### `errorprone/ErroneousThreadPoolConstructorChecker`

Thread pool size will never go beyond corePoolSize if an unbounded queue is used.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ErroneousThreadPoolConstructorChecker).
- **Exception:** If this is intended, add `{"rule":"errorprone/ErroneousThreadPoolConstructorChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ErroneousThreadPoolConstructorChecker)

<a id="errorprone-escapedentity"></a>

### `errorprone/EscapedEntity`

HTML entities in @code/@literal tags will appear literally in the rendered javadoc.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/EscapedEntity).
- **Exception:** If this is intended, add `{"rule":"errorprone/EscapedEntity","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EscapedEntity)

<a id="errorprone-expectedexceptionchecker"></a>

### `errorprone/ExpectedExceptionChecker`

Prefer assertThrows to ExpectedException.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ExpectedExceptionChecker).
- **Exception:** If this is intended, add `{"rule":"errorprone/ExpectedExceptionChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ExpectedExceptionChecker)

<a id="errorprone-expensivelenientformatstring"></a>

### `errorprone/ExpensiveLenientFormatString`

String.format is passed to a lenient formatting method, which can be unwrapped to improve efficiency.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ExpensiveLenientFormatString).
- **Exception:** If this is intended, add `{"rule":"errorprone/ExpensiveLenientFormatString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ExpensiveLenientFormatString)

<a id="errorprone-explicitarrayforvarargs"></a>

### `errorprone/ExplicitArrayForVarargs`

Avoid explicit array creation for varargs.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ExplicitArrayForVarargs).
- **Exception:** If this is intended, add `{"rule":"errorprone/ExplicitArrayForVarargs","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ExplicitArrayForVarargs)

<a id="errorprone-exposedprivatetype"></a>

### `errorprone/ExposedPrivateType`

Private member classes should not be referenced in signatures of non-private members.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ExposedPrivateType).
- **Exception:** If this is intended, add `{"rule":"errorprone/ExposedPrivateType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ExposedPrivateType)

<a id="errorprone-extendingjunitassert"></a>

### `errorprone/ExtendingJUnitAssert`

When only using JUnit Assert's static methods, you should import statically instead of extending.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ExtendingJUnitAssert).
- **Exception:** If this is intended, add `{"rule":"errorprone/ExtendingJUnitAssert","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ExtendingJUnitAssert)

<a id="errorprone-extendsautovalue"></a>

### `errorprone/ExtendsAutoValue`

Do not extend an @AutoValue-like classes in non-generated code.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ExtendsAutoValue).
- **Exception:** If this is intended, add `{"rule":"errorprone/ExtendsAutoValue","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ExtendsAutoValue)

<a id="errorprone-extendsobject"></a>

### `errorprone/ExtendsObject`

`T extends Object` is redundant (unless you are using the Checker Framework).

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ExtendsObject).
- **Exception:** If this is intended, add `{"rule":"errorprone/ExtendsObject","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ExtendsObject)

<a id="errorprone-fallthrough"></a>

### `errorprone/FallThrough`

Switch case may fall through.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FallThrough).
- **Exception:** If this is intended, add `{"rule":"errorprone/FallThrough","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FallThrough)

<a id="errorprone-fieldcanbefinal"></a>

### `errorprone/FieldCanBeFinal`

This field is only assigned during initialization; consider making it final.

- **Scope:** Not reported in classes annotated jakarta.persistence.Embeddable, jakarta.persistence.Entity, jakarta.persistence.MappedSuperclass, javax.persistence.Embeddable, javax.persistence.Entity, javax.persistence.MappedSuperclass.
- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FieldCanBeFinal).
- **Exception:** If this is intended, add `{"rule":"errorprone/FieldCanBeFinal","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FieldCanBeFinal)

<a id="errorprone-fieldcanbelocal"></a>

### `errorprone/FieldCanBeLocal`

This field can be replaced with a local variable in the methods that use it.

- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FieldCanBeLocal).
- **Exception:** If this is intended, add `{"rule":"errorprone/FieldCanBeLocal","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FieldCanBeLocal)

<a id="errorprone-fieldcanbestatic"></a>

### `errorprone/FieldCanBeStatic`

A final field initialized at compile-time with an instance of an immutable type can be static.

- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FieldCanBeStatic).
- **Exception:** If this is intended, add `{"rule":"errorprone/FieldCanBeStatic","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FieldCanBeStatic)

<a id="errorprone-finalize"></a>

### `errorprone/Finalize`

Do not override finalize.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/Finalize).
- **Exception:** If this is intended, add `{"rule":"errorprone/Finalize","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/Finalize)

<a id="errorprone-finally"></a>

### `errorprone/Finally`

If you return or throw from a finally, then values returned or thrown from the try-catch block will be ignored. Consider using try-with-resources instead.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/Finally).
- **Exception:** If this is intended, add `{"rule":"errorprone/Finally","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/Finally)

<a id="errorprone-floatcast"></a>

### `errorprone/FloatCast`

Use parentheses to make the precedence explicit.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FloatCast).
- **Exception:** If this is intended, add `{"rule":"errorprone/FloatCast","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloatCast)

<a id="errorprone-floatingpointassertionwithinepsilon"></a>

### `errorprone/FloatingPointAssertionWithinEpsilon`

This fuzzy equality check is using a tolerance less than the gap to the next number. You may want a less restrictive tolerance, or to assert equality.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FloatingPointAssertionWithinEpsilon).
- **Exception:** If this is intended, add `{"rule":"errorprone/FloatingPointAssertionWithinEpsilon","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloatingPointAssertionWithinEpsilon)

<a id="errorprone-floatingpointliteralprecision"></a>

### `errorprone/FloatingPointLiteralPrecision`

Floating point literal loses precision.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FloatingPointLiteralPrecision).
- **Exception:** If this is intended, add `{"rule":"errorprone/FloatingPointLiteralPrecision","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloatingPointLiteralPrecision)

<a id="errorprone-floggerargumenttostring"></a>

### `errorprone/FloggerArgumentToString`

Use Flogger's printf-style formatting instead of explicitly converting arguments to strings. Note that Flogger does more than just call toString; for instance, it formats arrays sensibly.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerArgumentToString).
- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerArgumentToString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerArgumentToString)

<a id="errorprone-floggerformatstring"></a>

### `errorprone/FloggerFormatString`

Invalid printf-style format string.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerFormatString).
- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerFormatString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerFormatString)

<a id="errorprone-floggerlogstring"></a>

### `errorprone/FloggerLogString`

Arguments to log(String) must be compile-time constants or parameters annotated with @CompileTimeConstant. If possible, use Flogger's formatting log methods instead.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerLogString).
- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerLogString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerLogString)

<a id="errorprone-floggerlogvarargs"></a>

### `errorprone/FloggerLogVarargs`

LogVarargs should be used to pass through format strings and arguments.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerLogVarargs).
- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerLogVarargs","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerLogVarargs)

<a id="errorprone-floggerlogwithcause"></a>

### `errorprone/FloggerLogWithCause`

Setting the caught exception as the cause of the log message may provide more context for anyone debugging errors.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerLogWithCause).
- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerLogWithCause","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerLogWithCause)

<a id="errorprone-floggermessageformat"></a>

### `errorprone/FloggerMessageFormat`

Invalid message format-style format specifier ({0}), expected printf-style (%s).

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerMessageFormat).
- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerMessageFormat","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerMessageFormat)

<a id="errorprone-floggerperwithoutratelimit"></a>

### `errorprone/FloggerPerWithoutRateLimit`

Per() methods are no-ops unless combined with atMostEvery(), every(), or onAverageEvery().

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerPerWithoutRateLimit).
- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerPerWithoutRateLimit","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerPerWithoutRateLimit)

<a id="errorprone-floggerredundantisenabled"></a>

### `errorprone/FloggerRedundantIsEnabled`

Logger level check is already implied in the log() call. An explicit atLEVEL().isEnabled() check is redundant.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerRedundantIsEnabled).
- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerRedundantIsEnabled","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerRedundantIsEnabled)

<a id="errorprone-floggerrequiredmodifiers"></a>

### `errorprone/FloggerRequiredModifiers`

FluentLogger.forEnclosingClass should always be saved to a private static final field.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://google.github.io/flogger/best_practice#modifiers).
- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerRequiredModifiers","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://google.github.io/flogger/best_practice#modifiers)

<a id="errorprone-floggersplitlogstatement"></a>

### `errorprone/FloggerSplitLogStatement`

Splitting log statements and using Api instances directly breaks logging.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://google.github.io/flogger/best_practice#no-split).
- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerSplitLogStatement","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://google.github.io/flogger/best_practice#no-split)

<a id="errorprone-floggerstringconcatenation"></a>

### `errorprone/FloggerStringConcatenation`

Prefer string formatting using printf placeholders (e.g. %s) instead of string concatenation.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerStringConcatenation).
- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerStringConcatenation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerStringConcatenation)

<a id="errorprone-floggerwithcause"></a>

### `errorprone/FloggerWithCause`

Calling withCause(Throwable) with an inline allocated Throwable is discouraged. Consider using withStackTrace(StackSize) instead, and specifying a reduced stack size (e.g. SMALL, MEDIUM or LARGE) instead of FULL, to improve performance.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://google.github.io/flogger/best_practice#stack-trace).
- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerWithCause","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://google.github.io/flogger/best_practice#stack-trace)

<a id="errorprone-floggerwithoutcause"></a>

### `errorprone/FloggerWithoutCause`

Use withCause to associate Exceptions with log statements.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerWithoutCause).
- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerWithoutCause","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerWithoutCause)

<a id="errorprone-foreachiterable"></a>

### `errorprone/ForEachIterable`

This loop can be replaced with an enhanced for loop.

- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ForEachIterable).
- **Exception:** If this is intended, add `{"rule":"errorprone/ForEachIterable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ForEachIterable)

<a id="errorprone-formatstring"></a>

### `errorprone/FormatString`

Invalid printf-style format string.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FormatString).
- **Exception:** If this is intended, add `{"rule":"errorprone/FormatString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FormatString)

<a id="errorprone-formatstringannotation"></a>

### `errorprone/FormatStringAnnotation`

Invalid format string passed to formatting method.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FormatStringAnnotation).
- **Exception:** If this is intended, add `{"rule":"errorprone/FormatStringAnnotation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FormatStringAnnotation)

<a id="errorprone-formatstringshoulduseplaceholders"></a>

### `errorprone/FormatStringShouldUsePlaceholders`

Using a format string avoids string concatenation in the common case.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FormatStringShouldUsePlaceholders).
- **Exception:** If this is intended, add `{"rule":"errorprone/FormatStringShouldUsePlaceholders","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FormatStringShouldUsePlaceholders)

<a id="errorprone-foroverride"></a>

### `errorprone/ForOverride`

Method annotated @ForOverride must be protected or package-private and only invoked from declaring class, or from an override of the method.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ForOverride).
- **Exception:** If this is intended, add `{"rule":"errorprone/ForOverride","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ForOverride)

<a id="errorprone-fragmentinjection"></a>

### `errorprone/FragmentInjection`

Classes extending PreferenceActivity must implement isValidFragment such that it does not unconditionally return true to prevent vulnerability to fragment injection attacks.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FragmentInjection).
- **Exception:** If this is intended, add `{"rule":"errorprone/FragmentInjection","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FragmentInjection)

<a id="errorprone-fragmentnotinstantiable"></a>

### `errorprone/FragmentNotInstantiable`

Subclasses of Fragment must be instantiable via Class#newInstance(): the class must be public, static and have a public nullary constructor.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FragmentNotInstantiable).
- **Exception:** If this is intended, add `{"rule":"errorprone/FragmentNotInstantiable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FragmentNotInstantiable)

<a id="errorprone-fromtemporalaccessor"></a>

### `errorprone/FromTemporalAccessor`

Certain combinations of javaTimeType.from(TemporalAccessor) will always throw a DateTimeException or return the parameter directly.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FromTemporalAccessor).
- **Exception:** If this is intended, add `{"rule":"errorprone/FromTemporalAccessor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FromTemporalAccessor)

<a id="errorprone-functionalinterfaceclash"></a>

### `errorprone/FunctionalInterfaceClash`

Overloads will be ambiguous when passing lambda arguments.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FunctionalInterfaceClash).
- **Exception:** If this is intended, add `{"rule":"errorprone/FunctionalInterfaceClash","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FunctionalInterfaceClash)

<a id="errorprone-functionalinterfacemethodchanged"></a>

### `errorprone/FunctionalInterfaceMethodChanged`

Casting a lambda to this @FunctionalInterface can cause a behavior change from casting to a functional superinterface, which is surprising to users. Prefer decorator methods to this surprising behavior.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FunctionalInterfaceMethodChanged).
- **Exception:** If this is intended, add `{"rule":"errorprone/FunctionalInterfaceMethodChanged","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FunctionalInterfaceMethodChanged)

<a id="errorprone-futurereturnvalueignored"></a>

### `errorprone/FutureReturnValueIgnored`

Return value of methods returning Future must be checked. Ignoring returned Futures suppresses exceptions thrown from the code that completes the Future.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FutureReturnValueIgnored).
- **Exception:** If this is intended, add `{"rule":"errorprone/FutureReturnValueIgnored","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FutureReturnValueIgnored)

<a id="errorprone-futuresgetcheckedillegalexceptiontype"></a>

### `errorprone/FuturesGetCheckedIllegalExceptionType`

Futures.getChecked requires a checked exception type with a standard constructor.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FuturesGetCheckedIllegalExceptionType).
- **Exception:** If this is intended, add `{"rule":"errorprone/FuturesGetCheckedIllegalExceptionType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FuturesGetCheckedIllegalExceptionType)

<a id="errorprone-futuretransformasync"></a>

### `errorprone/FutureTransformAsync`

Use transform instead of transformAsync when all returns are an immediate future.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FutureTransformAsync).
- **Exception:** If this is intended, add `{"rule":"errorprone/FutureTransformAsync","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FutureTransformAsync)

<a id="errorprone-fuzzyequalsshouldnotbeusedinequalsmethod"></a>

### `errorprone/FuzzyEqualsShouldNotBeUsedInEqualsMethod`

DoubleMath.fuzzyEquals should never be used in an Object.equals() method.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/FuzzyEqualsShouldNotBeUsedInEqualsMethod).
- **Exception:** If this is intended, add `{"rule":"errorprone/FuzzyEqualsShouldNotBeUsedInEqualsMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FuzzyEqualsShouldNotBeUsedInEqualsMethod)

<a id="errorprone-getclassonannotation"></a>

### `errorprone/GetClassOnAnnotation`

Calling getClass() on an annotation may return a proxy class.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/GetClassOnAnnotation).
- **Exception:** If this is intended, add `{"rule":"errorprone/GetClassOnAnnotation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/GetClassOnAnnotation)

<a id="errorprone-getclassonclass"></a>

### `errorprone/GetClassOnClass`

Calling getClass() on an object of type Class returns the Class object for java.lang.Class; you probably meant to operate on the object directly.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/GetClassOnClass).
- **Exception:** If this is intended, add `{"rule":"errorprone/GetClassOnClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/GetClassOnClass)

<a id="errorprone-getclassonenum"></a>

### `errorprone/GetClassOnEnum`

Calling getClass() on an enum may return a subclass of the enum type.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/GetClassOnEnum).
- **Exception:** If this is intended, add `{"rule":"errorprone/GetClassOnEnum","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/GetClassOnEnum)

<a id="errorprone-guardedby"></a>

### `errorprone/GuardedBy`

Checks for unguarded accesses to fields and methods with @GuardedBy annotations.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/GuardedBy).
- **Exception:** If this is intended, add `{"rule":"errorprone/GuardedBy","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/GuardedBy)

<a id="errorprone-guiceassistedinjectscoping"></a>

### `errorprone/GuiceAssistedInjectScoping`

Scope annotation on implementation class of AssistedInject factory is not allowed.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/GuiceAssistedInjectScoping).
- **Exception:** If this is intended, add `{"rule":"errorprone/GuiceAssistedInjectScoping","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/GuiceAssistedInjectScoping)

<a id="errorprone-guiceassistedparameters"></a>

### `errorprone/GuiceAssistedParameters`

A constructor cannot have two @Assisted parameters of the same type unless they are disambiguated with named @Assisted annotations.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/GuiceAssistedParameters).
- **Exception:** If this is intended, add `{"rule":"errorprone/GuiceAssistedParameters","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/GuiceAssistedParameters)

<a id="errorprone-guiceinjectonfinalfield"></a>

### `errorprone/GuiceInjectOnFinalField`

Although Guice allows injecting final fields, doing so is disallowed because the injected value may not be visible to other threads.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/GuiceInjectOnFinalField).
- **Exception:** If this is intended, add `{"rule":"errorprone/GuiceInjectOnFinalField","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/GuiceInjectOnFinalField)

<a id="errorprone-guicenestedcombine"></a>

### `errorprone/GuiceNestedCombine`

Nesting Modules.combine() here is unnecessary.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/GuiceNestedCombine).
- **Exception:** If this is intended, add `{"rule":"errorprone/GuiceNestedCombine","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/GuiceNestedCombine)

<a id="errorprone-hardcodedsdcardpath"></a>

### `errorprone/HardCodedSdCardPath`

Hardcoded reference to /sdcard.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/HardCodedSdCardPath).
- **Exception:** If this is intended, add `{"rule":"errorprone/HardCodedSdCardPath","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/HardCodedSdCardPath)

<a id="errorprone-hashtablecontains"></a>

### `errorprone/HashtableContains`

Contains() is a legacy method that is equivalent to containsValue().

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/HashtableContains).
- **Exception:** If this is intended, add `{"rule":"errorprone/HashtableContains","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/HashtableContains)

<a id="errorprone-hidingfield"></a>

### `errorprone/HidingField`

Hiding fields of superclasses may cause confusion and errors.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/HidingField).
- **Exception:** If this is intended, add `{"rule":"errorprone/HidingField","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/HidingField)

<a id="errorprone-iccprofilegetinstance"></a>

### `errorprone/ICCProfileGetInstance`

This method searches the class path for the given file, prefer to read the file and call getInstance(byte[]) or getInstance(InputStream).

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ICCProfileGetInstance).
- **Exception:** If this is intended, add `{"rule":"errorprone/ICCProfileGetInstance","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ICCProfileGetInstance)

<a id="errorprone-identifiername"></a>

### `errorprone/IdentifierName`

Methods and non-static variables should be named in lowerCamelCase.

- **Scope:** Not reported in classes annotated com.tngtech.archunit.junit.AnalyzeClasses.
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s5.2-specific-identifier-names).
- **Exception:** If this is intended, add `{"rule":"errorprone/IdentifierName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s5.2-specific-identifier-names)

<a id="errorprone-identitybinaryexpression"></a>

### `errorprone/IdentityBinaryExpression`

A binary expression where both operands are the same is usually incorrect.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/IdentityBinaryExpression).
- **Exception:** If this is intended, add `{"rule":"errorprone/IdentityBinaryExpression","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IdentityBinaryExpression)

<a id="errorprone-identityhashmapboxing"></a>

### `errorprone/IdentityHashMapBoxing`

Using IdentityHashMap with a boxed type as the key is risky since boxing may produce distinct instances.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/IdentityHashMapBoxing).
- **Exception:** If this is intended, add `{"rule":"errorprone/IdentityHashMapBoxing","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IdentityHashMapBoxing)

<a id="errorprone-identityhashmapusage"></a>

### `errorprone/IdentityHashMapUsage`

IdentityHashMap usage shouldn't be intermingled with Map.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/IdentityHashMapUsage).
- **Exception:** If this is intended, add `{"rule":"errorprone/IdentityHashMapUsage","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IdentityHashMapUsage)

<a id="errorprone-ignoredpuregetter"></a>

### `errorprone/IgnoredPureGetter`

Getters on AutoValues, AutoBuilders, and Protobuf Messages are side-effect free, so there is no point in calling them if the return value is ignored. While there are no side effects from the getter, the receiver may have side effects.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/IgnoredPureGetter).
- **Exception:** If this is intended, add `{"rule":"errorprone/IgnoredPureGetter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IgnoredPureGetter)

<a id="errorprone-immutable"></a>

### `errorprone/Immutable`

Type declaration annotated with @Immutable is not immutable.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/Immutable).
- **Exception:** If this is intended, add `{"rule":"errorprone/Immutable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/Immutable)

<a id="errorprone-immutableannotationchecker"></a>

### `errorprone/ImmutableAnnotationChecker`

Annotations should always be immutable.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ImmutableAnnotationChecker).
- **Exception:** If this is intended, add `{"rule":"errorprone/ImmutableAnnotationChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ImmutableAnnotationChecker)

<a id="errorprone-immutableenumchecker"></a>

### `errorprone/ImmutableEnumChecker`

Enums should always be immutable.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ImmutableEnumChecker).
- **Exception:** If this is intended, add `{"rule":"errorprone/ImmutableEnumChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ImmutableEnumChecker)

<a id="errorprone-immutablesetforcontains"></a>

### `errorprone/ImmutableSetForContains`

This private static ImmutableList is only used for contains, containsAll or isEmpty checks; prefer ImmutableSet.

- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ImmutableSetForContains).
- **Exception:** If this is intended, add `{"rule":"errorprone/ImmutableSetForContains","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ImmutableSetForContains)

<a id="errorprone-implementassertionwithchaining"></a>

### `errorprone/ImplementAssertionWithChaining`

Prefer check(...), which usually generates more readable failure messages.

- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ImplementAssertionWithChaining).
- **Exception:** If this is intended, add `{"rule":"errorprone/ImplementAssertionWithChaining","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ImplementAssertionWithChaining)

<a id="errorprone-impossiblenullcomparison"></a>

### `errorprone/ImpossibleNullComparison`

This value cannot be null, and comparing it to null may be misleading.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ImpossibleNullComparison).
- **Exception:** If this is intended, add `{"rule":"errorprone/ImpossibleNullComparison","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ImpossibleNullComparison)

<a id="errorprone-incomparable"></a>

### `errorprone/Incomparable`

Types contained in sorted collections must implement Comparable.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/Incomparable).
- **Exception:** If this is intended, add `{"rule":"errorprone/Incomparable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/Incomparable)

<a id="errorprone-incompatibleargumenttype"></a>

### `errorprone/IncompatibleArgumentType`

Passing argument to a generic method with an incompatible type.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/IncompatibleArgumentType).
- **Exception:** If this is intended, add `{"rule":"errorprone/IncompatibleArgumentType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IncompatibleArgumentType)

<a id="errorprone-incompatiblemodifiers"></a>

### `errorprone/IncompatibleModifiers`

This annotation has incompatible modifiers as specified by its @IncompatibleModifiers annotation.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/IncompatibleModifiers).
- **Exception:** If this is intended, add `{"rule":"errorprone/IncompatibleModifiers","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IncompatibleModifiers)

<a id="errorprone-inconsistentcapitalization"></a>

### `errorprone/InconsistentCapitalization`

It is confusing to have a field and a parameter under the same scope that differ only in capitalization.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InconsistentCapitalization).
- **Exception:** If this is intended, add `{"rule":"errorprone/InconsistentCapitalization","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InconsistentCapitalization)

<a id="errorprone-inconsistenthashcode"></a>

### `errorprone/InconsistentHashCode`

Including fields in hashCode which are not compared in equals violates the contract of hashCode.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InconsistentHashCode).
- **Exception:** If this is intended, add `{"rule":"errorprone/InconsistentHashCode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InconsistentHashCode)

<a id="errorprone-inconsistentoverloads"></a>

### `errorprone/InconsistentOverloads`

The ordering of parameters in overloaded methods should be as consistent as possible (when viewed from left to right).

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InconsistentOverloads).
- **Exception:** If this is intended, add `{"rule":"errorprone/InconsistentOverloads","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InconsistentOverloads)

<a id="errorprone-incorrectmainmethod"></a>

### `errorprone/IncorrectMainMethod`

'main' methods must be public, static, and void.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/IncorrectMainMethod).
- **Exception:** If this is intended, add `{"rule":"errorprone/IncorrectMainMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IncorrectMainMethod)

<a id="errorprone-incrementinforloopandheader"></a>

### `errorprone/IncrementInForLoopAndHeader`

This for loop increments the same variable in the header and in the body.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/IncrementInForLoopAndHeader).
- **Exception:** If this is intended, add `{"rule":"errorprone/IncrementInForLoopAndHeader","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IncrementInForLoopAndHeader)

<a id="errorprone-indexofchar"></a>

### `errorprone/IndexOfChar`

The first argument to indexOf is a Unicode code point, and the second is the index to start the search from.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/IndexOfChar).
- **Exception:** If this is intended, add `{"rule":"errorprone/IndexOfChar","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IndexOfChar)

<a id="errorprone-inexactvarargsconditional"></a>

### `errorprone/InexactVarargsConditional`

Conditional expression in varargs call contains array and non-array arguments.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InexactVarargsConditional).
- **Exception:** If this is intended, add `{"rule":"errorprone/InexactVarargsConditional","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InexactVarargsConditional)

<a id="errorprone-infiniterecursion"></a>

### `errorprone/InfiniteRecursion`

This method calls itself unconditionally; it will throw StackOverflowError.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InfiniteRecursion).
- **Exception:** If this is intended, add `{"rule":"errorprone/InfiniteRecursion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InfiniteRecursion)

<a id="errorprone-inheritdoc"></a>

### `errorprone/InheritDoc`

Invalid use of @inheritDoc.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InheritDoc).
- **Exception:** If this is intended, add `{"rule":"errorprone/InheritDoc","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InheritDoc)

<a id="errorprone-initializeinline"></a>

### `errorprone/InitializeInline`

Initializing variables in their declaring statement is clearer, where possible.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InitializeInline).
- **Exception:** If this is intended, add `{"rule":"errorprone/InitializeInline","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InitializeInline)

<a id="errorprone-injectedconstructorannotations"></a>

### `errorprone/InjectedConstructorAnnotations`

Injected constructors cannot be optional nor have binding annotations.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InjectedConstructorAnnotations).
- **Exception:** If this is intended, add `{"rule":"errorprone/InjectedConstructorAnnotations","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InjectedConstructorAnnotations)

<a id="errorprone-injectinvalidtargetingonscopingannotation"></a>

### `errorprone/InjectInvalidTargetingOnScopingAnnotation`

A scoping annotation's Target should include TYPE and METHOD.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InjectInvalidTargetingOnScopingAnnotation).
- **Exception:** If this is intended, add `{"rule":"errorprone/InjectInvalidTargetingOnScopingAnnotation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InjectInvalidTargetingOnScopingAnnotation)

<a id="errorprone-injectmorethanonescopeannotationonclass"></a>

### `errorprone/InjectMoreThanOneScopeAnnotationOnClass`

A class can be annotated with at most one scope annotation.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InjectMoreThanOneScopeAnnotationOnClass).
- **Exception:** If this is intended, add `{"rule":"errorprone/InjectMoreThanOneScopeAnnotationOnClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InjectMoreThanOneScopeAnnotationOnClass)

<a id="errorprone-injectonbugcheckers"></a>

### `errorprone/InjectOnBugCheckers`

BugChecker constructors should be marked @Inject.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InjectOnBugCheckers).
- **Exception:** If this is intended, add `{"rule":"errorprone/InjectOnBugCheckers","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InjectOnBugCheckers)

<a id="errorprone-injectonconstructorofabstractclass"></a>

### `errorprone/InjectOnConstructorOfAbstractClass`

Constructors on abstract classes are never directly @Inject'ed, only the constructors of their subclasses can be @Inject'ed.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InjectOnConstructorOfAbstractClass).
- **Exception:** If this is intended, add `{"rule":"errorprone/InjectOnConstructorOfAbstractClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InjectOnConstructorOfAbstractClass)

<a id="errorprone-injectonmemberandconstructor"></a>

### `errorprone/InjectOnMemberAndConstructor`

Members shouldn't be annotated with @Inject if constructor is already annotated @Inject.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InjectOnMemberAndConstructor).
- **Exception:** If this is intended, add `{"rule":"errorprone/InjectOnMemberAndConstructor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InjectOnMemberAndConstructor)

<a id="errorprone-injectscopeannotationoninterfaceorabstractclass"></a>

### `errorprone/InjectScopeAnnotationOnInterfaceOrAbstractClass`

Scope annotation on an interface or abstract class is not allowed.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InjectScopeAnnotationOnInterfaceOrAbstractClass).
- **Exception:** If this is intended, add `{"rule":"errorprone/InjectScopeAnnotationOnInterfaceOrAbstractClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InjectScopeAnnotationOnInterfaceOrAbstractClass)

<a id="errorprone-inlinemeinliner"></a>

### `errorprone/InlineMeInliner`

Callers of this API should be inlined.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InlineMeInliner).
- **Exception:** If this is intended, add `{"rule":"errorprone/InlineMeInliner","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InlineMeInliner)

<a id="errorprone-inlinemevalidator"></a>

### `errorprone/InlineMeValidator`

Ensures that the @InlineMe annotation is used correctly.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InlineMeValidator).
- **Exception:** If this is intended, add `{"rule":"errorprone/InlineMeValidator","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InlineMeValidator)

<a id="errorprone-inlinetrivialconstant"></a>

### `errorprone/InlineTrivialConstant`

Consider inlining this constant.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InlineTrivialConstant).
- **Exception:** If this is intended, add `{"rule":"errorprone/InlineTrivialConstant","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InlineTrivialConstant)

<a id="errorprone-inputstreamslowmultibyteread"></a>

### `errorprone/InputStreamSlowMultibyteRead`

Please also override int read(byte[], int, int), otherwise multi-byte reads from this input stream are likely to be slow.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InputStreamSlowMultibyteRead).
- **Exception:** If this is intended, add `{"rule":"errorprone/InputStreamSlowMultibyteRead","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InputStreamSlowMultibyteRead)

<a id="errorprone-insecurecryptousage"></a>

### `errorprone/InsecureCryptoUsage`

A standard cryptographic operation is used in a mode that is prone to vulnerabilities.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InsecureCryptoUsage).
- **Exception:** If this is intended, add `{"rule":"errorprone/InsecureCryptoUsage","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InsecureCryptoUsage)

<a id="errorprone-instanceofandcastmatchwrongtype"></a>

### `errorprone/InstanceOfAndCastMatchWrongType`

Casting inside an if block should be plausibly consistent with the instanceof type.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InstanceOfAndCastMatchWrongType).
- **Exception:** If this is intended, add `{"rule":"errorprone/InstanceOfAndCastMatchWrongType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InstanceOfAndCastMatchWrongType)

<a id="errorprone-instanttemporalunit"></a>

### `errorprone/InstantTemporalUnit`

Instant APIs only work for NANOS, MICROS, MILLIS, SECONDS, MINUTES, HOURS, HALF_DAYS and DAYS.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InstantTemporalUnit).
- **Exception:** If this is intended, add `{"rule":"errorprone/InstantTemporalUnit","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InstantTemporalUnit)

<a id="errorprone-interruptedexceptionswallowed"></a>

### `errorprone/InterruptedExceptionSwallowed`

This catch block appears to be catching an explicitly declared InterruptedException as an Exception/Throwable and not handling the interruption separately.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InterruptedExceptionSwallowed).
- **Exception:** If this is intended, add `{"rule":"errorprone/InterruptedExceptionSwallowed","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InterruptedExceptionSwallowed)

<a id="errorprone-interruptedincatchblock"></a>

### `errorprone/InterruptedInCatchBlock`

Did you mean to call Thread.currentThread().interrupt() instead of Thread.interrupted()?

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InterruptedInCatchBlock).
- **Exception:** If this is intended, add `{"rule":"errorprone/InterruptedInCatchBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InterruptedInCatchBlock)

<a id="errorprone-interruption"></a>

### `errorprone/Interruption`

Always pass 'false' to 'Future.cancel()', unless you are propagating a cancellation-with-interrupt from another caller.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/Interruption).
- **Exception:** If this is intended, add `{"rule":"errorprone/Interruption","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/Interruption)

<a id="errorprone-intfloatconversion"></a>

### `errorprone/IntFloatConversion`

Conversion from int to float may lose precision; use an explicit cast to float if this was intentional.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/IntFloatConversion).
- **Exception:** If this is intended, add `{"rule":"errorprone/IntFloatConversion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IntFloatConversion)

<a id="errorprone-intliteralcast"></a>

### `errorprone/IntLiteralCast`

Consider using a literal of the desired type instead of casting an int literal.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/IntLiteralCast).
- **Exception:** If this is intended, add `{"rule":"errorprone/IntLiteralCast","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IntLiteralCast)

<a id="errorprone-intlongmath"></a>

### `errorprone/IntLongMath`

Expression of type int may overflow before being assigned to a long.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/IntLongMath).
- **Exception:** If this is intended, add `{"rule":"errorprone/IntLongMath","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IntLongMath)

<a id="errorprone-invalidblocktag"></a>

### `errorprone/InvalidBlockTag`

This tag is invalid.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidBlockTag).
- **Exception:** If this is intended, add `{"rule":"errorprone/InvalidBlockTag","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidBlockTag)

<a id="errorprone-invalidinlinetag"></a>

### `errorprone/InvalidInlineTag`

This tag is invalid.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidInlineTag).
- **Exception:** If this is intended, add `{"rule":"errorprone/InvalidInlineTag","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidInlineTag)

<a id="errorprone-invalidjavatimeconstant"></a>

### `errorprone/InvalidJavaTimeConstant`

This checker errors on calls to java.time methods using values that are guaranteed to throw a DateTimeException.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidJavaTimeConstant).
- **Exception:** If this is intended, add `{"rule":"errorprone/InvalidJavaTimeConstant","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidJavaTimeConstant)

<a id="errorprone-invalidlink"></a>

### `errorprone/InvalidLink`

This @link tag looks wrong.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidLink).
- **Exception:** If this is intended, add `{"rule":"errorprone/InvalidLink","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidLink)

<a id="errorprone-invalidparam"></a>

### `errorprone/InvalidParam`

This @param tag doesn't refer to a parameter of the method.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidParam).
- **Exception:** If this is intended, add `{"rule":"errorprone/InvalidParam","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidParam)

<a id="errorprone-invalidpatternsyntax"></a>

### `errorprone/InvalidPatternSyntax`

Invalid syntax used for a regular expression.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidPatternSyntax).
- **Exception:** If this is intended, add `{"rule":"errorprone/InvalidPatternSyntax","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidPatternSyntax)

<a id="errorprone-invalidsnippet"></a>

### `errorprone/InvalidSnippet`

This tag is invalid.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidSnippet).
- **Exception:** If this is intended, add `{"rule":"errorprone/InvalidSnippet","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidSnippet)

<a id="errorprone-invalidthrows"></a>

### `errorprone/InvalidThrows`

The documented method doesn't actually throw this checked exception.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidThrows).
- **Exception:** If this is intended, add `{"rule":"errorprone/InvalidThrows","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidThrows)

<a id="errorprone-invalidthrowslink"></a>

### `errorprone/InvalidThrowsLink`

Don't use {@link} or {@code} in @throws tags; mention the exception name directly (e.g., @throws IOException, not @throws {@link IOException}).

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidThrowsLink).
- **Exception:** If this is intended, add `{"rule":"errorprone/InvalidThrowsLink","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidThrowsLink)

<a id="errorprone-invalidtimezoneid"></a>

### `errorprone/InvalidTimeZoneID`

Invalid time zone identifier. TimeZone.getTimeZone(String) will silently return GMT instead of the time zone you intended.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidTimeZoneID).
- **Exception:** If this is intended, add `{"rule":"errorprone/InvalidTimeZoneID","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidTimeZoneID)

<a id="errorprone-invalidzoneid"></a>

### `errorprone/InvalidZoneId`

Invalid zone identifier. ZoneId.of(String) will throw exception at runtime.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidZoneId).
- **Exception:** If this is intended, add `{"rule":"errorprone/InvalidZoneId","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidZoneId)

<a id="errorprone-isinstanceincompatibletype"></a>

### `errorprone/IsInstanceIncompatibleType`

This use of isInstance will always evaluate to false.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/IsInstanceIncompatibleType).
- **Exception:** If this is intended, add `{"rule":"errorprone/IsInstanceIncompatibleType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IsInstanceIncompatibleType)

<a id="errorprone-isinstanceofclass"></a>

### `errorprone/IsInstanceOfClass`

The argument to Class#isInstance(Object) should not be a Class.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/IsInstanceOfClass).
- **Exception:** If this is intended, add `{"rule":"errorprone/IsInstanceOfClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IsInstanceOfClass)

<a id="errorprone-isloggabletaglength"></a>

### `errorprone/IsLoggableTagLength`

Log tag too long, cannot exceed 23 characters.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/IsLoggableTagLength).
- **Exception:** If this is intended, add `{"rule":"errorprone/IsLoggableTagLength","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IsLoggableTagLength)

<a id="errorprone-iterableanditerator"></a>

### `errorprone/IterableAndIterator`

Class should not implement both `Iterable` and `Iterator`.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/IterableAndIterator).
- **Exception:** If this is intended, add `{"rule":"errorprone/IterableAndIterator","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IterableAndIterator)

<a id="errorprone-iterablepathparameter"></a>

### `errorprone/IterablePathParameter`

Path implements Iterable\<Path>; prefer Collection\<Path> for clarity.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/IterablePathParameter).
- **Exception:** If this is intended, add `{"rule":"errorprone/IterablePathParameter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IterablePathParameter)

<a id="errorprone-javadurationgetsecondsgetnano"></a>

### `errorprone/JavaDurationGetSecondsGetNano`

Duration.getNano() only accesses the underlying nanosecond adjustment from the whole second.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaDurationGetSecondsGetNano).
- **Exception:** If this is intended, add `{"rule":"errorprone/JavaDurationGetSecondsGetNano","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaDurationGetSecondsGetNano)

<a id="errorprone-javadurationgetsecondstotoseconds"></a>

### `errorprone/JavaDurationGetSecondsToToSeconds`

Prefer duration.toSeconds() over duration.getSeconds().

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaDurationGetSecondsToToSeconds).
- **Exception:** If this is intended, add `{"rule":"errorprone/JavaDurationGetSecondsToToSeconds","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaDurationGetSecondsToToSeconds)

<a id="errorprone-javadurationwithnanos"></a>

### `errorprone/JavaDurationWithNanos`

Use of java.time.Duration.withNanos(int) is not allowed.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaDurationWithNanos).
- **Exception:** If this is intended, add `{"rule":"errorprone/JavaDurationWithNanos","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaDurationWithNanos)

<a id="errorprone-javadurationwithseconds"></a>

### `errorprone/JavaDurationWithSeconds`

Use of java.time.Duration.withSeconds(long) is not allowed.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaDurationWithSeconds).
- **Exception:** If this is intended, add `{"rule":"errorprone/JavaDurationWithSeconds","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaDurationWithSeconds)

<a id="errorprone-javainstantgetsecondsgetnano"></a>

### `errorprone/JavaInstantGetSecondsGetNano`

Instant.getNano() only accesses the underlying nanosecond adjustment from the whole second.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaInstantGetSecondsGetNano).
- **Exception:** If this is intended, add `{"rule":"errorprone/JavaInstantGetSecondsGetNano","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaInstantGetSecondsGetNano)

<a id="errorprone-javalocaldatetimegetnano"></a>

### `errorprone/JavaLocalDateTimeGetNano`

LocalDateTime.getNano() only access the nanos-of-second field. It's rare to only use getNano() without a nearby getSecond() call.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaLocalDateTimeGetNano).
- **Exception:** If this is intended, add `{"rule":"errorprone/JavaLocalDateTimeGetNano","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaLocalDateTimeGetNano)

<a id="errorprone-javalocaltimegetnano"></a>

### `errorprone/JavaLocalTimeGetNano`

LocalTime.getNano() only accesses the nanos-of-second field. It's rare to only use getNano() without a nearby getSecond() call.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaLocalTimeGetNano).
- **Exception:** If this is intended, add `{"rule":"errorprone/JavaLocalTimeGetNano","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaLocalTimeGetNano)

<a id="errorprone-javaperiodgetdays"></a>

### `errorprone/JavaPeriodGetDays`

Period.getDays() only accesses the "days" portion of the Period, and doesn't represent the total span of time of the period. Consider using org.threeten.extra.Days to extract the difference between two civil dates if you want the whole time.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaPeriodGetDays).
- **Exception:** If this is intended, add `{"rule":"errorprone/JavaPeriodGetDays","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaPeriodGetDays)

<a id="errorprone-javatimedefaulttimezone"></a>

### `errorprone/JavaTimeDefaultTimeZone`

Java.time APIs that silently use the default system time-zone are not allowed.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaTimeDefaultTimeZone).
- **Exception:** If this is intended, add `{"rule":"errorprone/JavaTimeDefaultTimeZone","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaTimeDefaultTimeZone)

<a id="errorprone-javautildate"></a>

### `errorprone/JavaUtilDate`

Date has a bad API that leads to bugs; prefer java.time.Instant or LocalDate.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaUtilDate).
- **Exception:** If this is intended, add `{"rule":"errorprone/JavaUtilDate","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaUtilDate)

<a id="errorprone-javaxinjectonabstractmethod"></a>

### `errorprone/JavaxInjectOnAbstractMethod`

Abstract and default methods are not injectable with javax.inject.Inject.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaxInjectOnAbstractMethod).
- **Exception:** If this is intended, add `{"rule":"errorprone/JavaxInjectOnAbstractMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaxInjectOnAbstractMethod)

<a id="errorprone-javaxinjectonfinalfield"></a>

### `errorprone/JavaxInjectOnFinalField`

@javax.inject.Inject cannot be put on a final field.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaxInjectOnFinalField).
- **Exception:** If this is intended, add `{"rule":"errorprone/JavaxInjectOnFinalField","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaxInjectOnFinalField)

<a id="errorprone-jdkobsolete"></a>

### `errorprone/JdkObsolete`

Suggests alternatives to obsolete JDK classes.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JdkObsolete).
- **Exception:** If this is intended, add `{"rule":"errorprone/JdkObsolete","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JdkObsolete)

<a id="errorprone-jodaconstructors"></a>

### `errorprone/JodaConstructors`

Use of certain JodaTime constructors are not allowed.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaConstructors).
- **Exception:** If this is intended, add `{"rule":"errorprone/JodaConstructors","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaConstructors)

<a id="errorprone-jodadatetimeconstants"></a>

### `errorprone/JodaDateTimeConstants`

Using the `_PER_` constants in `DateTimeConstants` is problematic because they encourage manual date/time math.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaDateTimeConstants).
- **Exception:** If this is intended, add `{"rule":"errorprone/JodaDateTimeConstants","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaDateTimeConstants)

<a id="errorprone-jodadurationwithmillis"></a>

### `errorprone/JodaDurationWithMillis`

Use of duration.withMillis(long) is not allowed. Please use Duration.millis(long) instead.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaDurationWithMillis).
- **Exception:** If this is intended, add `{"rule":"errorprone/JodaDurationWithMillis","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaDurationWithMillis)

<a id="errorprone-jodainstantwithmillis"></a>

### `errorprone/JodaInstantWithMillis`

Use of instant.withMillis(long) is not allowed. Use Instant.ofEpochMilli(long) instead.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaInstantWithMillis).
- **Exception:** If this is intended, add `{"rule":"errorprone/JodaInstantWithMillis","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaInstantWithMillis)

<a id="errorprone-jodanewperiod"></a>

### `errorprone/JodaNewPeriod`

This may have surprising semantics, e.g. new Period(LocalDate.parse("1970-01-01"), LocalDate.parse("1970-02-02")).getDays() == 1, not 32.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaNewPeriod).
- **Exception:** If this is intended, add `{"rule":"errorprone/JodaNewPeriod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaNewPeriod)

<a id="errorprone-jodaplusminuslong"></a>

### `errorprone/JodaPlusMinusLong`

Use of JodaTime's type.plus(long) or type.minus(long) is not allowed (where \<type> = {Duration,Instant,DateTime,DateMidnight}). Please use type.plus(Duration.millis(long)) or type.minus(Duration.millis(long)) instead.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaPlusMinusLong).
- **Exception:** If this is intended, add `{"rule":"errorprone/JodaPlusMinusLong","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaPlusMinusLong)

<a id="errorprone-jodatimeconvertermanager"></a>

### `errorprone/JodaTimeConverterManager`

Joda-Time's ConverterManager makes the semantics of DateTime/Instant/etc construction subject to global static state. If you need to define your own converters, use a helper.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaTimeConverterManager).
- **Exception:** If this is intended, add `{"rule":"errorprone/JodaTimeConverterManager","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaTimeConverterManager)

<a id="errorprone-jodatoself"></a>

### `errorprone/JodaToSelf`

Use of Joda-Time's DateTime.toDateTime(), Duration.toDuration(), Instant.toInstant(), Interval.toInterval(), and Period.toPeriod() are not allowed.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaToSelf).
- **Exception:** If this is intended, add `{"rule":"errorprone/JodaToSelf","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaToSelf)

<a id="errorprone-jodawithdurationaddedlong"></a>

### `errorprone/JodaWithDurationAddedLong`

Use of JodaTime's type.withDurationAdded(long, int) (where \<type> = {Duration,Instant,DateTime}). Please use type.withDurationAdded(Duration.millis(long), int) instead.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaWithDurationAddedLong).
- **Exception:** If this is intended, add `{"rule":"errorprone/JodaWithDurationAddedLong","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaWithDurationAddedLong)

<a id="errorprone-junit3floatingpointcomparisonwithoutdelta"></a>

### `errorprone/JUnit3FloatingPointComparisonWithoutDelta`

Floating-point comparison without error tolerance.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit3FloatingPointComparisonWithoutDelta).
- **Exception:** If this is intended, add `{"rule":"errorprone/JUnit3FloatingPointComparisonWithoutDelta","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit3FloatingPointComparisonWithoutDelta)

<a id="errorprone-junit3testnotrun"></a>

### `errorprone/JUnit3TestNotRun`

Test method will not be run; please correct method signature (Should be public, non-static, and method name should begin with "test").

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit3TestNotRun).
- **Exception:** If this is intended, add `{"rule":"errorprone/JUnit3TestNotRun","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit3TestNotRun)

<a id="errorprone-junit4classannotationnonstatic"></a>

### `errorprone/JUnit4ClassAnnotationNonStatic`

This method should be static.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit4ClassAnnotationNonStatic).
- **Exception:** If this is intended, add `{"rule":"errorprone/JUnit4ClassAnnotationNonStatic","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit4ClassAnnotationNonStatic)

<a id="errorprone-junit4classusedinjunit3"></a>

### `errorprone/JUnit4ClassUsedInJUnit3`

Some JUnit4 construct cannot be used in a JUnit3 context. Convert your class to JUnit4 style to use them.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit4ClassUsedInJUnit3).
- **Exception:** If this is intended, add `{"rule":"errorprone/JUnit4ClassUsedInJUnit3","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit4ClassUsedInJUnit3)

<a id="errorprone-junit4emptymethods"></a>

### `errorprone/JUnit4EmptyMethods`

Empty JUnit4 @Before, @After, @BeforeClass, and @AfterClass methods are unnecessary and should be deleted.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit4EmptyMethods).
- **Exception:** If this is intended, add `{"rule":"errorprone/JUnit4EmptyMethods","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit4EmptyMethods)

<a id="errorprone-junit4setupnotrun"></a>

### `errorprone/JUnit4SetUpNotRun`

SetUp() method will not be run; please add JUnit's @Before annotation.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit4SetUpNotRun).
- **Exception:** If this is intended, add `{"rule":"errorprone/JUnit4SetUpNotRun","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit4SetUpNotRun)

<a id="errorprone-junit4teardownnotrun"></a>

### `errorprone/JUnit4TearDownNotRun`

TearDown() method will not be run; please add JUnit's @After annotation.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit4TearDownNotRun).
- **Exception:** If this is intended, add `{"rule":"errorprone/JUnit4TearDownNotRun","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit4TearDownNotRun)

<a id="errorprone-junit4testnotrun"></a>

### `errorprone/JUnit4TestNotRun`

This looks like a test method but is not run; please add @Test and @Ignore, or, if this is a helper method, reduce its visibility.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit4TestNotRun).
- **Exception:** If this is intended, add `{"rule":"errorprone/JUnit4TestNotRun","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit4TestNotRun)

<a id="errorprone-junit4testsnotrunwithinenclosed"></a>

### `errorprone/JUnit4TestsNotRunWithinEnclosed`

This test is annotated @Test, but given it's within a class using the Enclosed runner, will not run.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit4TestsNotRunWithinEnclosed).
- **Exception:** If this is intended, add `{"rule":"errorprone/JUnit4TestsNotRunWithinEnclosed","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit4TestsNotRunWithinEnclosed)

<a id="errorprone-junitambiguoustestclass"></a>

### `errorprone/JUnitAmbiguousTestClass`

Test class inherits from JUnit 3's TestCase but has JUnit 4 @Test or @RunWith annotations.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnitAmbiguousTestClass).
- **Exception:** If this is intended, add `{"rule":"errorprone/JUnitAmbiguousTestClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnitAmbiguousTestClass)

<a id="errorprone-junitassertsamecheck"></a>

### `errorprone/JUnitAssertSameCheck`

An object is tested for reference equality to itself using JUnit library.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnitAssertSameCheck).
- **Exception:** If this is intended, add `{"rule":"errorprone/JUnitAssertSameCheck","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnitAssertSameCheck)

<a id="errorprone-junitincompatibletype"></a>

### `errorprone/JUnitIncompatibleType`

The types passed to this assertion are incompatible.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnitIncompatibleType).
- **Exception:** If this is intended, add `{"rule":"errorprone/JUnitIncompatibleType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnitIncompatibleType)

<a id="errorprone-junitmethodinvoked"></a>

### `errorprone/JUnitMethodInvoked`

Directly invoking a JUnit test method is discouraged; only the JUnit test runner should call these methods. If you need to share logic between tests, extract a helper method or class.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnitMethodInvoked).
- **Exception:** If this is intended, add `{"rule":"errorprone/JUnitMethodInvoked","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnitMethodInvoked)

<a id="errorprone-junitparametermethodnotfound"></a>

### `errorprone/JUnitParameterMethodNotFound`

The method for providing parameters was not found.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnitParameterMethodNotFound).
- **Exception:** If this is intended, add `{"rule":"errorprone/JUnitParameterMethodNotFound","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnitParameterMethodNotFound)

<a id="errorprone-labelledbreaktarget"></a>

### `errorprone/LabelledBreakTarget`

Labels should only be used on loops.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/LabelledBreakTarget).
- **Exception:** If this is intended, add `{"rule":"errorprone/LabelledBreakTarget","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LabelledBreakTarget)

<a id="errorprone-lambdafunctionalinterface"></a>

### `errorprone/LambdaFunctionalInterface`

Use Java's utility functional interfaces instead of Function\<A, B> for primitive types.

- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/LambdaFunctionalInterface).
- **Exception:** If this is intended, add `{"rule":"errorprone/LambdaFunctionalInterface","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LambdaFunctionalInterface)

<a id="errorprone-lenientformatstringvalidation"></a>

### `errorprone/LenientFormatStringValidation`

The number of arguments provided to lenient format methods should match the positional specifiers.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/LenientFormatStringValidation).
- **Exception:** If this is intended, add `{"rule":"errorprone/LenientFormatStringValidation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LenientFormatStringValidation)

<a id="errorprone-listremoveambiguous"></a>

### `errorprone/ListRemoveAmbiguous`

Ambiguous call to List.remove; clarify if index-based or value-based removal was intended by adding a comment.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ListRemoveAmbiguous).
- **Exception:** If this is intended, add `{"rule":"errorprone/ListRemoveAmbiguous","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ListRemoveAmbiguous)

<a id="errorprone-litebytestringutf8"></a>

### `errorprone/LiteByteStringUtf8`

This pattern will silently corrupt certain byte sequences from the serialized protocol message. Use ByteString or byte[] directly.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/LiteByteStringUtf8).
- **Exception:** If this is intended, add `{"rule":"errorprone/LiteByteStringUtf8","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LiteByteStringUtf8)

<a id="errorprone-liteenumvalueof"></a>

### `errorprone/LiteEnumValueOf`

Instead of looking up a lite enum by name, use its numeric value since that is the stable part of the protocol defined by the enum.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/LiteEnumValueOf).
- **Exception:** If this is intended, add `{"rule":"errorprone/LiteEnumValueOf","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LiteEnumValueOf)

<a id="errorprone-liteprototostring"></a>

### `errorprone/LiteProtoToString`

ToString() on lite protos will not generate a useful representation of the proto from optimized builds. Consider whether using some subset of fields instead would provide useful information.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/LiteProtoToString).
- **Exception:** If this is intended, add `{"rule":"errorprone/LiteProtoToString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LiteProtoToString)

<a id="errorprone-localdatetemporalamount"></a>

### `errorprone/LocalDateTemporalAmount`

LocalDate.plus() and minus() does not work with Durations. LocalDate represents civil time (years/months/days), so java.time.Period is the appropriate thing to add or subtract instead.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/LocalDateTemporalAmount).
- **Exception:** If this is intended, add `{"rule":"errorprone/LocalDateTemporalAmount","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LocalDateTemporalAmount)

<a id="errorprone-locknotbeforetry"></a>

### `errorprone/LockNotBeforeTry`

Calls to Lock#lock should be immediately followed by a try block which releases the lock.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/LockNotBeforeTry).
- **Exception:** If this is intended, add `{"rule":"errorprone/LockNotBeforeTry","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LockNotBeforeTry)

<a id="errorprone-lockonboxedprimitive"></a>

### `errorprone/LockOnBoxedPrimitive`

It is dangerous to use a boxed primitive as a lock as it can unintentionally lead to sharing a lock with another piece of code.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/LockOnBoxedPrimitive).
- **Exception:** If this is intended, add `{"rule":"errorprone/LockOnBoxedPrimitive","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LockOnBoxedPrimitive)

<a id="errorprone-lockonnonenclosingclassliteral"></a>

### `errorprone/LockOnNonEnclosingClassLiteral`

Lock on the class other than the enclosing class of the code block can unintentionally prevent the locked class being used properly.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/LockOnNonEnclosingClassLiteral).
- **Exception:** If this is intended, add `{"rule":"errorprone/LockOnNonEnclosingClassLiteral","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LockOnNonEnclosingClassLiteral)

<a id="errorprone-logicalassignment"></a>

### `errorprone/LogicalAssignment`

Assignment where a boolean expression was expected; use == if this assignment wasn't expected or add parentheses for clarity.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/LogicalAssignment).
- **Exception:** If this is intended, add `{"rule":"errorprone/LogicalAssignment","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LogicalAssignment)

<a id="errorprone-longdoubleconversion"></a>

### `errorprone/LongDoubleConversion`

Conversion from long to double may lose precision; use an explicit cast to double if this was intentional.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/LongDoubleConversion).
- **Exception:** If this is intended, add `{"rule":"errorprone/LongDoubleConversion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LongDoubleConversion)

<a id="errorprone-longfloatconversion"></a>

### `errorprone/LongFloatConversion`

Conversion from long to float may lose precision; use an explicit cast to float if this was intentional.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/LongFloatConversion).
- **Exception:** If this is intended, add `{"rule":"errorprone/LongFloatConversion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LongFloatConversion)

<a id="errorprone-longliterallowercasesuffix"></a>

### `errorprone/LongLiteralLowerCaseSuffix`

Prefer 'L' to 'l' for the suffix to long literals.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/LongLiteralLowerCaseSuffix).
- **Exception:** If this is intended, add `{"rule":"errorprone/LongLiteralLowerCaseSuffix","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LongLiteralLowerCaseSuffix)

<a id="errorprone-loopconditionchecker"></a>

### `errorprone/LoopConditionChecker`

Loop condition is never modified in loop body.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/LoopConditionChecker).
- **Exception:** If this is intended, add `{"rule":"errorprone/LoopConditionChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LoopConditionChecker)

<a id="errorprone-loopoverchararray"></a>

### `errorprone/LoopOverCharArray`

ToCharArray allocates a new array, using charAt is more efficient.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/LoopOverCharArray).
- **Exception:** If this is intended, add `{"rule":"errorprone/LoopOverCharArray","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LoopOverCharArray)

<a id="errorprone-lossyprimitivecompare"></a>

### `errorprone/LossyPrimitiveCompare`

Using an unnecessarily-wide comparison method can lead to lossy comparison.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/LossyPrimitiveCompare).
- **Exception:** If this is intended, add `{"rule":"errorprone/LossyPrimitiveCompare","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LossyPrimitiveCompare)

<a id="errorprone-malformedinlinetag"></a>

### `errorprone/MalformedInlineTag`

This Javadoc tag is malformed. The correct syntax is {@tag and not @{tag.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MalformedInlineTag).
- **Exception:** If this is intended, add `{"rule":"errorprone/MalformedInlineTag","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MalformedInlineTag)

<a id="errorprone-mathabsolutenegative"></a>

### `errorprone/MathAbsoluteNegative`

Math.abs() does not always give a non-negative result. Please consider other methods for positive numbers, such as IntMath.saturatedAbs() or Math.floorMod().

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MathAbsoluteNegative).
- **Exception:** If this is intended, add `{"rule":"errorprone/MathAbsoluteNegative","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MathAbsoluteNegative)

<a id="errorprone-mathroundintlong"></a>

### `errorprone/MathRoundIntLong`

Math.round(Integer) results in truncation.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MathRoundIntLong).
- **Exception:** If this is intended, add `{"rule":"errorprone/MathRoundIntLong","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MathRoundIntLong)

<a id="errorprone-memoizeconstantvisitorstatelookups"></a>

### `errorprone/MemoizeConstantVisitorStateLookups`

Anytime you need to look up a constant value from VisitorState, improve performance by creating a cache for it with VisitorState.memoize.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MemoizeConstantVisitorStateLookups).
- **Exception:** If this is intended, add `{"rule":"errorprone/MemoizeConstantVisitorStateLookups","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MemoizeConstantVisitorStateLookups)

<a id="errorprone-memorysegmentreferenceequality"></a>

### `errorprone/MemorySegmentReferenceEquality`

Do not compare MemorySegments using reference equality.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MemorySegmentReferenceEquality).
- **Exception:** If this is intended, add `{"rule":"errorprone/MemorySegmentReferenceEquality","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MemorySegmentReferenceEquality)

<a id="errorprone-misformattedtestdata"></a>

### `errorprone/MisformattedTestData`

This test data will be more readable if correctly formatted.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MisformattedTestData).
- **Exception:** If this is intended, add `{"rule":"errorprone/MisformattedTestData","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MisformattedTestData)

<a id="errorprone-mislabeledandroidstring"></a>

### `errorprone/MislabeledAndroidString`

Certain resources in `android.R.string` have names that do not match their content.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MislabeledAndroidString).
- **Exception:** If this is intended, add `{"rule":"errorprone/MislabeledAndroidString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MislabeledAndroidString)

<a id="errorprone-misleadingemptyvarargs"></a>

### `errorprone/MisleadingEmptyVarargs`

`thenThrow` with no arguments is a no-op, despite reading like it makes the mock throw.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MisleadingEmptyVarargs).
- **Exception:** If this is intended, add `{"rule":"errorprone/MisleadingEmptyVarargs","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MisleadingEmptyVarargs)

<a id="errorprone-misleadingescapedspace"></a>

### `errorprone/MisleadingEscapedSpace`

Using \s anywhere except at the end of a line in a text block is potentially misleading.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MisleadingEscapedSpace).
- **Exception:** If this is intended, add `{"rule":"errorprone/MisleadingEscapedSpace","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MisleadingEscapedSpace)

<a id="errorprone-misplacedscopeannotations"></a>

### `errorprone/MisplacedScopeAnnotations`

Scope annotations used as qualifier annotations don't have any effect. Move the scope annotation to the binding location or delete it.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MisplacedScopeAnnotations).
- **Exception:** If this is intended, add `{"rule":"errorprone/MisplacedScopeAnnotations","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MisplacedScopeAnnotations)

<a id="errorprone-missingbraces"></a>

### `errorprone/MissingBraces`

The Google Java Style Guide requires braces to be used with if, else, for, do and while statements, even when the body is empty or contains only a single statement.

- **Scope:** Off in a project that uses Lombok.
- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s4.1.1-braces-always-used).
- **Exception:** If this is intended, add `{"rule":"errorprone/MissingBraces","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s4.1.1-braces-always-used)

<a id="errorprone-missingcasesinenumswitch"></a>

### `errorprone/MissingCasesInEnumSwitch`

Switches on enum types should either handle all values, or have a default case.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingCasesInEnumSwitch).
- **Exception:** If this is intended, add `{"rule":"errorprone/MissingCasesInEnumSwitch","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingCasesInEnumSwitch)

<a id="errorprone-missingdefault"></a>

### `errorprone/MissingDefault`

The Google Java Style Guide requires that each switch statement includes a default statement group (even if it contains no code) unless the switch statement covers all values of an enum.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingDefault).
- **Exception:** If this is intended, add `{"rule":"errorprone/MissingDefault","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingDefault)

<a id="errorprone-missingfail"></a>

### `errorprone/MissingFail`

Not calling fail() when expecting an exception masks bugs.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingFail).
- **Exception:** If this is intended, add `{"rule":"errorprone/MissingFail","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingFail)

<a id="errorprone-missingimplementscomparable"></a>

### `errorprone/MissingImplementsComparable`

Classes implementing valid compareTo function should implement Comparable interface.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingImplementsComparable).
- **Exception:** If this is intended, add `{"rule":"errorprone/MissingImplementsComparable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingImplementsComparable)

<a id="errorprone-missingoverride"></a>

### `errorprone/MissingOverride`

Method overrides method in supertype; expected @Override.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingOverride).
- **Exception:** If this is intended, add `{"rule":"errorprone/MissingOverride","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingOverride)

<a id="errorprone-missingrefasterannotation"></a>

### `errorprone/MissingRefasterAnnotation`

The Refaster template contains a method without any Refaster annotations.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingRefasterAnnotation).
- **Exception:** If this is intended, add `{"rule":"errorprone/MissingRefasterAnnotation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingRefasterAnnotation)

<a id="errorprone-missingruntimeretention"></a>

### `errorprone/MissingRuntimeRetention`

Scoping and qualifier annotations must have runtime retention.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingRuntimeRetention).
- **Exception:** If this is intended, add `{"rule":"errorprone/MissingRuntimeRetention","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingRuntimeRetention)

<a id="errorprone-missingsummary"></a>

### `errorprone/MissingSummary`

A summary line is required on public/protected Javadocs.

- **Scope:** Off in a project that uses Lombok.
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s7.2-summary-fragment).
- **Exception:** If this is intended, add `{"rule":"errorprone/MissingSummary","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s7.2-summary-fragment)

<a id="errorprone-missingsupercall"></a>

### `errorprone/MissingSuperCall`

Overriding method is missing a call to overridden super method.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingSuperCall).
- **Exception:** If this is intended, add `{"rule":"errorprone/MissingSuperCall","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingSuperCall)

<a id="errorprone-missingtestcall"></a>

### `errorprone/MissingTestCall`

A terminating method call is required for a test helper to have any effect.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingTestCall).
- **Exception:** If this is intended, add `{"rule":"errorprone/MissingTestCall","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingTestCall)

<a id="errorprone-misuseddayofyear"></a>

### `errorprone/MisusedDayOfYear`

Use of 'DD' (day of year) in a date pattern with 'MM' (month of year) is not likely to be intentional, as it would lead to dates like 'March 73rd'.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MisusedDayOfYear).
- **Exception:** If this is intended, add `{"rule":"errorprone/MisusedDayOfYear","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MisusedDayOfYear)

<a id="errorprone-misusedweekyear"></a>

### `errorprone/MisusedWeekYear`

Use of "YYYY" (week year) in a date pattern without "ww" (week in year). You probably meant to use "yyyy" (year) instead.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MisusedWeekYear).
- **Exception:** If this is intended, add `{"rule":"errorprone/MisusedWeekYear","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MisusedWeekYear)

<a id="errorprone-mixedarraydimensions"></a>

### `errorprone/MixedArrayDimensions`

C-style array declarations should not be used.

- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MixedArrayDimensions).
- **Exception:** If this is intended, add `{"rule":"errorprone/MixedArrayDimensions","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MixedArrayDimensions)

<a id="errorprone-mixeddescriptors"></a>

### `errorprone/MixedDescriptors`

The field number passed into #findFieldByNumber belongs to a different proto to the Descriptor.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MixedDescriptors).
- **Exception:** If this is intended, add `{"rule":"errorprone/MixedDescriptors","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MixedDescriptors)

<a id="errorprone-mixedmutabilityreturntype"></a>

### `errorprone/MixedMutabilityReturnType`

This method returns both mutable and immutable collections or maps from different paths. This may be confusing for users of the method.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MixedMutabilityReturnType).
- **Exception:** If this is intended, add `{"rule":"errorprone/MixedMutabilityReturnType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MixedMutabilityReturnType)

<a id="errorprone-mockillegalthrows"></a>

### `errorprone/MockIllegalThrows`

This exception can't be thrown by the mocked method.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MockIllegalThrows).
- **Exception:** If this is intended, add `{"rule":"errorprone/MockIllegalThrows","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MockIllegalThrows)

<a id="errorprone-mockitodosetup"></a>

### `errorprone/MockitoDoSetup`

Prefer using when/thenReturn over doReturn/when for additional type safety.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MockitoDoSetup).
- **Exception:** If this is intended, add `{"rule":"errorprone/MockitoDoSetup","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MockitoDoSetup)

<a id="errorprone-mockitousage"></a>

### `errorprone/MockitoUsage`

Missing method call for verify(mock) here.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MockitoUsage).
- **Exception:** If this is intended, add `{"rule":"errorprone/MockitoUsage","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MockitoUsage)

<a id="errorprone-mocknotusedinproduction"></a>

### `errorprone/MockNotUsedInProduction`

This mock is instantiated and configured, but is never passed to production code. It should be either removed or used.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MockNotUsedInProduction).
- **Exception:** If this is intended, add `{"rule":"errorprone/MockNotUsedInProduction","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MockNotUsedInProduction)

<a id="errorprone-modifiedbutnotused"></a>

### `errorprone/ModifiedButNotUsed`

A collection or proto builder was created, but its values were never accessed.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ModifiedButNotUsed).
- **Exception:** If this is intended, add `{"rule":"errorprone/ModifiedButNotUsed","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ModifiedButNotUsed)

<a id="errorprone-modifycollectioninenhancedforloop"></a>

### `errorprone/ModifyCollectionInEnhancedForLoop`

Modifying a collection while iterating over it in a loop may cause a ConcurrentModificationException to be thrown or lead to undefined behavior.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ModifyCollectionInEnhancedForLoop).
- **Exception:** If this is intended, add `{"rule":"errorprone/ModifyCollectionInEnhancedForLoop","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ModifyCollectionInEnhancedForLoop)

<a id="errorprone-modifyingcollectionwithitself"></a>

### `errorprone/ModifyingCollectionWithItself`

Using a collection function with itself as the argument.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ModifyingCollectionWithItself).
- **Exception:** If this is intended, add `{"rule":"errorprone/ModifyingCollectionWithItself","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ModifyingCollectionWithItself)

<a id="errorprone-modifysourcecollectioninstream"></a>

### `errorprone/ModifySourceCollectionInStream`

Modifying the backing source during stream operations may cause unintended results.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ModifySourceCollectionInStream).
- **Exception:** If this is intended, add `{"rule":"errorprone/ModifySourceCollectionInStream","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ModifySourceCollectionInStream)

<a id="errorprone-morethanoneinjectableconstructor"></a>

### `errorprone/MoreThanOneInjectableConstructor`

This class has more than one @Inject-annotated constructor. Please remove the @Inject annotation from all but one of them.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MoreThanOneInjectableConstructor).
- **Exception:** If this is intended, add `{"rule":"errorprone/MoreThanOneInjectableConstructor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MoreThanOneInjectableConstructor)

<a id="errorprone-morethanonequalifier"></a>

### `errorprone/MoreThanOneQualifier`

Using more than one qualifier annotation on the same element is not allowed.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MoreThanOneQualifier).
- **Exception:** If this is intended, add `{"rule":"errorprone/MoreThanOneQualifier","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MoreThanOneQualifier)

<a id="errorprone-multimapkeys"></a>

### `errorprone/MultimapKeys`

Iterating over `Multimap.keys()` does not collapse duplicates. Did you mean `keySet()`?

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MultimapKeys).
- **Exception:** If this is intended, add `{"rule":"errorprone/MultimapKeys","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MultimapKeys)

<a id="errorprone-multiplenullnessannotations"></a>

### `errorprone/MultipleNullnessAnnotations`

This type use has conflicting nullness annotations.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MultipleNullnessAnnotations).
- **Exception:** If this is intended, add `{"rule":"errorprone/MultipleNullnessAnnotations","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MultipleNullnessAnnotations)

<a id="errorprone-multipleparallelorsequentialcalls"></a>

### `errorprone/MultipleParallelOrSequentialCalls`

Multiple calls to either parallel or sequential are unnecessary and cause confusion.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MultipleParallelOrSequentialCalls).
- **Exception:** If this is intended, add `{"rule":"errorprone/MultipleParallelOrSequentialCalls","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MultipleParallelOrSequentialCalls)

<a id="errorprone-multipletoplevelclasses"></a>

### `errorprone/MultipleTopLevelClasses`

Source files should not contain multiple top-level class declarations.

- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s3.4.1-one-top-level-class).
- **Exception:** If this is intended, add `{"rule":"errorprone/MultipleTopLevelClasses","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s3.4.1-one-top-level-class)

<a id="errorprone-multipleunaryoperatorsinmethodcall"></a>

### `errorprone/MultipleUnaryOperatorsInMethodCall`

Avoid having multiple unary operators acting on the same variable in a method call.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MultipleUnaryOperatorsInMethodCall).
- **Exception:** If this is intended, add `{"rule":"errorprone/MultipleUnaryOperatorsInMethodCall","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MultipleUnaryOperatorsInMethodCall)

<a id="errorprone-multivariabledeclaration"></a>

### `errorprone/MultiVariableDeclaration`

Variable declarations should declare only one variable.

- **Scope:** Off in a project that uses Lombok.
- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s4.8.2.1-variables-per-declaration).
- **Exception:** If this is intended, add `{"rule":"errorprone/MultiVariableDeclaration","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s4.8.2.1-variables-per-declaration)

<a id="errorprone-mustbeclosedchecker"></a>

### `errorprone/MustBeClosedChecker`

This method returns a resource which must be managed carefully, not just left for garbage collection. If it is a constant that will persist for the lifetime of your program, move it to a private static final field. Otherwise, you should use it in a try-with-resources.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MustBeClosedChecker).
- **Exception:** If this is intended, add `{"rule":"errorprone/MustBeClosedChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MustBeClosedChecker)

<a id="errorprone-mutableguicemodule"></a>

### `errorprone/MutableGuiceModule`

Fields in Guice modules should be final.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MutableGuiceModule).
- **Exception:** If this is intended, add `{"rule":"errorprone/MutableGuiceModule","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MutableGuiceModule)

<a id="errorprone-mutablepublicarray"></a>

### `errorprone/MutablePublicArray`

Non-empty arrays are mutable, so this `public static final` array is not a constant and can be modified by clients of this class. Prefer an ImmutableList, or provide an accessor method that returns a defensive copy.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MutablePublicArray).
- **Exception:** If this is intended, add `{"rule":"errorprone/MutablePublicArray","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MutablePublicArray)

<a id="errorprone-namedlikecontextualkeyword"></a>

### `errorprone/NamedLikeContextualKeyword`

Avoid naming of classes and methods that is similar to contextual keywords. When invoking such a method, qualify it.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NamedLikeContextualKeyword).
- **Exception:** If this is intended, add `{"rule":"errorprone/NamedLikeContextualKeyword","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NamedLikeContextualKeyword)

<a id="errorprone-narrowcalculation"></a>

### `errorprone/NarrowCalculation`

This calculation may lose precision compared to its target type.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NarrowCalculation).
- **Exception:** If this is intended, add `{"rule":"errorprone/NarrowCalculation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NarrowCalculation)

<a id="errorprone-narrowingcompoundassignment"></a>

### `errorprone/NarrowingCompoundAssignment`

Compound assignments may hide dangerous casts.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NarrowingCompoundAssignment).
- **Exception:** If this is intended, add `{"rule":"errorprone/NarrowingCompoundAssignment","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NarrowingCompoundAssignment)

<a id="errorprone-ncopiesofchar"></a>

### `errorprone/NCopiesOfChar`

The first argument to nCopies is the number of copies, and the second is the item to copy.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NCopiesOfChar).
- **Exception:** If this is intended, add `{"rule":"errorprone/NCopiesOfChar","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NCopiesOfChar)

<a id="errorprone-negativeboolean"></a>

### `errorprone/NegativeBoolean`

Prefer positive boolean names.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NegativeBoolean).
- **Exception:** If this is intended, add `{"rule":"errorprone/NegativeBoolean","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NegativeBoolean)

<a id="errorprone-negativecharliteral"></a>

### `errorprone/NegativeCharLiteral`

Casting a negative signed literal to an (unsigned) char might be misleading.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NegativeCharLiteral).
- **Exception:** If this is intended, add `{"rule":"errorprone/NegativeCharLiteral","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NegativeCharLiteral)

<a id="errorprone-nestedinstanceofconditions"></a>

### `errorprone/NestedInstanceOfConditions`

Nested instanceOf conditions of disjoint types create blocks of code that never execute.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NestedInstanceOfConditions).
- **Exception:** If this is intended, add `{"rule":"errorprone/NestedInstanceOfConditions","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NestedInstanceOfConditions)

<a id="errorprone-newfilesystem"></a>

### `errorprone/NewFileSystem`

Starting in JDK 13, this call is ambiguous with FileSystem.newFileSystem(Path,Map).

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NewFileSystem).
- **Exception:** If this is intended, add `{"rule":"errorprone/NewFileSystem","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NewFileSystem)

<a id="errorprone-noallocation"></a>

### `errorprone/NoAllocation`

@NoAllocation was specified on this method, but something was found that would trigger an allocation.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NoAllocation).
- **Exception:** If this is intended, add `{"rule":"errorprone/NoAllocation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NoAllocation)

<a id="errorprone-nocanignorereturnvalueonclasses"></a>

### `errorprone/NoCanIgnoreReturnValueOnClasses`

@CanIgnoreReturnValue should not be applied to classes as it almost always overmatches (as it applies to constructors and all methods), and the CIRVness isn't conferred to its subclasses.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NoCanIgnoreReturnValueOnClasses).
- **Exception:** If this is intended, add `{"rule":"errorprone/NoCanIgnoreReturnValueOnClasses","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NoCanIgnoreReturnValueOnClasses)

<a id="errorprone-nonatomicvolatileupdate"></a>

### `errorprone/NonAtomicVolatileUpdate`

This update of a volatile variable is non-atomic.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NonAtomicVolatileUpdate).
- **Exception:** If this is intended, add `{"rule":"errorprone/NonAtomicVolatileUpdate","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NonAtomicVolatileUpdate)

<a id="errorprone-noncanonicalstaticimport"></a>

### `errorprone/NonCanonicalStaticImport`

Static import of type uses non-canonical name.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NonCanonicalStaticImport).
- **Exception:** If this is intended, add `{"rule":"errorprone/NonCanonicalStaticImport","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NonCanonicalStaticImport)

<a id="errorprone-noncanonicalstaticmemberimport"></a>

### `errorprone/NonCanonicalStaticMemberImport`

Static import of member uses non-canonical name.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NonCanonicalStaticMemberImport).
- **Exception:** If this is intended, add `{"rule":"errorprone/NonCanonicalStaticMemberImport","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NonCanonicalStaticMemberImport)

<a id="errorprone-noncanonicaltype"></a>

### `errorprone/NonCanonicalType`

This type is referred to by a non-canonical name, which may be misleading.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NonCanonicalType).
- **Exception:** If this is intended, add `{"rule":"errorprone/NonCanonicalType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NonCanonicalType)

<a id="errorprone-nonfinalcompiletimeconstant"></a>

### `errorprone/NonFinalCompileTimeConstant`

@CompileTimeConstant parameters should be final or effectively final.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NonFinalCompileTimeConstant).
- **Exception:** If this is intended, add `{"rule":"errorprone/NonFinalCompileTimeConstant","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NonFinalCompileTimeConstant)

<a id="errorprone-nonfinalstaticfield"></a>

### `errorprone/NonFinalStaticField`

Static fields should almost always be final.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NonFinalStaticField).
- **Exception:** If this is intended, add `{"rule":"errorprone/NonFinalStaticField","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NonFinalStaticField)

<a id="errorprone-nonoverridingequals"></a>

### `errorprone/NonOverridingEquals`

Equals method doesn't override Object.equals.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NonOverridingEquals).
- **Exception:** If this is intended, add `{"rule":"errorprone/NonOverridingEquals","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NonOverridingEquals)

<a id="errorprone-nonruntimeannotation"></a>

### `errorprone/NonRuntimeAnnotation`

Calling getAnnotation on an annotation that is not retained at runtime.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NonRuntimeAnnotation).
- **Exception:** If this is intended, add `{"rule":"errorprone/NonRuntimeAnnotation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NonRuntimeAnnotation)

<a id="errorprone-notjavadoc"></a>

### `errorprone/NotJavadoc`

Avoid using `/**` for comments which aren't actually Javadoc.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NotJavadoc).
- **Exception:** If this is intended, add `{"rule":"errorprone/NotJavadoc","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NotJavadoc)

<a id="errorprone-nullableconstructor"></a>

### `errorprone/NullableConstructor`

Constructors should not be annotated with @Nullable since they cannot return null.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NullableConstructor).
- **Exception:** If this is intended, add `{"rule":"errorprone/NullableConstructor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NullableConstructor)

<a id="errorprone-nullableoncontainingclass"></a>

### `errorprone/NullableOnContainingClass`

Type-use nullability annotations should annotate the inner class, not the outer class (e.g., write `A.@Nullable B` instead of `@Nullable A.B`).

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NullableOnContainingClass).
- **Exception:** If this is intended, add `{"rule":"errorprone/NullableOnContainingClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NullableOnContainingClass)

<a id="errorprone-nullableoptional"></a>

### `errorprone/NullableOptional`

Using an Optional variable which is expected to possibly be null is discouraged. It is best to indicate the absence of the value by assigning it an empty optional.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NullableOptional).
- **Exception:** If this is intended, add `{"rule":"errorprone/NullableOptional","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NullableOptional)

<a id="errorprone-nullableprimitive"></a>

### `errorprone/NullablePrimitive`

Nullness annotations should not be used for primitive types since they cannot be null.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NullablePrimitive).
- **Exception:** If this is intended, add `{"rule":"errorprone/NullablePrimitive","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NullablePrimitive)

<a id="errorprone-nullableprimitivearray"></a>

### `errorprone/NullablePrimitiveArray`

@Nullable type annotations should not be used for primitive types since they cannot be null.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NullablePrimitiveArray).
- **Exception:** If this is intended, add `{"rule":"errorprone/NullablePrimitiveArray","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NullablePrimitiveArray)

<a id="errorprone-nullabletypeparameter"></a>

### `errorprone/NullableTypeParameter`

Nullness annotations directly on type parameters are interpreted differently by different tools.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NullableTypeParameter).
- **Exception:** If this is intended, add `{"rule":"errorprone/NullableTypeParameter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NullableTypeParameter)

<a id="errorprone-nullablevoid"></a>

### `errorprone/NullableVoid`

Void-returning methods should not be annotated with nullness annotations, since they cannot return null.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NullableVoid).
- **Exception:** If this is intended, add `{"rule":"errorprone/NullableVoid","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NullableVoid)

<a id="errorprone-nullablewildcard"></a>

### `errorprone/NullableWildcard`

Nullness annotations directly on wildcard types are interpreted differently by different tools.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NullableWildcard).
- **Exception:** If this is intended, add `{"rule":"errorprone/NullableWildcard","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NullableWildcard)

<a id="errorprone-nullargumentfornonnullparameter"></a>

### `errorprone/NullArgumentForNonNullParameter`

Null is not permitted for this parameter.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NullArgumentForNonNullParameter).
- **Exception:** If this is intended, add `{"rule":"errorprone/NullArgumentForNonNullParameter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NullArgumentForNonNullParameter)

<a id="errorprone-nullaway"></a>

### `errorprone/NullAway`

Nullability type error.

- **Scope:** Main sources only; off in a project without main classes in a named package.
- **Why it is on:** NullAway is an Error Prone plugin: the main packages of the project are non-null unless marked, so a null that reaches a place that does not allow it is a finding.
- **Allowed form:** Annotate a field, parameter or return value that may be null with the @Nullable the project already uses (JSpecify's org.jspecify.annotations.Nullable when it uses none) and check it before use, or give a non-null value.
- **Exception:** If this is intended, add `{"rule":"errorprone/NullAway","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [NullAway](https://github.com/uber/NullAway)

<a id="errorprone-nullneedscastforvarargs"></a>

### `errorprone/NullNeedsCastForVarargs`

This call passes a null array, so it always produces NullPointerException. To pass a null element, cast to the element type.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NullNeedsCastForVarargs).
- **Exception:** If this is intended, add `{"rule":"errorprone/NullNeedsCastForVarargs","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NullNeedsCastForVarargs)

<a id="errorprone-nulloptional"></a>

### `errorprone/NullOptional`

Passing a literal null to an Optional parameter is almost certainly a mistake. Did you mean to provide an empty Optional?

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NullOptional).
- **Exception:** If this is intended, add `{"rule":"errorprone/NullOptional","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NullOptional)

<a id="errorprone-nullternary"></a>

### `errorprone/NullTernary`

This conditional expression may evaluate to null, which will result in an NPE when the result is unboxed.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NullTernary).
- **Exception:** If this is intended, add `{"rule":"errorprone/NullTernary","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NullTernary)

<a id="errorprone-objectequalsforprimitives"></a>

### `errorprone/ObjectEqualsForPrimitives`

Avoid unnecessary boxing by using plain == for primitive types.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ObjectEqualsForPrimitives).
- **Exception:** If this is intended, add `{"rule":"errorprone/ObjectEqualsForPrimitives","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ObjectEqualsForPrimitives)

<a id="errorprone-objectshashcodeprimitive"></a>

### `errorprone/ObjectsHashCodePrimitive`

Objects.hashCode(Object o) should not be passed a primitive value.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ObjectsHashCodePrimitive).
- **Exception:** If this is intended, add `{"rule":"errorprone/ObjectsHashCodePrimitive","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ObjectsHashCodePrimitive)

<a id="errorprone-objecttostring"></a>

### `errorprone/ObjectToString`

Calling toString on Objects that don't override toString() doesn't provide useful information.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ObjectToString).
- **Exception:** If this is intended, add `{"rule":"errorprone/ObjectToString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ObjectToString)

<a id="errorprone-operatorprecedence"></a>

### `errorprone/OperatorPrecedence`

Use grouping parenthesis to make the operator precedence explicit.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/OperatorPrecedence).
- **Exception:** If this is intended, add `{"rule":"errorprone/OperatorPrecedence","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OperatorPrecedence)

<a id="errorprone-optionalequality"></a>

### `errorprone/OptionalEquality`

Comparison using reference equality instead of value equality.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/OptionalEquality).
- **Exception:** If this is intended, add `{"rule":"errorprone/OptionalEquality","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OptionalEquality)

<a id="errorprone-optionalmaptooptional"></a>

### `errorprone/OptionalMapToOptional`

Mapping to another Optional will yield a nested Optional. Did you mean flatMap?

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/OptionalMapToOptional).
- **Exception:** If this is intended, add `{"rule":"errorprone/OptionalMapToOptional","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OptionalMapToOptional)

<a id="errorprone-optionalmapunusedvalue"></a>

### `errorprone/OptionalMapUnusedValue`

Optional.ifPresent is preferred over Optional.map when the return value is unused.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/OptionalMapUnusedValue).
- **Exception:** If this is intended, add `{"rule":"errorprone/OptionalMapUnusedValue","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OptionalMapUnusedValue)

<a id="errorprone-optionalnotpresent"></a>

### `errorprone/OptionalNotPresent`

This Optional has been confirmed to be empty at this point, so the call to `get()` or `orElseThrow()` will always throw.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/OptionalNotPresent).
- **Exception:** If this is intended, add `{"rule":"errorprone/OptionalNotPresent","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OptionalNotPresent)

<a id="errorprone-optionalofredundantmethod"></a>

### `errorprone/OptionalOfRedundantMethod`

Optional.of() always returns a non-empty optional. Using ifPresent/isPresent/orElse/orElseGet/orElseThrow/isPresent/or/orNull method on it is unnecessary and most probably a bug.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/OptionalOfRedundantMethod).
- **Exception:** If this is intended, add `{"rule":"errorprone/OptionalOfRedundantMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OptionalOfRedundantMethod)

<a id="errorprone-orphanedformatstring"></a>

### `errorprone/OrphanedFormatString`

String literal contains format specifiers, but is not passed to a format method.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/OrphanedFormatString).
- **Exception:** If this is intended, add `{"rule":"errorprone/OrphanedFormatString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OrphanedFormatString)

<a id="errorprone-outlinenone"></a>

### `errorprone/OutlineNone`

Setting CSS outline style to none or 0 (while not otherwise providing visual focus indicators) is inaccessible for users navigating a web page without a mouse.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/OutlineNone).
- **Exception:** If this is intended, add `{"rule":"errorprone/OutlineNone","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OutlineNone)

<a id="errorprone-overlappingqualifierandscopeannotation"></a>

### `errorprone/OverlappingQualifierAndScopeAnnotation`

Annotations cannot be both Scope annotations and Qualifier annotations: this causes confusion when trying to use them.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/OverlappingQualifierAndScopeAnnotation).
- **Exception:** If this is intended, add `{"rule":"errorprone/OverlappingQualifierAndScopeAnnotation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OverlappingQualifierAndScopeAnnotation)

<a id="errorprone-overrides"></a>

### `errorprone/Overrides`

Varargs doesn't agree for overridden method.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/Overrides).
- **Exception:** If this is intended, add `{"rule":"errorprone/Overrides","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/Overrides)

<a id="errorprone-overridesguiceinjectablemethod"></a>

### `errorprone/OverridesGuiceInjectableMethod`

This method is not annotated with @Inject, but it overrides a method that is annotated with @com.google.inject.Inject. Guice will inject this method, and it is recommended to annotate it explicitly.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/OverridesGuiceInjectableMethod).
- **Exception:** If this is intended, add `{"rule":"errorprone/OverridesGuiceInjectableMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OverridesGuiceInjectableMethod)

<a id="errorprone-overridesjavaxinjectablemethod"></a>

### `errorprone/OverridesJavaxInjectableMethod`

This method is not annotated with @Inject, but it overrides a method that is annotated with @javax.inject.Inject. The method will not be Injected.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/OverridesJavaxInjectableMethod).
- **Exception:** If this is intended, add `{"rule":"errorprone/OverridesJavaxInjectableMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OverridesJavaxInjectableMethod)

<a id="errorprone-overridethrowabletostring"></a>

### `errorprone/OverrideThrowableToString`

To return a custom message with a Throwable class, one should override getMessage() instead of toString().

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/OverrideThrowableToString).
- **Exception:** If this is intended, add `{"rule":"errorprone/OverrideThrowableToString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OverrideThrowableToString)

<a id="errorprone-overridingmethodinconsistentargumentnameschecker"></a>

### `errorprone/OverridingMethodInconsistentArgumentNamesChecker`

Arguments of overriding method are inconsistent with overridden method.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/OverridingMethodInconsistentArgumentNamesChecker).
- **Exception:** If this is intended, add `{"rule":"errorprone/OverridingMethodInconsistentArgumentNamesChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OverridingMethodInconsistentArgumentNamesChecker)

<a id="errorprone-packageinfo"></a>

### `errorprone/PackageInfo`

Declaring types inside package-info.java files is very bad form.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/PackageInfo).
- **Exception:** If this is intended, add `{"rule":"errorprone/PackageInfo","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PackageInfo)

<a id="errorprone-packagelocation"></a>

### `errorprone/PackageLocation`

Package names should match the directory they are declared in.

- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/PackageLocation).
- **Exception:** If this is intended, add `{"rule":"errorprone/PackageLocation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PackageLocation)

<a id="errorprone-parametercomment"></a>

### `errorprone/ParameterComment`

Non-standard parameter comment; prefer `/* paramName= */ arg`.

- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ParameterComment).
- **Exception:** If this is intended, add `{"rule":"errorprone/ParameterComment","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ParameterComment)

<a id="errorprone-parametername"></a>

### `errorprone/ParameterName`

Detects `/* name= */`-style comments on actual parameters where the name doesn't match the formal parameter.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ParameterName).
- **Exception:** If this is intended, add `{"rule":"errorprone/ParameterName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ParameterName)

<a id="errorprone-parametersbutnotparameterized"></a>

### `errorprone/ParametersButNotParameterized`

This test has @Parameters but is using the default JUnit4 runner. The parameters will have no effect.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ParametersButNotParameterized).
- **Exception:** If this is intended, add `{"rule":"errorprone/ParametersButNotParameterized","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ParametersButNotParameterized)

<a id="errorprone-parcelablecreator"></a>

### `errorprone/ParcelableCreator`

Detects classes which implement Parcelable but don't have CREATOR.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ParcelableCreator).
- **Exception:** If this is intended, add `{"rule":"errorprone/ParcelableCreator","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ParcelableCreator)

<a id="errorprone-patternmatchinginstanceof"></a>

### `errorprone/PatternMatchingInstanceof`

This code can be simplified to use a pattern-matching instanceof.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/PatternMatchingInstanceof).
- **Exception:** If this is intended, add `{"rule":"errorprone/PatternMatchingInstanceof","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PatternMatchingInstanceof)

<a id="errorprone-periodfrom"></a>

### `errorprone/PeriodFrom`

Period.from(Period) returns itself; from(Duration) throws a runtime exception.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/PeriodFrom).
- **Exception:** If this is intended, add `{"rule":"errorprone/PeriodFrom","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PeriodFrom)

<a id="errorprone-periodgettemporalunit"></a>

### `errorprone/PeriodGetTemporalUnit`

Period.get() only works with YEARS, MONTHS, or DAYS.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/PeriodGetTemporalUnit).
- **Exception:** If this is intended, add `{"rule":"errorprone/PeriodGetTemporalUnit","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PeriodGetTemporalUnit)

<a id="errorprone-periodtimemath"></a>

### `errorprone/PeriodTimeMath`

When adding or subtracting from a Period, Duration is incompatible.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/PeriodTimeMath).
- **Exception:** If this is intended, add `{"rule":"errorprone/PeriodTimeMath","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PeriodTimeMath)

<a id="errorprone-preconditionschecknotnullrepeated"></a>

### `errorprone/PreconditionsCheckNotNullRepeated`

Including the first argument of checkNotNull in the failure message is not useful, as it will always be `null`.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/PreconditionsCheckNotNullRepeated).
- **Exception:** If this is intended, add `{"rule":"errorprone/PreconditionsCheckNotNullRepeated","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PreconditionsCheckNotNullRepeated)

<a id="errorprone-preconditionsinvalidplaceholder"></a>

### `errorprone/PreconditionsInvalidPlaceholder`

Preconditions only accepts the %s placeholder in error message strings.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/PreconditionsInvalidPlaceholder).
- **Exception:** If this is intended, add `{"rule":"errorprone/PreconditionsInvalidPlaceholder","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PreconditionsInvalidPlaceholder)

<a id="errorprone-preferinstanceofovergetkind"></a>

### `errorprone/PreferInstanceofOverGetKind`

Prefer instanceof over getKind() checks where possible, as these work well with pattern matching instanceofs.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/PreferInstanceofOverGetKind).
- **Exception:** If this is intended, add `{"rule":"errorprone/PreferInstanceofOverGetKind","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PreferInstanceofOverGetKind)

<a id="errorprone-preferjavatimeoverload"></a>

### `errorprone/PreferJavaTimeOverload`

Prefer using java.time-based APIs when available. Note that this checker does not and cannot guarantee that the overloads have equivalent semantics, but that is generally the case with overloaded methods.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/PreferJavaTimeOverload).
- **Exception:** If this is intended, add `{"rule":"errorprone/PreferJavaTimeOverload","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PreferJavaTimeOverload)

<a id="errorprone-prefertestparameter"></a>

### `errorprone/PreferTestParameter`

When exhaustively testing all values of a single enum or boolean parameter, prefer @TestParameter over @TestParameters.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/PreferTestParameter).
- **Exception:** If this is intended, add `{"rule":"errorprone/PreferTestParameter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PreferTestParameter)

<a id="errorprone-preferthrowstag"></a>

### `errorprone/PreferThrowsTag`

Prefer the @throws javadoc tag instead of @exception.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/PreferThrowsTag).
- **Exception:** If this is intended, add `{"rule":"errorprone/PreferThrowsTag","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PreferThrowsTag)

<a id="errorprone-primitivearraypassedtovarargsmethod"></a>

### `errorprone/PrimitiveArrayPassedToVarargsMethod`

Passing a primitive array to a varargs method is usually wrong.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/PrimitiveArrayPassedToVarargsMethod).
- **Exception:** If this is intended, add `{"rule":"errorprone/PrimitiveArrayPassedToVarargsMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PrimitiveArrayPassedToVarargsMethod)

<a id="errorprone-primitiveatomicreference"></a>

### `errorprone/PrimitiveAtomicReference`

Using compareAndSet with boxed primitives is dangerous, as reference rather than value equality is used. Consider using AtomicInteger, AtomicLong, AtomicBoolean from JDK or AtomicDouble from Guava instead.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/PrimitiveAtomicReference).
- **Exception:** If this is intended, add `{"rule":"errorprone/PrimitiveAtomicReference","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PrimitiveAtomicReference)

<a id="errorprone-privateconstructorfornoninstantiablemodule"></a>

### `errorprone/PrivateConstructorForNoninstantiableModule`

Add a private constructor to modules that will not be instantiated by Dagger.

- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/PrivateConstructorForNoninstantiableModule).
- **Exception:** If this is intended, add `{"rule":"errorprone/PrivateConstructorForNoninstantiableModule","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PrivateConstructorForNoninstantiableModule)

<a id="errorprone-privateconstructorforutilityclass"></a>

### `errorprone/PrivateConstructorForUtilityClass`

Classes which are not intended to be instantiated should be made non-instantiable with a private constructor. This includes utility classes (classes with only static members), and the main class.

- **Scope:** Not reported in classes annotated com.tngtech.archunit.junit.AnalyzeClasses, org.springframework.boot.SpringBootConfiguration, org.springframework.boot.autoconfigure.SpringBootApplication, org.springframework.context.annotation.Configuration.
- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/PrivateConstructorForUtilityClass).
- **Exception:** If this is intended, add `{"rule":"errorprone/PrivateConstructorForUtilityClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PrivateConstructorForUtilityClass)

<a id="errorprone-privatesecuritycontractprotoaccess"></a>

### `errorprone/PrivateSecurityContractProtoAccess`

Access to a private protocol buffer field is forbidden. This protocol buffer carries a security contract, and can only be created using an approved library. Direct access to the fields is forbidden.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/PrivateSecurityContractProtoAccess).
- **Exception:** If this is intended, add `{"rule":"errorprone/PrivateSecurityContractProtoAccess","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PrivateSecurityContractProtoAccess)

<a id="errorprone-protectedmembersinfinalclass"></a>

### `errorprone/ProtectedMembersInFinalClass`

Protected members in final classes can be package-private.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ProtectedMembersInFinalClass).
- **Exception:** If this is intended, add `{"rule":"errorprone/ProtectedMembersInFinalClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ProtectedMembersInFinalClass)

<a id="errorprone-protobuilderreturnvalueignored"></a>

### `errorprone/ProtoBuilderReturnValueIgnored`

Unnecessary call to proto's #build() method. If you don't consume the return value of #build(), the result is discarded and the only effect is to verify that all required fields are set, which can be expressed more directly with #isInitialized().

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ProtoBuilderReturnValueIgnored).
- **Exception:** If this is intended, add `{"rule":"errorprone/ProtoBuilderReturnValueIgnored","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ProtoBuilderReturnValueIgnored)

<a id="errorprone-protocolbufferordinal"></a>

### `errorprone/ProtocolBufferOrdinal`

To get the tag number of a protocol buffer enum, use getNumber() instead.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ProtocolBufferOrdinal).
- **Exception:** If this is intended, add `{"rule":"errorprone/ProtocolBufferOrdinal","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ProtocolBufferOrdinal)

<a id="errorprone-protodurationgetsecondsgetnano"></a>

### `errorprone/ProtoDurationGetSecondsGetNano`

GetNanos() only accesses the underlying nanosecond-adjustment of the duration.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ProtoDurationGetSecondsGetNano).
- **Exception:** If this is intended, add `{"rule":"errorprone/ProtoDurationGetSecondsGetNano","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ProtoDurationGetSecondsGetNano)

<a id="errorprone-protostringfieldreferenceequality"></a>

### `errorprone/ProtoStringFieldReferenceEquality`

Comparing protobuf fields of type String using reference equality.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ProtoStringFieldReferenceEquality).
- **Exception:** If this is intended, add `{"rule":"errorprone/ProtoStringFieldReferenceEquality","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ProtoStringFieldReferenceEquality)

<a id="errorprone-prototimestampgetsecondsgetnano"></a>

### `errorprone/ProtoTimestampGetSecondsGetNano`

GetNanos() only accesses the underlying nanosecond-adjustment of the instant.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ProtoTimestampGetSecondsGetNano).
- **Exception:** If this is intended, add `{"rule":"errorprone/ProtoTimestampGetSecondsGetNano","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ProtoTimestampGetSecondsGetNano)

<a id="errorprone-prototruthmixeddescriptors"></a>

### `errorprone/ProtoTruthMixedDescriptors`

The arguments passed to `ignoringFields` are inconsistent with the proto which is the subject of the assertion.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ProtoTruthMixedDescriptors).
- **Exception:** If this is intended, add `{"rule":"errorprone/ProtoTruthMixedDescriptors","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ProtoTruthMixedDescriptors)

<a id="errorprone-providesmethodoutsideofmodule"></a>

### `errorprone/ProvidesMethodOutsideOfModule`

@Provides methods need to be declared in a Module to have any effect.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ProvidesMethodOutsideOfModule).
- **Exception:** If this is intended, add `{"rule":"errorprone/ProvidesMethodOutsideOfModule","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ProvidesMethodOutsideOfModule)

<a id="errorprone-publicapinamedstreamshouldreturnstream"></a>

### `errorprone/PublicApiNamedStreamShouldReturnStream`

Public methods named stream() are generally expected to return a type whose name ends with Stream. Consider choosing a different method name instead.

- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/PublicApiNamedStreamShouldReturnStream).
- **Exception:** If this is intended, add `{"rule":"errorprone/PublicApiNamedStreamShouldReturnStream","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PublicApiNamedStreamShouldReturnStream)

<a id="errorprone-qualifierorscopeoninjectmethod"></a>

### `errorprone/QualifierOrScopeOnInjectMethod`

Qualifiers/Scope annotations on @Inject methods don't have any effect. Move the qualifier annotation to the binding location.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/QualifierOrScopeOnInjectMethod).
- **Exception:** If this is intended, add `{"rule":"errorprone/QualifierOrScopeOnInjectMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/QualifierOrScopeOnInjectMethod)

<a id="errorprone-qualifierwithtypeuse"></a>

### `errorprone/QualifierWithTypeUse`

Injection frameworks currently don't understand Qualifiers in TYPE_PARAMETER or TYPE_USE contexts.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/QualifierWithTypeUse).
- **Exception:** If this is intended, add `{"rule":"errorprone/QualifierWithTypeUse","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/QualifierWithTypeUse)

<a id="errorprone-randomcast"></a>

### `errorprone/RandomCast`

Casting a random number in the range [0.0, 1.0) to an integer or long always results in 0.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RandomCast).
- **Exception:** If this is intended, add `{"rule":"errorprone/RandomCast","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RandomCast)

<a id="errorprone-randommodinteger"></a>

### `errorprone/RandomModInteger`

Use Random.nextInt(int). Random.nextInt() % n can have negative results.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RandomModInteger).
- **Exception:** If this is intended, add `{"rule":"errorprone/RandomModInteger","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RandomModInteger)

<a id="errorprone-reachabilityfenceusage"></a>

### `errorprone/ReachabilityFenceUsage`

ReachabilityFence should always be called inside a finally block.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ReachabilityFenceUsage).
- **Exception:** If this is intended, add `{"rule":"errorprone/ReachabilityFenceUsage","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ReachabilityFenceUsage)

<a id="errorprone-recordaccessorincompactconstructor"></a>

### `errorprone/RecordAccessorInCompactConstructor`

Record accessors read uninitialized fields inside a compact constructor. Use the component parameter instead.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RecordAccessorInCompactConstructor).
- **Exception:** If this is intended, add `{"rule":"errorprone/RecordAccessorInCompactConstructor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RecordAccessorInCompactConstructor)

<a id="errorprone-recordcomponentaccessorannotationconflict"></a>

### `errorprone/RecordComponentAccessorAnnotationConflict`

Annotation on record component is ignored.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RecordComponentAccessorAnnotationConflict).
- **Exception:** If this is intended, add `{"rule":"errorprone/RecordComponentAccessorAnnotationConflict","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RecordComponentAccessorAnnotationConflict)

<a id="errorprone-recordcomponentoverride"></a>

### `errorprone/RecordComponentOverride`

@Override annotations on record components don't do anything.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RecordComponentOverride).
- **Exception:** If this is intended, add `{"rule":"errorprone/RecordComponentOverride","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RecordComponentOverride)

<a id="errorprone-rectintersectreturnvalueignored"></a>

### `errorprone/RectIntersectReturnValueIgnored`

Return value of android.graphics.Rect.intersect() must be checked.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RectIntersectReturnValueIgnored).
- **Exception:** If this is intended, add `{"rule":"errorprone/RectIntersectReturnValueIgnored","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RectIntersectReturnValueIgnored)

<a id="errorprone-redundantcontrolflow"></a>

### `errorprone/RedundantControlFlow`

This continue statement is redundant and can be removed. It may be misleading.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RedundantControlFlow).
- **Exception:** If this is intended, add `{"rule":"errorprone/RedundantControlFlow","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RedundantControlFlow)

<a id="errorprone-redundantnullcheck"></a>

### `errorprone/RedundantNullCheck`

Null check on an expression that is statically determined to be non-null according to language semantics or nullness annotations.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RedundantNullCheck).
- **Exception:** If this is intended, add `{"rule":"errorprone/RedundantNullCheck","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RedundantNullCheck)

<a id="errorprone-redundantoverride"></a>

### `errorprone/RedundantOverride`

This overriding method is redundant, and can be removed.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RedundantOverride).
- **Exception:** If this is intended, add `{"rule":"errorprone/RedundantOverride","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RedundantOverride)

<a id="errorprone-redundantsettercall"></a>

### `errorprone/RedundantSetterCall`

A field was set twice in the same chained expression.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RedundantSetterCall).
- **Exception:** If this is intended, add `{"rule":"errorprone/RedundantSetterCall","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RedundantSetterCall)

<a id="errorprone-redundantthrows"></a>

### `errorprone/RedundantThrows`

Thrown exception is a subtype of another.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RedundantThrows).
- **Exception:** If this is intended, add `{"rule":"errorprone/RedundantThrows","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RedundantThrows)

<a id="errorprone-refactorswitch"></a>

### `errorprone/RefactorSwitch`

This switch can be refactored to be more readable.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RefactorSwitch).
- **Exception:** If this is intended, add `{"rule":"errorprone/RefactorSwitch","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RefactorSwitch)

<a id="errorprone-referenceequality"></a>

### `errorprone/ReferenceEquality`

Comparison using reference equality instead of value equality.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ReferenceEquality).
- **Exception:** If this is intended, add `{"rule":"errorprone/ReferenceEquality","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ReferenceEquality)

<a id="errorprone-referstodaggercodegen"></a>

### `errorprone/RefersToDaggerCodegen`

Don't refer to Dagger's internal or generated code.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RefersToDaggerCodegen).
- **Exception:** If this is intended, add `{"rule":"errorprone/RefersToDaggerCodegen","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RefersToDaggerCodegen)

<a id="errorprone-requiredmodifiers"></a>

### `errorprone/RequiredModifiers`

This annotation is missing required modifiers as specified by its @RequiredModifiers annotation.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RequiredModifiers).
- **Exception:** If this is intended, add `{"rule":"errorprone/RequiredModifiers","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RequiredModifiers)

<a id="errorprone-restrictedapi"></a>

### `errorprone/RestrictedApi`

Check for non-allowlisted callers to RestrictedApiChecker.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RestrictedApi).
- **Exception:** If this is intended, add `{"rule":"errorprone/RestrictedApi","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RestrictedApi)

<a id="errorprone-rethrowreflectiveoperationexceptionaslinkageerror"></a>

### `errorprone/RethrowReflectiveOperationExceptionAsLinkageError`

Prefer LinkageError for rethrowing ReflectiveOperationException as unchecked.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RethrowReflectiveOperationExceptionAsLinkageError).
- **Exception:** If this is intended, add `{"rule":"errorprone/RethrowReflectiveOperationExceptionAsLinkageError","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RethrowReflectiveOperationExceptionAsLinkageError)

<a id="errorprone-returnattheendofvoidfunction"></a>

### `errorprone/ReturnAtTheEndOfVoidFunction`

`return;` is unnecessary at the end of void methods and constructors.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ReturnAtTheEndOfVoidFunction).
- **Exception:** If this is intended, add `{"rule":"errorprone/ReturnAtTheEndOfVoidFunction","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ReturnAtTheEndOfVoidFunction)

<a id="errorprone-returnfromvoid"></a>

### `errorprone/ReturnFromVoid`

Void methods should not have a @return tag.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ReturnFromVoid).
- **Exception:** If this is intended, add `{"rule":"errorprone/ReturnFromVoid","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ReturnFromVoid)

<a id="errorprone-returnsnullcollection"></a>

### `errorprone/ReturnsNullCollection`

Method has a collection return type and returns {@code null} in some cases but does not annotate the method as @Nullable. See Effective Java 3rd Edition Item 54.

- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ReturnsNullCollection).
- **Exception:** If this is intended, add `{"rule":"errorprone/ReturnsNullCollection","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ReturnsNullCollection)

<a id="errorprone-returnvalueignored"></a>

### `errorprone/ReturnValueIgnored`

Return value of this method must be used.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ReturnValueIgnored).
- **Exception:** If this is intended, add `{"rule":"errorprone/ReturnValueIgnored","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ReturnValueIgnored)

<a id="errorprone-robolectricshadowdirectlyon"></a>

### `errorprone/RobolectricShadowDirectlyOn`

Migrate off a deprecated overload of org.robolectric.shadow.api.Shadow#directlyOn.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RobolectricShadowDirectlyOn).
- **Exception:** If this is intended, add `{"rule":"errorprone/RobolectricShadowDirectlyOn","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RobolectricShadowDirectlyOn)

<a id="errorprone-rulenotrun"></a>

### `errorprone/RuleNotRun`

This TestRule isn't annotated with @Rule, so won't be run.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RuleNotRun).
- **Exception:** If this is intended, add `{"rule":"errorprone/RuleNotRun","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RuleNotRun)

<a id="errorprone-rxreturnvalueignored"></a>

### `errorprone/RxReturnValueIgnored`

Returned Rx objects must be checked. Ignoring a returned Rx value means it is never scheduled for execution.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RxReturnValueIgnored).
- **Exception:** If this is intended, add `{"rule":"errorprone/RxReturnValueIgnored","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RxReturnValueIgnored)

<a id="errorprone-samenamebutdifferent"></a>

### `errorprone/SameNameButDifferent`

This type name shadows another in a way that may be confusing.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SameNameButDifferent).
- **Exception:** If this is intended, add `{"rule":"errorprone/SameNameButDifferent","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SameNameButDifferent)

<a id="errorprone-scannerusedelimiter"></a>

### `errorprone/ScannerUseDelimiter`

Scanner.useDelimiter is not an efficient way to read an entire InputStream.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ScannerUseDelimiter).
- **Exception:** If this is intended, add `{"rule":"errorprone/ScannerUseDelimiter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ScannerUseDelimiter)

<a id="errorprone-scopeonmodule"></a>

### `errorprone/ScopeOnModule`

Scopes on modules have no function and will soon be an error.

- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ScopeOnModule).
- **Exception:** If this is intended, add `{"rule":"errorprone/ScopeOnModule","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ScopeOnModule)

<a id="errorprone-selfalwaysreturnsthis"></a>

### `errorprone/SelfAlwaysReturnsThis`

Non-abstract instance methods named 'self()' or 'getThis()' that return the enclosing class must always 'return this'.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SelfAlwaysReturnsThis).
- **Exception:** If this is intended, add `{"rule":"errorprone/SelfAlwaysReturnsThis","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SelfAlwaysReturnsThis)

<a id="errorprone-selfassertion"></a>

### `errorprone/SelfAssertion`

This assertion will always fail or succeed.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SelfAssertion).
- **Exception:** If this is intended, add `{"rule":"errorprone/SelfAssertion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SelfAssertion)

<a id="errorprone-selfassignment"></a>

### `errorprone/SelfAssignment`

Variable assigned to itself.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SelfAssignment).
- **Exception:** If this is intended, add `{"rule":"errorprone/SelfAssignment","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SelfAssignment)

<a id="errorprone-selfcomparison"></a>

### `errorprone/SelfComparison`

An object is compared to itself.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SelfComparison).
- **Exception:** If this is intended, add `{"rule":"errorprone/SelfComparison","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SelfComparison)

<a id="errorprone-selfequals"></a>

### `errorprone/SelfEquals`

Testing an object for equality with itself will always be true.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SelfEquals).
- **Exception:** If this is intended, add `{"rule":"errorprone/SelfEquals","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SelfEquals)

<a id="errorprone-selfset"></a>

### `errorprone/SelfSet`

This setter seems to be invoked with a value from its own getter. Is it redundant?

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SelfSet).
- **Exception:** If this is intended, add `{"rule":"errorprone/SelfSet","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SelfSet)

<a id="errorprone-setunrecognized"></a>

### `errorprone/SetUnrecognized`

Setting a proto field to an UNRECOGNIZED value will result in an exception at runtime when building.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SetUnrecognized).
- **Exception:** If this is intended, add `{"rule":"errorprone/SetUnrecognized","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SetUnrecognized)

<a id="errorprone-shortcircuitboolean"></a>

### `errorprone/ShortCircuitBoolean`

Prefer the short-circuiting boolean operators && and || to & and |.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ShortCircuitBoolean).
- **Exception:** If this is intended, add `{"rule":"errorprone/ShortCircuitBoolean","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ShortCircuitBoolean)

<a id="errorprone-shouldhaveevenargs"></a>

### `errorprone/ShouldHaveEvenArgs`

This method must be called with an even number of arguments.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ShouldHaveEvenArgs).
- **Exception:** If this is intended, add `{"rule":"errorprone/ShouldHaveEvenArgs","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ShouldHaveEvenArgs)

<a id="errorprone-sizegreaterthanorequalszero"></a>

### `errorprone/SizeGreaterThanOrEqualsZero`

Comparison of a size >= 0 is always true, did you intend to check for non-emptiness?

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SizeGreaterThanOrEqualsZero).
- **Exception:** If this is intended, add `{"rule":"errorprone/SizeGreaterThanOrEqualsZero","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SizeGreaterThanOrEqualsZero)

<a id="errorprone-statementswitchtoexpressionswitch"></a>

### `errorprone/StatementSwitchToExpressionSwitch`

This statement switch can be converted to a new-style arrow switch.

- **Scope:** Off in a project that uses Lombok.
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/StatementSwitchToExpressionSwitch).
- **Exception:** If this is intended, add `{"rule":"errorprone/StatementSwitchToExpressionSwitch","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StatementSwitchToExpressionSwitch)

<a id="errorprone-staticassignmentinconstructor"></a>

### `errorprone/StaticAssignmentInConstructor`

This assignment is to a static field. Mutating static state from a constructor is highly error-prone.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/StaticAssignmentInConstructor).
- **Exception:** If this is intended, add `{"rule":"errorprone/StaticAssignmentInConstructor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StaticAssignmentInConstructor)

<a id="errorprone-staticassignmentofthrowable"></a>

### `errorprone/StaticAssignmentOfThrowable`

Saving instances of Throwable in static fields is discouraged, prefer to create them on-demand when an exception is thrown.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/StaticAssignmentOfThrowable).
- **Exception:** If this is intended, add `{"rule":"errorprone/StaticAssignmentOfThrowable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StaticAssignmentOfThrowable)

<a id="errorprone-staticguardedbyinstance"></a>

### `errorprone/StaticGuardedByInstance`

Writes to static fields should not be guarded by instance locks.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/StaticGuardedByInstance).
- **Exception:** If this is intended, add `{"rule":"errorprone/StaticGuardedByInstance","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StaticGuardedByInstance)

<a id="errorprone-staticmockmember"></a>

### `errorprone/StaticMockMember`

@Mock members of test classes shouldn't share state between tests and preferably be non-static.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/StaticMockMember).
- **Exception:** If this is intended, add `{"rule":"errorprone/StaticMockMember","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StaticMockMember)

<a id="errorprone-staticqualifiedusingexpression"></a>

### `errorprone/StaticQualifiedUsingExpression`

A static variable or method should be qualified with a class name, not expression.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/StaticQualifiedUsingExpression).
- **Exception:** If this is intended, add `{"rule":"errorprone/StaticQualifiedUsingExpression","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StaticQualifiedUsingExpression)

<a id="errorprone-streamresourceleak"></a>

### `errorprone/StreamResourceLeak`

Streams that encapsulate a closeable resource should be closed using try-with-resources.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/StreamResourceLeak).
- **Exception:** If this is intended, add `{"rule":"errorprone/StreamResourceLeak","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StreamResourceLeak)

<a id="errorprone-streamtoiterable"></a>

### `errorprone/StreamToIterable`

Using stream::iterator creates a one-shot Iterable, which may cause surprising failures.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/StreamToIterable).
- **Exception:** If this is intended, add `{"rule":"errorprone/StreamToIterable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StreamToIterable)

<a id="errorprone-streamtostring"></a>

### `errorprone/StreamToString`

Calling toString on a Stream does not provide useful information.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/StreamToString).
- **Exception:** If this is intended, add `{"rule":"errorprone/StreamToString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StreamToString)

<a id="errorprone-stringbuilderinitwithchar"></a>

### `errorprone/StringBuilderInitWithChar`

StringBuilder does not have a char constructor; this invokes the int constructor.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/StringBuilderInitWithChar).
- **Exception:** If this is intended, add `{"rule":"errorprone/StringBuilderInitWithChar","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StringBuilderInitWithChar)

<a id="errorprone-stringcaselocaleusage"></a>

### `errorprone/StringCaseLocaleUsage`

Specify a `Locale` when calling `String#to{Lower,Upper}Case`. (Note: there are multiple suggested fixes; the third may be most appropriate if you're dealing with ASCII Strings.).

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/StringCaseLocaleUsage).
- **Exception:** If this is intended, add `{"rule":"errorprone/StringCaseLocaleUsage","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StringCaseLocaleUsage)

<a id="errorprone-stringcharset"></a>

### `errorprone/StringCharset`

Prefer StandardCharsets over using string names for charsets.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/StringCharset).
- **Exception:** If this is intended, add `{"rule":"errorprone/StringCharset","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StringCharset)

<a id="errorprone-stringconcattotextblock"></a>

### `errorprone/StringConcatToTextBlock`

This string literal can be written more clearly as a text block.

- **Scope:** Off in a project that uses Lombok.
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/StringConcatToTextBlock).
- **Exception:** If this is intended, add `{"rule":"errorprone/StringConcatToTextBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StringConcatToTextBlock)

<a id="errorprone-stringjoin"></a>

### `errorprone/StringJoin`

String.join(CharSequence) performs no joining (it always returns the empty string); String.join(CharSequence, CharSequence) performs no joining (it just returns the 2nd parameter).

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/StringJoin).
- **Exception:** If this is intended, add `{"rule":"errorprone/StringJoin","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StringJoin)

<a id="errorprone-stringsplitter"></a>

### `errorprone/StringSplitter`

String.split(String) has surprising behavior.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/StringSplitter).
- **Exception:** If this is intended, add `{"rule":"errorprone/StringSplitter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StringSplitter)

<a id="errorprone-stronglytypebytestring"></a>

### `errorprone/StronglyTypeByteString`

This primitive byte array is only used to construct ByteStrings. It would be clearer to strongly type the field instead.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/StronglyTypeByteString).
- **Exception:** If this is intended, add `{"rule":"errorprone/StronglyTypeByteString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StronglyTypeByteString)

<a id="errorprone-stronglytypetime"></a>

### `errorprone/StronglyTypeTime`

This primitive integral type is only used to construct time types. It would be clearer to strongly type the field instead.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/StronglyTypeTime).
- **Exception:** If this is intended, add `{"rule":"errorprone/StronglyTypeTime","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StronglyTypeTime)

<a id="errorprone-substringofzero"></a>

### `errorprone/SubstringOfZero`

String.substring(0) returns the original String.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SubstringOfZero).
- **Exception:** If this is intended, add `{"rule":"errorprone/SubstringOfZero","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SubstringOfZero)

<a id="errorprone-sunapi"></a>

### `errorprone/SunApi`

Usage of internal proprietary API which may be removed in a future release.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SunApi).
- **Exception:** If this is intended, add `{"rule":"errorprone/SunApi","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SunApi)

<a id="errorprone-supercalltoobjectmethod"></a>

### `errorprone/SuperCallToObjectMethod`

`super.equals(obj)` and `super.hashCode()` are often bugs when they call the methods defined in `java.lang.Object`.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SuperCallToObjectMethod).
- **Exception:** If this is intended, add `{"rule":"errorprone/SuperCallToObjectMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SuperCallToObjectMethod)

<a id="errorprone-suppresswarningsdeprecated"></a>

### `errorprone/SuppressWarningsDeprecated`

Suppressing "deprecated" is probably a typo for "deprecation".

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SuppressWarningsDeprecated).
- **Exception:** If this is intended, add `{"rule":"errorprone/SuppressWarningsDeprecated","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SuppressWarningsDeprecated)

<a id="errorprone-suppresswarningswithoutexplanation"></a>

### `errorprone/SuppressWarningsWithoutExplanation`

Use of @SuppressWarnings should be accompanied by a comment describing why the warning is safe to ignore.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SuppressWarningsWithoutExplanation).
- **Exception:** If this is intended, add `{"rule":"errorprone/SuppressWarningsWithoutExplanation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SuppressWarningsWithoutExplanation)

<a id="errorprone-swigmemoryleak"></a>

### `errorprone/SwigMemoryLeak`

SWIG generated code that can't call a C++ destructor will leak memory.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SwigMemoryLeak).
- **Exception:** If this is intended, add `{"rule":"errorprone/SwigMemoryLeak","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SwigMemoryLeak)

<a id="errorprone-switchdefault"></a>

### `errorprone/SwitchDefault`

The default case of a switch should appear at the end of the last statement group.

- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SwitchDefault).
- **Exception:** If this is intended, add `{"rule":"errorprone/SwitchDefault","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SwitchDefault)

<a id="errorprone-symboltostring"></a>

### `errorprone/SymbolToString`

Element#toString shouldn't be used for comparison as it is expensive and fragile.

- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SymbolToString).
- **Exception:** If this is intended, add `{"rule":"errorprone/SymbolToString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SymbolToString)

<a id="errorprone-synchronizeonnonfinalfield"></a>

### `errorprone/SynchronizeOnNonFinalField`

Synchronizing on non-final fields is not safe: if the field is ever updated, different threads may end up locking on different objects.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SynchronizeOnNonFinalField).
- **Exception:** If this is intended, add `{"rule":"errorprone/SynchronizeOnNonFinalField","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SynchronizeOnNonFinalField)

<a id="errorprone-systemconsolenull"></a>

### `errorprone/SystemConsoleNull`

System.console() no longer returns null in JDK 22 and newer versions.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SystemConsoleNull).
- **Exception:** If this is intended, add `{"rule":"errorprone/SystemConsoleNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SystemConsoleNull)

<a id="errorprone-systemexitoutsidemain"></a>

### `errorprone/SystemExitOutsideMain`

Code that contains System.exit() is untestable.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SystemExitOutsideMain).
- **Exception:** If this is intended, add `{"rule":"errorprone/SystemExitOutsideMain","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SystemExitOutsideMain)

<a id="errorprone-systemout"></a>

### `errorprone/SystemOut`

Production code should not print to standard out or standard error. Standard out and standard error should only be used for debugging.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SystemOut).
- **Exception:** If this is intended, add `{"rule":"errorprone/SystemOut","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SystemOut)

<a id="errorprone-temporalaccessorgetchronofield"></a>

### `errorprone/TemporalAccessorGetChronoField`

TemporalAccessor.get() only works for certain values of ChronoField.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TemporalAccessorGetChronoField).
- **Exception:** If this is intended, add `{"rule":"errorprone/TemporalAccessorGetChronoField","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TemporalAccessorGetChronoField)

<a id="errorprone-testexceptionchecker"></a>

### `errorprone/TestExceptionChecker`

Using @Test(expected=...) is discouraged, since the test will pass if any statement in the test method throws the expected exception.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TestExceptionChecker).
- **Exception:** If this is intended, add `{"rule":"errorprone/TestExceptionChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TestExceptionChecker)

<a id="errorprone-testparametersnotinitialized"></a>

### `errorprone/TestParametersNotInitialized`

This test has @TestParameter fields but is using the default JUnit4 runner. The parameters will not be initialised beyond their default value.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TestParametersNotInitialized).
- **Exception:** If this is intended, add `{"rule":"errorprone/TestParametersNotInitialized","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TestParametersNotInitialized)

<a id="errorprone-theorybutnotheories"></a>

### `errorprone/TheoryButNoTheories`

This test has members annotated with @Theory, @DataPoint, or @DataPoints but is using the default JUnit4 runner.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TheoryButNoTheories).
- **Exception:** If this is intended, add `{"rule":"errorprone/TheoryButNoTheories","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TheoryButNoTheories)

<a id="errorprone-threadbuildernamewithplaceholder"></a>

### `errorprone/ThreadBuilderNameWithPlaceholder`

Thread.Builder.name() does not accept placeholders (e.g., %d or %s). threadBuilder.name(String) accepts a constant name and threadBuilder.name(String, int) accepts a constant name prefix and an initial counter value.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ThreadBuilderNameWithPlaceholder).
- **Exception:** If this is intended, add `{"rule":"errorprone/ThreadBuilderNameWithPlaceholder","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ThreadBuilderNameWithPlaceholder)

<a id="errorprone-threadjoinloop"></a>

### `errorprone/ThreadJoinLoop`

Thread.join needs to be immediately surrounded by a loop until it succeeds. Consider using Uninterruptibles.joinUninterruptibly.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ThreadJoinLoop).
- **Exception:** If this is intended, add `{"rule":"errorprone/ThreadJoinLoop","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ThreadJoinLoop)

<a id="errorprone-threadlocalusage"></a>

### `errorprone/ThreadLocalUsage`

ThreadLocals should be stored in static fields.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ThreadLocalUsage).
- **Exception:** If this is intended, add `{"rule":"errorprone/ThreadLocalUsage","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ThreadLocalUsage)

<a id="errorprone-threadprioritycheck"></a>

### `errorprone/ThreadPriorityCheck`

Relying on the thread scheduler is discouraged.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ThreadPriorityCheck).
- **Exception:** If this is intended, add `{"rule":"errorprone/ThreadPriorityCheck","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ThreadPriorityCheck)

<a id="errorprone-threelettertimezoneid"></a>

### `errorprone/ThreeLetterTimeZoneID`

Three-letter time zone identifiers are deprecated, may be ambiguous, and might not do what you intend; the full IANA time zone ID should be used instead.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ThreeLetterTimeZoneID).
- **Exception:** If this is intended, add `{"rule":"errorprone/ThreeLetterTimeZoneID","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ThreeLetterTimeZoneID)

<a id="errorprone-throwableequalshashcode"></a>

### `errorprone/ThrowableEqualsHashCode`

Overriding Throwable.equals() or hashCode() is discouraged.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ThrowableEqualsHashCode).
- **Exception:** If this is intended, add `{"rule":"errorprone/ThrowableEqualsHashCode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ThrowableEqualsHashCode)

<a id="errorprone-throwifuncheckedknownchecked"></a>

### `errorprone/ThrowIfUncheckedKnownChecked`

ThrowIfUnchecked(knownCheckedException) is a no-op.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ThrowIfUncheckedKnownChecked).
- **Exception:** If this is intended, add `{"rule":"errorprone/ThrowIfUncheckedKnownChecked","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ThrowIfUncheckedKnownChecked)

<a id="errorprone-throwifuncheckedknownunchecked"></a>

### `errorprone/ThrowIfUncheckedKnownUnchecked`

`throwIfUnchecked(knownUnchecked)` is equivalent to `throw knownUnchecked`.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ThrowIfUncheckedKnownUnchecked).
- **Exception:** If this is intended, add `{"rule":"errorprone/ThrowIfUncheckedKnownUnchecked","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ThrowIfUncheckedKnownUnchecked)

<a id="errorprone-thrownull"></a>

### `errorprone/ThrowNull`

Throwing 'null' always results in a NullPointerException being thrown.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ThrowNull).
- **Exception:** If this is intended, add `{"rule":"errorprone/ThrowNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ThrowNull)

<a id="errorprone-throwspecificexceptions"></a>

### `errorprone/ThrowSpecificExceptions`

Base exception classes should be treated as abstract. If the exception is intended to be caught, throw a domain-specific exception. Otherwise, prefer a more specific exception for clarity. Common alternatives include: AssertionError, IllegalArgumentException, IllegalStateException, and (Guava's) VerifyException.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ThrowSpecificExceptions).
- **Exception:** If this is intended, add `{"rule":"errorprone/ThrowSpecificExceptions","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ThrowSpecificExceptions)

<a id="errorprone-timeinstaticinitializer"></a>

### `errorprone/TimeInStaticInitializer`

Accessing the current time in a static initialiser captures the time at class loading, which is rarely desirable.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TimeInStaticInitializer).
- **Exception:** If this is intended, add `{"rule":"errorprone/TimeInStaticInitializer","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TimeInStaticInitializer)

<a id="errorprone-timeunitconversionchecker"></a>

### `errorprone/TimeUnitConversionChecker`

This TimeUnit conversion looks buggy: converting from a smaller unit to a larger unit (and passing a constant), converting to/from the same TimeUnit, or converting TimeUnits where the result is statically known to be 0 or 1 are all buggy patterns.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TimeUnitConversionChecker).
- **Exception:** If this is intended, add `{"rule":"errorprone/TimeUnitConversionChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TimeUnitConversionChecker)

<a id="errorprone-timeunitmismatch"></a>

### `errorprone/TimeUnitMismatch`

An value that appears to be represented in one unit is used where another appears to be required (e.g., seconds where nanos are needed).

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TimeUnitMismatch).
- **Exception:** If this is intended, add `{"rule":"errorprone/TimeUnitMismatch","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TimeUnitMismatch)

<a id="errorprone-tostringreturnsnull"></a>

### `errorprone/ToStringReturnsNull`

An implementation of Object.toString() should never return null.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ToStringReturnsNull).
- **Exception:** If this is intended, add `{"rule":"errorprone/ToStringReturnsNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ToStringReturnsNull)

<a id="errorprone-traditionalswitchexpression"></a>

### `errorprone/TraditionalSwitchExpression`

Prefer -> switches for switch expressions.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TraditionalSwitchExpression).
- **Exception:** If this is intended, add `{"rule":"errorprone/TraditionalSwitchExpression","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TraditionalSwitchExpression)

<a id="errorprone-transientmisuse"></a>

### `errorprone/TransientMisuse`

Static fields are implicitly transient, so the explicit modifier is unnecessary.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TransientMisuse).
- **Exception:** If this is intended, add `{"rule":"errorprone/TransientMisuse","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TransientMisuse)

<a id="errorprone-treetostring"></a>

### `errorprone/TreeToString`

Tree#toString shouldn't be used for Trees deriving from the code being compiled, as it discards whitespace and comments.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TreeToString).
- **Exception:** If this is intended, add `{"rule":"errorprone/TreeToString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TreeToString)

<a id="errorprone-truthassertexpected"></a>

### `errorprone/TruthAssertExpected`

The actual and expected values appear to be swapped, which results in poor assertion failure messages. The actual value should come first.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TruthAssertExpected).
- **Exception:** If this is intended, add `{"rule":"errorprone/TruthAssertExpected","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TruthAssertExpected)

<a id="errorprone-truthconstantasserts"></a>

### `errorprone/TruthConstantAsserts`

Truth Library assert is called on a constant.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TruthConstantAsserts).
- **Exception:** If this is intended, add `{"rule":"errorprone/TruthConstantAsserts","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TruthConstantAsserts)

<a id="errorprone-truthcontainsexactlyelementsinusage"></a>

### `errorprone/TruthContainsExactlyElementsInUsage`

ContainsExactly is preferred over containsExactlyElementsIn when creating new iterables.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TruthContainsExactlyElementsInUsage).
- **Exception:** If this is intended, add `{"rule":"errorprone/TruthContainsExactlyElementsInUsage","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TruthContainsExactlyElementsInUsage)

<a id="errorprone-truthgetordefault"></a>

### `errorprone/TruthGetOrDefault`

Asserting on getOrDefault is unclear; prefer containsEntry or doesNotContainKey.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TruthGetOrDefault).
- **Exception:** If this is intended, add `{"rule":"errorprone/TruthGetOrDefault","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TruthGetOrDefault)

<a id="errorprone-truthincompatibletype"></a>

### `errorprone/TruthIncompatibleType`

Argument is not compatible with the subject's type.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TruthIncompatibleType).
- **Exception:** If this is intended, add `{"rule":"errorprone/TruthIncompatibleType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TruthIncompatibleType)

<a id="errorprone-tryfailrefactoring"></a>

### `errorprone/TryFailRefactoring`

Prefer assertThrows to try/fail.

- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TryFailRefactoring).
- **Exception:** If this is intended, add `{"rule":"errorprone/TryFailRefactoring","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TryFailRefactoring)

<a id="errorprone-tryfailthrowable"></a>

### `errorprone/TryFailThrowable`

Catching Throwable/Error masks failures from fail() or assert\*() in the try block.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TryFailThrowable).
- **Exception:** If this is intended, add `{"rule":"errorprone/TryFailThrowable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TryFailThrowable)

<a id="errorprone-trywithresourcesvariable"></a>

### `errorprone/TryWithResourcesVariable`

This variable is unnecessary, the try-with-resources resource can be a reference to a final or effectively final variable.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TryWithResourcesVariable).
- **Exception:** If this is intended, add `{"rule":"errorprone/TryWithResourcesVariable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TryWithResourcesVariable)

<a id="errorprone-typeequals"></a>

### `errorprone/TypeEquals`

TypeMirror should be compared using Types#isSameType, not equality operators or equals().

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TypeEquals).
- **Exception:** If this is intended, add `{"rule":"errorprone/TypeEquals","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TypeEquals)

<a id="errorprone-typenameshadowing"></a>

### `errorprone/TypeNameShadowing`

Type parameter declaration shadows another named type.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TypeNameShadowing).
- **Exception:** If this is intended, add `{"rule":"errorprone/TypeNameShadowing","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TypeNameShadowing)

<a id="errorprone-typeparameternaming"></a>

### `errorprone/TypeParameterNaming`

Type parameters must be a single letter with an optional numeric suffix, or an UpperCamelCase name followed by the letter 'T'.

- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s5.2.8-type-variable-names).
- **Exception:** If this is intended, add `{"rule":"errorprone/TypeParameterNaming","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s5.2.8-type-variable-names)

<a id="errorprone-typeparameterqualifier"></a>

### `errorprone/TypeParameterQualifier`

Type parameter used as type qualifier.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TypeParameterQualifier).
- **Exception:** If this is intended, add `{"rule":"errorprone/TypeParameterQualifier","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TypeParameterQualifier)

<a id="errorprone-typeparametershadowing"></a>

### `errorprone/TypeParameterShadowing`

Type parameter declaration overrides another type parameter already declared.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TypeParameterShadowing).
- **Exception:** If this is intended, add `{"rule":"errorprone/TypeParameterShadowing","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TypeParameterShadowing)

<a id="errorprone-typeparameterunusedinformals"></a>

### `errorprone/TypeParameterUnusedInFormals`

Declaring a type parameter that is only used in the return type is a misuse of generics: operations on the type parameter are unchecked, it hides unsafe casts at invocations of the method, and it interacts badly with method overload resolution.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TypeParameterUnusedInFormals).
- **Exception:** If this is intended, add `{"rule":"errorprone/TypeParameterUnusedInFormals","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TypeParameterUnusedInFormals)

<a id="errorprone-typetostring"></a>

### `errorprone/TypeToString`

TypeMirror#toString shouldn't be used for comparison as it is expensive and fragile.

- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TypeToString).
- **Exception:** If this is intended, add `{"rule":"errorprone/TypeToString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TypeToString)

<a id="errorprone-undefinedequals"></a>

### `errorprone/UndefinedEquals`

This type is not guaranteed to implement a useful equals() method.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UndefinedEquals).
- **Exception:** If this is intended, add `{"rule":"errorprone/UndefinedEquals","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UndefinedEquals)

<a id="errorprone-unescapedentity"></a>

### `errorprone/UnescapedEntity`

Javadoc is interpreted as HTML, so HTML entities such as &, \<, > must be escaped. If this finding seems wrong (e.g. is within a @code or @literal tag), check whether the tag could be malformed and not recognised by the compiler.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnescapedEntity).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnescapedEntity","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnescapedEntity)

<a id="errorprone-ungroupedoverloads"></a>

### `errorprone/UngroupedOverloads`

Constructors and methods with the same name should appear sequentially with no other code in between, even when modifiers such as static or private differ between the methods. Please re-order or re-name methods.

- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UngroupedOverloads).
- **Exception:** If this is intended, add `{"rule":"errorprone/UngroupedOverloads","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UngroupedOverloads)

<a id="errorprone-unicodedirectionalitycharacters"></a>

### `errorprone/UnicodeDirectionalityCharacters`

Unicode directionality modifiers can be used to conceal code in many editors.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnicodeDirectionalityCharacters).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnicodeDirectionalityCharacters","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnicodeDirectionalityCharacters)

<a id="errorprone-unicodeescape"></a>

### `errorprone/UnicodeEscape`

Using unicode escape sequences for printable ASCII characters is obfuscated, and potentially dangerous.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnicodeEscape).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnicodeEscape","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnicodeEscape)

<a id="errorprone-unicodeincode"></a>

### `errorprone/UnicodeInCode`

Avoid using non-ASCII Unicode characters outside of comments and literals, as they can be confusing.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnicodeInCode).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnicodeInCode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnicodeInCode)

<a id="errorprone-unnecessarilyfullyqualified"></a>

### `errorprone/UnnecessarilyFullyQualified`

This fully qualified name is unambiguous to the compiler if imported.

- **Scope:** Off in a project that uses Lombok.
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessarilyFullyQualified).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessarilyFullyQualified","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessarilyFullyQualified)

<a id="errorprone-unnecessarilyusedvalue"></a>

### `errorprone/UnnecessarilyUsedValue`

The result of this API is ignorable, so it does not need to be captured / assigned into an `unused` variable.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessarilyUsedValue).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessarilyUsedValue","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessarilyUsedValue)

<a id="errorprone-unnecessarilyvisible"></a>

### `errorprone/UnnecessarilyVisible`

Some methods (such as those annotated with @Inject or @Provides) are only intended to be called by a framework, and so should have default visibility.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessarilyVisible).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessarilyVisible","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessarilyVisible)

<a id="errorprone-unnecessaryanonymousclass"></a>

### `errorprone/UnnecessaryAnonymousClass`

Implementing a functional interface is unnecessary; prefer to implement the functional interface method directly and use a method reference instead.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryAnonymousClass).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryAnonymousClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryAnonymousClass)

<a id="errorprone-unnecessaryassignment"></a>

### `errorprone/UnnecessaryAssignment`

Fields annotated with @Inject/@Mock/@TestParameter should not be manually assigned to, as they should be initialized by a framework. Remove the assignment if a framework is being used, or the annotation if one isn't.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryAssignment).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryAssignment","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryAssignment)

<a id="errorprone-unnecessaryasync"></a>

### `errorprone/UnnecessaryAsync`

Variables which are initialized and do not escape the current scope do not need to worry about concurrency. Using the non-concurrent type will reduce overhead and verbosity.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryAsync).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryAsync","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryAsync)

<a id="errorprone-unnecessaryboxedassignment"></a>

### `errorprone/UnnecessaryBoxedAssignment`

This expression can be implicitly boxed.

- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryBoxedAssignment).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryBoxedAssignment","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryBoxedAssignment)

<a id="errorprone-unnecessaryboxedvariable"></a>

### `errorprone/UnnecessaryBoxedVariable`

It is unnecessary for this variable to be boxed. Use the primitive instead.

- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryBoxedVariable).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryBoxedVariable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryBoxedVariable)

<a id="errorprone-unnecessarybreakinswitch"></a>

### `errorprone/UnnecessaryBreakInSwitch`

This break is unnecessary, fallthrough does not occur in -> switches.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryBreakInSwitch).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryBreakInSwitch","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryBreakInSwitch)

<a id="errorprone-unnecessarychecknotnull"></a>

### `errorprone/UnnecessaryCheckNotNull`

This null check is unnecessary; the expression can never be null.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryCheckNotNull).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryCheckNotNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryCheckNotNull)

<a id="errorprone-unnecessarycopy"></a>

### `errorprone/UnnecessaryCopy`

This collection is already immutable (just not ImmutableList/ImmutableMap); copying it is unnecessary.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryCopy).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryCopy","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryCopy)

<a id="errorprone-unnecessarylongtointconversion"></a>

### `errorprone/UnnecessaryLongToIntConversion`

Converting a long or Long to an int to pass as a long parameter is usually not necessary. If this conversion is intentional, consider `Longs.constrainToRange()` instead.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryLongToIntConversion).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryLongToIntConversion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryLongToIntConversion)

<a id="errorprone-unnecessarymethodinvocationmatcher"></a>

### `errorprone/UnnecessaryMethodInvocationMatcher`

It is not necessary to wrap a MethodMatcher with methodInvocation().

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryMethodInvocationMatcher).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryMethodInvocationMatcher","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryMethodInvocationMatcher)

<a id="errorprone-unnecessarymethodreference"></a>

### `errorprone/UnnecessaryMethodReference`

This method reference is unnecessary, and can be replaced with the variable itself.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryMethodReference).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryMethodReference","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryMethodReference)

<a id="errorprone-unnecessaryoptionalget"></a>

### `errorprone/UnnecessaryOptionalGet`

This code can be simplified by directly using the lambda parameters instead of calling get..() on optional.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryOptionalGet).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryOptionalGet","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryOptionalGet)

<a id="errorprone-unnecessaryparentheses"></a>

### `errorprone/UnnecessaryParentheses`

These parentheses are unnecessary; it is unlikely the code will be misinterpreted without them.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryParentheses).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryParentheses","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryParentheses)

<a id="errorprone-unnecessaryqualifier"></a>

### `errorprone/UnnecessaryQualifier`

A qualifier annotation has no effect here.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryQualifier).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryQualifier","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryQualifier)

<a id="errorprone-unnecessarysemicolon"></a>

### `errorprone/UnnecessarySemicolon`

Unnecessary semicolons should be omitted. For empty block statements, prefer {}.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessarySemicolon).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessarySemicolon","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessarySemicolon)

<a id="errorprone-unnecessarysetdefault"></a>

### `errorprone/UnnecessarySetDefault`

Unnecessary call to NullPointerTester#setDefault.

- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessarySetDefault).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessarySetDefault","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessarySetDefault)

<a id="errorprone-unnecessarystaticimport"></a>

### `errorprone/UnnecessaryStaticImport`

Using static imports for types is unnecessary.

- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryStaticImport).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryStaticImport","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryStaticImport)

<a id="errorprone-unnecessarystringbuilder"></a>

### `errorprone/UnnecessaryStringBuilder`

Prefer string concatenation over explicitly using `StringBuilder#append`, since `+` reads better and has equivalent or better performance.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryStringBuilder).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryStringBuilder","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryStringBuilder)

<a id="errorprone-unnecessarytestmethodprefix"></a>

### `errorprone/UnnecessaryTestMethodPrefix`

A `test` prefix for a JUnit4 test is redundant, and a holdover from JUnit3. The `@Test` annotation makes it clear it's a test.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryTestMethodPrefix).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryTestMethodPrefix","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryTestMethodPrefix)

<a id="errorprone-unnecessarytypeargument"></a>

### `errorprone/UnnecessaryTypeArgument`

Non-generic methods should not be invoked with type arguments.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryTypeArgument).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryTypeArgument","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryTypeArgument)

<a id="errorprone-unrecognisedjavadoctag"></a>

### `errorprone/UnrecognisedJavadocTag`

This Javadoc tag wasn't recognised by the parser. Is it malformed somehow, perhaps with mismatched braces?

- **Scope:** Off in a project that uses Lombok.
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnrecognisedJavadocTag).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnrecognisedJavadocTag","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnrecognisedJavadocTag)

<a id="errorprone-unsafefinalization"></a>

### `errorprone/UnsafeFinalization`

Finalizer may run before native code finishes execution.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnsafeFinalization).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnsafeFinalization","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnsafeFinalization)

<a id="errorprone-unsafelocaleusage"></a>

### `errorprone/UnsafeLocaleUsage`

Possible unsafe operation related to the java.util.Locale class.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnsafeLocaleUsage).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnsafeLocaleUsage","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnsafeLocaleUsage)

<a id="errorprone-unsafereflectiveconstructioncast"></a>

### `errorprone/UnsafeReflectiveConstructionCast`

Prefer `asSubclass` instead of casting the result of `newInstance`, to detect classes of incorrect type before invoking their constructors. This way, if the class is of the incorrect type, it will throw an exception before invoking its constructor.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnsafeReflectiveConstructionCast).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnsafeReflectiveConstructionCast","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnsafeReflectiveConstructionCast)

<a id="errorprone-unsafewildcard"></a>

### `errorprone/UnsafeWildcard`

Certain wildcard types can confuse the compiler.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnsafeWildcard).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnsafeWildcard","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnsafeWildcard)

<a id="errorprone-unsynchronizedoverridessynchronized"></a>

### `errorprone/UnsynchronizedOverridesSynchronized`

Unsynchronized method overrides a synchronized method.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnsynchronizedOverridesSynchronized).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnsynchronizedOverridesSynchronized","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnsynchronizedOverridesSynchronized)

<a id="errorprone-unusedanonymousclass"></a>

### `errorprone/UnusedAnonymousClass`

Instance created but never used.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnusedAnonymousClass).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnusedAnonymousClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnusedAnonymousClass)

<a id="errorprone-unusedcollectionmodifiedinplace"></a>

### `errorprone/UnusedCollectionModifiedInPlace`

Collection is modified in place, but the result is not used.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnusedCollectionModifiedInPlace).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnusedCollectionModifiedInPlace","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnusedCollectionModifiedInPlace)

<a id="errorprone-unusedexception"></a>

### `errorprone/UnusedException`

This catch block catches an exception and re-throws another, but swallows the caught exception rather than setting it as a cause. This can make debugging harder.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnusedException).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnusedException","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnusedException)

<a id="errorprone-unusedlabel"></a>

### `errorprone/UnusedLabel`

This label is unused.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnusedLabel).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnusedLabel","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnusedLabel)

<a id="errorprone-unusedmethod"></a>

### `errorprone/UnusedMethod`

Unused.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnusedMethod).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnusedMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnusedMethod)

<a id="errorprone-unusednestedclass"></a>

### `errorprone/UnusedNestedClass`

This nested class is unused, and can be removed.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnusedNestedClass).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnusedNestedClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnusedNestedClass)

<a id="errorprone-unusedtypeparameter"></a>

### `errorprone/UnusedTypeParameter`

This type parameter is unused and can be removed.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnusedTypeParameter).
- **Exception:** If this is intended, add `{"rule":"errorprone/UnusedTypeParameter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnusedTypeParameter)

<a id="errorprone-urlequalshashcode"></a>

### `errorprone/URLEqualsHashCode`

Avoid hash-based containers of java.net.URL--the containers rely on equals() and hashCode(), which cause java.net.URL to make blocking internet connections.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/URLEqualsHashCode).
- **Exception:** If this is intended, add `{"rule":"errorprone/URLEqualsHashCode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/URLEqualsHashCode)

<a id="errorprone-urlinsee"></a>

### `errorprone/UrlInSee`

URLs should not be used in @see tags; they are designed for Java elements which could be used with @link.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UrlInSee).
- **Exception:** If this is intended, add `{"rule":"errorprone/UrlInSee","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UrlInSee)

<a id="errorprone-usebinds"></a>

### `errorprone/UseBinds`

@Binds is a more efficient and declarative mechanism for delegating a binding.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UseBinds).
- **Exception:** If this is intended, add `{"rule":"errorprone/UseBinds","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UseBinds)

<a id="errorprone-usecorrectassertintests"></a>

### `errorprone/UseCorrectAssertInTests`

Java assert is used in testing code. For testing purposes, prefer using Truth-based assertions.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UseCorrectAssertInTests).
- **Exception:** If this is intended, add `{"rule":"errorprone/UseCorrectAssertInTests","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UseCorrectAssertInTests)

<a id="errorprone-variablenamesameastype"></a>

### `errorprone/VariableNameSameAsType`

VariableName and type with the same name would refer to the static field instead of the class.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/VariableNameSameAsType).
- **Exception:** If this is intended, add `{"rule":"errorprone/VariableNameSameAsType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/VariableNameSameAsType)

<a id="errorprone-vartypename"></a>

### `errorprone/VarTypeName`

`var` should not be used as a type name.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/VarTypeName).
- **Exception:** If this is intended, add `{"rule":"errorprone/VarTypeName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/VarTypeName)

<a id="errorprone-voidused"></a>

### `errorprone/VoidUsed`

Using a Void-typed variable is potentially confusing, and can be replaced with a literal `null`.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/VoidUsed).
- **Exception:** If this is intended, add `{"rule":"errorprone/VoidUsed","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/VoidUsed)

<a id="errorprone-waitnotinloop"></a>

### `errorprone/WaitNotInLoop`

Because of spurious wakeups, Object.wait() and Condition.await() must always be called in a loop.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/WaitNotInLoop).
- **Exception:** If this is intended, add `{"rule":"errorprone/WaitNotInLoop","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/WaitNotInLoop)

<a id="errorprone-wakelockreleaseddangerously"></a>

### `errorprone/WakelockReleasedDangerously`

On Android versions \< P, a wakelock acquired with a timeout may be released by the system before calling `release`, even after checking `isHeld()`. If so, it will throw a RuntimeException. Please wrap in a try/catch block.

- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/WakelockReleasedDangerously).
- **Exception:** If this is intended, add `{"rule":"errorprone/WakelockReleasedDangerously","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/WakelockReleasedDangerously)

<a id="errorprone-wildcardimport"></a>

### `errorprone/WildcardImport`

Wildcard imports, static or otherwise, should not be used.

- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html?cl=head#s3.3.1-wildcard-imports).
- **Exception:** If this is intended, add `{"rule":"errorprone/WildcardImport","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html?cl=head#s3.3.1-wildcard-imports)

<a id="errorprone-wrongoneof"></a>

### `errorprone/WrongOneof`

This field is guaranteed not to be set given it's within a switch over a one_of.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/WrongOneof).
- **Exception:** If this is intended, add `{"rule":"errorprone/WrongOneof","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/WrongOneof)

<a id="errorprone-xorpower"></a>

### `errorprone/XorPower`

The `^` operator is binary XOR, not a power operator.

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/XorPower).
- **Exception:** If this is intended, add `{"rule":"errorprone/XorPower","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/XorPower)

<a id="errorprone-zoneidofz"></a>

### `errorprone/ZoneIdOfZ`

Use ZoneOffset.UTC instead of ZoneId.of("Z").

- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ZoneIdOfZ).
- **Exception:** If this is intended, add `{"rule":"errorprone/ZoneIdOfZ","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ZoneIdOfZ)
