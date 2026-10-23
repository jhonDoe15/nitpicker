# Java and Kotlin: Error Prone and NullAway checks

The Error Prone checks and NullAway that the Java and Kotlin presets compile Java sources with, with Gradle and Maven. This page lists 596 rules. [All pages](README.md).

The guide for these rules: [docs/java-preset.md#error-prone-and-nullaway](../java-preset.md#error-prone-and-nullaway).

Unless an entry says otherwise:

- **Presets:** Java and Kotlin
- **Analyzers:** `java` (Java); `kotlin` (Kotlin)
- **Builds:** Gradle and Maven
- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide.

<a id="errorprone-addressselection"></a>

### `errorprone/AddressSelection`

Address selection.

- **Exception:** If this is intended, add `{"rule":"errorprone/AddressSelection","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AddressSelection)

<a id="errorprone-almostjavadoc"></a>

### `errorprone/AlmostJavadoc`

Almost javadoc.

- **Exception:** If this is intended, add `{"rule":"errorprone/AlmostJavadoc","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AlmostJavadoc)

<a id="errorprone-alreadychecked"></a>

### `errorprone/AlreadyChecked`

Already checked.

- **Exception:** If this is intended, add `{"rule":"errorprone/AlreadyChecked","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AlreadyChecked)

<a id="errorprone-alwaysthrows"></a>

### `errorprone/AlwaysThrows`

Always throws.

- **Exception:** If this is intended, add `{"rule":"errorprone/AlwaysThrows","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AlwaysThrows)

<a id="errorprone-ambiguousmethodreference"></a>

### `errorprone/AmbiguousMethodReference`

Ambiguous method reference.

- **Exception:** If this is intended, add `{"rule":"errorprone/AmbiguousMethodReference","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AmbiguousMethodReference)

<a id="errorprone-androidinjectionbeforesuper"></a>

### `errorprone/AndroidInjectionBeforeSuper`

Android injection before super.

- **Exception:** If this is intended, add `{"rule":"errorprone/AndroidInjectionBeforeSuper","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AndroidInjectionBeforeSuper)

<a id="errorprone-annotationposition"></a>

### `errorprone/AnnotationPosition`

Annotation position.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/AnnotationPosition","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AnnotationPosition)

<a id="errorprone-argumentselectiondefectchecker"></a>

### `errorprone/ArgumentSelectionDefectChecker`

Argument selection defect checker.

- **Exception:** If this is intended, add `{"rule":"errorprone/ArgumentSelectionDefectChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ArgumentSelectionDefectChecker)

<a id="errorprone-arrayaskeyofsetormap"></a>

### `errorprone/ArrayAsKeyOfSetOrMap`

Array as key of set or map.

- **Exception:** If this is intended, add `{"rule":"errorprone/ArrayAsKeyOfSetOrMap","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ArrayAsKeyOfSetOrMap)

<a id="errorprone-arrayequals"></a>

### `errorprone/ArrayEquals`

Array equals.

- **Exception:** If this is intended, add `{"rule":"errorprone/ArrayEquals","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ArrayEquals)

<a id="errorprone-arrayfillincompatibletype"></a>

### `errorprone/ArrayFillIncompatibleType`

Array fill incompatible type.

- **Exception:** If this is intended, add `{"rule":"errorprone/ArrayFillIncompatibleType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ArrayFillIncompatibleType)

<a id="errorprone-arrayhashcode"></a>

### `errorprone/ArrayHashCode`

Array hash code.

- **Exception:** If this is intended, add `{"rule":"errorprone/ArrayHashCode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ArrayHashCode)

<a id="errorprone-arrayrecordcomponent"></a>

### `errorprone/ArrayRecordComponent`

Array record component.

- **Exception:** If this is intended, add `{"rule":"errorprone/ArrayRecordComponent","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ArrayRecordComponent)

<a id="errorprone-arraysaslistprimitivearray"></a>

### `errorprone/ArraysAsListPrimitiveArray`

Arrays as list primitive array.

- **Exception:** If this is intended, add `{"rule":"errorprone/ArraysAsListPrimitiveArray","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ArraysAsListPrimitiveArray)

<a id="errorprone-arraytostring"></a>

### `errorprone/ArrayToString`

Array to string.

- **Exception:** If this is intended, add `{"rule":"errorprone/ArrayToString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ArrayToString)

<a id="errorprone-assertequalsargumentorderchecker"></a>

### `errorprone/AssertEqualsArgumentOrderChecker`

Assert equals argument order checker.

- **Exception:** If this is intended, add `{"rule":"errorprone/AssertEqualsArgumentOrderChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AssertEqualsArgumentOrderChecker)

<a id="errorprone-assertfalse"></a>

### `errorprone/AssertFalse`

Assert false.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/AssertFalse","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AssertFalse)

<a id="errorprone-assertionfailureignored"></a>

### `errorprone/AssertionFailureIgnored`

Assertion failure ignored.

- **Exception:** If this is intended, add `{"rule":"errorprone/AssertionFailureIgnored","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AssertionFailureIgnored)

<a id="errorprone-assertsameincompatible"></a>

### `errorprone/AssertSameIncompatible`

Assert same incompatible.

- **Exception:** If this is intended, add `{"rule":"errorprone/AssertSameIncompatible","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AssertSameIncompatible)

<a id="errorprone-assertthrowsblocktoexpression"></a>

### `errorprone/AssertThrowsBlockToExpression`

Assert throws block to expression.

- **Exception:** If this is intended, add `{"rule":"errorprone/AssertThrowsBlockToExpression","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AssertThrowsBlockToExpression)

<a id="errorprone-assertthrowsminimizer"></a>

### `errorprone/AssertThrowsMinimizer`

Assert throws minimizer.

- **Exception:** If this is intended, add `{"rule":"errorprone/AssertThrowsMinimizer","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AssertThrowsMinimizer)

<a id="errorprone-assertthrowsmultiplestatements"></a>

### `errorprone/AssertThrowsMultipleStatements`

Assert throws multiple statements.

- **Exception:** If this is intended, add `{"rule":"errorprone/AssertThrowsMultipleStatements","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AssertThrowsMultipleStatements)

<a id="errorprone-assignmentexpression"></a>

### `errorprone/AssignmentExpression`

Assignment expression.

- **Exception:** If this is intended, add `{"rule":"errorprone/AssignmentExpression","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AssignmentExpression)

<a id="errorprone-assistedinjectandinjectonconstructors"></a>

### `errorprone/AssistedInjectAndInjectOnConstructors`

Assisted inject and inject on constructors.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/AssistedInjectAndInjectOnConstructors","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AssistedInjectAndInjectOnConstructors)

<a id="errorprone-assistedinjectandinjectonsameconstructor"></a>

### `errorprone/AssistedInjectAndInjectOnSameConstructor`

Assisted inject and inject on same constructor.

- **Exception:** If this is intended, add `{"rule":"errorprone/AssistedInjectAndInjectOnSameConstructor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AssistedInjectAndInjectOnSameConstructor)

<a id="errorprone-asthelperssuggestions"></a>

### `errorprone/ASTHelpersSuggestions`

Ast helpers suggestions.

- **Exception:** If this is intended, add `{"rule":"errorprone/ASTHelpersSuggestions","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ASTHelpersSuggestions)

<a id="errorprone-asynccallablereturnsnull"></a>

### `errorprone/AsyncCallableReturnsNull`

Async callable returns null.

- **Exception:** If this is intended, add `{"rule":"errorprone/AsyncCallableReturnsNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AsyncCallableReturnsNull)

<a id="errorprone-asyncfunctionreturnsnull"></a>

### `errorprone/AsyncFunctionReturnsNull`

Async function returns null.

- **Exception:** If this is intended, add `{"rule":"errorprone/AsyncFunctionReturnsNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AsyncFunctionReturnsNull)

<a id="errorprone-attemptednegativezero"></a>

### `errorprone/AttemptedNegativeZero`

Attempted negative zero.

- **Exception:** If this is intended, add `{"rule":"errorprone/AttemptedNegativeZero","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AttemptedNegativeZero)

<a id="errorprone-autofactoryatinject"></a>

### `errorprone/AutoFactoryAtInject`

Auto factory at inject.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/AutoFactoryAtInject","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AutoFactoryAtInject)

<a id="errorprone-autovalueboxedvalues"></a>

### `errorprone/AutoValueBoxedValues`

Auto value boxed values.

- **Exception:** If this is intended, add `{"rule":"errorprone/AutoValueBoxedValues","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AutoValueBoxedValues)

<a id="errorprone-autovaluebuilderdefaultsinconstructor"></a>

### `errorprone/AutoValueBuilderDefaultsInConstructor`

Auto value builder defaults in constructor.

- **Exception:** If this is intended, add `{"rule":"errorprone/AutoValueBuilderDefaultsInConstructor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AutoValueBuilderDefaultsInConstructor)

<a id="errorprone-autovalueconstructororderchecker"></a>

### `errorprone/AutoValueConstructorOrderChecker`

Auto value constructor order checker.

- **Exception:** If this is intended, add `{"rule":"errorprone/AutoValueConstructorOrderChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AutoValueConstructorOrderChecker)

<a id="errorprone-autovaluefinalmethods"></a>

### `errorprone/AutoValueFinalMethods`

Auto value final methods.

- **Exception:** If this is intended, add `{"rule":"errorprone/AutoValueFinalMethods","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AutoValueFinalMethods)

<a id="errorprone-autovalueimmutablefields"></a>

### `errorprone/AutoValueImmutableFields`

Auto value immutable fields.

- **Exception:** If this is intended, add `{"rule":"errorprone/AutoValueImmutableFields","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AutoValueImmutableFields)

<a id="errorprone-autovaluesubclassleaked"></a>

### `errorprone/AutoValueSubclassLeaked`

Auto value subclass leaked.

- **Exception:** If this is intended, add `{"rule":"errorprone/AutoValueSubclassLeaked","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AutoValueSubclassLeaked)

<a id="errorprone-avoidcommontypenames"></a>

### `errorprone/AvoidCommonTypeNames`

Avoid common type names.

- **Exception:** If this is intended, add `{"rule":"errorprone/AvoidCommonTypeNames","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AvoidCommonTypeNames)

<a id="errorprone-avoidvaluesetter"></a>

### `errorprone/AvoidValueSetter`

Avoid value setter.

- **Exception:** If this is intended, add `{"rule":"errorprone/AvoidValueSetter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/AvoidValueSetter)

<a id="errorprone-badannotationimplementation"></a>

### `errorprone/BadAnnotationImplementation`

Bad annotation implementation.

- **Exception:** If this is intended, add `{"rule":"errorprone/BadAnnotationImplementation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BadAnnotationImplementation)

<a id="errorprone-badcomparable"></a>

### `errorprone/BadComparable`

Bad comparable.

- **Exception:** If this is intended, add `{"rule":"errorprone/BadComparable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BadComparable)

<a id="errorprone-badimport"></a>

### `errorprone/BadImport`

Bad import.

- **Exception:** If this is intended, add `{"rule":"errorprone/BadImport","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BadImport)

<a id="errorprone-badinstanceof"></a>

### `errorprone/BadInstanceof`

Bad instanceof.

- **Exception:** If this is intended, add `{"rule":"errorprone/BadInstanceof","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BadInstanceof)

<a id="errorprone-badshiftamount"></a>

### `errorprone/BadShiftAmount`

Bad shift amount.

- **Exception:** If this is intended, add `{"rule":"errorprone/BadShiftAmount","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BadShiftAmount)

<a id="errorprone-banclassloader"></a>

### `errorprone/BanClassLoader`

Ban class loader.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/BanClassLoader","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BanClassLoader)

<a id="errorprone-banjndi"></a>

### `errorprone/BanJNDI`

Ban jndi.

- **Exception:** If this is intended, add `{"rule":"errorprone/BanJNDI","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BanJNDI)

<a id="errorprone-banserializableread"></a>

### `errorprone/BanSerializableRead`

Ban serializable read.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/BanSerializableRead","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BanSerializableRead)

<a id="errorprone-baredotmetacharacter"></a>

### `errorprone/BareDotMetacharacter`

Bare dot metacharacter.

- **Exception:** If this is intended, add `{"rule":"errorprone/BareDotMetacharacter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BareDotMetacharacter)

<a id="errorprone-bigdecimalequals"></a>

### `errorprone/BigDecimalEquals`

Big decimal equals.

- **Exception:** If this is intended, add `{"rule":"errorprone/BigDecimalEquals","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BigDecimalEquals)

<a id="errorprone-bigdecimalliteraldouble"></a>

### `errorprone/BigDecimalLiteralDouble`

Big decimal literal double.

- **Exception:** If this is intended, add `{"rule":"errorprone/BigDecimalLiteralDouble","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BigDecimalLiteralDouble)

<a id="errorprone-binderidentityrestoreddangerously"></a>

### `errorprone/BinderIdentityRestoredDangerously`

Binder identity restored dangerously.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/BinderIdentityRestoredDangerously","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BinderIdentityRestoredDangerously)

<a id="errorprone-bindingtounqualifiedcommontype"></a>

### `errorprone/BindingToUnqualifiedCommonType`

Binding to unqualified common type.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/BindingToUnqualifiedCommonType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BindingToUnqualifiedCommonType)

<a id="errorprone-booleanliteral"></a>

### `errorprone/BooleanLiteral`

Boolean literal.

- **Exception:** If this is intended, add `{"rule":"errorprone/BooleanLiteral","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BooleanLiteral)

<a id="errorprone-boxedprimitiveconstructor"></a>

### `errorprone/BoxedPrimitiveConstructor`

Boxed primitive constructor.

- **Exception:** If this is intended, add `{"rule":"errorprone/BoxedPrimitiveConstructor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BoxedPrimitiveConstructor)

<a id="errorprone-boxedprimitiveequality"></a>

### `errorprone/BoxedPrimitiveEquality`

Boxed primitive equality.

- **Exception:** If this is intended, add `{"rule":"errorprone/BoxedPrimitiveEquality","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BoxedPrimitiveEquality)

<a id="errorprone-boxingcomparator"></a>

### `errorprone/BoxingComparator`

Boxing comparator.

- **Exception:** If this is intended, add `{"rule":"errorprone/BoxingComparator","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BoxingComparator)

<a id="errorprone-bugpatternnaming"></a>

### `errorprone/BugPatternNaming`

Bug pattern naming.

- **Exception:** If this is intended, add `{"rule":"errorprone/BugPatternNaming","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BugPatternNaming)

<a id="errorprone-builderreturnthis"></a>

### `errorprone/BuilderReturnThis`

Builder return this.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/BuilderReturnThis","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BuilderReturnThis)

<a id="errorprone-bundledeserializationcast"></a>

### `errorprone/BundleDeserializationCast`

Bundle deserialization cast.

- **Exception:** If this is intended, add `{"rule":"errorprone/BundleDeserializationCast","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/BundleDeserializationCast)

<a id="errorprone-bytebufferbackingarray"></a>

### `errorprone/ByteBufferBackingArray`

Byte buffer backing array.

- **Exception:** If this is intended, add `{"rule":"errorprone/ByteBufferBackingArray","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ByteBufferBackingArray)

<a id="errorprone-cacheloadernull"></a>

### `errorprone/CacheLoaderNull`

Cache loader null.

- **Exception:** If this is intended, add `{"rule":"errorprone/CacheLoaderNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CacheLoaderNull)

<a id="errorprone-canonicalduration"></a>

### `errorprone/CanonicalDuration`

Canonical duration.

- **Exception:** If this is intended, add `{"rule":"errorprone/CanonicalDuration","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CanonicalDuration)

<a id="errorprone-catchandprintstacktrace"></a>

### `errorprone/CatchAndPrintStackTrace`

Catch and print stack trace.

- **Exception:** If this is intended, add `{"rule":"errorprone/CatchAndPrintStackTrace","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CatchAndPrintStackTrace)

<a id="errorprone-catchfail"></a>

### `errorprone/CatchFail`

Catch fail.

- **Exception:** If this is intended, add `{"rule":"errorprone/CatchFail","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CatchFail)

<a id="errorprone-chainedassertionlosescontext"></a>

### `errorprone/ChainedAssertionLosesContext`

Chained assertion loses context.

- **Exception:** If this is intended, add `{"rule":"errorprone/ChainedAssertionLosesContext","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ChainedAssertionLosesContext)

<a id="errorprone-chainingconstructorignoresparameter"></a>

### `errorprone/ChainingConstructorIgnoresParameter`

Chaining constructor ignores parameter.

- **Exception:** If this is intended, add `{"rule":"errorprone/ChainingConstructorIgnoresParameter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ChainingConstructorIgnoresParameter)

<a id="errorprone-charactergetnumericvalue"></a>

### `errorprone/CharacterGetNumericValue`

Character get numeric value.

- **Exception:** If this is intended, add `{"rule":"errorprone/CharacterGetNumericValue","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CharacterGetNumericValue)

<a id="errorprone-checkedexceptionnotthrown"></a>

### `errorprone/CheckedExceptionNotThrown`

Checked exception not thrown.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/CheckedExceptionNotThrown","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CheckedExceptionNotThrown)

<a id="errorprone-checknotnullmultipletimes"></a>

### `errorprone/CheckNotNullMultipleTimes`

Check not null multiple times.

- **Exception:** If this is intended, add `{"rule":"errorprone/CheckNotNullMultipleTimes","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CheckNotNullMultipleTimes)

<a id="errorprone-checkreturnvalue"></a>

### `errorprone/CheckReturnValue`

Check return value.

- **Exception:** If this is intended, add `{"rule":"errorprone/CheckReturnValue","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CheckReturnValue)

<a id="errorprone-classcanbestatic"></a>

### `errorprone/ClassCanBeStatic`

Class can be static.

- **Exception:** If this is intended, add `{"rule":"errorprone/ClassCanBeStatic","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ClassCanBeStatic)

<a id="errorprone-classinitializationdeadlock"></a>

### `errorprone/ClassInitializationDeadlock`

Class initialization deadlock.

- **Exception:** If this is intended, add `{"rule":"errorprone/ClassInitializationDeadlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ClassInitializationDeadlock)

<a id="errorprone-classname"></a>

### `errorprone/ClassName`

Class name.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/ClassName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ClassName)

<a id="errorprone-classnamedliketypeparameter"></a>

### `errorprone/ClassNamedLikeTypeParameter`

Class named like type parameter.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/ClassNamedLikeTypeParameter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ClassNamedLikeTypeParameter)

<a id="errorprone-classnewinstance"></a>

### `errorprone/ClassNewInstance`

Class new instance.

- **Exception:** If this is intended, add `{"rule":"errorprone/ClassNewInstance","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ClassNewInstance)

<a id="errorprone-closeableprovides"></a>

### `errorprone/CloseableProvides`

Closeable provides.

- **Exception:** If this is intended, add `{"rule":"errorprone/CloseableProvides","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CloseableProvides)

<a id="errorprone-closingstandardoutputstreams"></a>

### `errorprone/ClosingStandardOutputStreams`

Closing standard output streams.

- **Exception:** If this is intended, add `{"rule":"errorprone/ClosingStandardOutputStreams","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ClosingStandardOutputStreams)

<a id="errorprone-collectionincompatibletype"></a>

### `errorprone/CollectionIncompatibleType`

Collection incompatible type.

- **Exception:** If this is intended, add `{"rule":"errorprone/CollectionIncompatibleType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CollectionIncompatibleType)

<a id="errorprone-collectiontoarraysafeparameter"></a>

### `errorprone/CollectionToArraySafeParameter`

Collection to array safe parameter.

- **Exception:** If this is intended, add `{"rule":"errorprone/CollectionToArraySafeParameter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CollectionToArraySafeParameter)

<a id="errorprone-collectionundefinedequality"></a>

### `errorprone/CollectionUndefinedEquality`

Collection undefined equality.

- **Exception:** If this is intended, add `{"rule":"errorprone/CollectionUndefinedEquality","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CollectionUndefinedEquality)

<a id="errorprone-collectorshouldnotusestate"></a>

### `errorprone/CollectorShouldNotUseState`

Collector should not use state.

- **Exception:** If this is intended, add `{"rule":"errorprone/CollectorShouldNotUseState","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CollectorShouldNotUseState)

<a id="errorprone-comparableandcomparator"></a>

### `errorprone/ComparableAndComparator`

Comparable and comparator.

- **Exception:** If this is intended, add `{"rule":"errorprone/ComparableAndComparator","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ComparableAndComparator)

<a id="errorprone-comparabletype"></a>

### `errorprone/ComparableType`

Comparable type.

- **Exception:** If this is intended, add `{"rule":"errorprone/ComparableType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ComparableType)

<a id="errorprone-comparetozero"></a>

### `errorprone/CompareToZero`

Compare to zero.

- **Exception:** If this is intended, add `{"rule":"errorprone/CompareToZero","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CompareToZero)

<a id="errorprone-comparingthiswithnull"></a>

### `errorprone/ComparingThisWithNull`

Comparing this with null.

- **Exception:** If this is intended, add `{"rule":"errorprone/ComparingThisWithNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ComparingThisWithNull)

<a id="errorprone-comparisoncontractviolated"></a>

### `errorprone/ComparisonContractViolated`

Comparison contract violated.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/ComparisonContractViolated","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ComparisonContractViolated)

<a id="errorprone-comparisonoutofrange"></a>

### `errorprone/ComparisonOutOfRange`

Comparison out of range.

- **Exception:** If this is intended, add `{"rule":"errorprone/ComparisonOutOfRange","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ComparisonOutOfRange)

<a id="errorprone-compatiblewithannotationmisuse"></a>

### `errorprone/CompatibleWithAnnotationMisuse`

Compatible with annotation misuse.

- **Exception:** If this is intended, add `{"rule":"errorprone/CompatibleWithAnnotationMisuse","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CompatibleWithAnnotationMisuse)

<a id="errorprone-compiletimeconstant"></a>

### `errorprone/CompileTimeConstant`

Compile time constant.

- **Exception:** If this is intended, add `{"rule":"errorprone/CompileTimeConstant","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/CompileTimeConstant)

<a id="errorprone-complexbooleanconstant"></a>

### `errorprone/ComplexBooleanConstant`

Complex boolean constant.

- **Exception:** If this is intended, add `{"rule":"errorprone/ComplexBooleanConstant","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ComplexBooleanConstant)

<a id="errorprone-computeifabsentambiguousreference"></a>

### `errorprone/ComputeIfAbsentAmbiguousReference`

Compute if absent ambiguous reference.

- **Exception:** If this is intended, add `{"rule":"errorprone/ComputeIfAbsentAmbiguousReference","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ComputeIfAbsentAmbiguousReference)

<a id="errorprone-conditionalexpressionnumericpromotion"></a>

### `errorprone/ConditionalExpressionNumericPromotion`

Conditional expression numeric promotion.

- **Exception:** If this is intended, add `{"rule":"errorprone/ConditionalExpressionNumericPromotion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ConditionalExpressionNumericPromotion)

<a id="errorprone-constantoverflow"></a>

### `errorprone/ConstantOverflow`

Constant overflow.

- **Exception:** If this is intended, add `{"rule":"errorprone/ConstantOverflow","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ConstantOverflow)

<a id="errorprone-constantpatterncompile"></a>

### `errorprone/ConstantPatternCompile`

Constant pattern compile.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/ConstantPatternCompile","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ConstantPatternCompile)

<a id="errorprone-daggerprovidesnull"></a>

### `errorprone/DaggerProvidesNull`

Dagger provides null.

- **Exception:** If this is intended, add `{"rule":"errorprone/DaggerProvidesNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DaggerProvidesNull)

<a id="errorprone-dangerousliteralnull"></a>

### `errorprone/DangerousLiteralNull`

Dangerous literal null.

- **Exception:** If this is intended, add `{"rule":"errorprone/DangerousLiteralNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DangerousLiteralNull)

<a id="errorprone-datechecker"></a>

### `errorprone/DateChecker`

Date checker.

- **Exception:** If this is intended, add `{"rule":"errorprone/DateChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DateChecker)

<a id="errorprone-dateformatconstant"></a>

### `errorprone/DateFormatConstant`

Date format constant.

- **Exception:** If this is intended, add `{"rule":"errorprone/DateFormatConstant","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DateFormatConstant)

<a id="errorprone-deadexception"></a>

### `errorprone/DeadException`

Dead exception.

- **Exception:** If this is intended, add `{"rule":"errorprone/DeadException","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DeadException)

<a id="errorprone-deadthread"></a>

### `errorprone/DeadThread`

Dead thread.

- **Exception:** If this is intended, add `{"rule":"errorprone/DeadThread","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DeadThread)

<a id="errorprone-deduplicateconstants"></a>

### `errorprone/DeduplicateConstants`

Deduplicate constants.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/DeduplicateConstants","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DeduplicateConstants)

<a id="errorprone-deeplynested"></a>

### `errorprone/DeeplyNested`

Deeply nested.

- **Exception:** If this is intended, add `{"rule":"errorprone/DeeplyNested","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DeeplyNested)

<a id="errorprone-defaultcharset"></a>

### `errorprone/DefaultCharset`

Default charset.

- **Exception:** If this is intended, add `{"rule":"errorprone/DefaultCharset","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DefaultCharset)

<a id="errorprone-defaultlocale"></a>

### `errorprone/DefaultLocale`

Default locale.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/DefaultLocale","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DefaultLocale)

<a id="errorprone-defaultpackage"></a>

### `errorprone/DefaultPackage`

Default package.

- **Exception:** If this is intended, add `{"rule":"errorprone/DefaultPackage","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DefaultPackage)

<a id="errorprone-depann"></a>

### `errorprone/DepAnn`

Dep ann.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/DepAnn","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DepAnn)

<a id="errorprone-deprecatedvariable"></a>

### `errorprone/DeprecatedVariable`

Deprecated variable.

- **Exception:** If this is intended, add `{"rule":"errorprone/DeprecatedVariable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DeprecatedVariable)

<a id="errorprone-dereferencewithnullbranch"></a>

### `errorprone/DereferenceWithNullBranch`

Dereference with null branch.

- **Exception:** If this is intended, add `{"rule":"errorprone/DereferenceWithNullBranch","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DereferenceWithNullBranch)

<a id="errorprone-differentnamebutsame"></a>

### `errorprone/DifferentNameButSame`

Different name but same.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/DifferentNameButSame","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DifferentNameButSame)

<a id="errorprone-directinvocationonmock"></a>

### `errorprone/DirectInvocationOnMock`

Direct invocation on mock.

- **Exception:** If this is intended, add `{"rule":"errorprone/DirectInvocationOnMock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DirectInvocationOnMock)

<a id="errorprone-discardedpostfixexpression"></a>

### `errorprone/DiscardedPostfixExpression`

Discarded postfix expression.

- **Exception:** If this is intended, add `{"rule":"errorprone/DiscardedPostfixExpression","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DiscardedPostfixExpression)

<a id="errorprone-distinctvarargschecker"></a>

### `errorprone/DistinctVarargsChecker`

Distinct varargs checker.

- **Exception:** If this is intended, add `{"rule":"errorprone/DistinctVarargsChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DistinctVarargsChecker)

<a id="errorprone-donotcall"></a>

### `errorprone/DoNotCall`

Do not call.

- **Exception:** If this is intended, add `{"rule":"errorprone/DoNotCall","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DoNotCall)

<a id="errorprone-donotclaimannotations"></a>

### `errorprone/DoNotClaimAnnotations`

Do not claim annotations.

- **Exception:** If this is intended, add `{"rule":"errorprone/DoNotClaimAnnotations","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DoNotClaimAnnotations)

<a id="errorprone-donotmock"></a>

### `errorprone/DoNotMock`

Do not mock.

- **Exception:** If this is intended, add `{"rule":"errorprone/DoNotMock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DoNotMock)

<a id="errorprone-donotmockautovalue"></a>

### `errorprone/DoNotMockAutoValue`

Do not mock auto value.

- **Exception:** If this is intended, add `{"rule":"errorprone/DoNotMockAutoValue","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DoNotMockAutoValue)

<a id="errorprone-doublebraceinitialization"></a>

### `errorprone/DoubleBraceInitialization`

Double brace initialization.

- **Exception:** If this is intended, add `{"rule":"errorprone/DoubleBraceInitialization","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DoubleBraceInitialization)

<a id="errorprone-doublecheckedlocking"></a>

### `errorprone/DoubleCheckedLocking`

Double checked locking.

- **Exception:** If this is intended, add `{"rule":"errorprone/DoubleCheckedLocking","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DoubleCheckedLocking)

<a id="errorprone-duplicateassertion"></a>

### `errorprone/DuplicateAssertion`

Duplicate assertion.

- **Exception:** If this is intended, add `{"rule":"errorprone/DuplicateAssertion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DuplicateAssertion)

<a id="errorprone-duplicatebranches"></a>

### `errorprone/DuplicateBranches`

Duplicate branches.

- **Exception:** If this is intended, add `{"rule":"errorprone/DuplicateBranches","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DuplicateBranches)

<a id="errorprone-duplicatedateformatfield"></a>

### `errorprone/DuplicateDateFormatField`

Duplicate date format field.

- **Exception:** If this is intended, add `{"rule":"errorprone/DuplicateDateFormatField","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DuplicateDateFormatField)

<a id="errorprone-duplicatemapkeys"></a>

### `errorprone/DuplicateMapKeys`

Duplicate map keys.

- **Exception:** If this is intended, add `{"rule":"errorprone/DuplicateMapKeys","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DuplicateMapKeys)

<a id="errorprone-durationfrom"></a>

### `errorprone/DurationFrom`

Duration from.

- **Exception:** If this is intended, add `{"rule":"errorprone/DurationFrom","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DurationFrom)

<a id="errorprone-durationgettemporalunit"></a>

### `errorprone/DurationGetTemporalUnit`

Duration get temporal unit.

- **Exception:** If this is intended, add `{"rule":"errorprone/DurationGetTemporalUnit","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DurationGetTemporalUnit)

<a id="errorprone-durationtemporalunit"></a>

### `errorprone/DurationTemporalUnit`

Duration temporal unit.

- **Exception:** If this is intended, add `{"rule":"errorprone/DurationTemporalUnit","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DurationTemporalUnit)

<a id="errorprone-durationtolongtimeunit"></a>

### `errorprone/DurationToLongTimeUnit`

Duration to long time unit.

- **Exception:** If this is intended, add `{"rule":"errorprone/DurationToLongTimeUnit","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/DurationToLongTimeUnit)

<a id="errorprone-effectivelyprivate"></a>

### `errorprone/EffectivelyPrivate`

Effectively private.

- **Exception:** If this is intended, add `{"rule":"errorprone/EffectivelyPrivate","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EffectivelyPrivate)

<a id="errorprone-emptyblocktag"></a>

### `errorprone/EmptyBlockTag`

Empty block tag.

- **Exception:** If this is intended, add `{"rule":"errorprone/EmptyBlockTag","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EmptyBlockTag)

<a id="errorprone-emptycatch"></a>

### `errorprone/EmptyCatch`

Empty catch.

- **Exception:** If this is intended, add `{"rule":"errorprone/EmptyCatch","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EmptyCatch)

<a id="errorprone-emptysetmultibindingcontributions"></a>

### `errorprone/EmptySetMultibindingContributions`

Empty set multibinding contributions.

- **Exception:** If this is intended, add `{"rule":"errorprone/EmptySetMultibindingContributions","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EmptySetMultibindingContributions)

<a id="errorprone-emptytopleveldeclaration"></a>

### `errorprone/EmptyTopLevelDeclaration`

Empty top level declaration.

- **Exception:** If this is intended, add `{"rule":"errorprone/EmptyTopLevelDeclaration","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EmptyTopLevelDeclaration)

<a id="errorprone-enumordinal"></a>

### `errorprone/EnumOrdinal`

Enum ordinal.

- **Exception:** If this is intended, add `{"rule":"errorprone/EnumOrdinal","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EnumOrdinal)

<a id="errorprone-equalsbrokenfornull"></a>

### `errorprone/EqualsBrokenForNull`

Equals broken for null.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/EqualsBrokenForNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsBrokenForNull)

<a id="errorprone-equalshashcode"></a>

### `errorprone/EqualsHashCode`

Equals hash code.

- **Exception:** If this is intended, add `{"rule":"errorprone/EqualsHashCode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsHashCode)

<a id="errorprone-equalsincompatibletype"></a>

### `errorprone/EqualsIncompatibleType`

Equals incompatible type.

- **Exception:** If this is intended, add `{"rule":"errorprone/EqualsIncompatibleType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsIncompatibleType)

<a id="errorprone-equalsnan"></a>

### `errorprone/EqualsNaN`

Equals na n.

- **Exception:** If this is intended, add `{"rule":"errorprone/EqualsNaN","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsNaN)

<a id="errorprone-equalsnull"></a>

### `errorprone/EqualsNull`

Equals null.

- **Exception:** If this is intended, add `{"rule":"errorprone/EqualsNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsNull)

<a id="errorprone-equalsreference"></a>

### `errorprone/EqualsReference`

Equals reference.

- **Exception:** If this is intended, add `{"rule":"errorprone/EqualsReference","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsReference)

<a id="errorprone-equalsunsafecast"></a>

### `errorprone/EqualsUnsafeCast`

Equals unsafe cast.

- **Exception:** If this is intended, add `{"rule":"errorprone/EqualsUnsafeCast","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsUnsafeCast)

<a id="errorprone-equalsusinghashcode"></a>

### `errorprone/EqualsUsingHashCode`

Equals using hash code.

- **Exception:** If this is intended, add `{"rule":"errorprone/EqualsUsingHashCode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsUsingHashCode)

<a id="errorprone-equalswrongthing"></a>

### `errorprone/EqualsWrongThing`

Equals wrong thing.

- **Exception:** If this is intended, add `{"rule":"errorprone/EqualsWrongThing","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EqualsWrongThing)

<a id="errorprone-erroneousbitwiseexpression"></a>

### `errorprone/ErroneousBitwiseExpression`

Erroneous bitwise expression.

- **Exception:** If this is intended, add `{"rule":"errorprone/ErroneousBitwiseExpression","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ErroneousBitwiseExpression)

<a id="errorprone-erroneousthreadpoolconstructorchecker"></a>

### `errorprone/ErroneousThreadPoolConstructorChecker`

Erroneous thread pool constructor checker.

- **Exception:** If this is intended, add `{"rule":"errorprone/ErroneousThreadPoolConstructorChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ErroneousThreadPoolConstructorChecker)

<a id="errorprone-escapedentity"></a>

### `errorprone/EscapedEntity`

Escaped entity.

- **Exception:** If this is intended, add `{"rule":"errorprone/EscapedEntity","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/EscapedEntity)

<a id="errorprone-expectedexceptionchecker"></a>

### `errorprone/ExpectedExceptionChecker`

Expected exception checker.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/ExpectedExceptionChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ExpectedExceptionChecker)

<a id="errorprone-expensivelenientformatstring"></a>

### `errorprone/ExpensiveLenientFormatString`

Expensive lenient format string.

- **Exception:** If this is intended, add `{"rule":"errorprone/ExpensiveLenientFormatString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ExpensiveLenientFormatString)

<a id="errorprone-explicitarrayforvarargs"></a>

### `errorprone/ExplicitArrayForVarargs`

Explicit array for varargs.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/ExplicitArrayForVarargs","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ExplicitArrayForVarargs)

<a id="errorprone-exposedprivatetype"></a>

### `errorprone/ExposedPrivateType`

Exposed private type.

- **Exception:** If this is intended, add `{"rule":"errorprone/ExposedPrivateType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ExposedPrivateType)

<a id="errorprone-extendingjunitassert"></a>

### `errorprone/ExtendingJUnitAssert`

Extending j unit assert.

- **Exception:** If this is intended, add `{"rule":"errorprone/ExtendingJUnitAssert","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ExtendingJUnitAssert)

<a id="errorprone-extendsautovalue"></a>

### `errorprone/ExtendsAutoValue`

Extends auto value.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/ExtendsAutoValue","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ExtendsAutoValue)

<a id="errorprone-extendsobject"></a>

### `errorprone/ExtendsObject`

Extends object.

- **Exception:** If this is intended, add `{"rule":"errorprone/ExtendsObject","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ExtendsObject)

<a id="errorprone-fallthrough"></a>

### `errorprone/FallThrough`

Fall through.

- **Exception:** If this is intended, add `{"rule":"errorprone/FallThrough","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FallThrough)

<a id="errorprone-fieldcanbefinal"></a>

### `errorprone/FieldCanBeFinal`

Field can be final.

- **Scope:** Not reported in classes annotated jakarta.persistence.Embeddable, jakarta.persistence.Entity, jakarta.persistence.MappedSuperclass, javax.persistence.Embeddable, javax.persistence.Entity, javax.persistence.MappedSuperclass.
- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/FieldCanBeFinal","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FieldCanBeFinal)

<a id="errorprone-fieldcanbelocal"></a>

### `errorprone/FieldCanBeLocal`

Field can be local.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/FieldCanBeLocal","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FieldCanBeLocal)

<a id="errorprone-fieldcanbestatic"></a>

### `errorprone/FieldCanBeStatic`

Field can be static.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/FieldCanBeStatic","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FieldCanBeStatic)

<a id="errorprone-finalize"></a>

### `errorprone/Finalize`

Finalize.

- **Exception:** If this is intended, add `{"rule":"errorprone/Finalize","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/Finalize)

<a id="errorprone-finally"></a>

### `errorprone/Finally`

Finally.

- **Exception:** If this is intended, add `{"rule":"errorprone/Finally","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/Finally)

<a id="errorprone-floatcast"></a>

### `errorprone/FloatCast`

Float cast.

- **Exception:** If this is intended, add `{"rule":"errorprone/FloatCast","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloatCast)

<a id="errorprone-floatingpointassertionwithinepsilon"></a>

### `errorprone/FloatingPointAssertionWithinEpsilon`

Floating point assertion within epsilon.

- **Exception:** If this is intended, add `{"rule":"errorprone/FloatingPointAssertionWithinEpsilon","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloatingPointAssertionWithinEpsilon)

<a id="errorprone-floatingpointliteralprecision"></a>

### `errorprone/FloatingPointLiteralPrecision`

Floating point literal precision.

- **Exception:** If this is intended, add `{"rule":"errorprone/FloatingPointLiteralPrecision","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloatingPointLiteralPrecision)

<a id="errorprone-floggerargumenttostring"></a>

### `errorprone/FloggerArgumentToString`

Flogger argument to string.

- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerArgumentToString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerArgumentToString)

<a id="errorprone-floggerformatstring"></a>

### `errorprone/FloggerFormatString`

Flogger format string.

- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerFormatString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerFormatString)

<a id="errorprone-floggerlogstring"></a>

### `errorprone/FloggerLogString`

Flogger log string.

- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerLogString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerLogString)

<a id="errorprone-floggerlogvarargs"></a>

### `errorprone/FloggerLogVarargs`

Flogger log varargs.

- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerLogVarargs","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerLogVarargs)

<a id="errorprone-floggerlogwithcause"></a>

### `errorprone/FloggerLogWithCause`

Flogger log with cause.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerLogWithCause","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerLogWithCause)

<a id="errorprone-floggermessageformat"></a>

### `errorprone/FloggerMessageFormat`

Flogger message format.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerMessageFormat","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerMessageFormat)

<a id="errorprone-floggerperwithoutratelimit"></a>

### `errorprone/FloggerPerWithoutRateLimit`

Flogger per without rate limit.

- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerPerWithoutRateLimit","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerPerWithoutRateLimit)

<a id="errorprone-floggerredundantisenabled"></a>

### `errorprone/FloggerRedundantIsEnabled`

Flogger redundant is enabled.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerRedundantIsEnabled","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerRedundantIsEnabled)

<a id="errorprone-floggerrequiredmodifiers"></a>

### `errorprone/FloggerRequiredModifiers`

Flogger required modifiers.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerRequiredModifiers","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerRequiredModifiers)

<a id="errorprone-floggersplitlogstatement"></a>

### `errorprone/FloggerSplitLogStatement`

Flogger split log statement.

- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerSplitLogStatement","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerSplitLogStatement)

<a id="errorprone-floggerstringconcatenation"></a>

### `errorprone/FloggerStringConcatenation`

Flogger string concatenation.

- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerStringConcatenation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerStringConcatenation)

<a id="errorprone-floggerwithcause"></a>

### `errorprone/FloggerWithCause`

Flogger with cause.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerWithCause","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerWithCause)

<a id="errorprone-floggerwithoutcause"></a>

### `errorprone/FloggerWithoutCause`

Flogger without cause.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/FloggerWithoutCause","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FloggerWithoutCause)

<a id="errorprone-foreachiterable"></a>

### `errorprone/ForEachIterable`

For each iterable.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/ForEachIterable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ForEachIterable)

<a id="errorprone-formatstring"></a>

### `errorprone/FormatString`

Format string.

- **Exception:** If this is intended, add `{"rule":"errorprone/FormatString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FormatString)

<a id="errorprone-formatstringannotation"></a>

### `errorprone/FormatStringAnnotation`

Format string annotation.

- **Exception:** If this is intended, add `{"rule":"errorprone/FormatStringAnnotation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FormatStringAnnotation)

<a id="errorprone-formatstringshoulduseplaceholders"></a>

### `errorprone/FormatStringShouldUsePlaceholders`

Format string should use placeholders.

- **Exception:** If this is intended, add `{"rule":"errorprone/FormatStringShouldUsePlaceholders","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FormatStringShouldUsePlaceholders)

<a id="errorprone-foroverride"></a>

### `errorprone/ForOverride`

For override.

- **Exception:** If this is intended, add `{"rule":"errorprone/ForOverride","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ForOverride)

<a id="errorprone-fragmentinjection"></a>

### `errorprone/FragmentInjection`

Fragment injection.

- **Exception:** If this is intended, add `{"rule":"errorprone/FragmentInjection","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FragmentInjection)

<a id="errorprone-fragmentnotinstantiable"></a>

### `errorprone/FragmentNotInstantiable`

Fragment not instantiable.

- **Exception:** If this is intended, add `{"rule":"errorprone/FragmentNotInstantiable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FragmentNotInstantiable)

<a id="errorprone-fromtemporalaccessor"></a>

### `errorprone/FromTemporalAccessor`

From temporal accessor.

- **Exception:** If this is intended, add `{"rule":"errorprone/FromTemporalAccessor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FromTemporalAccessor)

<a id="errorprone-functionalinterfaceclash"></a>

### `errorprone/FunctionalInterfaceClash`

Functional interface clash.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/FunctionalInterfaceClash","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FunctionalInterfaceClash)

<a id="errorprone-functionalinterfacemethodchanged"></a>

### `errorprone/FunctionalInterfaceMethodChanged`

Functional interface method changed.

- **Exception:** If this is intended, add `{"rule":"errorprone/FunctionalInterfaceMethodChanged","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FunctionalInterfaceMethodChanged)

<a id="errorprone-futurereturnvalueignored"></a>

### `errorprone/FutureReturnValueIgnored`

Future return value ignored.

- **Exception:** If this is intended, add `{"rule":"errorprone/FutureReturnValueIgnored","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FutureReturnValueIgnored)

<a id="errorprone-futuresgetcheckedillegalexceptiontype"></a>

### `errorprone/FuturesGetCheckedIllegalExceptionType`

Futures get checked illegal exception type.

- **Exception:** If this is intended, add `{"rule":"errorprone/FuturesGetCheckedIllegalExceptionType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FuturesGetCheckedIllegalExceptionType)

<a id="errorprone-futuretransformasync"></a>

### `errorprone/FutureTransformAsync`

Future transform async.

- **Exception:** If this is intended, add `{"rule":"errorprone/FutureTransformAsync","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FutureTransformAsync)

<a id="errorprone-fuzzyequalsshouldnotbeusedinequalsmethod"></a>

### `errorprone/FuzzyEqualsShouldNotBeUsedInEqualsMethod`

Fuzzy equals should not be used in equals method.

- **Exception:** If this is intended, add `{"rule":"errorprone/FuzzyEqualsShouldNotBeUsedInEqualsMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/FuzzyEqualsShouldNotBeUsedInEqualsMethod)

<a id="errorprone-getclassonannotation"></a>

### `errorprone/GetClassOnAnnotation`

Get class on annotation.

- **Exception:** If this is intended, add `{"rule":"errorprone/GetClassOnAnnotation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/GetClassOnAnnotation)

<a id="errorprone-getclassonclass"></a>

### `errorprone/GetClassOnClass`

Get class on class.

- **Exception:** If this is intended, add `{"rule":"errorprone/GetClassOnClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/GetClassOnClass)

<a id="errorprone-getclassonenum"></a>

### `errorprone/GetClassOnEnum`

Get class on enum.

- **Exception:** If this is intended, add `{"rule":"errorprone/GetClassOnEnum","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/GetClassOnEnum)

<a id="errorprone-guardedby"></a>

### `errorprone/GuardedBy`

Guarded by.

- **Exception:** If this is intended, add `{"rule":"errorprone/GuardedBy","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/GuardedBy)

<a id="errorprone-guiceassistedinjectscoping"></a>

### `errorprone/GuiceAssistedInjectScoping`

Guice assisted inject scoping.

- **Exception:** If this is intended, add `{"rule":"errorprone/GuiceAssistedInjectScoping","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/GuiceAssistedInjectScoping)

<a id="errorprone-guiceassistedparameters"></a>

### `errorprone/GuiceAssistedParameters`

Guice assisted parameters.

- **Exception:** If this is intended, add `{"rule":"errorprone/GuiceAssistedParameters","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/GuiceAssistedParameters)

<a id="errorprone-guiceinjectonfinalfield"></a>

### `errorprone/GuiceInjectOnFinalField`

Guice inject on final field.

- **Exception:** If this is intended, add `{"rule":"errorprone/GuiceInjectOnFinalField","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/GuiceInjectOnFinalField)

<a id="errorprone-guicenestedcombine"></a>

### `errorprone/GuiceNestedCombine`

Guice nested combine.

- **Exception:** If this is intended, add `{"rule":"errorprone/GuiceNestedCombine","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/GuiceNestedCombine)

<a id="errorprone-hardcodedsdcardpath"></a>

### `errorprone/HardCodedSdCardPath`

Hard coded sd card path.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/HardCodedSdCardPath","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/HardCodedSdCardPath)

<a id="errorprone-hashtablecontains"></a>

### `errorprone/HashtableContains`

Hashtable contains.

- **Exception:** If this is intended, add `{"rule":"errorprone/HashtableContains","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/HashtableContains)

<a id="errorprone-hidingfield"></a>

### `errorprone/HidingField`

Hiding field.

- **Exception:** If this is intended, add `{"rule":"errorprone/HidingField","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/HidingField)

<a id="errorprone-iccprofilegetinstance"></a>

### `errorprone/ICCProfileGetInstance`

Icc profile get instance.

- **Exception:** If this is intended, add `{"rule":"errorprone/ICCProfileGetInstance","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ICCProfileGetInstance)

<a id="errorprone-identifiername"></a>

### `errorprone/IdentifierName`

Identifier name.

- **Scope:** Not reported in classes annotated com.tngtech.archunit.junit.AnalyzeClasses.
- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/IdentifierName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IdentifierName)

<a id="errorprone-identitybinaryexpression"></a>

### `errorprone/IdentityBinaryExpression`

Identity binary expression.

- **Exception:** If this is intended, add `{"rule":"errorprone/IdentityBinaryExpression","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IdentityBinaryExpression)

<a id="errorprone-identityhashmapboxing"></a>

### `errorprone/IdentityHashMapBoxing`

Identity hash map boxing.

- **Exception:** If this is intended, add `{"rule":"errorprone/IdentityHashMapBoxing","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IdentityHashMapBoxing)

<a id="errorprone-identityhashmapusage"></a>

### `errorprone/IdentityHashMapUsage`

Identity hash map usage.

- **Exception:** If this is intended, add `{"rule":"errorprone/IdentityHashMapUsage","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IdentityHashMapUsage)

<a id="errorprone-ignoredpuregetter"></a>

### `errorprone/IgnoredPureGetter`

Ignored pure getter.

- **Exception:** If this is intended, add `{"rule":"errorprone/IgnoredPureGetter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IgnoredPureGetter)

<a id="errorprone-immutable"></a>

### `errorprone/Immutable`

Immutable.

- **Exception:** If this is intended, add `{"rule":"errorprone/Immutable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/Immutable)

<a id="errorprone-immutableannotationchecker"></a>

### `errorprone/ImmutableAnnotationChecker`

Immutable annotation checker.

- **Exception:** If this is intended, add `{"rule":"errorprone/ImmutableAnnotationChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ImmutableAnnotationChecker)

<a id="errorprone-immutableenumchecker"></a>

### `errorprone/ImmutableEnumChecker`

Immutable enum checker.

- **Exception:** If this is intended, add `{"rule":"errorprone/ImmutableEnumChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ImmutableEnumChecker)

<a id="errorprone-immutablesetforcontains"></a>

### `errorprone/ImmutableSetForContains`

Immutable set for contains.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/ImmutableSetForContains","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ImmutableSetForContains)

<a id="errorprone-implementassertionwithchaining"></a>

### `errorprone/ImplementAssertionWithChaining`

Implement assertion with chaining.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/ImplementAssertionWithChaining","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ImplementAssertionWithChaining)

<a id="errorprone-impossiblenullcomparison"></a>

### `errorprone/ImpossibleNullComparison`

Impossible null comparison.

- **Exception:** If this is intended, add `{"rule":"errorprone/ImpossibleNullComparison","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ImpossibleNullComparison)

<a id="errorprone-incomparable"></a>

### `errorprone/Incomparable`

Incomparable.

- **Exception:** If this is intended, add `{"rule":"errorprone/Incomparable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/Incomparable)

<a id="errorprone-incompatibleargumenttype"></a>

### `errorprone/IncompatibleArgumentType`

Incompatible argument type.

- **Exception:** If this is intended, add `{"rule":"errorprone/IncompatibleArgumentType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IncompatibleArgumentType)

<a id="errorprone-incompatiblemodifiers"></a>

### `errorprone/IncompatibleModifiers`

Incompatible modifiers.

- **Exception:** If this is intended, add `{"rule":"errorprone/IncompatibleModifiers","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IncompatibleModifiers)

<a id="errorprone-inconsistentcapitalization"></a>

### `errorprone/InconsistentCapitalization`

Inconsistent capitalization.

- **Exception:** If this is intended, add `{"rule":"errorprone/InconsistentCapitalization","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InconsistentCapitalization)

<a id="errorprone-inconsistenthashcode"></a>

### `errorprone/InconsistentHashCode`

Inconsistent hash code.

- **Exception:** If this is intended, add `{"rule":"errorprone/InconsistentHashCode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InconsistentHashCode)

<a id="errorprone-inconsistentoverloads"></a>

### `errorprone/InconsistentOverloads`

Inconsistent overloads.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/InconsistentOverloads","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InconsistentOverloads)

<a id="errorprone-incorrectmainmethod"></a>

### `errorprone/IncorrectMainMethod`

Incorrect main method.

- **Exception:** If this is intended, add `{"rule":"errorprone/IncorrectMainMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IncorrectMainMethod)

<a id="errorprone-incrementinforloopandheader"></a>

### `errorprone/IncrementInForLoopAndHeader`

Increment in for loop and header.

- **Exception:** If this is intended, add `{"rule":"errorprone/IncrementInForLoopAndHeader","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IncrementInForLoopAndHeader)

<a id="errorprone-indexofchar"></a>

### `errorprone/IndexOfChar`

Index of char.

- **Exception:** If this is intended, add `{"rule":"errorprone/IndexOfChar","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IndexOfChar)

<a id="errorprone-inexactvarargsconditional"></a>

### `errorprone/InexactVarargsConditional`

Inexact varargs conditional.

- **Exception:** If this is intended, add `{"rule":"errorprone/InexactVarargsConditional","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InexactVarargsConditional)

<a id="errorprone-infiniterecursion"></a>

### `errorprone/InfiniteRecursion`

Infinite recursion.

- **Exception:** If this is intended, add `{"rule":"errorprone/InfiniteRecursion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InfiniteRecursion)

<a id="errorprone-inheritdoc"></a>

### `errorprone/InheritDoc`

Inherit doc.

- **Exception:** If this is intended, add `{"rule":"errorprone/InheritDoc","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InheritDoc)

<a id="errorprone-initializeinline"></a>

### `errorprone/InitializeInline`

Initialize inline.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/InitializeInline","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InitializeInline)

<a id="errorprone-injectedconstructorannotations"></a>

### `errorprone/InjectedConstructorAnnotations`

Injected constructor annotations.

- **Exception:** If this is intended, add `{"rule":"errorprone/InjectedConstructorAnnotations","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InjectedConstructorAnnotations)

<a id="errorprone-injectinvalidtargetingonscopingannotation"></a>

### `errorprone/InjectInvalidTargetingOnScopingAnnotation`

Inject invalid targeting on scoping annotation.

- **Exception:** If this is intended, add `{"rule":"errorprone/InjectInvalidTargetingOnScopingAnnotation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InjectInvalidTargetingOnScopingAnnotation)

<a id="errorprone-injectmorethanonescopeannotationonclass"></a>

### `errorprone/InjectMoreThanOneScopeAnnotationOnClass`

Inject more than one scope annotation on class.

- **Exception:** If this is intended, add `{"rule":"errorprone/InjectMoreThanOneScopeAnnotationOnClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InjectMoreThanOneScopeAnnotationOnClass)

<a id="errorprone-injectonbugcheckers"></a>

### `errorprone/InjectOnBugCheckers`

Inject on bug checkers.

- **Exception:** If this is intended, add `{"rule":"errorprone/InjectOnBugCheckers","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InjectOnBugCheckers)

<a id="errorprone-injectonconstructorofabstractclass"></a>

### `errorprone/InjectOnConstructorOfAbstractClass`

Inject on constructor of abstract class.

- **Exception:** If this is intended, add `{"rule":"errorprone/InjectOnConstructorOfAbstractClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InjectOnConstructorOfAbstractClass)

<a id="errorprone-injectonmemberandconstructor"></a>

### `errorprone/InjectOnMemberAndConstructor`

Inject on member and constructor.

- **Exception:** If this is intended, add `{"rule":"errorprone/InjectOnMemberAndConstructor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InjectOnMemberAndConstructor)

<a id="errorprone-injectscopeannotationoninterfaceorabstractclass"></a>

### `errorprone/InjectScopeAnnotationOnInterfaceOrAbstractClass`

Inject scope annotation on interface or abstract class.

- **Exception:** If this is intended, add `{"rule":"errorprone/InjectScopeAnnotationOnInterfaceOrAbstractClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InjectScopeAnnotationOnInterfaceOrAbstractClass)

<a id="errorprone-inlinemeinliner"></a>

### `errorprone/InlineMeInliner`

Inline me inliner.

- **Exception:** If this is intended, add `{"rule":"errorprone/InlineMeInliner","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InlineMeInliner)

<a id="errorprone-inlinemevalidator"></a>

### `errorprone/InlineMeValidator`

Inline me validator.

- **Exception:** If this is intended, add `{"rule":"errorprone/InlineMeValidator","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InlineMeValidator)

<a id="errorprone-inlinetrivialconstant"></a>

### `errorprone/InlineTrivialConstant`

Inline trivial constant.

- **Exception:** If this is intended, add `{"rule":"errorprone/InlineTrivialConstant","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InlineTrivialConstant)

<a id="errorprone-inputstreamslowmultibyteread"></a>

### `errorprone/InputStreamSlowMultibyteRead`

Input stream slow multibyte read.

- **Exception:** If this is intended, add `{"rule":"errorprone/InputStreamSlowMultibyteRead","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InputStreamSlowMultibyteRead)

<a id="errorprone-insecurecryptousage"></a>

### `errorprone/InsecureCryptoUsage`

Insecure crypto usage.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/InsecureCryptoUsage","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InsecureCryptoUsage)

<a id="errorprone-instanceofandcastmatchwrongtype"></a>

### `errorprone/InstanceOfAndCastMatchWrongType`

Instance of and cast match wrong type.

- **Exception:** If this is intended, add `{"rule":"errorprone/InstanceOfAndCastMatchWrongType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InstanceOfAndCastMatchWrongType)

<a id="errorprone-instanttemporalunit"></a>

### `errorprone/InstantTemporalUnit`

Instant temporal unit.

- **Exception:** If this is intended, add `{"rule":"errorprone/InstantTemporalUnit","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InstantTemporalUnit)

<a id="errorprone-interruptedexceptionswallowed"></a>

### `errorprone/InterruptedExceptionSwallowed`

Interrupted exception swallowed.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/InterruptedExceptionSwallowed","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InterruptedExceptionSwallowed)

<a id="errorprone-interruptedincatchblock"></a>

### `errorprone/InterruptedInCatchBlock`

Interrupted in catch block.

- **Exception:** If this is intended, add `{"rule":"errorprone/InterruptedInCatchBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InterruptedInCatchBlock)

<a id="errorprone-interruption"></a>

### `errorprone/Interruption`

Interruption.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/Interruption","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/Interruption)

<a id="errorprone-intfloatconversion"></a>

### `errorprone/IntFloatConversion`

Int float conversion.

- **Exception:** If this is intended, add `{"rule":"errorprone/IntFloatConversion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IntFloatConversion)

<a id="errorprone-intliteralcast"></a>

### `errorprone/IntLiteralCast`

Int literal cast.

- **Exception:** If this is intended, add `{"rule":"errorprone/IntLiteralCast","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IntLiteralCast)

<a id="errorprone-intlongmath"></a>

### `errorprone/IntLongMath`

Int long math.

- **Exception:** If this is intended, add `{"rule":"errorprone/IntLongMath","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IntLongMath)

<a id="errorprone-invalidblocktag"></a>

### `errorprone/InvalidBlockTag`

Invalid block tag.

- **Exception:** If this is intended, add `{"rule":"errorprone/InvalidBlockTag","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidBlockTag)

<a id="errorprone-invalidinlinetag"></a>

### `errorprone/InvalidInlineTag`

Invalid inline tag.

- **Exception:** If this is intended, add `{"rule":"errorprone/InvalidInlineTag","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidInlineTag)

<a id="errorprone-invalidjavatimeconstant"></a>

### `errorprone/InvalidJavaTimeConstant`

Invalid java time constant.

- **Exception:** If this is intended, add `{"rule":"errorprone/InvalidJavaTimeConstant","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidJavaTimeConstant)

<a id="errorprone-invalidlink"></a>

### `errorprone/InvalidLink`

Invalid link.

- **Exception:** If this is intended, add `{"rule":"errorprone/InvalidLink","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidLink)

<a id="errorprone-invalidparam"></a>

### `errorprone/InvalidParam`

Invalid param.

- **Exception:** If this is intended, add `{"rule":"errorprone/InvalidParam","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidParam)

<a id="errorprone-invalidpatternsyntax"></a>

### `errorprone/InvalidPatternSyntax`

Invalid pattern syntax.

- **Exception:** If this is intended, add `{"rule":"errorprone/InvalidPatternSyntax","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidPatternSyntax)

<a id="errorprone-invalidsnippet"></a>

### `errorprone/InvalidSnippet`

Invalid snippet.

- **Exception:** If this is intended, add `{"rule":"errorprone/InvalidSnippet","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidSnippet)

<a id="errorprone-invalidthrows"></a>

### `errorprone/InvalidThrows`

Invalid throws.

- **Exception:** If this is intended, add `{"rule":"errorprone/InvalidThrows","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidThrows)

<a id="errorprone-invalidthrowslink"></a>

### `errorprone/InvalidThrowsLink`

Invalid throws link.

- **Exception:** If this is intended, add `{"rule":"errorprone/InvalidThrowsLink","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidThrowsLink)

<a id="errorprone-invalidtimezoneid"></a>

### `errorprone/InvalidTimeZoneID`

Invalid time zone id.

- **Exception:** If this is intended, add `{"rule":"errorprone/InvalidTimeZoneID","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidTimeZoneID)

<a id="errorprone-invalidzoneid"></a>

### `errorprone/InvalidZoneId`

Invalid zone id.

- **Exception:** If this is intended, add `{"rule":"errorprone/InvalidZoneId","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/InvalidZoneId)

<a id="errorprone-isinstanceincompatibletype"></a>

### `errorprone/IsInstanceIncompatibleType`

Is instance incompatible type.

- **Exception:** If this is intended, add `{"rule":"errorprone/IsInstanceIncompatibleType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IsInstanceIncompatibleType)

<a id="errorprone-isinstanceofclass"></a>

### `errorprone/IsInstanceOfClass`

Is instance of class.

- **Exception:** If this is intended, add `{"rule":"errorprone/IsInstanceOfClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IsInstanceOfClass)

<a id="errorprone-isloggabletaglength"></a>

### `errorprone/IsLoggableTagLength`

Is loggable tag length.

- **Exception:** If this is intended, add `{"rule":"errorprone/IsLoggableTagLength","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IsLoggableTagLength)

<a id="errorprone-iterableanditerator"></a>

### `errorprone/IterableAndIterator`

Iterable and iterator.

- **Exception:** If this is intended, add `{"rule":"errorprone/IterableAndIterator","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IterableAndIterator)

<a id="errorprone-iterablepathparameter"></a>

### `errorprone/IterablePathParameter`

Iterable path parameter.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/IterablePathParameter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/IterablePathParameter)

<a id="errorprone-javadurationgetsecondsgetnano"></a>

### `errorprone/JavaDurationGetSecondsGetNano`

Java duration get seconds get nano.

- **Exception:** If this is intended, add `{"rule":"errorprone/JavaDurationGetSecondsGetNano","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaDurationGetSecondsGetNano)

<a id="errorprone-javadurationgetsecondstotoseconds"></a>

### `errorprone/JavaDurationGetSecondsToToSeconds`

Java duration get seconds to to seconds.

- **Exception:** If this is intended, add `{"rule":"errorprone/JavaDurationGetSecondsToToSeconds","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaDurationGetSecondsToToSeconds)

<a id="errorprone-javadurationwithnanos"></a>

### `errorprone/JavaDurationWithNanos`

Java duration with nanos.

- **Exception:** If this is intended, add `{"rule":"errorprone/JavaDurationWithNanos","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaDurationWithNanos)

<a id="errorprone-javadurationwithseconds"></a>

### `errorprone/JavaDurationWithSeconds`

Java duration with seconds.

- **Exception:** If this is intended, add `{"rule":"errorprone/JavaDurationWithSeconds","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaDurationWithSeconds)

<a id="errorprone-javainstantgetsecondsgetnano"></a>

### `errorprone/JavaInstantGetSecondsGetNano`

Java instant get seconds get nano.

- **Exception:** If this is intended, add `{"rule":"errorprone/JavaInstantGetSecondsGetNano","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaInstantGetSecondsGetNano)

<a id="errorprone-javalocaldatetimegetnano"></a>

### `errorprone/JavaLocalDateTimeGetNano`

Java local date time get nano.

- **Exception:** If this is intended, add `{"rule":"errorprone/JavaLocalDateTimeGetNano","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaLocalDateTimeGetNano)

<a id="errorprone-javalocaltimegetnano"></a>

### `errorprone/JavaLocalTimeGetNano`

Java local time get nano.

- **Exception:** If this is intended, add `{"rule":"errorprone/JavaLocalTimeGetNano","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaLocalTimeGetNano)

<a id="errorprone-javaperiodgetdays"></a>

### `errorprone/JavaPeriodGetDays`

Java period get days.

- **Exception:** If this is intended, add `{"rule":"errorprone/JavaPeriodGetDays","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaPeriodGetDays)

<a id="errorprone-javatimedefaulttimezone"></a>

### `errorprone/JavaTimeDefaultTimeZone`

Java time default time zone.

- **Exception:** If this is intended, add `{"rule":"errorprone/JavaTimeDefaultTimeZone","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaTimeDefaultTimeZone)

<a id="errorprone-javautildate"></a>

### `errorprone/JavaUtilDate`

Java util date.

- **Exception:** If this is intended, add `{"rule":"errorprone/JavaUtilDate","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaUtilDate)

<a id="errorprone-javaxinjectonabstractmethod"></a>

### `errorprone/JavaxInjectOnAbstractMethod`

Javax inject on abstract method.

- **Exception:** If this is intended, add `{"rule":"errorprone/JavaxInjectOnAbstractMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaxInjectOnAbstractMethod)

<a id="errorprone-javaxinjectonfinalfield"></a>

### `errorprone/JavaxInjectOnFinalField`

Javax inject on final field.

- **Exception:** If this is intended, add `{"rule":"errorprone/JavaxInjectOnFinalField","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JavaxInjectOnFinalField)

<a id="errorprone-jdkobsolete"></a>

### `errorprone/JdkObsolete`

Jdk obsolete.

- **Exception:** If this is intended, add `{"rule":"errorprone/JdkObsolete","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JdkObsolete)

<a id="errorprone-jodaconstructors"></a>

### `errorprone/JodaConstructors`

Joda constructors.

- **Exception:** If this is intended, add `{"rule":"errorprone/JodaConstructors","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaConstructors)

<a id="errorprone-jodadatetimeconstants"></a>

### `errorprone/JodaDateTimeConstants`

Joda date time constants.

- **Exception:** If this is intended, add `{"rule":"errorprone/JodaDateTimeConstants","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaDateTimeConstants)

<a id="errorprone-jodadurationwithmillis"></a>

### `errorprone/JodaDurationWithMillis`

Joda duration with millis.

- **Exception:** If this is intended, add `{"rule":"errorprone/JodaDurationWithMillis","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaDurationWithMillis)

<a id="errorprone-jodainstantwithmillis"></a>

### `errorprone/JodaInstantWithMillis`

Joda instant with millis.

- **Exception:** If this is intended, add `{"rule":"errorprone/JodaInstantWithMillis","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaInstantWithMillis)

<a id="errorprone-jodanewperiod"></a>

### `errorprone/JodaNewPeriod`

Joda new period.

- **Exception:** If this is intended, add `{"rule":"errorprone/JodaNewPeriod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaNewPeriod)

<a id="errorprone-jodaplusminuslong"></a>

### `errorprone/JodaPlusMinusLong`

Joda plus minus long.

- **Exception:** If this is intended, add `{"rule":"errorprone/JodaPlusMinusLong","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaPlusMinusLong)

<a id="errorprone-jodatimeconvertermanager"></a>

### `errorprone/JodaTimeConverterManager`

Joda time converter manager.

- **Exception:** If this is intended, add `{"rule":"errorprone/JodaTimeConverterManager","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaTimeConverterManager)

<a id="errorprone-jodatoself"></a>

### `errorprone/JodaToSelf`

Joda to self.

- **Exception:** If this is intended, add `{"rule":"errorprone/JodaToSelf","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaToSelf)

<a id="errorprone-jodawithdurationaddedlong"></a>

### `errorprone/JodaWithDurationAddedLong`

Joda with duration added long.

- **Exception:** If this is intended, add `{"rule":"errorprone/JodaWithDurationAddedLong","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JodaWithDurationAddedLong)

<a id="errorprone-junit3floatingpointcomparisonwithoutdelta"></a>

### `errorprone/JUnit3FloatingPointComparisonWithoutDelta`

J unit3 floating point comparison without delta.

- **Exception:** If this is intended, add `{"rule":"errorprone/JUnit3FloatingPointComparisonWithoutDelta","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit3FloatingPointComparisonWithoutDelta)

<a id="errorprone-junit3testnotrun"></a>

### `errorprone/JUnit3TestNotRun`

J unit3 test not run.

- **Exception:** If this is intended, add `{"rule":"errorprone/JUnit3TestNotRun","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit3TestNotRun)

<a id="errorprone-junit4classannotationnonstatic"></a>

### `errorprone/JUnit4ClassAnnotationNonStatic`

J unit4 class annotation non static.

- **Exception:** If this is intended, add `{"rule":"errorprone/JUnit4ClassAnnotationNonStatic","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit4ClassAnnotationNonStatic)

<a id="errorprone-junit4classusedinjunit3"></a>

### `errorprone/JUnit4ClassUsedInJUnit3`

J unit4 class used in j unit3.

- **Exception:** If this is intended, add `{"rule":"errorprone/JUnit4ClassUsedInJUnit3","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit4ClassUsedInJUnit3)

<a id="errorprone-junit4emptymethods"></a>

### `errorprone/JUnit4EmptyMethods`

J unit4 empty methods.

- **Exception:** If this is intended, add `{"rule":"errorprone/JUnit4EmptyMethods","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit4EmptyMethods)

<a id="errorprone-junit4setupnotrun"></a>

### `errorprone/JUnit4SetUpNotRun`

J unit4 set up not run.

- **Exception:** If this is intended, add `{"rule":"errorprone/JUnit4SetUpNotRun","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit4SetUpNotRun)

<a id="errorprone-junit4teardownnotrun"></a>

### `errorprone/JUnit4TearDownNotRun`

J unit4 tear down not run.

- **Exception:** If this is intended, add `{"rule":"errorprone/JUnit4TearDownNotRun","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit4TearDownNotRun)

<a id="errorprone-junit4testnotrun"></a>

### `errorprone/JUnit4TestNotRun`

J unit4 test not run.

- **Exception:** If this is intended, add `{"rule":"errorprone/JUnit4TestNotRun","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit4TestNotRun)

<a id="errorprone-junit4testsnotrunwithinenclosed"></a>

### `errorprone/JUnit4TestsNotRunWithinEnclosed`

J unit4 tests not run within enclosed.

- **Exception:** If this is intended, add `{"rule":"errorprone/JUnit4TestsNotRunWithinEnclosed","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnit4TestsNotRunWithinEnclosed)

<a id="errorprone-junitambiguoustestclass"></a>

### `errorprone/JUnitAmbiguousTestClass`

J unit ambiguous test class.

- **Exception:** If this is intended, add `{"rule":"errorprone/JUnitAmbiguousTestClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnitAmbiguousTestClass)

<a id="errorprone-junitassertsamecheck"></a>

### `errorprone/JUnitAssertSameCheck`

J unit assert same check.

- **Exception:** If this is intended, add `{"rule":"errorprone/JUnitAssertSameCheck","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnitAssertSameCheck)

<a id="errorprone-junitincompatibletype"></a>

### `errorprone/JUnitIncompatibleType`

J unit incompatible type.

- **Exception:** If this is intended, add `{"rule":"errorprone/JUnitIncompatibleType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnitIncompatibleType)

<a id="errorprone-junitmethodinvoked"></a>

### `errorprone/JUnitMethodInvoked`

J unit method invoked.

- **Exception:** If this is intended, add `{"rule":"errorprone/JUnitMethodInvoked","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnitMethodInvoked)

<a id="errorprone-junitparametermethodnotfound"></a>

### `errorprone/JUnitParameterMethodNotFound`

J unit parameter method not found.

- **Exception:** If this is intended, add `{"rule":"errorprone/JUnitParameterMethodNotFound","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/JUnitParameterMethodNotFound)

<a id="errorprone-labelledbreaktarget"></a>

### `errorprone/LabelledBreakTarget`

Labelled break target.

- **Exception:** If this is intended, add `{"rule":"errorprone/LabelledBreakTarget","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LabelledBreakTarget)

<a id="errorprone-lambdafunctionalinterface"></a>

### `errorprone/LambdaFunctionalInterface`

Lambda functional interface.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/LambdaFunctionalInterface","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LambdaFunctionalInterface)

<a id="errorprone-lenientformatstringvalidation"></a>

### `errorprone/LenientFormatStringValidation`

Lenient format string validation.

- **Exception:** If this is intended, add `{"rule":"errorprone/LenientFormatStringValidation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LenientFormatStringValidation)

<a id="errorprone-listremoveambiguous"></a>

### `errorprone/ListRemoveAmbiguous`

List remove ambiguous.

- **Exception:** If this is intended, add `{"rule":"errorprone/ListRemoveAmbiguous","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ListRemoveAmbiguous)

<a id="errorprone-litebytestringutf8"></a>

### `errorprone/LiteByteStringUtf8`

Lite byte string utf8.

- **Exception:** If this is intended, add `{"rule":"errorprone/LiteByteStringUtf8","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LiteByteStringUtf8)

<a id="errorprone-liteenumvalueof"></a>

### `errorprone/LiteEnumValueOf`

Lite enum value of.

- **Exception:** If this is intended, add `{"rule":"errorprone/LiteEnumValueOf","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LiteEnumValueOf)

<a id="errorprone-liteprototostring"></a>

### `errorprone/LiteProtoToString`

Lite proto to string.

- **Exception:** If this is intended, add `{"rule":"errorprone/LiteProtoToString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LiteProtoToString)

<a id="errorprone-localdatetemporalamount"></a>

### `errorprone/LocalDateTemporalAmount`

Local date temporal amount.

- **Exception:** If this is intended, add `{"rule":"errorprone/LocalDateTemporalAmount","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LocalDateTemporalAmount)

<a id="errorprone-locknotbeforetry"></a>

### `errorprone/LockNotBeforeTry`

Lock not before try.

- **Exception:** If this is intended, add `{"rule":"errorprone/LockNotBeforeTry","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LockNotBeforeTry)

<a id="errorprone-lockonboxedprimitive"></a>

### `errorprone/LockOnBoxedPrimitive`

Lock on boxed primitive.

- **Exception:** If this is intended, add `{"rule":"errorprone/LockOnBoxedPrimitive","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LockOnBoxedPrimitive)

<a id="errorprone-lockonnonenclosingclassliteral"></a>

### `errorprone/LockOnNonEnclosingClassLiteral`

Lock on non enclosing class literal.

- **Exception:** If this is intended, add `{"rule":"errorprone/LockOnNonEnclosingClassLiteral","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LockOnNonEnclosingClassLiteral)

<a id="errorprone-logicalassignment"></a>

### `errorprone/LogicalAssignment`

Logical assignment.

- **Exception:** If this is intended, add `{"rule":"errorprone/LogicalAssignment","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LogicalAssignment)

<a id="errorprone-longdoubleconversion"></a>

### `errorprone/LongDoubleConversion`

Long double conversion.

- **Exception:** If this is intended, add `{"rule":"errorprone/LongDoubleConversion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LongDoubleConversion)

<a id="errorprone-longfloatconversion"></a>

### `errorprone/LongFloatConversion`

Long float conversion.

- **Exception:** If this is intended, add `{"rule":"errorprone/LongFloatConversion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LongFloatConversion)

<a id="errorprone-longliterallowercasesuffix"></a>

### `errorprone/LongLiteralLowerCaseSuffix`

Long literal lower case suffix.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/LongLiteralLowerCaseSuffix","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LongLiteralLowerCaseSuffix)

<a id="errorprone-loopconditionchecker"></a>

### `errorprone/LoopConditionChecker`

Loop condition checker.

- **Exception:** If this is intended, add `{"rule":"errorprone/LoopConditionChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LoopConditionChecker)

<a id="errorprone-loopoverchararray"></a>

### `errorprone/LoopOverCharArray`

Loop over char array.

- **Exception:** If this is intended, add `{"rule":"errorprone/LoopOverCharArray","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LoopOverCharArray)

<a id="errorprone-lossyprimitivecompare"></a>

### `errorprone/LossyPrimitiveCompare`

Lossy primitive compare.

- **Exception:** If this is intended, add `{"rule":"errorprone/LossyPrimitiveCompare","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/LossyPrimitiveCompare)

<a id="errorprone-malformedinlinetag"></a>

### `errorprone/MalformedInlineTag`

Malformed inline tag.

- **Exception:** If this is intended, add `{"rule":"errorprone/MalformedInlineTag","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MalformedInlineTag)

<a id="errorprone-mathabsolutenegative"></a>

### `errorprone/MathAbsoluteNegative`

Math absolute negative.

- **Exception:** If this is intended, add `{"rule":"errorprone/MathAbsoluteNegative","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MathAbsoluteNegative)

<a id="errorprone-mathroundintlong"></a>

### `errorprone/MathRoundIntLong`

Math round int long.

- **Exception:** If this is intended, add `{"rule":"errorprone/MathRoundIntLong","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MathRoundIntLong)

<a id="errorprone-memoizeconstantvisitorstatelookups"></a>

### `errorprone/MemoizeConstantVisitorStateLookups`

Memoize constant visitor state lookups.

- **Exception:** If this is intended, add `{"rule":"errorprone/MemoizeConstantVisitorStateLookups","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MemoizeConstantVisitorStateLookups)

<a id="errorprone-memorysegmentreferenceequality"></a>

### `errorprone/MemorySegmentReferenceEquality`

Memory segment reference equality.

- **Exception:** If this is intended, add `{"rule":"errorprone/MemorySegmentReferenceEquality","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MemorySegmentReferenceEquality)

<a id="errorprone-misformattedtestdata"></a>

### `errorprone/MisformattedTestData`

Misformatted test data.

- **Exception:** If this is intended, add `{"rule":"errorprone/MisformattedTestData","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MisformattedTestData)

<a id="errorprone-mislabeledandroidstring"></a>

### `errorprone/MislabeledAndroidString`

Mislabeled android string.

- **Exception:** If this is intended, add `{"rule":"errorprone/MislabeledAndroidString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MislabeledAndroidString)

<a id="errorprone-misleadingemptyvarargs"></a>

### `errorprone/MisleadingEmptyVarargs`

Misleading empty varargs.

- **Exception:** If this is intended, add `{"rule":"errorprone/MisleadingEmptyVarargs","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MisleadingEmptyVarargs)

<a id="errorprone-misleadingescapedspace"></a>

### `errorprone/MisleadingEscapedSpace`

Misleading escaped space.

- **Exception:** If this is intended, add `{"rule":"errorprone/MisleadingEscapedSpace","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MisleadingEscapedSpace)

<a id="errorprone-misplacedscopeannotations"></a>

### `errorprone/MisplacedScopeAnnotations`

Misplaced scope annotations.

- **Exception:** If this is intended, add `{"rule":"errorprone/MisplacedScopeAnnotations","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MisplacedScopeAnnotations)

<a id="errorprone-missingbraces"></a>

### `errorprone/MissingBraces`

Missing braces.

- **Scope:** Off in a project that uses Lombok.
- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/MissingBraces","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingBraces)

<a id="errorprone-missingcasesinenumswitch"></a>

### `errorprone/MissingCasesInEnumSwitch`

Missing cases in enum switch.

- **Exception:** If this is intended, add `{"rule":"errorprone/MissingCasesInEnumSwitch","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingCasesInEnumSwitch)

<a id="errorprone-missingdefault"></a>

### `errorprone/MissingDefault`

Missing default.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/MissingDefault","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingDefault)

<a id="errorprone-missingfail"></a>

### `errorprone/MissingFail`

Missing fail.

- **Exception:** If this is intended, add `{"rule":"errorprone/MissingFail","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingFail)

<a id="errorprone-missingimplementscomparable"></a>

### `errorprone/MissingImplementsComparable`

Missing implements comparable.

- **Exception:** If this is intended, add `{"rule":"errorprone/MissingImplementsComparable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingImplementsComparable)

<a id="errorprone-missingoverride"></a>

### `errorprone/MissingOverride`

Missing override.

- **Exception:** If this is intended, add `{"rule":"errorprone/MissingOverride","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingOverride)

<a id="errorprone-missingrefasterannotation"></a>

### `errorprone/MissingRefasterAnnotation`

Missing refaster annotation.

- **Exception:** If this is intended, add `{"rule":"errorprone/MissingRefasterAnnotation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingRefasterAnnotation)

<a id="errorprone-missingruntimeretention"></a>

### `errorprone/MissingRuntimeRetention`

Missing runtime retention.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/MissingRuntimeRetention","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingRuntimeRetention)

<a id="errorprone-missingsummary"></a>

### `errorprone/MissingSummary`

Missing summary.

- **Scope:** Off in a project that uses Lombok.
- **Exception:** If this is intended, add `{"rule":"errorprone/MissingSummary","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingSummary)

<a id="errorprone-missingsupercall"></a>

### `errorprone/MissingSuperCall`

Missing super call.

- **Exception:** If this is intended, add `{"rule":"errorprone/MissingSuperCall","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingSuperCall)

<a id="errorprone-missingtestcall"></a>

### `errorprone/MissingTestCall`

Missing test call.

- **Exception:** If this is intended, add `{"rule":"errorprone/MissingTestCall","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingTestCall)

<a id="errorprone-misuseddayofyear"></a>

### `errorprone/MisusedDayOfYear`

Misused day of year.

- **Exception:** If this is intended, add `{"rule":"errorprone/MisusedDayOfYear","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MisusedDayOfYear)

<a id="errorprone-misusedweekyear"></a>

### `errorprone/MisusedWeekYear`

Misused week year.

- **Exception:** If this is intended, add `{"rule":"errorprone/MisusedWeekYear","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MisusedWeekYear)

<a id="errorprone-mixedarraydimensions"></a>

### `errorprone/MixedArrayDimensions`

Mixed array dimensions.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/MixedArrayDimensions","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MixedArrayDimensions)

<a id="errorprone-mixeddescriptors"></a>

### `errorprone/MixedDescriptors`

Mixed descriptors.

- **Exception:** If this is intended, add `{"rule":"errorprone/MixedDescriptors","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MixedDescriptors)

<a id="errorprone-mixedmutabilityreturntype"></a>

### `errorprone/MixedMutabilityReturnType`

Mixed mutability return type.

- **Exception:** If this is intended, add `{"rule":"errorprone/MixedMutabilityReturnType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MixedMutabilityReturnType)

<a id="errorprone-mockillegalthrows"></a>

### `errorprone/MockIllegalThrows`

Mock illegal throws.

- **Exception:** If this is intended, add `{"rule":"errorprone/MockIllegalThrows","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MockIllegalThrows)

<a id="errorprone-mockitodosetup"></a>

### `errorprone/MockitoDoSetup`

Mockito do setup.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/MockitoDoSetup","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MockitoDoSetup)

<a id="errorprone-mockitousage"></a>

### `errorprone/MockitoUsage`

Mockito usage.

- **Exception:** If this is intended, add `{"rule":"errorprone/MockitoUsage","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MockitoUsage)

<a id="errorprone-mocknotusedinproduction"></a>

### `errorprone/MockNotUsedInProduction`

Mock not used in production.

- **Exception:** If this is intended, add `{"rule":"errorprone/MockNotUsedInProduction","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MockNotUsedInProduction)

<a id="errorprone-modifiedbutnotused"></a>

### `errorprone/ModifiedButNotUsed`

Modified but not used.

- **Exception:** If this is intended, add `{"rule":"errorprone/ModifiedButNotUsed","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ModifiedButNotUsed)

<a id="errorprone-modifycollectioninenhancedforloop"></a>

### `errorprone/ModifyCollectionInEnhancedForLoop`

Modify collection in enhanced for loop.

- **Exception:** If this is intended, add `{"rule":"errorprone/ModifyCollectionInEnhancedForLoop","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ModifyCollectionInEnhancedForLoop)

<a id="errorprone-modifyingcollectionwithitself"></a>

### `errorprone/ModifyingCollectionWithItself`

Modifying collection with itself.

- **Exception:** If this is intended, add `{"rule":"errorprone/ModifyingCollectionWithItself","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ModifyingCollectionWithItself)

<a id="errorprone-modifysourcecollectioninstream"></a>

### `errorprone/ModifySourceCollectionInStream`

Modify source collection in stream.

- **Exception:** If this is intended, add `{"rule":"errorprone/ModifySourceCollectionInStream","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ModifySourceCollectionInStream)

<a id="errorprone-morethanoneinjectableconstructor"></a>

### `errorprone/MoreThanOneInjectableConstructor`

More than one injectable constructor.

- **Exception:** If this is intended, add `{"rule":"errorprone/MoreThanOneInjectableConstructor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MoreThanOneInjectableConstructor)

<a id="errorprone-morethanonequalifier"></a>

### `errorprone/MoreThanOneQualifier`

More than one qualifier.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/MoreThanOneQualifier","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MoreThanOneQualifier)

<a id="errorprone-multimapkeys"></a>

### `errorprone/MultimapKeys`

Multimap keys.

- **Exception:** If this is intended, add `{"rule":"errorprone/MultimapKeys","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MultimapKeys)

<a id="errorprone-multiplenullnessannotations"></a>

### `errorprone/MultipleNullnessAnnotations`

Multiple nullness annotations.

- **Exception:** If this is intended, add `{"rule":"errorprone/MultipleNullnessAnnotations","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MultipleNullnessAnnotations)

<a id="errorprone-multipleparallelorsequentialcalls"></a>

### `errorprone/MultipleParallelOrSequentialCalls`

Multiple parallel or sequential calls.

- **Exception:** If this is intended, add `{"rule":"errorprone/MultipleParallelOrSequentialCalls","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MultipleParallelOrSequentialCalls)

<a id="errorprone-multipletoplevelclasses"></a>

### `errorprone/MultipleTopLevelClasses`

Multiple top level classes.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/MultipleTopLevelClasses","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MultipleTopLevelClasses)

<a id="errorprone-multipleunaryoperatorsinmethodcall"></a>

### `errorprone/MultipleUnaryOperatorsInMethodCall`

Multiple unary operators in method call.

- **Exception:** If this is intended, add `{"rule":"errorprone/MultipleUnaryOperatorsInMethodCall","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MultipleUnaryOperatorsInMethodCall)

<a id="errorprone-multivariabledeclaration"></a>

### `errorprone/MultiVariableDeclaration`

Multi variable declaration.

- **Scope:** Off in a project that uses Lombok.
- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/MultiVariableDeclaration","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MultiVariableDeclaration)

<a id="errorprone-mustbeclosedchecker"></a>

### `errorprone/MustBeClosedChecker`

Must be closed checker.

- **Exception:** If this is intended, add `{"rule":"errorprone/MustBeClosedChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MustBeClosedChecker)

<a id="errorprone-mutableguicemodule"></a>

### `errorprone/MutableGuiceModule`

Mutable guice module.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/MutableGuiceModule","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MutableGuiceModule)

<a id="errorprone-mutablepublicarray"></a>

### `errorprone/MutablePublicArray`

Mutable public array.

- **Exception:** If this is intended, add `{"rule":"errorprone/MutablePublicArray","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MutablePublicArray)

<a id="errorprone-namedlikecontextualkeyword"></a>

### `errorprone/NamedLikeContextualKeyword`

Named like contextual keyword.

- **Exception:** If this is intended, add `{"rule":"errorprone/NamedLikeContextualKeyword","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NamedLikeContextualKeyword)

<a id="errorprone-narrowcalculation"></a>

### `errorprone/NarrowCalculation`

Narrow calculation.

- **Exception:** If this is intended, add `{"rule":"errorprone/NarrowCalculation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NarrowCalculation)

<a id="errorprone-narrowingcompoundassignment"></a>

### `errorprone/NarrowingCompoundAssignment`

Narrowing compound assignment.

- **Exception:** If this is intended, add `{"rule":"errorprone/NarrowingCompoundAssignment","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NarrowingCompoundAssignment)

<a id="errorprone-ncopiesofchar"></a>

### `errorprone/NCopiesOfChar`

N copies of char.

- **Exception:** If this is intended, add `{"rule":"errorprone/NCopiesOfChar","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NCopiesOfChar)

<a id="errorprone-negativeboolean"></a>

### `errorprone/NegativeBoolean`

Negative boolean.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/NegativeBoolean","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NegativeBoolean)

<a id="errorprone-negativecharliteral"></a>

### `errorprone/NegativeCharLiteral`

Negative char literal.

- **Exception:** If this is intended, add `{"rule":"errorprone/NegativeCharLiteral","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NegativeCharLiteral)

<a id="errorprone-nestedinstanceofconditions"></a>

### `errorprone/NestedInstanceOfConditions`

Nested instance of conditions.

- **Exception:** If this is intended, add `{"rule":"errorprone/NestedInstanceOfConditions","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NestedInstanceOfConditions)

<a id="errorprone-newfilesystem"></a>

### `errorprone/NewFileSystem`

New file system.

- **Exception:** If this is intended, add `{"rule":"errorprone/NewFileSystem","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NewFileSystem)

<a id="errorprone-noallocation"></a>

### `errorprone/NoAllocation`

No allocation.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/NoAllocation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NoAllocation)

<a id="errorprone-nocanignorereturnvalueonclasses"></a>

### `errorprone/NoCanIgnoreReturnValueOnClasses`

No can ignore return value on classes.

- **Exception:** If this is intended, add `{"rule":"errorprone/NoCanIgnoreReturnValueOnClasses","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NoCanIgnoreReturnValueOnClasses)

<a id="errorprone-nonatomicvolatileupdate"></a>

### `errorprone/NonAtomicVolatileUpdate`

Non atomic volatile update.

- **Exception:** If this is intended, add `{"rule":"errorprone/NonAtomicVolatileUpdate","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NonAtomicVolatileUpdate)

<a id="errorprone-noncanonicalstaticimport"></a>

### `errorprone/NonCanonicalStaticImport`

Non canonical static import.

- **Exception:** If this is intended, add `{"rule":"errorprone/NonCanonicalStaticImport","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NonCanonicalStaticImport)

<a id="errorprone-noncanonicalstaticmemberimport"></a>

### `errorprone/NonCanonicalStaticMemberImport`

Non canonical static member import.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/NonCanonicalStaticMemberImport","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NonCanonicalStaticMemberImport)

<a id="errorprone-noncanonicaltype"></a>

### `errorprone/NonCanonicalType`

Non canonical type.

- **Exception:** If this is intended, add `{"rule":"errorprone/NonCanonicalType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NonCanonicalType)

<a id="errorprone-nonfinalcompiletimeconstant"></a>

### `errorprone/NonFinalCompileTimeConstant`

Non final compile time constant.

- **Exception:** If this is intended, add `{"rule":"errorprone/NonFinalCompileTimeConstant","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NonFinalCompileTimeConstant)

<a id="errorprone-nonfinalstaticfield"></a>

### `errorprone/NonFinalStaticField`

Non final static field.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/NonFinalStaticField","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NonFinalStaticField)

<a id="errorprone-nonoverridingequals"></a>

### `errorprone/NonOverridingEquals`

Non overriding equals.

- **Exception:** If this is intended, add `{"rule":"errorprone/NonOverridingEquals","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NonOverridingEquals)

<a id="errorprone-nonruntimeannotation"></a>

### `errorprone/NonRuntimeAnnotation`

Non runtime annotation.

- **Exception:** If this is intended, add `{"rule":"errorprone/NonRuntimeAnnotation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NonRuntimeAnnotation)

<a id="errorprone-notjavadoc"></a>

### `errorprone/NotJavadoc`

Not javadoc.

- **Exception:** If this is intended, add `{"rule":"errorprone/NotJavadoc","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NotJavadoc)

<a id="errorprone-nullableconstructor"></a>

### `errorprone/NullableConstructor`

Nullable constructor.

- **Exception:** If this is intended, add `{"rule":"errorprone/NullableConstructor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NullableConstructor)

<a id="errorprone-nullableoncontainingclass"></a>

### `errorprone/NullableOnContainingClass`

Nullable on containing class.

- **Exception:** If this is intended, add `{"rule":"errorprone/NullableOnContainingClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NullableOnContainingClass)

<a id="errorprone-nullableoptional"></a>

### `errorprone/NullableOptional`

Nullable optional.

- **Exception:** If this is intended, add `{"rule":"errorprone/NullableOptional","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NullableOptional)

<a id="errorprone-nullableprimitive"></a>

### `errorprone/NullablePrimitive`

Nullable primitive.

- **Exception:** If this is intended, add `{"rule":"errorprone/NullablePrimitive","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NullablePrimitive)

<a id="errorprone-nullableprimitivearray"></a>

### `errorprone/NullablePrimitiveArray`

Nullable primitive array.

- **Exception:** If this is intended, add `{"rule":"errorprone/NullablePrimitiveArray","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NullablePrimitiveArray)

<a id="errorprone-nullabletypeparameter"></a>

### `errorprone/NullableTypeParameter`

Nullable type parameter.

- **Exception:** If this is intended, add `{"rule":"errorprone/NullableTypeParameter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NullableTypeParameter)

<a id="errorprone-nullablevoid"></a>

### `errorprone/NullableVoid`

Nullable void.

- **Exception:** If this is intended, add `{"rule":"errorprone/NullableVoid","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NullableVoid)

<a id="errorprone-nullablewildcard"></a>

### `errorprone/NullableWildcard`

Nullable wildcard.

- **Exception:** If this is intended, add `{"rule":"errorprone/NullableWildcard","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NullableWildcard)

<a id="errorprone-nullargumentfornonnullparameter"></a>

### `errorprone/NullArgumentForNonNullParameter`

Null argument for non null parameter.

- **Exception:** If this is intended, add `{"rule":"errorprone/NullArgumentForNonNullParameter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NullArgumentForNonNullParameter)

<a id="errorprone-nullaway"></a>

### `errorprone/NullAway`

Null safety.

- **Scope:** Main sources only; off in a project without main classes in a named package.
- **Why it is on:** NullAway is an Error Prone plugin: the main packages of the project are non-null unless marked, so a null that reaches a place that does not allow it is a finding.
- **Allowed form:** Annotate a field, parameter or return value that may be null with the @Nullable the project already uses (JSpecify's org.jspecify.annotations.Nullable when it uses none) and check it before use, or give a non-null value.
- **Exception:** If this is intended, add `{"rule":"errorprone/NullAway","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [NullAway](https://github.com/uber/NullAway)

<a id="errorprone-nullneedscastforvarargs"></a>

### `errorprone/NullNeedsCastForVarargs`

Null needs cast for varargs.

- **Exception:** If this is intended, add `{"rule":"errorprone/NullNeedsCastForVarargs","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NullNeedsCastForVarargs)

<a id="errorprone-nulloptional"></a>

### `errorprone/NullOptional`

Null optional.

- **Exception:** If this is intended, add `{"rule":"errorprone/NullOptional","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NullOptional)

<a id="errorprone-nullternary"></a>

### `errorprone/NullTernary`

Null ternary.

- **Exception:** If this is intended, add `{"rule":"errorprone/NullTernary","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NullTernary)

<a id="errorprone-objectequalsforprimitives"></a>

### `errorprone/ObjectEqualsForPrimitives`

Object equals for primitives.

- **Exception:** If this is intended, add `{"rule":"errorprone/ObjectEqualsForPrimitives","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ObjectEqualsForPrimitives)

<a id="errorprone-objectshashcodeprimitive"></a>

### `errorprone/ObjectsHashCodePrimitive`

Objects hash code primitive.

- **Exception:** If this is intended, add `{"rule":"errorprone/ObjectsHashCodePrimitive","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ObjectsHashCodePrimitive)

<a id="errorprone-objecttostring"></a>

### `errorprone/ObjectToString`

Object to string.

- **Exception:** If this is intended, add `{"rule":"errorprone/ObjectToString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ObjectToString)

<a id="errorprone-operatorprecedence"></a>

### `errorprone/OperatorPrecedence`

Operator precedence.

- **Exception:** If this is intended, add `{"rule":"errorprone/OperatorPrecedence","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OperatorPrecedence)

<a id="errorprone-optionalequality"></a>

### `errorprone/OptionalEquality`

Optional equality.

- **Exception:** If this is intended, add `{"rule":"errorprone/OptionalEquality","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OptionalEquality)

<a id="errorprone-optionalmaptooptional"></a>

### `errorprone/OptionalMapToOptional`

Optional map to optional.

- **Exception:** If this is intended, add `{"rule":"errorprone/OptionalMapToOptional","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OptionalMapToOptional)

<a id="errorprone-optionalmapunusedvalue"></a>

### `errorprone/OptionalMapUnusedValue`

Optional map unused value.

- **Exception:** If this is intended, add `{"rule":"errorprone/OptionalMapUnusedValue","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OptionalMapUnusedValue)

<a id="errorprone-optionalnotpresent"></a>

### `errorprone/OptionalNotPresent`

Optional not present.

- **Exception:** If this is intended, add `{"rule":"errorprone/OptionalNotPresent","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OptionalNotPresent)

<a id="errorprone-optionalofredundantmethod"></a>

### `errorprone/OptionalOfRedundantMethod`

Optional of redundant method.

- **Exception:** If this is intended, add `{"rule":"errorprone/OptionalOfRedundantMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OptionalOfRedundantMethod)

<a id="errorprone-orphanedformatstring"></a>

### `errorprone/OrphanedFormatString`

Orphaned format string.

- **Exception:** If this is intended, add `{"rule":"errorprone/OrphanedFormatString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OrphanedFormatString)

<a id="errorprone-outlinenone"></a>

### `errorprone/OutlineNone`

Outline none.

- **Exception:** If this is intended, add `{"rule":"errorprone/OutlineNone","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OutlineNone)

<a id="errorprone-overlappingqualifierandscopeannotation"></a>

### `errorprone/OverlappingQualifierAndScopeAnnotation`

Overlapping qualifier and scope annotation.

- **Exception:** If this is intended, add `{"rule":"errorprone/OverlappingQualifierAndScopeAnnotation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OverlappingQualifierAndScopeAnnotation)

<a id="errorprone-overrides"></a>

### `errorprone/Overrides`

Overrides.

- **Exception:** If this is intended, add `{"rule":"errorprone/Overrides","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/Overrides)

<a id="errorprone-overridesguiceinjectablemethod"></a>

### `errorprone/OverridesGuiceInjectableMethod`

Overrides guice injectable method.

- **Exception:** If this is intended, add `{"rule":"errorprone/OverridesGuiceInjectableMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OverridesGuiceInjectableMethod)

<a id="errorprone-overridesjavaxinjectablemethod"></a>

### `errorprone/OverridesJavaxInjectableMethod`

Overrides javax injectable method.

- **Exception:** If this is intended, add `{"rule":"errorprone/OverridesJavaxInjectableMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OverridesJavaxInjectableMethod)

<a id="errorprone-overridethrowabletostring"></a>

### `errorprone/OverrideThrowableToString`

Override throwable to string.

- **Exception:** If this is intended, add `{"rule":"errorprone/OverrideThrowableToString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OverrideThrowableToString)

<a id="errorprone-overridingmethodinconsistentargumentnameschecker"></a>

### `errorprone/OverridingMethodInconsistentArgumentNamesChecker`

Overriding method inconsistent argument names checker.

- **Exception:** If this is intended, add `{"rule":"errorprone/OverridingMethodInconsistentArgumentNamesChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OverridingMethodInconsistentArgumentNamesChecker)

<a id="errorprone-packageinfo"></a>

### `errorprone/PackageInfo`

Package info.

- **Exception:** If this is intended, add `{"rule":"errorprone/PackageInfo","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PackageInfo)

<a id="errorprone-packagelocation"></a>

### `errorprone/PackageLocation`

Package location.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/PackageLocation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PackageLocation)

<a id="errorprone-parametercomment"></a>

### `errorprone/ParameterComment`

Parameter comment.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/ParameterComment","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ParameterComment)

<a id="errorprone-parametername"></a>

### `errorprone/ParameterName`

Parameter name.

- **Exception:** If this is intended, add `{"rule":"errorprone/ParameterName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ParameterName)

<a id="errorprone-parametersbutnotparameterized"></a>

### `errorprone/ParametersButNotParameterized`

Parameters but not parameterized.

- **Exception:** If this is intended, add `{"rule":"errorprone/ParametersButNotParameterized","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ParametersButNotParameterized)

<a id="errorprone-parcelablecreator"></a>

### `errorprone/ParcelableCreator`

Parcelable creator.

- **Exception:** If this is intended, add `{"rule":"errorprone/ParcelableCreator","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ParcelableCreator)

<a id="errorprone-patternmatchinginstanceof"></a>

### `errorprone/PatternMatchingInstanceof`

Pattern matching instanceof.

- **Exception:** If this is intended, add `{"rule":"errorprone/PatternMatchingInstanceof","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PatternMatchingInstanceof)

<a id="errorprone-periodfrom"></a>

### `errorprone/PeriodFrom`

Period from.

- **Exception:** If this is intended, add `{"rule":"errorprone/PeriodFrom","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PeriodFrom)

<a id="errorprone-periodgettemporalunit"></a>

### `errorprone/PeriodGetTemporalUnit`

Period get temporal unit.

- **Exception:** If this is intended, add `{"rule":"errorprone/PeriodGetTemporalUnit","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PeriodGetTemporalUnit)

<a id="errorprone-periodtimemath"></a>

### `errorprone/PeriodTimeMath`

Period time math.

- **Exception:** If this is intended, add `{"rule":"errorprone/PeriodTimeMath","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PeriodTimeMath)

<a id="errorprone-preconditionschecknotnullrepeated"></a>

### `errorprone/PreconditionsCheckNotNullRepeated`

Preconditions check not null repeated.

- **Exception:** If this is intended, add `{"rule":"errorprone/PreconditionsCheckNotNullRepeated","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PreconditionsCheckNotNullRepeated)

<a id="errorprone-preconditionsinvalidplaceholder"></a>

### `errorprone/PreconditionsInvalidPlaceholder`

Preconditions invalid placeholder.

- **Exception:** If this is intended, add `{"rule":"errorprone/PreconditionsInvalidPlaceholder","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PreconditionsInvalidPlaceholder)

<a id="errorprone-preferinstanceofovergetkind"></a>

### `errorprone/PreferInstanceofOverGetKind`

Prefer instanceof over get kind.

- **Exception:** If this is intended, add `{"rule":"errorprone/PreferInstanceofOverGetKind","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PreferInstanceofOverGetKind)

<a id="errorprone-preferjavatimeoverload"></a>

### `errorprone/PreferJavaTimeOverload`

Prefer java time overload.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/PreferJavaTimeOverload","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PreferJavaTimeOverload)

<a id="errorprone-prefertestparameter"></a>

### `errorprone/PreferTestParameter`

Prefer test parameter.

- **Exception:** If this is intended, add `{"rule":"errorprone/PreferTestParameter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PreferTestParameter)

<a id="errorprone-preferthrowstag"></a>

### `errorprone/PreferThrowsTag`

Prefer throws tag.

- **Exception:** If this is intended, add `{"rule":"errorprone/PreferThrowsTag","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PreferThrowsTag)

<a id="errorprone-primitivearraypassedtovarargsmethod"></a>

### `errorprone/PrimitiveArrayPassedToVarargsMethod`

Primitive array passed to varargs method.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/PrimitiveArrayPassedToVarargsMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PrimitiveArrayPassedToVarargsMethod)

<a id="errorprone-primitiveatomicreference"></a>

### `errorprone/PrimitiveAtomicReference`

Primitive atomic reference.

- **Exception:** If this is intended, add `{"rule":"errorprone/PrimitiveAtomicReference","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PrimitiveAtomicReference)

<a id="errorprone-privateconstructorfornoninstantiablemodule"></a>

### `errorprone/PrivateConstructorForNoninstantiableModule`

Private constructor for noninstantiable module.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/PrivateConstructorForNoninstantiableModule","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PrivateConstructorForNoninstantiableModule)

<a id="errorprone-privateconstructorforutilityclass"></a>

### `errorprone/PrivateConstructorForUtilityClass`

Private constructor for utility class.

- **Scope:** Not reported in classes annotated com.tngtech.archunit.junit.AnalyzeClasses, org.springframework.boot.SpringBootConfiguration, org.springframework.boot.autoconfigure.SpringBootApplication, org.springframework.context.annotation.Configuration.
- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/PrivateConstructorForUtilityClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PrivateConstructorForUtilityClass)

<a id="errorprone-privatesecuritycontractprotoaccess"></a>

### `errorprone/PrivateSecurityContractProtoAccess`

Private security contract proto access.

- **Exception:** If this is intended, add `{"rule":"errorprone/PrivateSecurityContractProtoAccess","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PrivateSecurityContractProtoAccess)

<a id="errorprone-protectedmembersinfinalclass"></a>

### `errorprone/ProtectedMembersInFinalClass`

Protected members in final class.

- **Exception:** If this is intended, add `{"rule":"errorprone/ProtectedMembersInFinalClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ProtectedMembersInFinalClass)

<a id="errorprone-protobuilderreturnvalueignored"></a>

### `errorprone/ProtoBuilderReturnValueIgnored`

Proto builder return value ignored.

- **Exception:** If this is intended, add `{"rule":"errorprone/ProtoBuilderReturnValueIgnored","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ProtoBuilderReturnValueIgnored)

<a id="errorprone-protocolbufferordinal"></a>

### `errorprone/ProtocolBufferOrdinal`

Protocol buffer ordinal.

- **Exception:** If this is intended, add `{"rule":"errorprone/ProtocolBufferOrdinal","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ProtocolBufferOrdinal)

<a id="errorprone-protodurationgetsecondsgetnano"></a>

### `errorprone/ProtoDurationGetSecondsGetNano`

Proto duration get seconds get nano.

- **Exception:** If this is intended, add `{"rule":"errorprone/ProtoDurationGetSecondsGetNano","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ProtoDurationGetSecondsGetNano)

<a id="errorprone-protostringfieldreferenceequality"></a>

### `errorprone/ProtoStringFieldReferenceEquality`

Proto string field reference equality.

- **Exception:** If this is intended, add `{"rule":"errorprone/ProtoStringFieldReferenceEquality","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ProtoStringFieldReferenceEquality)

<a id="errorprone-prototimestampgetsecondsgetnano"></a>

### `errorprone/ProtoTimestampGetSecondsGetNano`

Proto timestamp get seconds get nano.

- **Exception:** If this is intended, add `{"rule":"errorprone/ProtoTimestampGetSecondsGetNano","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ProtoTimestampGetSecondsGetNano)

<a id="errorprone-prototruthmixeddescriptors"></a>

### `errorprone/ProtoTruthMixedDescriptors`

Proto truth mixed descriptors.

- **Exception:** If this is intended, add `{"rule":"errorprone/ProtoTruthMixedDescriptors","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ProtoTruthMixedDescriptors)

<a id="errorprone-providesmethodoutsideofmodule"></a>

### `errorprone/ProvidesMethodOutsideOfModule`

Provides method outside of module.

- **Exception:** If this is intended, add `{"rule":"errorprone/ProvidesMethodOutsideOfModule","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ProvidesMethodOutsideOfModule)

<a id="errorprone-publicapinamedstreamshouldreturnstream"></a>

### `errorprone/PublicApiNamedStreamShouldReturnStream`

Public api named stream should return stream.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/PublicApiNamedStreamShouldReturnStream","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PublicApiNamedStreamShouldReturnStream)

<a id="errorprone-qualifierorscopeoninjectmethod"></a>

### `errorprone/QualifierOrScopeOnInjectMethod`

Qualifier or scope on inject method.

- **Exception:** If this is intended, add `{"rule":"errorprone/QualifierOrScopeOnInjectMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/QualifierOrScopeOnInjectMethod)

<a id="errorprone-qualifierwithtypeuse"></a>

### `errorprone/QualifierWithTypeUse`

Qualifier with type use.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/QualifierWithTypeUse","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/QualifierWithTypeUse)

<a id="errorprone-randomcast"></a>

### `errorprone/RandomCast`

Random cast.

- **Exception:** If this is intended, add `{"rule":"errorprone/RandomCast","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RandomCast)

<a id="errorprone-randommodinteger"></a>

### `errorprone/RandomModInteger`

Random mod integer.

- **Exception:** If this is intended, add `{"rule":"errorprone/RandomModInteger","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RandomModInteger)

<a id="errorprone-reachabilityfenceusage"></a>

### `errorprone/ReachabilityFenceUsage`

Reachability fence usage.

- **Exception:** If this is intended, add `{"rule":"errorprone/ReachabilityFenceUsage","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ReachabilityFenceUsage)

<a id="errorprone-recordaccessorincompactconstructor"></a>

### `errorprone/RecordAccessorInCompactConstructor`

Record accessor in compact constructor.

- **Exception:** If this is intended, add `{"rule":"errorprone/RecordAccessorInCompactConstructor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RecordAccessorInCompactConstructor)

<a id="errorprone-recordcomponentaccessorannotationconflict"></a>

### `errorprone/RecordComponentAccessorAnnotationConflict`

Record component accessor annotation conflict.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/RecordComponentAccessorAnnotationConflict","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RecordComponentAccessorAnnotationConflict)

<a id="errorprone-recordcomponentoverride"></a>

### `errorprone/RecordComponentOverride`

Record component override.

- **Exception:** If this is intended, add `{"rule":"errorprone/RecordComponentOverride","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RecordComponentOverride)

<a id="errorprone-rectintersectreturnvalueignored"></a>

### `errorprone/RectIntersectReturnValueIgnored`

Rect intersect return value ignored.

- **Exception:** If this is intended, add `{"rule":"errorprone/RectIntersectReturnValueIgnored","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RectIntersectReturnValueIgnored)

<a id="errorprone-redundantcontrolflow"></a>

### `errorprone/RedundantControlFlow`

Redundant control flow.

- **Exception:** If this is intended, add `{"rule":"errorprone/RedundantControlFlow","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RedundantControlFlow)

<a id="errorprone-redundantnullcheck"></a>

### `errorprone/RedundantNullCheck`

Redundant null check.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/RedundantNullCheck","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RedundantNullCheck)

<a id="errorprone-redundantoverride"></a>

### `errorprone/RedundantOverride`

Redundant override.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/RedundantOverride","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RedundantOverride)

<a id="errorprone-redundantsettercall"></a>

### `errorprone/RedundantSetterCall`

Redundant setter call.

- **Exception:** If this is intended, add `{"rule":"errorprone/RedundantSetterCall","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RedundantSetterCall)

<a id="errorprone-redundantthrows"></a>

### `errorprone/RedundantThrows`

Redundant throws.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/RedundantThrows","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RedundantThrows)

<a id="errorprone-refactorswitch"></a>

### `errorprone/RefactorSwitch`

Refactor switch.

- **Exception:** If this is intended, add `{"rule":"errorprone/RefactorSwitch","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RefactorSwitch)

<a id="errorprone-referenceequality"></a>

### `errorprone/ReferenceEquality`

Reference equality.

- **Exception:** If this is intended, add `{"rule":"errorprone/ReferenceEquality","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ReferenceEquality)

<a id="errorprone-referstodaggercodegen"></a>

### `errorprone/RefersToDaggerCodegen`

Refers to dagger codegen.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/RefersToDaggerCodegen","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RefersToDaggerCodegen)

<a id="errorprone-requiredmodifiers"></a>

### `errorprone/RequiredModifiers`

Required modifiers.

- **Exception:** If this is intended, add `{"rule":"errorprone/RequiredModifiers","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RequiredModifiers)

<a id="errorprone-restrictedapi"></a>

### `errorprone/RestrictedApi`

Restricted api.

- **Exception:** If this is intended, add `{"rule":"errorprone/RestrictedApi","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RestrictedApi)

<a id="errorprone-rethrowreflectiveoperationexceptionaslinkageerror"></a>

### `errorprone/RethrowReflectiveOperationExceptionAsLinkageError`

Rethrow reflective operation exception as linkage error.

- **Exception:** If this is intended, add `{"rule":"errorprone/RethrowReflectiveOperationExceptionAsLinkageError","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RethrowReflectiveOperationExceptionAsLinkageError)

<a id="errorprone-returnattheendofvoidfunction"></a>

### `errorprone/ReturnAtTheEndOfVoidFunction`

Return at the end of void function.

- **Exception:** If this is intended, add `{"rule":"errorprone/ReturnAtTheEndOfVoidFunction","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ReturnAtTheEndOfVoidFunction)

<a id="errorprone-returnfromvoid"></a>

### `errorprone/ReturnFromVoid`

Return from void.

- **Exception:** If this is intended, add `{"rule":"errorprone/ReturnFromVoid","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ReturnFromVoid)

<a id="errorprone-returnsnullcollection"></a>

### `errorprone/ReturnsNullCollection`

Returns null collection.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/ReturnsNullCollection","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ReturnsNullCollection)

<a id="errorprone-returnvalueignored"></a>

### `errorprone/ReturnValueIgnored`

Return value ignored.

- **Exception:** If this is intended, add `{"rule":"errorprone/ReturnValueIgnored","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ReturnValueIgnored)

<a id="errorprone-robolectricshadowdirectlyon"></a>

### `errorprone/RobolectricShadowDirectlyOn`

Robolectric shadow directly on.

- **Exception:** If this is intended, add `{"rule":"errorprone/RobolectricShadowDirectlyOn","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RobolectricShadowDirectlyOn)

<a id="errorprone-rulenotrun"></a>

### `errorprone/RuleNotRun`

Rule not run.

- **Exception:** If this is intended, add `{"rule":"errorprone/RuleNotRun","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RuleNotRun)

<a id="errorprone-rxreturnvalueignored"></a>

### `errorprone/RxReturnValueIgnored`

Rx return value ignored.

- **Exception:** If this is intended, add `{"rule":"errorprone/RxReturnValueIgnored","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RxReturnValueIgnored)

<a id="errorprone-samenamebutdifferent"></a>

### `errorprone/SameNameButDifferent`

Same name but different.

- **Exception:** If this is intended, add `{"rule":"errorprone/SameNameButDifferent","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SameNameButDifferent)

<a id="errorprone-scannerusedelimiter"></a>

### `errorprone/ScannerUseDelimiter`

Scanner use delimiter.

- **Exception:** If this is intended, add `{"rule":"errorprone/ScannerUseDelimiter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ScannerUseDelimiter)

<a id="errorprone-scopeonmodule"></a>

### `errorprone/ScopeOnModule`

Scope on module.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/ScopeOnModule","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ScopeOnModule)

<a id="errorprone-selfalwaysreturnsthis"></a>

### `errorprone/SelfAlwaysReturnsThis`

Self always returns this.

- **Exception:** If this is intended, add `{"rule":"errorprone/SelfAlwaysReturnsThis","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SelfAlwaysReturnsThis)

<a id="errorprone-selfassertion"></a>

### `errorprone/SelfAssertion`

Self assertion.

- **Exception:** If this is intended, add `{"rule":"errorprone/SelfAssertion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SelfAssertion)

<a id="errorprone-selfassignment"></a>

### `errorprone/SelfAssignment`

Self assignment.

- **Exception:** If this is intended, add `{"rule":"errorprone/SelfAssignment","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SelfAssignment)

<a id="errorprone-selfcomparison"></a>

### `errorprone/SelfComparison`

Self comparison.

- **Exception:** If this is intended, add `{"rule":"errorprone/SelfComparison","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SelfComparison)

<a id="errorprone-selfequals"></a>

### `errorprone/SelfEquals`

Self equals.

- **Exception:** If this is intended, add `{"rule":"errorprone/SelfEquals","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SelfEquals)

<a id="errorprone-selfset"></a>

### `errorprone/SelfSet`

Self set.

- **Exception:** If this is intended, add `{"rule":"errorprone/SelfSet","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SelfSet)

<a id="errorprone-setunrecognized"></a>

### `errorprone/SetUnrecognized`

Set unrecognized.

- **Exception:** If this is intended, add `{"rule":"errorprone/SetUnrecognized","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SetUnrecognized)

<a id="errorprone-shortcircuitboolean"></a>

### `errorprone/ShortCircuitBoolean`

Short circuit boolean.

- **Exception:** If this is intended, add `{"rule":"errorprone/ShortCircuitBoolean","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ShortCircuitBoolean)

<a id="errorprone-shouldhaveevenargs"></a>

### `errorprone/ShouldHaveEvenArgs`

Should have even args.

- **Exception:** If this is intended, add `{"rule":"errorprone/ShouldHaveEvenArgs","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ShouldHaveEvenArgs)

<a id="errorprone-sizegreaterthanorequalszero"></a>

### `errorprone/SizeGreaterThanOrEqualsZero`

Size greater than or equals zero.

- **Exception:** If this is intended, add `{"rule":"errorprone/SizeGreaterThanOrEqualsZero","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SizeGreaterThanOrEqualsZero)

<a id="errorprone-statementswitchtoexpressionswitch"></a>

### `errorprone/StatementSwitchToExpressionSwitch`

Statement switch to expression switch.

- **Scope:** Off in a project that uses Lombok.
- **Exception:** If this is intended, add `{"rule":"errorprone/StatementSwitchToExpressionSwitch","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StatementSwitchToExpressionSwitch)

<a id="errorprone-staticassignmentinconstructor"></a>

### `errorprone/StaticAssignmentInConstructor`

Static assignment in constructor.

- **Exception:** If this is intended, add `{"rule":"errorprone/StaticAssignmentInConstructor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StaticAssignmentInConstructor)

<a id="errorprone-staticassignmentofthrowable"></a>

### `errorprone/StaticAssignmentOfThrowable`

Static assignment of throwable.

- **Exception:** If this is intended, add `{"rule":"errorprone/StaticAssignmentOfThrowable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StaticAssignmentOfThrowable)

<a id="errorprone-staticguardedbyinstance"></a>

### `errorprone/StaticGuardedByInstance`

Static guarded by instance.

- **Exception:** If this is intended, add `{"rule":"errorprone/StaticGuardedByInstance","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StaticGuardedByInstance)

<a id="errorprone-staticmockmember"></a>

### `errorprone/StaticMockMember`

Static mock member.

- **Exception:** If this is intended, add `{"rule":"errorprone/StaticMockMember","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StaticMockMember)

<a id="errorprone-staticqualifiedusingexpression"></a>

### `errorprone/StaticQualifiedUsingExpression`

Static qualified using expression.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/StaticQualifiedUsingExpression","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StaticQualifiedUsingExpression)

<a id="errorprone-streamresourceleak"></a>

### `errorprone/StreamResourceLeak`

Stream resource leak.

- **Exception:** If this is intended, add `{"rule":"errorprone/StreamResourceLeak","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StreamResourceLeak)

<a id="errorprone-streamtoiterable"></a>

### `errorprone/StreamToIterable`

Stream to iterable.

- **Exception:** If this is intended, add `{"rule":"errorprone/StreamToIterable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StreamToIterable)

<a id="errorprone-streamtostring"></a>

### `errorprone/StreamToString`

Stream to string.

- **Exception:** If this is intended, add `{"rule":"errorprone/StreamToString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StreamToString)

<a id="errorprone-stringbuilderinitwithchar"></a>

### `errorprone/StringBuilderInitWithChar`

String builder init with char.

- **Exception:** If this is intended, add `{"rule":"errorprone/StringBuilderInitWithChar","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StringBuilderInitWithChar)

<a id="errorprone-stringcaselocaleusage"></a>

### `errorprone/StringCaseLocaleUsage`

String case locale usage.

- **Exception:** If this is intended, add `{"rule":"errorprone/StringCaseLocaleUsage","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StringCaseLocaleUsage)

<a id="errorprone-stringcharset"></a>

### `errorprone/StringCharset`

String charset.

- **Exception:** If this is intended, add `{"rule":"errorprone/StringCharset","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StringCharset)

<a id="errorprone-stringconcattotextblock"></a>

### `errorprone/StringConcatToTextBlock`

String concat to text block.

- **Scope:** Off in a project that uses Lombok.
- **Exception:** If this is intended, add `{"rule":"errorprone/StringConcatToTextBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StringConcatToTextBlock)

<a id="errorprone-stringjoin"></a>

### `errorprone/StringJoin`

String join.

- **Exception:** If this is intended, add `{"rule":"errorprone/StringJoin","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StringJoin)

<a id="errorprone-stringsplitter"></a>

### `errorprone/StringSplitter`

String splitter.

- **Exception:** If this is intended, add `{"rule":"errorprone/StringSplitter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StringSplitter)

<a id="errorprone-stronglytypebytestring"></a>

### `errorprone/StronglyTypeByteString`

Strongly type byte string.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/StronglyTypeByteString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StronglyTypeByteString)

<a id="errorprone-stronglytypetime"></a>

### `errorprone/StronglyTypeTime`

Strongly type time.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/StronglyTypeTime","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StronglyTypeTime)

<a id="errorprone-substringofzero"></a>

### `errorprone/SubstringOfZero`

Substring of zero.

- **Exception:** If this is intended, add `{"rule":"errorprone/SubstringOfZero","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SubstringOfZero)

<a id="errorprone-sunapi"></a>

### `errorprone/SunApi`

Sun api.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/SunApi","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SunApi)

<a id="errorprone-supercalltoobjectmethod"></a>

### `errorprone/SuperCallToObjectMethod`

Super call to object method.

- **Exception:** If this is intended, add `{"rule":"errorprone/SuperCallToObjectMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SuperCallToObjectMethod)

<a id="errorprone-suppresswarningsdeprecated"></a>

### `errorprone/SuppressWarningsDeprecated`

Suppress warnings deprecated.

- **Exception:** If this is intended, add `{"rule":"errorprone/SuppressWarningsDeprecated","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SuppressWarningsDeprecated)

<a id="errorprone-suppresswarningswithoutexplanation"></a>

### `errorprone/SuppressWarningsWithoutExplanation`

Suppress warnings without explanation.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/SuppressWarningsWithoutExplanation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SuppressWarningsWithoutExplanation)

<a id="errorprone-swigmemoryleak"></a>

### `errorprone/SwigMemoryLeak`

Swig memory leak.

- **Exception:** If this is intended, add `{"rule":"errorprone/SwigMemoryLeak","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SwigMemoryLeak)

<a id="errorprone-switchdefault"></a>

### `errorprone/SwitchDefault`

Switch default.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/SwitchDefault","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SwitchDefault)

<a id="errorprone-symboltostring"></a>

### `errorprone/SymbolToString`

Symbol to string.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/SymbolToString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SymbolToString)

<a id="errorprone-synchronizeonnonfinalfield"></a>

### `errorprone/SynchronizeOnNonFinalField`

Synchronize on non final field.

- **Exception:** If this is intended, add `{"rule":"errorprone/SynchronizeOnNonFinalField","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SynchronizeOnNonFinalField)

<a id="errorprone-systemconsolenull"></a>

### `errorprone/SystemConsoleNull`

System console null.

- **Exception:** If this is intended, add `{"rule":"errorprone/SystemConsoleNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SystemConsoleNull)

<a id="errorprone-systemexitoutsidemain"></a>

### `errorprone/SystemExitOutsideMain`

System exit outside main.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/SystemExitOutsideMain","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SystemExitOutsideMain)

<a id="errorprone-systemout"></a>

### `errorprone/SystemOut`

System out.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/SystemOut","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SystemOut)

<a id="errorprone-temporalaccessorgetchronofield"></a>

### `errorprone/TemporalAccessorGetChronoField`

Temporal accessor get chrono field.

- **Exception:** If this is intended, add `{"rule":"errorprone/TemporalAccessorGetChronoField","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TemporalAccessorGetChronoField)

<a id="errorprone-testexceptionchecker"></a>

### `errorprone/TestExceptionChecker`

Test exception checker.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/TestExceptionChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TestExceptionChecker)

<a id="errorprone-testparametersnotinitialized"></a>

### `errorprone/TestParametersNotInitialized`

Test parameters not initialized.

- **Exception:** If this is intended, add `{"rule":"errorprone/TestParametersNotInitialized","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TestParametersNotInitialized)

<a id="errorprone-theorybutnotheories"></a>

### `errorprone/TheoryButNoTheories`

Theory but no theories.

- **Exception:** If this is intended, add `{"rule":"errorprone/TheoryButNoTheories","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TheoryButNoTheories)

<a id="errorprone-threadbuildernamewithplaceholder"></a>

### `errorprone/ThreadBuilderNameWithPlaceholder`

Thread builder name with placeholder.

- **Exception:** If this is intended, add `{"rule":"errorprone/ThreadBuilderNameWithPlaceholder","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ThreadBuilderNameWithPlaceholder)

<a id="errorprone-threadjoinloop"></a>

### `errorprone/ThreadJoinLoop`

Thread join loop.

- **Exception:** If this is intended, add `{"rule":"errorprone/ThreadJoinLoop","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ThreadJoinLoop)

<a id="errorprone-threadlocalusage"></a>

### `errorprone/ThreadLocalUsage`

Thread local usage.

- **Exception:** If this is intended, add `{"rule":"errorprone/ThreadLocalUsage","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ThreadLocalUsage)

<a id="errorprone-threadprioritycheck"></a>

### `errorprone/ThreadPriorityCheck`

Thread priority check.

- **Exception:** If this is intended, add `{"rule":"errorprone/ThreadPriorityCheck","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ThreadPriorityCheck)

<a id="errorprone-threelettertimezoneid"></a>

### `errorprone/ThreeLetterTimeZoneID`

Three letter time zone id.

- **Exception:** If this is intended, add `{"rule":"errorprone/ThreeLetterTimeZoneID","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ThreeLetterTimeZoneID)

<a id="errorprone-throwableequalshashcode"></a>

### `errorprone/ThrowableEqualsHashCode`

Throwable equals hash code.

- **Exception:** If this is intended, add `{"rule":"errorprone/ThrowableEqualsHashCode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ThrowableEqualsHashCode)

<a id="errorprone-throwifuncheckedknownchecked"></a>

### `errorprone/ThrowIfUncheckedKnownChecked`

Throw if unchecked known checked.

- **Exception:** If this is intended, add `{"rule":"errorprone/ThrowIfUncheckedKnownChecked","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ThrowIfUncheckedKnownChecked)

<a id="errorprone-throwifuncheckedknownunchecked"></a>

### `errorprone/ThrowIfUncheckedKnownUnchecked`

Throw if unchecked known unchecked.

- **Exception:** If this is intended, add `{"rule":"errorprone/ThrowIfUncheckedKnownUnchecked","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ThrowIfUncheckedKnownUnchecked)

<a id="errorprone-thrownull"></a>

### `errorprone/ThrowNull`

Throw null.

- **Exception:** If this is intended, add `{"rule":"errorprone/ThrowNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ThrowNull)

<a id="errorprone-throwspecificexceptions"></a>

### `errorprone/ThrowSpecificExceptions`

Throw specific exceptions.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/ThrowSpecificExceptions","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ThrowSpecificExceptions)

<a id="errorprone-timeinstaticinitializer"></a>

### `errorprone/TimeInStaticInitializer`

Time in static initializer.

- **Exception:** If this is intended, add `{"rule":"errorprone/TimeInStaticInitializer","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TimeInStaticInitializer)

<a id="errorprone-timeunitconversionchecker"></a>

### `errorprone/TimeUnitConversionChecker`

Time unit conversion checker.

- **Exception:** If this is intended, add `{"rule":"errorprone/TimeUnitConversionChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TimeUnitConversionChecker)

<a id="errorprone-timeunitmismatch"></a>

### `errorprone/TimeUnitMismatch`

Time unit mismatch.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/TimeUnitMismatch","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TimeUnitMismatch)

<a id="errorprone-tostringreturnsnull"></a>

### `errorprone/ToStringReturnsNull`

To string returns null.

- **Exception:** If this is intended, add `{"rule":"errorprone/ToStringReturnsNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ToStringReturnsNull)

<a id="errorprone-traditionalswitchexpression"></a>

### `errorprone/TraditionalSwitchExpression`

Traditional switch expression.

- **Exception:** If this is intended, add `{"rule":"errorprone/TraditionalSwitchExpression","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TraditionalSwitchExpression)

<a id="errorprone-transientmisuse"></a>

### `errorprone/TransientMisuse`

Transient misuse.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/TransientMisuse","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TransientMisuse)

<a id="errorprone-treetostring"></a>

### `errorprone/TreeToString`

Tree to string.

- **Exception:** If this is intended, add `{"rule":"errorprone/TreeToString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TreeToString)

<a id="errorprone-truthassertexpected"></a>

### `errorprone/TruthAssertExpected`

Truth assert expected.

- **Exception:** If this is intended, add `{"rule":"errorprone/TruthAssertExpected","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TruthAssertExpected)

<a id="errorprone-truthconstantasserts"></a>

### `errorprone/TruthConstantAsserts`

Truth constant asserts.

- **Exception:** If this is intended, add `{"rule":"errorprone/TruthConstantAsserts","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TruthConstantAsserts)

<a id="errorprone-truthcontainsexactlyelementsinusage"></a>

### `errorprone/TruthContainsExactlyElementsInUsage`

Truth contains exactly elements in usage.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/TruthContainsExactlyElementsInUsage","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TruthContainsExactlyElementsInUsage)

<a id="errorprone-truthgetordefault"></a>

### `errorprone/TruthGetOrDefault`

Truth get or default.

- **Exception:** If this is intended, add `{"rule":"errorprone/TruthGetOrDefault","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TruthGetOrDefault)

<a id="errorprone-truthincompatibletype"></a>

### `errorprone/TruthIncompatibleType`

Truth incompatible type.

- **Exception:** If this is intended, add `{"rule":"errorprone/TruthIncompatibleType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TruthIncompatibleType)

<a id="errorprone-tryfailrefactoring"></a>

### `errorprone/TryFailRefactoring`

Try fail refactoring.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/TryFailRefactoring","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TryFailRefactoring)

<a id="errorprone-tryfailthrowable"></a>

### `errorprone/TryFailThrowable`

Try fail throwable.

- **Exception:** If this is intended, add `{"rule":"errorprone/TryFailThrowable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TryFailThrowable)

<a id="errorprone-trywithresourcesvariable"></a>

### `errorprone/TryWithResourcesVariable`

Try with resources variable.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/TryWithResourcesVariable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TryWithResourcesVariable)

<a id="errorprone-typeequals"></a>

### `errorprone/TypeEquals`

Type equals.

- **Exception:** If this is intended, add `{"rule":"errorprone/TypeEquals","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TypeEquals)

<a id="errorprone-typenameshadowing"></a>

### `errorprone/TypeNameShadowing`

Type name shadowing.

- **Exception:** If this is intended, add `{"rule":"errorprone/TypeNameShadowing","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TypeNameShadowing)

<a id="errorprone-typeparameternaming"></a>

### `errorprone/TypeParameterNaming`

Type parameter naming.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/TypeParameterNaming","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TypeParameterNaming)

<a id="errorprone-typeparameterqualifier"></a>

### `errorprone/TypeParameterQualifier`

Type parameter qualifier.

- **Exception:** If this is intended, add `{"rule":"errorprone/TypeParameterQualifier","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TypeParameterQualifier)

<a id="errorprone-typeparametershadowing"></a>

### `errorprone/TypeParameterShadowing`

Type parameter shadowing.

- **Exception:** If this is intended, add `{"rule":"errorprone/TypeParameterShadowing","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TypeParameterShadowing)

<a id="errorprone-typeparameterunusedinformals"></a>

### `errorprone/TypeParameterUnusedInFormals`

Type parameter unused in formals.

- **Exception:** If this is intended, add `{"rule":"errorprone/TypeParameterUnusedInFormals","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TypeParameterUnusedInFormals)

<a id="errorprone-typetostring"></a>

### `errorprone/TypeToString`

Type to string.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/TypeToString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TypeToString)

<a id="errorprone-undefinedequals"></a>

### `errorprone/UndefinedEquals`

Undefined equals.

- **Exception:** If this is intended, add `{"rule":"errorprone/UndefinedEquals","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UndefinedEquals)

<a id="errorprone-unescapedentity"></a>

### `errorprone/UnescapedEntity`

Unescaped entity.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnescapedEntity","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnescapedEntity)

<a id="errorprone-ungroupedoverloads"></a>

### `errorprone/UngroupedOverloads`

Ungrouped overloads.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/UngroupedOverloads","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UngroupedOverloads)

<a id="errorprone-unicodedirectionalitycharacters"></a>

### `errorprone/UnicodeDirectionalityCharacters`

Unicode directionality characters.

- **Exception:** If this is intended, add `{"rule":"errorprone/UnicodeDirectionalityCharacters","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnicodeDirectionalityCharacters)

<a id="errorprone-unicodeescape"></a>

### `errorprone/UnicodeEscape`

Unicode escape.

- **Exception:** If this is intended, add `{"rule":"errorprone/UnicodeEscape","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnicodeEscape)

<a id="errorprone-unicodeincode"></a>

### `errorprone/UnicodeInCode`

Unicode in code.

- **Exception:** If this is intended, add `{"rule":"errorprone/UnicodeInCode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnicodeInCode)

<a id="errorprone-unnecessarilyfullyqualified"></a>

### `errorprone/UnnecessarilyFullyQualified`

Unnecessarily fully qualified.

- **Scope:** Off in a project that uses Lombok.
- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessarilyFullyQualified","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessarilyFullyQualified)

<a id="errorprone-unnecessarilyusedvalue"></a>

### `errorprone/UnnecessarilyUsedValue`

Unnecessarily used value.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessarilyUsedValue","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessarilyUsedValue)

<a id="errorprone-unnecessarilyvisible"></a>

### `errorprone/UnnecessarilyVisible`

Unnecessarily visible.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessarilyVisible","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessarilyVisible)

<a id="errorprone-unnecessaryanonymousclass"></a>

### `errorprone/UnnecessaryAnonymousClass`

Unnecessary anonymous class.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryAnonymousClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryAnonymousClass)

<a id="errorprone-unnecessaryassignment"></a>

### `errorprone/UnnecessaryAssignment`

Unnecessary assignment.

- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryAssignment","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryAssignment)

<a id="errorprone-unnecessaryasync"></a>

### `errorprone/UnnecessaryAsync`

Unnecessary async.

- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryAsync","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryAsync)

<a id="errorprone-unnecessaryboxedassignment"></a>

### `errorprone/UnnecessaryBoxedAssignment`

Unnecessary boxed assignment.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryBoxedAssignment","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryBoxedAssignment)

<a id="errorprone-unnecessaryboxedvariable"></a>

### `errorprone/UnnecessaryBoxedVariable`

Unnecessary boxed variable.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryBoxedVariable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryBoxedVariable)

<a id="errorprone-unnecessarybreakinswitch"></a>

### `errorprone/UnnecessaryBreakInSwitch`

Unnecessary break in switch.

- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryBreakInSwitch","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryBreakInSwitch)

<a id="errorprone-unnecessarychecknotnull"></a>

### `errorprone/UnnecessaryCheckNotNull`

Unnecessary check not null.

- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryCheckNotNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryCheckNotNull)

<a id="errorprone-unnecessarycopy"></a>

### `errorprone/UnnecessaryCopy`

Unnecessary copy.

- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryCopy","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryCopy)

<a id="errorprone-unnecessarylongtointconversion"></a>

### `errorprone/UnnecessaryLongToIntConversion`

Unnecessary long to int conversion.

- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryLongToIntConversion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryLongToIntConversion)

<a id="errorprone-unnecessarymethodinvocationmatcher"></a>

### `errorprone/UnnecessaryMethodInvocationMatcher`

Unnecessary method invocation matcher.

- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryMethodInvocationMatcher","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryMethodInvocationMatcher)

<a id="errorprone-unnecessarymethodreference"></a>

### `errorprone/UnnecessaryMethodReference`

Unnecessary method reference.

- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryMethodReference","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryMethodReference)

<a id="errorprone-unnecessaryoptionalget"></a>

### `errorprone/UnnecessaryOptionalGet`

Unnecessary optional get.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryOptionalGet","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryOptionalGet)

<a id="errorprone-unnecessaryparentheses"></a>

### `errorprone/UnnecessaryParentheses`

Unnecessary parentheses.

- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryParentheses","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryParentheses)

<a id="errorprone-unnecessaryqualifier"></a>

### `errorprone/UnnecessaryQualifier`

Unnecessary qualifier.

- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryQualifier","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryQualifier)

<a id="errorprone-unnecessarysemicolon"></a>

### `errorprone/UnnecessarySemicolon`

Unnecessary semicolon.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessarySemicolon","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessarySemicolon)

<a id="errorprone-unnecessarysetdefault"></a>

### `errorprone/UnnecessarySetDefault`

Unnecessary set default.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessarySetDefault","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessarySetDefault)

<a id="errorprone-unnecessarystaticimport"></a>

### `errorprone/UnnecessaryStaticImport`

Unnecessary static import.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryStaticImport","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryStaticImport)

<a id="errorprone-unnecessarystringbuilder"></a>

### `errorprone/UnnecessaryStringBuilder`

Unnecessary string builder.

- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryStringBuilder","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryStringBuilder)

<a id="errorprone-unnecessarytestmethodprefix"></a>

### `errorprone/UnnecessaryTestMethodPrefix`

Unnecessary test method prefix.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryTestMethodPrefix","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryTestMethodPrefix)

<a id="errorprone-unnecessarytypeargument"></a>

### `errorprone/UnnecessaryTypeArgument`

Unnecessary type argument.

- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryTypeArgument","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryTypeArgument)

<a id="errorprone-unrecognisedjavadoctag"></a>

### `errorprone/UnrecognisedJavadocTag`

Unrecognised javadoc tag.

- **Scope:** Off in a project that uses Lombok.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnrecognisedJavadocTag","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnrecognisedJavadocTag)

<a id="errorprone-unsafefinalization"></a>

### `errorprone/UnsafeFinalization`

Unsafe finalization.

- **Exception:** If this is intended, add `{"rule":"errorprone/UnsafeFinalization","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnsafeFinalization)

<a id="errorprone-unsafelocaleusage"></a>

### `errorprone/UnsafeLocaleUsage`

Unsafe locale usage.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnsafeLocaleUsage","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnsafeLocaleUsage)

<a id="errorprone-unsafereflectiveconstructioncast"></a>

### `errorprone/UnsafeReflectiveConstructionCast`

Unsafe reflective construction cast.

- **Exception:** If this is intended, add `{"rule":"errorprone/UnsafeReflectiveConstructionCast","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnsafeReflectiveConstructionCast)

<a id="errorprone-unsafewildcard"></a>

### `errorprone/UnsafeWildcard`

Unsafe wildcard.

- **Exception:** If this is intended, add `{"rule":"errorprone/UnsafeWildcard","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnsafeWildcard)

<a id="errorprone-unsynchronizedoverridessynchronized"></a>

### `errorprone/UnsynchronizedOverridesSynchronized`

Unsynchronized overrides synchronized.

- **Exception:** If this is intended, add `{"rule":"errorprone/UnsynchronizedOverridesSynchronized","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnsynchronizedOverridesSynchronized)

<a id="errorprone-unusedanonymousclass"></a>

### `errorprone/UnusedAnonymousClass`

Unused anonymous class.

- **Exception:** If this is intended, add `{"rule":"errorprone/UnusedAnonymousClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnusedAnonymousClass)

<a id="errorprone-unusedcollectionmodifiedinplace"></a>

### `errorprone/UnusedCollectionModifiedInPlace`

Unused collection modified in place.

- **Exception:** If this is intended, add `{"rule":"errorprone/UnusedCollectionModifiedInPlace","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnusedCollectionModifiedInPlace)

<a id="errorprone-unusedexception"></a>

### `errorprone/UnusedException`

Unused exception.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnusedException","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnusedException)

<a id="errorprone-unusedlabel"></a>

### `errorprone/UnusedLabel`

Unused label.

- **Exception:** If this is intended, add `{"rule":"errorprone/UnusedLabel","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnusedLabel)

<a id="errorprone-unusedmethod"></a>

### `errorprone/UnusedMethod`

Unused method.

- **Exception:** If this is intended, add `{"rule":"errorprone/UnusedMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnusedMethod)

<a id="errorprone-unusednestedclass"></a>

### `errorprone/UnusedNestedClass`

Unused nested class.

- **Exception:** If this is intended, add `{"rule":"errorprone/UnusedNestedClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnusedNestedClass)

<a id="errorprone-unusedtypeparameter"></a>

### `errorprone/UnusedTypeParameter`

Unused type parameter.

- **Exception:** If this is intended, add `{"rule":"errorprone/UnusedTypeParameter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnusedTypeParameter)

<a id="errorprone-urlequalshashcode"></a>

### `errorprone/URLEqualsHashCode`

Url equals hash code.

- **Exception:** If this is intended, add `{"rule":"errorprone/URLEqualsHashCode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/URLEqualsHashCode)

<a id="errorprone-urlinsee"></a>

### `errorprone/UrlInSee`

Url in see.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/UrlInSee","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UrlInSee)

<a id="errorprone-usebinds"></a>

### `errorprone/UseBinds`

Use binds.

- **Exception:** If this is intended, add `{"rule":"errorprone/UseBinds","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UseBinds)

<a id="errorprone-usecorrectassertintests"></a>

### `errorprone/UseCorrectAssertInTests`

Use correct assert in tests.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/UseCorrectAssertInTests","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UseCorrectAssertInTests)

<a id="errorprone-variablenamesameastype"></a>

### `errorprone/VariableNameSameAsType`

Variable name same as type.

- **Exception:** If this is intended, add `{"rule":"errorprone/VariableNameSameAsType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/VariableNameSameAsType)

<a id="errorprone-vartypename"></a>

### `errorprone/VarTypeName`

Var type name.

- **Exception:** If this is intended, add `{"rule":"errorprone/VarTypeName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/VarTypeName)

<a id="errorprone-voidused"></a>

### `errorprone/VoidUsed`

Void used.

- **Exception:** If this is intended, add `{"rule":"errorprone/VoidUsed","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/VoidUsed)

<a id="errorprone-waitnotinloop"></a>

### `errorprone/WaitNotInLoop`

Wait not in loop.

- **Exception:** If this is intended, add `{"rule":"errorprone/WaitNotInLoop","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/WaitNotInLoop)

<a id="errorprone-wakelockreleaseddangerously"></a>

### `errorprone/WakelockReleasedDangerously`

Wakelock released dangerously.

- **Exception:** If this is intended, add `{"rule":"errorprone/WakelockReleasedDangerously","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/WakelockReleasedDangerously)

<a id="errorprone-wildcardimport"></a>

### `errorprone/WildcardImport`

Wildcard import.

- **Why it is on:** Error Prone compiles the main and test sources a second time and reports this check. It is on because it catches a bug class or names one allowed form; the checks that are off are listed in the Java preset guide. Error Prone has it off by default; nitpicker turns it on.
- **Exception:** If this is intended, add `{"rule":"errorprone/WildcardImport","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/WildcardImport)

<a id="errorprone-wrongoneof"></a>

### `errorprone/WrongOneof`

Wrong oneof.

- **Exception:** If this is intended, add `{"rule":"errorprone/WrongOneof","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/WrongOneof)

<a id="errorprone-xorpower"></a>

### `errorprone/XorPower`

Xor power.

- **Exception:** If this is intended, add `{"rule":"errorprone/XorPower","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/XorPower)

<a id="errorprone-zoneidofz"></a>

### `errorprone/ZoneIdOfZ`

Zone id of z.

- **Exception:** If this is intended, add `{"rule":"errorprone/ZoneIdOfZ","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ZoneIdOfZ)
