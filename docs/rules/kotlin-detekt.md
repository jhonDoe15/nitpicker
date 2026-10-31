# Kotlin: detekt rules

detekt's default rules and the one-way rules nitpicker pins on top of them (`detekt.<ruleset>.<Rule>`). This page lists 124 rules. [All pages](README.md).

The guide for these rules: [docs/kotlin-preset.md#one-way-rules](../kotlin-preset.md#one-way-rules).

The descriptions of detekt's rules are from detekt 1.23.8, under the Apache License 2.0.

In the Kotlin preset, an entry of `exceptions` names a detekt rule as `detekt.<ruleset>.<Rule>`, one of these rules: `catch-log-without-exception`, `test-without-assertion`, `function-lines-limit`, `function-statements-limit`, `function-control-nesting-limit`, `function-parameters-limit`, `crap-score-limit`, `crap-coverage-unknown`, `changed-branch-coverage`, `mutant-survived`, `mutant-nocoverage`, `duplicate-clone`, `stability-direction`, `file-lines-limit`, `line-length-limit`, `folder-files-limit`, `slow-test`, `committed-env-file`, `committed-private-key`, `committed-binary`, `large-file`, `committed-build-output`, `co-change`, `duplicate-definition`, `exported-name-collision`, `sibling-copy-edit`, `test-only-export`, `doc-comment-content`, `test-console-output`, `folder-depth-limit`, `class-methods-limit`, `class-fields-limit`, `inheritance-depth-limit`, `test-runtime/slow-test`, `test-runtime/test-console-output`, `test-runtime/test-not-run`, `coupling/test-only-export`, `kotlin-source/GeneratedOnHandWrittenCode`, `kotlin-source/JvmSyntheticOnHandWrittenCode`, `kotlin-source/MutationIgnoreMarker`, `kotlin-source/CommentedOutCode`, `kotlin-source/MutableModuleState`, `kotlin-source/GenericTypeName`, `kotlin-source/GenericPackageName`, `kotlin-source/LogStringConcatenation`, `kotlin-source/ShellCommand`, `kotlin-source/IoCallInLoop`, `kotlin-source/CatchOnlyLogsOrReturnsDefault`, `kotlin-source/BooleanFlagParameter`, `kotlin-source/HardcodedSecret`, `kotlin-source/CredentialLiteral`, `kotlin-source/SecretInLog`, `kotlin-source/TestClassWithoutTestCases`, `kotlin-source/DetachedTestCase`, `kotlin-source/TestHelperInSource`, `kotlin-source/SqlStringBuilding`, `kotlin-source/WeakHash`, `kotlin-source/TlsVerificationOff`, `kotlin-source/HttpWithoutTimeout`, `kotlin-source/UnsafeDeserialization`, `kotlin-source/UnboundedFanOut`, `kotlin-source/TriStateBoolean`, `kotlin-source/ParameterMutation`, `kotlin-source/CompatibilityShim`, `kotlin-source/RepeatedStringLiteral`, `kotlinc/deprecation`, `kotlinc/unchecked`, `kotlinc/cast`, `kotlinc/lint-not-run`, `pmd/FixedSleepInTest`, `pmd/NegativeWaitInTest`, `pmd/DisabledTest`, `pmd/FocusedTest`, `pmd/AssertionInControlFlow`, `pmd/CoroutineEscapesTest`, `pmd/SpringUnusedContext`, `pmd/ExhaustiveEnumPredicate`, `pmd/StaticForwardingWrapper`, `pmd/SingularAndPluralMember`, `pmd/ServiceLocatorLookup`, `pmd/ValidationAnnotationTarget`, `pmd/ClassLoadEffect`, `pmd/SpringConstructorInjection`, `pmd/SpringImmutableBeans`, `pmd/SpringNoServiceLocator`, `pmd/SpringNoLazyInjection`, `pmd/SpringLiteConfiguration`, `pmd/SpringNoComponentScan`, `pmd/SpringBeanCollectionState`, `pmd/SpringHttpClientPerCall`, `pmd/SpringHttpClientTimeouts`, `pmd/SpringNoPostConstructIo`, `pmd/SpringTypedConfiguration`, `pmd/SpringValueSecretDefault`, `pmd/SpringProfileOnConfiguration`, `pmd/SpringProxyMethodVisibility`, `pmd/SpringProxySelfCall`, `pmd/SpringTransactionalAnnotation`, `pmd/SpringNoTransactionalController`, `pmd/SpringNoRequiresNew`, `pmd/SpringNoSwallowedTransactionException`, `pmd/SpringTransactionalCheckedRollback`, `pmd/SpringTransactionalReadOnlyWrite`, `pmd/SpringAsyncExecutor`, `pmd/SpringScheduledFixedDelay`, `pmd/SpringComposedMapping`, `pmd/SpringRestController`, `pmd/SpringValidRequestBody`, `pmd/SpringTypedResponse`, `pmd/SpringTypedRequestBody`, `pmd/SpringNoErrorLeak`, `pmd/SpringNoCrossOrigin`, `pmd/SpringCorsWildcard`, `pmd/SpringPasswordEncoder`, `pmd/SpringPermitAllAnyRequest`, `pmd/SpringCsrfDisabled`, `pmd/SpringHardcodedUser`, `pmd/JpaLazyFetching`, `pmd/JpaEntityClass`, `pmd/JpaManyToManyCascade`, `pmd/JpaManyToManySet`, `pmd/JpaVersion`, `pmd/JpaSequenceIds`, `pmd/JpaEnumString`, `pmd/JpaIdentityHashCode`, `pmd/SpringDataDerivedQuery`, `pmd/SpringDataNativeQuery`, `pmd/SpringDataModifyingQuery`, `pmd/SpringDataNoSaveInLoop`, `pmd/SpringDataNoFlush`, `pmd/SpringDataNamedParameters`, `pmd/SpringDataQueryTextBlock`, `pmd/SpringDataBatchOfOne`, `pmd/SpringDataRowWriteInLoop`, `pmd/SpringDataSaveInLoopHelper`, `pmd/SpringDataFilterInQuery`, `pmd/SpringQueryConcatenation` and `unused-option`, or, for the Java sources of the project, a finding as it prints, `<tool>/<rule>` with one of the tools `pmd`, `spotbugs`, `errorprone`, `archunit`, `google-java-format`, `palantir-java-format`, `jacoco`, `checkstyle`, `crap`, `duplicates`, `pit`, `structure`, `coupling`, `spring` and `test-runtime`.

Unless an entry says otherwise:

- **Presets:** Kotlin
- **Analyzers:** `kotlin`
- **Builds:** Gradle

<a id="detekt-detekt-complexity-complexcondition"></a>

### `detekt/detekt.complexity.ComplexCondition`

Complex conditions should be simplified and extracted into well-named methods if necessary.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/complexity#complexcondition).
- **Exception:** If this is intended, add `{"rule":"detekt.complexity.ComplexCondition","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/complexity#complexcondition)

<a id="detekt-detekt-complexity-cyclomaticcomplexmethod"></a>

### `detekt/detekt.complexity.CyclomaticComplexMethod`

Prefer splitting up complex methods into smaller, easier to test methods.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/complexity#cyclomaticcomplexmethod).
- **Exception:** If this is intended, add `{"rule":"detekt.complexity.CyclomaticComplexMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/complexity#cyclomaticcomplexmethod)

<a id="detekt-detekt-complexity-largeclass"></a>

### `detekt/detekt.complexity.LargeClass`

One class should have one responsibility.

- **Why it is on:** Large classes tend to handle many things at once. Split up large classes into smaller classes that are easier to understand. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/complexity#largeclass).
- **Exception:** If this is intended, add `{"rule":"detekt.complexity.LargeClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/complexity#largeclass)

<a id="detekt-detekt-complexity-longmethod"></a>

### `detekt/detekt.complexity.LongMethod`

One method should have one responsibility.

- **Why it is on:** Long methods tend to handle many things at once. Prefer smaller methods to make them easier to understand. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/complexity#longmethod).
- **Exception:** If this is intended, add `{"rule":"detekt.complexity.LongMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/complexity#longmethod)

<a id="detekt-detekt-complexity-longparameterlist"></a>

### `detekt/detekt.complexity.LongParameterList`

The more parameters a function has the more complex it is.

- **Why it is on:** Long parameter lists are often used to control complex algorithms and violate the Single Responsibility Principle. Prefer functions with short parameter lists. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/complexity#longparameterlist).
- **Exception:** If this is intended, add `{"rule":"detekt.complexity.LongParameterList","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/complexity#longparameterlist)

<a id="detekt-detekt-complexity-nestedblockdepth"></a>

### `detekt/detekt.complexity.NestedBlockDepth`

Excessive nesting leads to hidden complexity.

- **Why it is on:** Prefer extracting code to make it easier to understand. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/complexity#nestedblockdepth).
- **Exception:** If this is intended, add `{"rule":"detekt.complexity.NestedBlockDepth","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/complexity#nestedblockdepth)

<a id="detekt-detekt-complexity-toomanyfunctions"></a>

### `detekt/detekt.complexity.TooManyFunctions`

Too many functions inside a/an file/class/object/interface always indicate a violation of the single responsibility principle.

- **Why it is on:** Maybe the file/class/object/interface wants to manage too many things at once. Extract functionality which clearly belongs together. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/complexity#toomanyfunctions).
- **Exception:** If this is intended, add `{"rule":"detekt.complexity.TooManyFunctions","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/complexity#toomanyfunctions)

<a id="detekt-detekt-coroutines-globalcoroutineusage"></a>

### `detekt/detekt.coroutines.GlobalCoroutineUsage`

The usage of the `GlobalScope` instance is highly discouraged.

- **Why it is on:** A one-way rule: nitpicker's detekt file turns it on and pins it, so a project cannot switch it off, lower its severity or exclude paths in detekt.yml. It narrows a spot where Kotlin offers several ways to the one allowed form.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/coroutines#globalcoroutineusage).
- **Exception:** If this is intended, add `{"rule":"detekt.coroutines.GlobalCoroutineUsage","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [detekt rule](https://detekt.dev/docs/rules/coroutines#globalcoroutineusage)

<a id="detekt-detekt-coroutines-injectdispatcher"></a>

### `detekt/detekt.coroutines.InjectDispatcher`

Don't hardcode dispatchers when creating new coroutines or calling `withContext`.

- **Why it is on:** Use dependency injection for dispatchers to make testing easier. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/coroutines#injectdispatcher).
- **Exception:** If this is intended, add `{"rule":"detekt.coroutines.InjectDispatcher","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/coroutines#injectdispatcher)

<a id="detekt-detekt-coroutines-redundantsuspendmodifier"></a>

### `detekt/detekt.coroutines.RedundantSuspendModifier`

The `suspend` modifier is only needed for functions that contain suspending calls.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/coroutines#redundantsuspendmodifier).
- **Exception:** If this is intended, add `{"rule":"detekt.coroutines.RedundantSuspendModifier","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/coroutines#redundantsuspendmodifier)

<a id="detekt-detekt-coroutines-sleepinsteadofdelay"></a>

### `detekt/detekt.coroutines.SleepInsteadOfDelay`

Usage of `Thread.sleep()` in coroutines can potentially halt multiple coroutines at once.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/coroutines#sleepinsteadofdelay).
- **Exception:** If this is intended, add `{"rule":"detekt.coroutines.SleepInsteadOfDelay","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/coroutines#sleepinsteadofdelay)

<a id="detekt-detekt-coroutines-suspendfunwithflowreturntype"></a>

### `detekt/detekt.coroutines.SuspendFunWithFlowReturnType`

The `suspend` modifier should not be used for functions that return a Coroutines Flow type.

- **Why it is on:** Flows are cold streams and invoking a function that returns one should not produce any side effects. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/coroutines#suspendfunwithflowreturntype).
- **Exception:** If this is intended, add `{"rule":"detekt.coroutines.SuspendFunWithFlowReturnType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/coroutines#suspendfunwithflowreturntype)

<a id="detekt-detekt-empty-blocks-emptycatchblock"></a>

### `detekt/detekt.empty-blocks.EmptyCatchBlock`

Empty catch block detected.

- **Why it is on:** Empty catch blocks indicate that an exception is ignored and not handled. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptycatchblock).
- **Exception:** If this is intended, add `{"rule":"detekt.empty-blocks.EmptyCatchBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptycatchblock)

<a id="detekt-detekt-empty-blocks-emptyclassblock"></a>

### `detekt/detekt.empty-blocks.EmptyClassBlock`

Empty block of code detected.

- **Why it is on:** As they serve no purpose they should be removed. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptyclassblock).
- **Exception:** If this is intended, add `{"rule":"detekt.empty-blocks.EmptyClassBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptyclassblock)

<a id="detekt-detekt-empty-blocks-emptydefaultconstructor"></a>

### `detekt/detekt.empty-blocks.EmptyDefaultConstructor`

Empty block of code detected.

- **Why it is on:** As they serve no purpose they should be removed. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptydefaultconstructor).
- **Exception:** If this is intended, add `{"rule":"detekt.empty-blocks.EmptyDefaultConstructor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptydefaultconstructor)

<a id="detekt-detekt-empty-blocks-emptydowhileblock"></a>

### `detekt/detekt.empty-blocks.EmptyDoWhileBlock`

Empty block of code detected.

- **Why it is on:** As they serve no purpose they should be removed. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptydowhileblock).
- **Exception:** If this is intended, add `{"rule":"detekt.empty-blocks.EmptyDoWhileBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptydowhileblock)

<a id="detekt-detekt-empty-blocks-emptyelseblock"></a>

### `detekt/detekt.empty-blocks.EmptyElseBlock`

Empty block of code detected.

- **Why it is on:** As they serve no purpose they should be removed. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptyelseblock).
- **Exception:** If this is intended, add `{"rule":"detekt.empty-blocks.EmptyElseBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptyelseblock)

<a id="detekt-detekt-empty-blocks-emptyfinallyblock"></a>

### `detekt/detekt.empty-blocks.EmptyFinallyBlock`

Empty block of code detected.

- **Why it is on:** As they serve no purpose they should be removed. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptyfinallyblock).
- **Exception:** If this is intended, add `{"rule":"detekt.empty-blocks.EmptyFinallyBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptyfinallyblock)

<a id="detekt-detekt-empty-blocks-emptyforblock"></a>

### `detekt/detekt.empty-blocks.EmptyForBlock`

Empty block of code detected.

- **Why it is on:** As they serve no purpose they should be removed. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptyforblock).
- **Exception:** If this is intended, add `{"rule":"detekt.empty-blocks.EmptyForBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptyforblock)

<a id="detekt-detekt-empty-blocks-emptyfunctionblock"></a>

### `detekt/detekt.empty-blocks.EmptyFunctionBlock`

Empty block of code detected.

- **Why it is on:** As they serve no purpose they should be removed. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptyfunctionblock).
- **Exception:** If this is intended, add `{"rule":"detekt.empty-blocks.EmptyFunctionBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptyfunctionblock)

<a id="detekt-detekt-empty-blocks-emptyifblock"></a>

### `detekt/detekt.empty-blocks.EmptyIfBlock`

Empty block of code detected.

- **Why it is on:** As they serve no purpose they should be removed. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptyifblock).
- **Exception:** If this is intended, add `{"rule":"detekt.empty-blocks.EmptyIfBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptyifblock)

<a id="detekt-detekt-empty-blocks-emptyinitblock"></a>

### `detekt/detekt.empty-blocks.EmptyInitBlock`

Empty block of code detected.

- **Why it is on:** As they serve no purpose they should be removed. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptyinitblock).
- **Exception:** If this is intended, add `{"rule":"detekt.empty-blocks.EmptyInitBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptyinitblock)

<a id="detekt-detekt-empty-blocks-emptyktfile"></a>

### `detekt/detekt.empty-blocks.EmptyKtFile`

Empty block of code detected.

- **Why it is on:** As they serve no purpose they should be removed. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptyktfile).
- **Exception:** If this is intended, add `{"rule":"detekt.empty-blocks.EmptyKtFile","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptyktfile)

<a id="detekt-detekt-empty-blocks-emptysecondaryconstructor"></a>

### `detekt/detekt.empty-blocks.EmptySecondaryConstructor`

Empty block of code detected.

- **Why it is on:** As they serve no purpose they should be removed. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptysecondaryconstructor).
- **Exception:** If this is intended, add `{"rule":"detekt.empty-blocks.EmptySecondaryConstructor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptysecondaryconstructor)

<a id="detekt-detekt-empty-blocks-emptytryblock"></a>

### `detekt/detekt.empty-blocks.EmptyTryBlock`

Empty block of code detected.

- **Why it is on:** As they serve no purpose they should be removed. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptytryblock).
- **Exception:** If this is intended, add `{"rule":"detekt.empty-blocks.EmptyTryBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptytryblock)

<a id="detekt-detekt-empty-blocks-emptywhenblock"></a>

### `detekt/detekt.empty-blocks.EmptyWhenBlock`

Empty block of code detected.

- **Why it is on:** As they serve no purpose they should be removed. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptywhenblock).
- **Exception:** If this is intended, add `{"rule":"detekt.empty-blocks.EmptyWhenBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptywhenblock)

<a id="detekt-detekt-empty-blocks-emptywhileblock"></a>

### `detekt/detekt.empty-blocks.EmptyWhileBlock`

Empty block of code detected.

- **Why it is on:** As they serve no purpose they should be removed. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptywhileblock).
- **Exception:** If this is intended, add `{"rule":"detekt.empty-blocks.EmptyWhileBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptywhileblock)

<a id="detekt-detekt-exceptions-exceptionraisedinunexpectedlocation"></a>

### `detekt/detekt.exceptions.ExceptionRaisedInUnexpectedLocation`

This method is not expected to throw exceptions.

- **Why it is on:** This can cause weird behavior. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/exceptions#exceptionraisedinunexpectedlocation).
- **Exception:** If this is intended, add `{"rule":"detekt.exceptions.ExceptionRaisedInUnexpectedLocation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/exceptions#exceptionraisedinunexpectedlocation)

<a id="detekt-detekt-exceptions-instanceofcheckforexception"></a>

### `detekt/detekt.exceptions.InstanceOfCheckForException`

Instead of catching for a general exception type and checking for a specific exception type, use multiple catch blocks.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/exceptions#instanceofcheckforexception).
- **Exception:** If this is intended, add `{"rule":"detekt.exceptions.InstanceOfCheckForException","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/exceptions#instanceofcheckforexception)

<a id="detekt-detekt-exceptions-printstacktrace"></a>

### `detekt/detekt.exceptions.PrintStackTrace`

Do not print a stack trace.

- **Why it is on:** These debug statements should be removed or replaced with a logger. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/exceptions#printstacktrace).
- **Exception:** If this is intended, add `{"rule":"detekt.exceptions.PrintStackTrace","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/exceptions#printstacktrace)

<a id="detekt-detekt-exceptions-rethrowcaughtexception"></a>

### `detekt/detekt.exceptions.RethrowCaughtException`

Do not rethrow a caught exception of the same type.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/exceptions#rethrowcaughtexception).
- **Exception:** If this is intended, add `{"rule":"detekt.exceptions.RethrowCaughtException","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/exceptions#rethrowcaughtexception)

<a id="detekt-detekt-exceptions-returnfromfinally"></a>

### `detekt/detekt.exceptions.ReturnFromFinally`

Do not return within a finally statement.

- **Why it is on:** This can discard exceptions. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/exceptions#returnfromfinally).
- **Exception:** If this is intended, add `{"rule":"detekt.exceptions.ReturnFromFinally","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/exceptions#returnfromfinally)

<a id="detekt-detekt-exceptions-swallowedexception"></a>

### `detekt/detekt.exceptions.SwallowedException`

The caught exception is swallowed.

- **Why it is on:** The original exception could be lost. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/exceptions#swallowedexception).
- **Exception:** If this is intended, add `{"rule":"detekt.exceptions.SwallowedException","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/exceptions#swallowedexception)

<a id="detekt-detekt-exceptions-throwingexceptionfromfinally"></a>

### `detekt/detekt.exceptions.ThrowingExceptionFromFinally`

Do not throw an exception within a finally statement.

- **Why it is on:** This can discard exceptions and is confusing. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/exceptions#throwingexceptionfromfinally).
- **Exception:** If this is intended, add `{"rule":"detekt.exceptions.ThrowingExceptionFromFinally","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/exceptions#throwingexceptionfromfinally)

<a id="detekt-detekt-exceptions-throwingexceptionswithoutmessageorcause"></a>

### `detekt/detekt.exceptions.ThrowingExceptionsWithoutMessageOrCause`

A call to the default constructor of an exception was detected.

- **Why it is on:** Instead one of the constructor overloads should be called. This allows to provide more meaningful exceptions. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/exceptions#throwingexceptionswithoutmessageorcause).
- **Exception:** If this is intended, add `{"rule":"detekt.exceptions.ThrowingExceptionsWithoutMessageOrCause","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/exceptions#throwingexceptionswithoutmessageorcause)

<a id="detekt-detekt-exceptions-throwingnewinstanceofsameexception"></a>

### `detekt/detekt.exceptions.ThrowingNewInstanceOfSameException`

Avoid catch blocks that rethrow a caught exception wrapped inside a new instance of the same exception.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/exceptions#throwingnewinstanceofsameexception).
- **Exception:** If this is intended, add `{"rule":"detekt.exceptions.ThrowingNewInstanceOfSameException","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/exceptions#throwingnewinstanceofsameexception)

<a id="detekt-detekt-exceptions-toogenericexceptioncaught"></a>

### `detekt/detekt.exceptions.TooGenericExceptionCaught`

The caught exception is too generic.

- **Why it is on:** Prefer catching specific exceptions to the case that is currently handled. A one-way rule: nitpicker's detekt file turns it on and pins it, so a project cannot switch it off, lower its severity or exclude paths in detekt.yml. It narrows a spot where Kotlin offers several ways to the one allowed form.
- **Allowed form:** In a test, use `assertFailsWith`.
- **Exception:** If this is intended, add `{"rule":"detekt.exceptions.TooGenericExceptionCaught","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [detekt rule](https://detekt.dev/docs/rules/exceptions#toogenericexceptioncaught)

<a id="detekt-detekt-exceptions-toogenericexceptionthrown"></a>

### `detekt/detekt.exceptions.TooGenericExceptionThrown`

The thrown exception is too generic.

- **Why it is on:** Prefer throwing project specific exceptions to handle error cases. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/exceptions#toogenericexceptionthrown).
- **Exception:** If this is intended, add `{"rule":"detekt.exceptions.TooGenericExceptionThrown","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/exceptions#toogenericexceptionthrown)

<a id="detekt-detekt-naming-classnaming"></a>

### `detekt/detekt.naming.ClassNaming`

A class or object name should fit the naming pattern defined in the projects configuration.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/naming#classnaming).
- **Exception:** If this is intended, add `{"rule":"detekt.naming.ClassNaming","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/naming#classnaming)

<a id="detekt-detekt-naming-constructorparameternaming"></a>

### `detekt/detekt.naming.ConstructorParameterNaming`

Constructor parameter names should follow the naming convention set in the projects configuration.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/naming#constructorparameternaming).
- **Exception:** If this is intended, add `{"rule":"detekt.naming.ConstructorParameterNaming","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/naming#constructorparameternaming)

<a id="detekt-detekt-naming-enumnaming"></a>

### `detekt/detekt.naming.EnumNaming`

Enum names should follow the naming convention set in the projects configuration.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/naming#enumnaming).
- **Exception:** If this is intended, add `{"rule":"detekt.naming.EnumNaming","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/naming#enumnaming)

<a id="detekt-detekt-naming-functionnaming"></a>

### `detekt/detekt.naming.FunctionNaming`

Function names should follow the naming convention set in the configuration.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/naming#functionnaming).
- **Exception:** If this is intended, add `{"rule":"detekt.naming.FunctionNaming","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/naming#functionnaming)

<a id="detekt-detekt-naming-functionparameternaming"></a>

### `detekt/detekt.naming.FunctionParameterNaming`

Function parameter names should follow the naming convention set in the projects configuration.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/naming#functionparameternaming).
- **Exception:** If this is intended, add `{"rule":"detekt.naming.FunctionParameterNaming","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/naming#functionparameternaming)

<a id="detekt-detekt-naming-invalidpackagedeclaration"></a>

### `detekt/detekt.naming.InvalidPackageDeclaration`

Kotlin source files should be stored in the directory corresponding to its package statement.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/naming#invalidpackagedeclaration).
- **Exception:** If this is intended, add `{"rule":"detekt.naming.InvalidPackageDeclaration","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/naming#invalidpackagedeclaration)

<a id="detekt-detekt-naming-matchingdeclarationname"></a>

### `detekt/detekt.naming.MatchingDeclarationName`

If a source file contains only a single non-private top-level class or object, the file name should reflect the case-sensitive name plus the .kt extension.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/naming#matchingdeclarationname).
- **Exception:** If this is intended, add `{"rule":"detekt.naming.MatchingDeclarationName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/naming#matchingdeclarationname)

<a id="detekt-detekt-naming-membernameequalsclassname"></a>

### `detekt/detekt.naming.MemberNameEqualsClassName`

A member should not be given the same name as its parent class or object.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/naming#membernameequalsclassname).
- **Exception:** If this is intended, add `{"rule":"detekt.naming.MemberNameEqualsClassName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/naming#membernameequalsclassname)

<a id="detekt-detekt-naming-nonameshadowing"></a>

### `detekt/detekt.naming.NoNameShadowing`

Disallow shadowing variable declarations.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/naming#nonameshadowing).
- **Exception:** If this is intended, add `{"rule":"detekt.naming.NoNameShadowing","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/naming#nonameshadowing)

<a id="detekt-detekt-naming-objectpropertynaming"></a>

### `detekt/detekt.naming.ObjectPropertyNaming`

Property names inside objects should follow the naming convention set in the projects configuration.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/naming#objectpropertynaming).
- **Exception:** If this is intended, add `{"rule":"detekt.naming.ObjectPropertyNaming","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/naming#objectpropertynaming)

<a id="detekt-detekt-naming-packagenaming"></a>

### `detekt/detekt.naming.PackageNaming`

Package names should match the naming convention set in the configuration.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/naming#packagenaming).
- **Exception:** If this is intended, add `{"rule":"detekt.naming.PackageNaming","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/naming#packagenaming)

<a id="detekt-detekt-naming-toplevelpropertynaming"></a>

### `detekt/detekt.naming.TopLevelPropertyNaming`

Top level property names should follow the naming convention set in the projects configuration.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/naming#toplevelpropertynaming).
- **Exception:** If this is intended, add `{"rule":"detekt.naming.TopLevelPropertyNaming","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/naming#toplevelpropertynaming)

<a id="detekt-detekt-naming-variablenaming"></a>

### `detekt/detekt.naming.VariableNaming`

Variable names should follow the naming convention set in the projects configuration.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/naming#variablenaming).
- **Exception:** If this is intended, add `{"rule":"detekt.naming.VariableNaming","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/naming#variablenaming)

<a id="detekt-detekt-performance-arrayprimitive"></a>

### `detekt/detekt.performance.ArrayPrimitive`

Using `Array<Primitive>` leads to implicit boxing and a performance hit.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/performance#arrayprimitive).
- **Exception:** If this is intended, add `{"rule":"detekt.performance.ArrayPrimitive","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/performance#arrayprimitive)

<a id="detekt-detekt-performance-foreachonrange"></a>

### `detekt/detekt.performance.ForEachOnRange`

Using the forEach method on ranges has a heavy performance cost.

- **Why it is on:** Prefer using simple for loops. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/performance#foreachonrange).
- **Exception:** If this is intended, add `{"rule":"detekt.performance.ForEachOnRange","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/performance#foreachonrange)

<a id="detekt-detekt-performance-spreadoperator"></a>

### `detekt/detekt.performance.SpreadOperator`

In most cases using a spread operator causes a full copy of the array to be created before calling a method.

- **Why it is on:** This may result in a performance penalty. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/performance#spreadoperator).
- **Exception:** If this is intended, add `{"rule":"detekt.performance.SpreadOperator","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/performance#spreadoperator)

<a id="detekt-detekt-performance-unnecessarytemporaryinstantiation"></a>

### `detekt/detekt.performance.UnnecessaryTemporaryInstantiation`

Avoid temporary objects when converting primitive types to `String`.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/performance#unnecessarytemporaryinstantiation).
- **Exception:** If this is intended, add `{"rule":"detekt.performance.UnnecessaryTemporaryInstantiation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/performance#unnecessarytemporaryinstantiation)

<a id="detekt-detekt-potential-bugs-avoidreferentialequality"></a>

### `detekt/detekt.potential-bugs.AvoidReferentialEquality`

Avoid using referential equality and prefer to use referential equality checks instead.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/potential-bugs#avoidreferentialequality).
- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.AvoidReferentialEquality","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#avoidreferentialequality)

<a id="detekt-detekt-potential-bugs-castnullabletononnullabletype"></a>

### `detekt/detekt.potential-bugs.CastNullableToNonNullableType`

Nullable type to non-null type cast is found.

- **Why it is on:** Consider using two assertions, `null` assertions and type cast A one-way rule: nitpicker's detekt file turns it on and pins it, so a project cannot switch it off, lower its severity or exclude paths in detekt.yml. It narrows a spot where Kotlin offers several ways to the one allowed form.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/potential-bugs#castnullabletononnullabletype).
- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.CastNullableToNonNullableType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [detekt rule](https://detekt.dev/docs/rules/potential-bugs#castnullabletononnullabletype)

<a id="detekt-detekt-potential-bugs-doublemutabilityforcollection"></a>

### `detekt/detekt.potential-bugs.DoubleMutabilityForCollection`

Using var with mutable collections or values leads to double mutability.

- **Why it is on:** Consider using val or immutable collection or value types. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/potential-bugs#doublemutabilityforcollection).
- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.DoubleMutabilityForCollection","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#doublemutabilityforcollection)

<a id="detekt-detekt-potential-bugs-equalsalwaysreturnstrueorfalse"></a>

### `detekt/detekt.potential-bugs.EqualsAlwaysReturnsTrueOrFalse`

Having an `equals()` method that always returns true or false is not a good idea.

- **Why it is on:** It does not follow the contract of this method. Consider a good default implementation (e.g. `this == other`). One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/potential-bugs#equalsalwaysreturnstrueorfalse).
- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.EqualsAlwaysReturnsTrueOrFalse","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#equalsalwaysreturnstrueorfalse)

<a id="detekt-detekt-potential-bugs-equalswithhashcodeexist"></a>

### `detekt/detekt.potential-bugs.EqualsWithHashCodeExist`

Always override hashCode when you override equals.

- **Why it is on:** All hash-based collections depend on objects meeting the equals-contract. Two equal objects must produce the same hashcode. When inheriting equals or hashcode, override the inherited and call the super method for clarification. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/potential-bugs#equalswithhashcodeexist).
- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.EqualsWithHashCodeExist","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#equalswithhashcodeexist)

<a id="detekt-detekt-potential-bugs-explicitgarbagecollectioncall"></a>

### `detekt/detekt.potential-bugs.ExplicitGarbageCollectionCall`

Don't try to be smarter than the JVM.

- **Why it is on:** Your code should work independently whether the garbage collector is disabled or not. If you face memory issues, try tuning the JVM options instead of relying on code itself. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/potential-bugs#explicitgarbagecollectioncall).
- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.ExplicitGarbageCollectionCall","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#explicitgarbagecollectioncall)

<a id="detekt-detekt-potential-bugs-hasplatformtype"></a>

### `detekt/detekt.potential-bugs.HasPlatformType`

Platform types must be declared explicitly in public APIs.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/potential-bugs#hasplatformtype).
- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.HasPlatformType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#hasplatformtype)

<a id="detekt-detekt-potential-bugs-ignoredreturnvalue"></a>

### `detekt/detekt.potential-bugs.IgnoredReturnValue`

This call returns a value which is ignored.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/potential-bugs#ignoredreturnvalue).
- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.IgnoredReturnValue","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#ignoredreturnvalue)

<a id="detekt-detekt-potential-bugs-implicitdefaultlocale"></a>

### `detekt/detekt.potential-bugs.ImplicitDefaultLocale`

Implicit default locale used for string processing.

- **Why it is on:** Consider using explicit locale. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/potential-bugs#implicitdefaultlocale).
- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.ImplicitDefaultLocale","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#implicitdefaultlocale)

<a id="detekt-detekt-potential-bugs-invalidrange"></a>

### `detekt/detekt.potential-bugs.InvalidRange`

If a for loops condition is false before the first iteration, the loop will never get executed.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/potential-bugs#invalidrange).
- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.InvalidRange","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#invalidrange)

<a id="detekt-detekt-potential-bugs-iteratorhasnextcallsnextmethod"></a>

### `detekt/detekt.potential-bugs.IteratorHasNextCallsNextMethod`

The `hasNext()` method of an Iterator implementation should not call the `next()` method.

- **Why it is on:** The state of the iterator should not be changed inside the `hasNext()` method. The `hasNext()` method is not supposed to have any side effects. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/potential-bugs#iteratorhasnextcallsnextmethod).
- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.IteratorHasNextCallsNextMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#iteratorhasnextcallsnextmethod)

<a id="detekt-detekt-potential-bugs-iteratornotthrowingnosuchelementexception"></a>

### `detekt/detekt.potential-bugs.IteratorNotThrowingNoSuchElementException`

The `next()` method of an `Iterator` implementation should throw a `NoSuchElementException` when there are no more elements to return.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/potential-bugs#iteratornotthrowingnosuchelementexception).
- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.IteratorNotThrowingNoSuchElementException","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#iteratornotthrowingnosuchelementexception)

<a id="detekt-detekt-potential-bugs-mapgetwithnotnullassertionoperator"></a>

### `detekt/detekt.potential-bugs.MapGetWithNotNullAssertionOperator`

Map.get() with not-null assertion operator (!!) can result in a NullPointerException.

- **Why it is on:** Consider usage of map.getValue(), map.getOrDefault() or map.getOrElse() instead. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/potential-bugs#mapgetwithnotnullassertionoperator).
- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.MapGetWithNotNullAssertionOperator","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#mapgetwithnotnullassertionoperator)

<a id="detekt-detekt-potential-bugs-unnecessarynotnulloperator"></a>

### `detekt/detekt.potential-bugs.UnnecessaryNotNullOperator`

Unnecessary not-null unary operator (!!) detected.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/potential-bugs#unnecessarynotnulloperator).
- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.UnnecessaryNotNullOperator","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#unnecessarynotnulloperator)

<a id="detekt-detekt-potential-bugs-unnecessarysafecall"></a>

### `detekt/detekt.potential-bugs.UnnecessarySafeCall`

Unnecessary safe call operator detected.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/potential-bugs#unnecessarysafecall).
- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.UnnecessarySafeCall","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#unnecessarysafecall)

<a id="detekt-detekt-potential-bugs-unreachablecatchblock"></a>

### `detekt/detekt.potential-bugs.UnreachableCatchBlock`

Unreachable catch block detected.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/potential-bugs#unreachablecatchblock).
- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.UnreachableCatchBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#unreachablecatchblock)

<a id="detekt-detekt-potential-bugs-unreachablecode"></a>

### `detekt/detekt.potential-bugs.UnreachableCode`

Unreachable code detected.

- **Why it is on:** This code should be removed. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/potential-bugs#unreachablecode).
- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.UnreachableCode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#unreachablecode)

<a id="detekt-detekt-potential-bugs-unsafecallonnullabletype"></a>

### `detekt/detekt.potential-bugs.UnsafeCallOnNullableType`

Unsafe calls on nullable types detected.

- **Why it is on:** These calls will throw a NullPointerException in case the nullable value is null. A one-way rule: nitpicker's detekt file turns it on and pins it, so a project cannot switch it off, lower its severity or exclude paths in detekt.yml. It narrows a spot where Kotlin offers several ways to the one allowed form.
- **Allowed form:** Handle null with `value ?: return`, `value?.let { ... }`, or `checkNotNull(value) { "why" }` when null is a bug.
- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.UnsafeCallOnNullableType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [detekt rule](https://detekt.dev/docs/rules/potential-bugs#unsafecallonnullabletype)

<a id="detekt-detekt-potential-bugs-unsafecast"></a>

### `detekt/detekt.potential-bugs.UnsafeCast`

Cast operator throws an exception if the cast is not possible.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/potential-bugs#unsafecast).
- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.UnsafeCast","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#unsafecast)

<a id="detekt-detekt-potential-bugs-unusedunaryoperator"></a>

### `detekt/detekt.potential-bugs.UnusedUnaryOperator`

This unary operator is unused.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/potential-bugs#unusedunaryoperator).
- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.UnusedUnaryOperator","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#unusedunaryoperator)

<a id="detekt-detekt-potential-bugs-uselesspostfixexpression"></a>

### `detekt/detekt.potential-bugs.UselessPostfixExpression`

The incremented or decremented value is unused.

- **Why it is on:** This value is replaced with the original value. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/potential-bugs#uselesspostfixexpression).
- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.UselessPostfixExpression","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#uselesspostfixexpression)

<a id="detekt-detekt-potential-bugs-wrongequalstypeparameter"></a>

### `detekt/detekt.potential-bugs.WrongEqualsTypeParameter`

Wrong parameter type for `equals()` method found.

- **Why it is on:** To correctly override the `equals()` method use `Any?`. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/potential-bugs#wrongequalstypeparameter).
- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.WrongEqualsTypeParameter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#wrongequalstypeparameter)

<a id="detekt-detekt-style-dataclassshouldbeimmutable"></a>

### `detekt/detekt.style.DataClassShouldBeImmutable`

Data classes should mainly be immutable and should not have any side effects (To copy an object altering some of its properties use the copy function).

- **Why it is on:** A one-way rule: nitpicker's detekt file turns it on and pins it, so a project cannot switch it off, lower its severity or exclude paths in detekt.yml. It narrows a spot where Kotlin offers several ways to the one allowed form.
- **Allowed form:** Make the property a `val` and build a changed copy with `copy(...)`.
- **Exception:** If this is intended, add `{"rule":"detekt.style.DataClassShouldBeImmutable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [detekt rule](https://detekt.dev/docs/rules/style#dataclassshouldbeimmutable)

<a id="detekt-detekt-style-destructuringdeclarationwithtoomanyentries"></a>

### `detekt/detekt.style.DestructuringDeclarationWithTooManyEntries`

Too many entries in a destructuring declaration make the code hard to understand.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#destructuringdeclarationwithtoomanyentries).
- **Exception:** If this is intended, add `{"rule":"detekt.style.DestructuringDeclarationWithTooManyEntries","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#destructuringdeclarationwithtoomanyentries)

<a id="detekt-detekt-style-equalsnullcall"></a>

### `detekt/detekt.style.EqualsNullCall`

Equals() method is called with null as parameter.

- **Why it is on:** Consider using == to compare to null. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#equalsnullcall).
- **Exception:** If this is intended, add `{"rule":"detekt.style.EqualsNullCall","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#equalsnullcall)

<a id="detekt-detekt-style-explicititlambdaparameter"></a>

### `detekt/detekt.style.ExplicitItLambdaParameter`

Declaring lambda parameters as `it` is redundant.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#explicititlambdaparameter).
- **Exception:** If this is intended, add `{"rule":"detekt.style.ExplicitItLambdaParameter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#explicititlambdaparameter)

<a id="detekt-detekt-style-forbiddencomment"></a>

### `detekt/detekt.style.ForbiddenComment`

Flags a forbidden comment.

- **Why it is on:** A one-way rule: nitpicker's detekt file turns it on and pins it, so a project cannot switch it off, lower its severity or exclude paths in detekt.yml. It narrows a spot where Kotlin offers several ways to the one allowed form.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#forbiddencomment).
- **Exception:** If this is intended, add `{"rule":"detekt.style.ForbiddenComment","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [detekt rule](https://detekt.dev/docs/rules/style#forbiddencomment)

<a id="detekt-detekt-style-forbiddenimport"></a>

### `detekt/detekt.style.ForbiddenImport`

Mark forbidden imports.

- **Why it is on:** A forbidden import could be an import for an unstable / experimental api and hence you might want to mark it as forbidden in order to get warned about the usage. A one-way rule: nitpicker's detekt file turns it on and pins it, so a project cannot switch it off, lower its severity or exclude paths in detekt.yml. It narrows a spot where Kotlin offers several ways to the one allowed form.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#forbiddenimport).
- **Exception:** If this is intended, add `{"rule":"detekt.style.ForbiddenImport","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [detekt rule](https://detekt.dev/docs/rules/style#forbiddenimport)

<a id="detekt-detekt-style-forbiddenmethodcall"></a>

### `detekt/detekt.style.ForbiddenMethodCall`

Mark forbidden methods.

- **Why it is on:** A forbidden method could be an invocation of an unstable / experimental method and hence you might want to mark it as forbidden in order to get warned about the usage. A one-way rule: nitpicker's detekt file turns it on and pins it, so a project cannot switch it off, lower its severity or exclude paths in detekt.yml. It narrows a spot where Kotlin offers several ways to the one allowed form.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#forbiddenmethodcall).
- **Exception:** If this is intended, add `{"rule":"detekt.style.ForbiddenMethodCall","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [detekt rule](https://detekt.dev/docs/rules/style#forbiddenmethodcall)

<a id="detekt-detekt-style-forbiddenvoid"></a>

### `detekt/detekt.style.ForbiddenVoid`

`Unit` should be used instead of `Void`.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#forbiddenvoid).
- **Exception:** If this is intended, add `{"rule":"detekt.style.ForbiddenVoid","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#forbiddenvoid)

<a id="detekt-detekt-style-functiononlyreturningconstant"></a>

### `detekt/detekt.style.FunctionOnlyReturningConstant`

A function that only returns a constant is misleading.

- **Why it is on:** Consider declaring a constant instead. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#functiononlyreturningconstant).
- **Exception:** If this is intended, add `{"rule":"detekt.style.FunctionOnlyReturningConstant","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#functiononlyreturningconstant)

<a id="detekt-detekt-style-loopwithtoomanyjumpstatements"></a>

### `detekt/detekt.style.LoopWithTooManyJumpStatements`

The loop contains more than one break or continue statement.

- **Why it is on:** The code should be refactored to increase readability. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#loopwithtoomanyjumpstatements).
- **Exception:** If this is intended, add `{"rule":"detekt.style.LoopWithTooManyJumpStatements","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#loopwithtoomanyjumpstatements)

<a id="detekt-detekt-style-magicnumber"></a>

### `detekt/detekt.style.MagicNumber`

Report magic numbers.

- **Why it is on:** Magic number is a numeric literal that is not defined as a constant and hence it's unclear what the purpose of this number is. It's better to declare such numbers as constants and give them a proper name. By default, -1, 0, 1, and 2 are not considered to be magic numbers. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#magicnumber).
- **Exception:** If this is intended, add `{"rule":"detekt.style.MagicNumber","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#magicnumber)

<a id="detekt-detekt-style-maxlinelength"></a>

### `detekt/detekt.style.MaxLineLength`

Line detected, which is longer than the defined maximum line length in the code style.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#maxlinelength).
- **Exception:** If this is intended, add `{"rule":"detekt.style.MaxLineLength","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#maxlinelength)

<a id="detekt-detekt-style-maybeconst"></a>

### `detekt/detekt.style.MayBeConst`

Usage of `vals` that can be `const val` detected.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#maybeconst).
- **Exception:** If this is intended, add `{"rule":"detekt.style.MayBeConst","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#maybeconst)

<a id="detekt-detekt-style-modifierorder"></a>

### `detekt/detekt.style.ModifierOrder`

Modifiers are not in the correct order.

- **Why it is on:** Consider to reorder these modifiers. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#modifierorder).
- **Exception:** If this is intended, add `{"rule":"detekt.style.ModifierOrder","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#modifierorder)

<a id="detekt-detekt-style-nestedclassesvisibility"></a>

### `detekt/detekt.style.NestedClassesVisibility`

The explicit public modifier still results in an internal nested class.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#nestedclassesvisibility).
- **Exception:** If this is intended, add `{"rule":"detekt.style.NestedClassesVisibility","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#nestedclassesvisibility)

<a id="detekt-detekt-style-newlineatendoffile"></a>

### `detekt/detekt.style.NewLineAtEndOfFile`

Checks whether files end with a line separator.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#newlineatendoffile).
- **Exception:** If this is intended, add `{"rule":"detekt.style.NewLineAtEndOfFile","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#newlineatendoffile)

<a id="detekt-detekt-style-objectliteraltolambda"></a>

### `detekt/detekt.style.ObjectLiteralToLambda`

Report object literals that can be changed to lambdas.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#objectliteraltolambda).
- **Exception:** If this is intended, add `{"rule":"detekt.style.ObjectLiteralToLambda","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#objectliteraltolambda)

<a id="detekt-detekt-style-optionalabstractkeyword"></a>

### `detekt/detekt.style.OptionalAbstractKeyword`

Unnecessary abstract modifier in interface detected.

- **Why it is on:** This abstract modifier is unnecessary and thus can be removed. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#optionalabstractkeyword).
- **Exception:** If this is intended, add `{"rule":"detekt.style.OptionalAbstractKeyword","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#optionalabstractkeyword)

<a id="detekt-detekt-style-protectedmemberinfinalclass"></a>

### `detekt/detekt.style.ProtectedMemberInFinalClass`

Member with protected visibility in final class is private.

- **Why it is on:** Consider using private or internal as modifier. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#protectedmemberinfinalclass).
- **Exception:** If this is intended, add `{"rule":"detekt.style.ProtectedMemberInFinalClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#protectedmemberinfinalclass)

<a id="detekt-detekt-style-redundanthigherordermapusage"></a>

### `detekt/detekt.style.RedundantHigherOrderMapUsage`

Checks for redundant 'map' calls, which can be removed.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#redundanthigherordermapusage).
- **Exception:** If this is intended, add `{"rule":"detekt.style.RedundantHigherOrderMapUsage","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#redundanthigherordermapusage)

<a id="detekt-detekt-style-returncount"></a>

### `detekt/detekt.style.ReturnCount`

Restrict the number of return statements in methods.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#returncount).
- **Exception:** If this is intended, add `{"rule":"detekt.style.ReturnCount","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#returncount)

<a id="detekt-detekt-style-safecast"></a>

### `detekt/detekt.style.SafeCast`

Prefer to use a safe cast instead of if-else-null.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#safecast).
- **Exception:** If this is intended, add `{"rule":"detekt.style.SafeCast","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#safecast)

<a id="detekt-detekt-style-serialversionuidinserializableclass"></a>

### `detekt/detekt.style.SerialVersionUIDInSerializableClass`

A class which implements the Serializable interface does not define a correct serialVersionUID field.

- **Why it is on:** The serialVersionUID field should be a private constant long value inside a companion object. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#serialversionuidinserializableclass).
- **Exception:** If this is intended, add `{"rule":"detekt.style.SerialVersionUIDInSerializableClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#serialversionuidinserializableclass)

<a id="detekt-detekt-style-throwscount"></a>

### `detekt/detekt.style.ThrowsCount`

Restrict the number of throw statements in methods.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#throwscount).
- **Exception:** If this is intended, add `{"rule":"detekt.style.ThrowsCount","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#throwscount)

<a id="detekt-detekt-style-unnecessaryabstractclass"></a>

### `detekt/detekt.style.UnnecessaryAbstractClass`

An abstract class is unnecessary.

- **Why it is on:** May be refactored to an interface or to a concrete class. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#unnecessaryabstractclass).
- **Exception:** If this is intended, add `{"rule":"detekt.style.UnnecessaryAbstractClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#unnecessaryabstractclass)

<a id="detekt-detekt-style-unnecessaryapply"></a>

### `detekt/detekt.style.UnnecessaryApply`

The `apply` usage is unnecessary and can be removed.

- **Why it is on:** A one-way rule: nitpicker's detekt file turns it on and pins it, so a project cannot switch it off, lower its severity or exclude paths in detekt.yml. It narrows a spot where Kotlin offers several ways to the one allowed form.
- **Allowed form:** Remove `apply`; use it only to configure an object you just created.
- **Exception:** If this is intended, add `{"rule":"detekt.style.UnnecessaryApply","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [detekt rule](https://detekt.dev/docs/rules/style#unnecessaryapply)

<a id="detekt-detekt-style-unnecessaryfilter"></a>

### `detekt/detekt.style.UnnecessaryFilter`

`filter()` with other collection operations may be simplified.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#unnecessaryfilter).
- **Exception:** If this is intended, add `{"rule":"detekt.style.UnnecessaryFilter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#unnecessaryfilter)

<a id="detekt-detekt-style-unnecessaryinheritance"></a>

### `detekt/detekt.style.UnnecessaryInheritance`

The extended super type is unnecessary.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#unnecessaryinheritance).
- **Exception:** If this is intended, add `{"rule":"detekt.style.UnnecessaryInheritance","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#unnecessaryinheritance)

<a id="detekt-detekt-style-unnecessarylet"></a>

### `detekt/detekt.style.UnnecessaryLet`

The `let` usage is unnecessary.

- **Why it is on:** A one-way rule: nitpicker's detekt file turns it on and pins it, so a project cannot switch it off, lower its severity or exclude paths in detekt.yml. It narrows a spot where Kotlin offers several ways to the one allowed form.
- **Allowed form:** Call the member directly; `let` is for `value?.let { ... }`.
- **Exception:** If this is intended, add `{"rule":"detekt.style.UnnecessaryLet","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [detekt rule](https://detekt.dev/docs/rules/style#unnecessarylet)

<a id="detekt-detekt-style-unusedparameter"></a>

### `detekt/detekt.style.UnusedParameter`

Function parameter is unused and should be removed.

- **Why it is on:** A one-way rule: nitpicker's detekt file turns it on and pins it, so a project cannot switch it off, lower its severity or exclude paths in detekt.yml. It narrows a spot where Kotlin offers several ways to the one allowed form.
- **Allowed form:** Remove the parameter and update the callers, or use it. An override, `main`, a function with any annotation other than `@Deprecated`, `@Suppress`, `@Throws`, `@JvmStatic`, `@JvmOverloads` or `@JvmName` (`@GetMapping`, `@Bean`, `@Test`, `@Inject`, ...) and a name starting `ignored` or `unused` are skipped.
- **Exception:** If this is intended, add `{"rule":"detekt.style.UnusedParameter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [detekt rule](https://detekt.dev/docs/rules/style#unusedparameter)

<a id="detekt-detekt-style-unusedprivateclass"></a>

### `detekt/detekt.style.UnusedPrivateClass`

Private class is unused and should be removed.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#unusedprivateclass).
- **Exception:** If this is intended, add `{"rule":"detekt.style.UnusedPrivateClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#unusedprivateclass)

<a id="detekt-detekt-style-unusedprivatemember"></a>

### `detekt/detekt.style.UnusedPrivateMember`

Private function is unused and should be removed.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#unusedprivatemember).
- **Exception:** If this is intended, add `{"rule":"detekt.style.UnusedPrivateMember","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#unusedprivatemember)

<a id="detekt-detekt-style-unusedprivateproperty"></a>

### `detekt/detekt.style.UnusedPrivateProperty`

Property is unused and should be removed.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#unusedprivateproperty).
- **Exception:** If this is intended, add `{"rule":"detekt.style.UnusedPrivateProperty","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#unusedprivateproperty)

<a id="detekt-detekt-style-useanyornoneinsteadoffind"></a>

### `detekt/detekt.style.UseAnyOrNoneInsteadOfFind`

Use `any` or `none` instead of `find` and `null` checks.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#useanyornoneinsteadoffind).
- **Exception:** If this is intended, add `{"rule":"detekt.style.UseAnyOrNoneInsteadOfFind","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#useanyornoneinsteadoffind)

<a id="detekt-detekt-style-usearrayliteralsinannotations"></a>

### `detekt/detekt.style.UseArrayLiteralsInAnnotations`

Array literals [...] should be preferred as they are more readable than `arrayOf(...)` expressions.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#usearrayliteralsinannotations).
- **Exception:** If this is intended, add `{"rule":"detekt.style.UseArrayLiteralsInAnnotations","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#usearrayliteralsinannotations)

<a id="detekt-detekt-style-usechecknotnull"></a>

### `detekt/detekt.style.UseCheckNotNull`

Use checkNotNull() instead of check() for checking not-null.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#usechecknotnull).
- **Exception:** If this is intended, add `{"rule":"detekt.style.UseCheckNotNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#usechecknotnull)

<a id="detekt-detekt-style-usecheckorerror"></a>

### `detekt/detekt.style.UseCheckOrError`

Use check() or error() instead of throwing an IllegalStateException.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#usecheckorerror).
- **Exception:** If this is intended, add `{"rule":"detekt.style.UseCheckOrError","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#usecheckorerror)

<a id="detekt-detekt-style-usedataclass"></a>

### `detekt/detekt.style.UseDataClass`

Classes that do nothing but hold data should be replaced with a data class.

- **Why it is on:** A one-way rule: nitpicker's detekt file turns it on and pins it, so a project cannot switch it off, lower its severity or exclude paths in detekt.yml. It narrows a spot where Kotlin offers several ways to the one allowed form.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#usedataclass).
- **Exception:** If this is intended, add `{"rule":"detekt.style.UseDataClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [detekt rule](https://detekt.dev/docs/rules/style#usedataclass)

<a id="detekt-detekt-style-useisnullorempty"></a>

### `detekt/detekt.style.UseIsNullOrEmpty`

Use `isNullOrEmpty()` call instead of `x == null || x.isEmpty()`.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#useisnullorempty).
- **Exception:** If this is intended, add `{"rule":"detekt.style.UseIsNullOrEmpty","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#useisnullorempty)

<a id="detekt-detekt-style-uselesscallonnotnull"></a>

### `detekt/detekt.style.UselessCallOnNotNull`

This call on a non-null reference may be reduced or removed.

- **Why it is on:** Some calls are intended to be called on nullable collection or text types (e.g. `String?`).When this call is used on a reference to a non-null type (e.g. `String`) it is redundant and will have no effect, so it can be removed. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#uselesscallonnotnull).
- **Exception:** If this is intended, add `{"rule":"detekt.style.UselessCallOnNotNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#uselesscallonnotnull)

<a id="detekt-detekt-style-uselet"></a>

### `detekt/detekt.style.UseLet`

Use `?.let {}` instead of if/else with a null block when checking for nullable values.

- **Why it is on:** A one-way rule: nitpicker's detekt file turns it on and pins it, so a project cannot switch it off, lower its severity or exclude paths in detekt.yml. It narrows a spot where Kotlin offers several ways to the one allowed form.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#uselet).
- **Exception:** If this is intended, add `{"rule":"detekt.style.UseLet","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [detekt rule](https://detekt.dev/docs/rules/style#uselet)

<a id="detekt-detekt-style-useorempty"></a>

### `detekt/detekt.style.UseOrEmpty`

Use `orEmpty()` call instead of `?:` with empty collection factory methods.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#useorempty).
- **Exception:** If this is intended, add `{"rule":"detekt.style.UseOrEmpty","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#useorempty)

<a id="detekt-detekt-style-userequire"></a>

### `detekt/detekt.style.UseRequire`

Use require() instead of throwing an IllegalArgumentException.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#userequire).
- **Exception:** If this is intended, add `{"rule":"detekt.style.UseRequire","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#userequire)

<a id="detekt-detekt-style-userequirenotnull"></a>

### `detekt/detekt.style.UseRequireNotNull`

Use requireNotNull() instead of require() for checking not-null.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#userequirenotnull).
- **Exception:** If this is intended, add `{"rule":"detekt.style.UseRequireNotNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#userequirenotnull)

<a id="detekt-detekt-style-utilityclasswithpublicconstructor"></a>

### `detekt/detekt.style.UtilityClassWithPublicConstructor`

The class declaration is unnecessary because it only contains utility functions.

- **Why it is on:** An object declaration should be used instead. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#utilityclasswithpublicconstructor).
- **Exception:** If this is intended, add `{"rule":"detekt.style.UtilityClassWithPublicConstructor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#utilityclasswithpublicconstructor)

<a id="detekt-detekt-style-varcouldbeval"></a>

### `detekt/detekt.style.VarCouldBeVal`

Var declaration could be val.

- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#varcouldbeval).
- **Exception:** If this is intended, add `{"rule":"detekt.style.VarCouldBeVal","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#varcouldbeval)

<a id="detekt-detekt-style-wildcardimport"></a>

### `detekt/detekt.style.WildcardImport`

Wildcard imports should be replaced with imports using fully qualified class names.

- **Why it is on:** Wildcard imports can lead to naming conflicts. A library update can introduce naming clashes with your classes which results in compilation errors. One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.
- **Allowed form:** See the tool's documentation: [detekt rule](https://detekt.dev/docs/rules/style#wildcardimport).
- **Exception:** If this is intended, add `{"rule":"detekt.style.WildcardImport","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#wildcardimport)
