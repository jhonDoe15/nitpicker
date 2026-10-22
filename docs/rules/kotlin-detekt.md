# Kotlin: detekt rules

detekt's default rules and the one-way rules nitpicker pins on top of them (`detekt.<ruleset>.<Rule>`). This page lists 125 rules. [All pages](README.md).

The guide for these rules: [docs/kotlin-preset.md#one-way-rules](../kotlin-preset.md#one-way-rules).

Unless an entry says otherwise:

- **Presets:** Kotlin
- **Analyzers:** `kotlin`
- **Builds:** Gradle and Maven
- **Why it is on:** One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.

<a id="detekt-detekt-complexity-complexcondition"></a>

### `detekt/detekt.complexity.ComplexCondition`

Complex condition.

- **Exception:** If this is intended, add `{"rule":"detekt.complexity.ComplexCondition","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/complexity#complexcondition)

<a id="detekt-detekt-complexity-cyclomaticcomplexmethod"></a>

### `detekt/detekt.complexity.CyclomaticComplexMethod`

Cyclomatic complex method.

- **Exception:** If this is intended, add `{"rule":"detekt.complexity.CyclomaticComplexMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/complexity#cyclomaticcomplexmethod)

<a id="detekt-detekt-complexity-largeclass"></a>

### `detekt/detekt.complexity.LargeClass`

Large class.

- **Exception:** If this is intended, add `{"rule":"detekt.complexity.LargeClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/complexity#largeclass)

<a id="detekt-detekt-complexity-longmethod"></a>

### `detekt/detekt.complexity.LongMethod`

Long method.

- **Exception:** If this is intended, add `{"rule":"detekt.complexity.LongMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/complexity#longmethod)

<a id="detekt-detekt-complexity-longparameterlist"></a>

### `detekt/detekt.complexity.LongParameterList`

Long parameter list.

- **Exception:** If this is intended, add `{"rule":"detekt.complexity.LongParameterList","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/complexity#longparameterlist)

<a id="detekt-detekt-complexity-nestedblockdepth"></a>

### `detekt/detekt.complexity.NestedBlockDepth`

Nested block depth.

- **Exception:** If this is intended, add `{"rule":"detekt.complexity.NestedBlockDepth","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/complexity#nestedblockdepth)

<a id="detekt-detekt-complexity-stringliteralduplication"></a>

### `detekt/detekt.complexity.StringLiteralDuplication`

String literal duplication.

- **Why it is on:** A one-way rule: nitpicker's detekt file turns it on and pins it, so a project cannot switch it off, lower its severity or exclude paths in detekt.yml. It narrows a spot where Kotlin offers several ways to the one allowed form.
- **Allowed form:** Name it once as a constant (`private const val NAME = "..."`) and use the constant.
- **Exception:** If this is intended, add `{"rule":"detekt.complexity.StringLiteralDuplication","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [detekt rule](https://detekt.dev/docs/rules/complexity#stringliteralduplication)

<a id="detekt-detekt-complexity-toomanyfunctions"></a>

### `detekt/detekt.complexity.TooManyFunctions`

Too many functions.

- **Exception:** If this is intended, add `{"rule":"detekt.complexity.TooManyFunctions","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/complexity#toomanyfunctions)

<a id="detekt-detekt-coroutines-globalcoroutineusage"></a>

### `detekt/detekt.coroutines.GlobalCoroutineUsage`

Global coroutine usage.

- **Why it is on:** A one-way rule: nitpicker's detekt file turns it on and pins it, so a project cannot switch it off, lower its severity or exclude paths in detekt.yml. It narrows a spot where Kotlin offers several ways to the one allowed form.
- **Exception:** If this is intended, add `{"rule":"detekt.coroutines.GlobalCoroutineUsage","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [detekt rule](https://detekt.dev/docs/rules/coroutines#globalcoroutineusage)

<a id="detekt-detekt-coroutines-injectdispatcher"></a>

### `detekt/detekt.coroutines.InjectDispatcher`

Inject dispatcher.

- **Exception:** If this is intended, add `{"rule":"detekt.coroutines.InjectDispatcher","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/coroutines#injectdispatcher)

<a id="detekt-detekt-coroutines-redundantsuspendmodifier"></a>

### `detekt/detekt.coroutines.RedundantSuspendModifier`

Redundant suspend modifier.

- **Exception:** If this is intended, add `{"rule":"detekt.coroutines.RedundantSuspendModifier","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/coroutines#redundantsuspendmodifier)

<a id="detekt-detekt-coroutines-sleepinsteadofdelay"></a>

### `detekt/detekt.coroutines.SleepInsteadOfDelay`

Sleep instead of delay.

- **Exception:** If this is intended, add `{"rule":"detekt.coroutines.SleepInsteadOfDelay","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/coroutines#sleepinsteadofdelay)

<a id="detekt-detekt-coroutines-suspendfunwithflowreturntype"></a>

### `detekt/detekt.coroutines.SuspendFunWithFlowReturnType`

Suspend fun with flow return type.

- **Exception:** If this is intended, add `{"rule":"detekt.coroutines.SuspendFunWithFlowReturnType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/coroutines#suspendfunwithflowreturntype)

<a id="detekt-detekt-empty-blocks-emptycatchblock"></a>

### `detekt/detekt.empty-blocks.EmptyCatchBlock`

Empty catch block.

- **Exception:** If this is intended, add `{"rule":"detekt.empty-blocks.EmptyCatchBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptycatchblock)

<a id="detekt-detekt-empty-blocks-emptyclassblock"></a>

### `detekt/detekt.empty-blocks.EmptyClassBlock`

Empty class block.

- **Exception:** If this is intended, add `{"rule":"detekt.empty-blocks.EmptyClassBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptyclassblock)

<a id="detekt-detekt-empty-blocks-emptydefaultconstructor"></a>

### `detekt/detekt.empty-blocks.EmptyDefaultConstructor`

Empty default constructor.

- **Exception:** If this is intended, add `{"rule":"detekt.empty-blocks.EmptyDefaultConstructor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptydefaultconstructor)

<a id="detekt-detekt-empty-blocks-emptydowhileblock"></a>

### `detekt/detekt.empty-blocks.EmptyDoWhileBlock`

Empty do while block.

- **Exception:** If this is intended, add `{"rule":"detekt.empty-blocks.EmptyDoWhileBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptydowhileblock)

<a id="detekt-detekt-empty-blocks-emptyelseblock"></a>

### `detekt/detekt.empty-blocks.EmptyElseBlock`

Empty else block.

- **Exception:** If this is intended, add `{"rule":"detekt.empty-blocks.EmptyElseBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptyelseblock)

<a id="detekt-detekt-empty-blocks-emptyfinallyblock"></a>

### `detekt/detekt.empty-blocks.EmptyFinallyBlock`

Empty finally block.

- **Exception:** If this is intended, add `{"rule":"detekt.empty-blocks.EmptyFinallyBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptyfinallyblock)

<a id="detekt-detekt-empty-blocks-emptyforblock"></a>

### `detekt/detekt.empty-blocks.EmptyForBlock`

Empty for block.

- **Exception:** If this is intended, add `{"rule":"detekt.empty-blocks.EmptyForBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptyforblock)

<a id="detekt-detekt-empty-blocks-emptyfunctionblock"></a>

### `detekt/detekt.empty-blocks.EmptyFunctionBlock`

Empty function block.

- **Exception:** If this is intended, add `{"rule":"detekt.empty-blocks.EmptyFunctionBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptyfunctionblock)

<a id="detekt-detekt-empty-blocks-emptyifblock"></a>

### `detekt/detekt.empty-blocks.EmptyIfBlock`

Empty if block.

- **Exception:** If this is intended, add `{"rule":"detekt.empty-blocks.EmptyIfBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptyifblock)

<a id="detekt-detekt-empty-blocks-emptyinitblock"></a>

### `detekt/detekt.empty-blocks.EmptyInitBlock`

Empty init block.

- **Exception:** If this is intended, add `{"rule":"detekt.empty-blocks.EmptyInitBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptyinitblock)

<a id="detekt-detekt-empty-blocks-emptyktfile"></a>

### `detekt/detekt.empty-blocks.EmptyKtFile`

Empty kt file.

- **Exception:** If this is intended, add `{"rule":"detekt.empty-blocks.EmptyKtFile","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptyktfile)

<a id="detekt-detekt-empty-blocks-emptysecondaryconstructor"></a>

### `detekt/detekt.empty-blocks.EmptySecondaryConstructor`

Empty secondary constructor.

- **Exception:** If this is intended, add `{"rule":"detekt.empty-blocks.EmptySecondaryConstructor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptysecondaryconstructor)

<a id="detekt-detekt-empty-blocks-emptytryblock"></a>

### `detekt/detekt.empty-blocks.EmptyTryBlock`

Empty try block.

- **Exception:** If this is intended, add `{"rule":"detekt.empty-blocks.EmptyTryBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptytryblock)

<a id="detekt-detekt-empty-blocks-emptywhenblock"></a>

### `detekt/detekt.empty-blocks.EmptyWhenBlock`

Empty when block.

- **Exception:** If this is intended, add `{"rule":"detekt.empty-blocks.EmptyWhenBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptywhenblock)

<a id="detekt-detekt-empty-blocks-emptywhileblock"></a>

### `detekt/detekt.empty-blocks.EmptyWhileBlock`

Empty while block.

- **Exception:** If this is intended, add `{"rule":"detekt.empty-blocks.EmptyWhileBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/empty-blocks#emptywhileblock)

<a id="detekt-detekt-exceptions-exceptionraisedinunexpectedlocation"></a>

### `detekt/detekt.exceptions.ExceptionRaisedInUnexpectedLocation`

Exception raised in unexpected location.

- **Exception:** If this is intended, add `{"rule":"detekt.exceptions.ExceptionRaisedInUnexpectedLocation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/exceptions#exceptionraisedinunexpectedlocation)

<a id="detekt-detekt-exceptions-instanceofcheckforexception"></a>

### `detekt/detekt.exceptions.InstanceOfCheckForException`

Instance of check for exception.

- **Exception:** If this is intended, add `{"rule":"detekt.exceptions.InstanceOfCheckForException","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/exceptions#instanceofcheckforexception)

<a id="detekt-detekt-exceptions-printstacktrace"></a>

### `detekt/detekt.exceptions.PrintStackTrace`

Print stack trace.

- **Exception:** If this is intended, add `{"rule":"detekt.exceptions.PrintStackTrace","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/exceptions#printstacktrace)

<a id="detekt-detekt-exceptions-rethrowcaughtexception"></a>

### `detekt/detekt.exceptions.RethrowCaughtException`

Rethrow caught exception.

- **Exception:** If this is intended, add `{"rule":"detekt.exceptions.RethrowCaughtException","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/exceptions#rethrowcaughtexception)

<a id="detekt-detekt-exceptions-returnfromfinally"></a>

### `detekt/detekt.exceptions.ReturnFromFinally`

Return from finally.

- **Exception:** If this is intended, add `{"rule":"detekt.exceptions.ReturnFromFinally","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/exceptions#returnfromfinally)

<a id="detekt-detekt-exceptions-swallowedexception"></a>

### `detekt/detekt.exceptions.SwallowedException`

Swallowed exception.

- **Exception:** If this is intended, add `{"rule":"detekt.exceptions.SwallowedException","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/exceptions#swallowedexception)

<a id="detekt-detekt-exceptions-throwingexceptionfromfinally"></a>

### `detekt/detekt.exceptions.ThrowingExceptionFromFinally`

Throwing exception from finally.

- **Exception:** If this is intended, add `{"rule":"detekt.exceptions.ThrowingExceptionFromFinally","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/exceptions#throwingexceptionfromfinally)

<a id="detekt-detekt-exceptions-throwingexceptionswithoutmessageorcause"></a>

### `detekt/detekt.exceptions.ThrowingExceptionsWithoutMessageOrCause`

Throwing exceptions without message or cause.

- **Exception:** If this is intended, add `{"rule":"detekt.exceptions.ThrowingExceptionsWithoutMessageOrCause","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/exceptions#throwingexceptionswithoutmessageorcause)

<a id="detekt-detekt-exceptions-throwingnewinstanceofsameexception"></a>

### `detekt/detekt.exceptions.ThrowingNewInstanceOfSameException`

Throwing new instance of same exception.

- **Exception:** If this is intended, add `{"rule":"detekt.exceptions.ThrowingNewInstanceOfSameException","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/exceptions#throwingnewinstanceofsameexception)

<a id="detekt-detekt-exceptions-toogenericexceptioncaught"></a>

### `detekt/detekt.exceptions.TooGenericExceptionCaught`

Too generic exception caught.

- **Why it is on:** A one-way rule: nitpicker's detekt file turns it on and pins it, so a project cannot switch it off, lower its severity or exclude paths in detekt.yml. It narrows a spot where Kotlin offers several ways to the one allowed form.
- **Allowed form:** In a test, use `assertFailsWith`.
- **Exception:** If this is intended, add `{"rule":"detekt.exceptions.TooGenericExceptionCaught","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [detekt rule](https://detekt.dev/docs/rules/exceptions#toogenericexceptioncaught)

<a id="detekt-detekt-exceptions-toogenericexceptionthrown"></a>

### `detekt/detekt.exceptions.TooGenericExceptionThrown`

Too generic exception thrown.

- **Exception:** If this is intended, add `{"rule":"detekt.exceptions.TooGenericExceptionThrown","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/exceptions#toogenericexceptionthrown)

<a id="detekt-detekt-naming-classnaming"></a>

### `detekt/detekt.naming.ClassNaming`

Class naming.

- **Exception:** If this is intended, add `{"rule":"detekt.naming.ClassNaming","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/naming#classnaming)

<a id="detekt-detekt-naming-constructorparameternaming"></a>

### `detekt/detekt.naming.ConstructorParameterNaming`

Constructor parameter naming.

- **Exception:** If this is intended, add `{"rule":"detekt.naming.ConstructorParameterNaming","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/naming#constructorparameternaming)

<a id="detekt-detekt-naming-enumnaming"></a>

### `detekt/detekt.naming.EnumNaming`

Enum naming.

- **Exception:** If this is intended, add `{"rule":"detekt.naming.EnumNaming","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/naming#enumnaming)

<a id="detekt-detekt-naming-functionnaming"></a>

### `detekt/detekt.naming.FunctionNaming`

Function naming.

- **Exception:** If this is intended, add `{"rule":"detekt.naming.FunctionNaming","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/naming#functionnaming)

<a id="detekt-detekt-naming-functionparameternaming"></a>

### `detekt/detekt.naming.FunctionParameterNaming`

Function parameter naming.

- **Exception:** If this is intended, add `{"rule":"detekt.naming.FunctionParameterNaming","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/naming#functionparameternaming)

<a id="detekt-detekt-naming-invalidpackagedeclaration"></a>

### `detekt/detekt.naming.InvalidPackageDeclaration`

Invalid package declaration.

- **Exception:** If this is intended, add `{"rule":"detekt.naming.InvalidPackageDeclaration","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/naming#invalidpackagedeclaration)

<a id="detekt-detekt-naming-matchingdeclarationname"></a>

### `detekt/detekt.naming.MatchingDeclarationName`

Matching declaration name.

- **Exception:** If this is intended, add `{"rule":"detekt.naming.MatchingDeclarationName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/naming#matchingdeclarationname)

<a id="detekt-detekt-naming-membernameequalsclassname"></a>

### `detekt/detekt.naming.MemberNameEqualsClassName`

Member name equals class name.

- **Exception:** If this is intended, add `{"rule":"detekt.naming.MemberNameEqualsClassName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/naming#membernameequalsclassname)

<a id="detekt-detekt-naming-nonameshadowing"></a>

### `detekt/detekt.naming.NoNameShadowing`

No name shadowing.

- **Exception:** If this is intended, add `{"rule":"detekt.naming.NoNameShadowing","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/naming#nonameshadowing)

<a id="detekt-detekt-naming-objectpropertynaming"></a>

### `detekt/detekt.naming.ObjectPropertyNaming`

Object property naming.

- **Exception:** If this is intended, add `{"rule":"detekt.naming.ObjectPropertyNaming","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/naming#objectpropertynaming)

<a id="detekt-detekt-naming-packagenaming"></a>

### `detekt/detekt.naming.PackageNaming`

Package naming.

- **Exception:** If this is intended, add `{"rule":"detekt.naming.PackageNaming","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/naming#packagenaming)

<a id="detekt-detekt-naming-toplevelpropertynaming"></a>

### `detekt/detekt.naming.TopLevelPropertyNaming`

Top level property naming.

- **Exception:** If this is intended, add `{"rule":"detekt.naming.TopLevelPropertyNaming","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/naming#toplevelpropertynaming)

<a id="detekt-detekt-naming-variablenaming"></a>

### `detekt/detekt.naming.VariableNaming`

Variable naming.

- **Exception:** If this is intended, add `{"rule":"detekt.naming.VariableNaming","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/naming#variablenaming)

<a id="detekt-detekt-performance-arrayprimitive"></a>

### `detekt/detekt.performance.ArrayPrimitive`

Array primitive.

- **Exception:** If this is intended, add `{"rule":"detekt.performance.ArrayPrimitive","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/performance#arrayprimitive)

<a id="detekt-detekt-performance-foreachonrange"></a>

### `detekt/detekt.performance.ForEachOnRange`

For each on range.

- **Exception:** If this is intended, add `{"rule":"detekt.performance.ForEachOnRange","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/performance#foreachonrange)

<a id="detekt-detekt-performance-spreadoperator"></a>

### `detekt/detekt.performance.SpreadOperator`

Spread operator.

- **Exception:** If this is intended, add `{"rule":"detekt.performance.SpreadOperator","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/performance#spreadoperator)

<a id="detekt-detekt-performance-unnecessarytemporaryinstantiation"></a>

### `detekt/detekt.performance.UnnecessaryTemporaryInstantiation`

Unnecessary temporary instantiation.

- **Exception:** If this is intended, add `{"rule":"detekt.performance.UnnecessaryTemporaryInstantiation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/performance#unnecessarytemporaryinstantiation)

<a id="detekt-detekt-potential-bugs-avoidreferentialequality"></a>

### `detekt/detekt.potential-bugs.AvoidReferentialEquality`

Avoid referential equality.

- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.AvoidReferentialEquality","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#avoidreferentialequality)

<a id="detekt-detekt-potential-bugs-castnullabletononnullabletype"></a>

### `detekt/detekt.potential-bugs.CastNullableToNonNullableType`

Cast nullable to non nullable type.

- **Why it is on:** A one-way rule: nitpicker's detekt file turns it on and pins it, so a project cannot switch it off, lower its severity or exclude paths in detekt.yml. It narrows a spot where Kotlin offers several ways to the one allowed form.
- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.CastNullableToNonNullableType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [detekt rule](https://detekt.dev/docs/rules/potential-bugs#castnullabletononnullabletype)

<a id="detekt-detekt-potential-bugs-doublemutabilityforcollection"></a>

### `detekt/detekt.potential-bugs.DoubleMutabilityForCollection`

Double mutability for collection.

- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.DoubleMutabilityForCollection","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#doublemutabilityforcollection)

<a id="detekt-detekt-potential-bugs-equalsalwaysreturnstrueorfalse"></a>

### `detekt/detekt.potential-bugs.EqualsAlwaysReturnsTrueOrFalse`

Equals always returns true or false.

- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.EqualsAlwaysReturnsTrueOrFalse","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#equalsalwaysreturnstrueorfalse)

<a id="detekt-detekt-potential-bugs-equalswithhashcodeexist"></a>

### `detekt/detekt.potential-bugs.EqualsWithHashCodeExist`

Equals with hash code exist.

- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.EqualsWithHashCodeExist","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#equalswithhashcodeexist)

<a id="detekt-detekt-potential-bugs-explicitgarbagecollectioncall"></a>

### `detekt/detekt.potential-bugs.ExplicitGarbageCollectionCall`

Explicit garbage collection call.

- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.ExplicitGarbageCollectionCall","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#explicitgarbagecollectioncall)

<a id="detekt-detekt-potential-bugs-hasplatformtype"></a>

### `detekt/detekt.potential-bugs.HasPlatformType`

Has platform type.

- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.HasPlatformType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#hasplatformtype)

<a id="detekt-detekt-potential-bugs-ignoredreturnvalue"></a>

### `detekt/detekt.potential-bugs.IgnoredReturnValue`

Ignored return value.

- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.IgnoredReturnValue","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#ignoredreturnvalue)

<a id="detekt-detekt-potential-bugs-implicitdefaultlocale"></a>

### `detekt/detekt.potential-bugs.ImplicitDefaultLocale`

Implicit default locale.

- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.ImplicitDefaultLocale","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#implicitdefaultlocale)

<a id="detekt-detekt-potential-bugs-invalidrange"></a>

### `detekt/detekt.potential-bugs.InvalidRange`

Invalid range.

- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.InvalidRange","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#invalidrange)

<a id="detekt-detekt-potential-bugs-iteratorhasnextcallsnextmethod"></a>

### `detekt/detekt.potential-bugs.IteratorHasNextCallsNextMethod`

Iterator has next calls next method.

- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.IteratorHasNextCallsNextMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#iteratorhasnextcallsnextmethod)

<a id="detekt-detekt-potential-bugs-iteratornotthrowingnosuchelementexception"></a>

### `detekt/detekt.potential-bugs.IteratorNotThrowingNoSuchElementException`

Iterator not throwing no such element exception.

- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.IteratorNotThrowingNoSuchElementException","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#iteratornotthrowingnosuchelementexception)

<a id="detekt-detekt-potential-bugs-mapgetwithnotnullassertionoperator"></a>

### `detekt/detekt.potential-bugs.MapGetWithNotNullAssertionOperator`

Map get with not null assertion operator.

- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.MapGetWithNotNullAssertionOperator","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#mapgetwithnotnullassertionoperator)

<a id="detekt-detekt-potential-bugs-unnecessarynotnulloperator"></a>

### `detekt/detekt.potential-bugs.UnnecessaryNotNullOperator`

Unnecessary not null operator.

- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.UnnecessaryNotNullOperator","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#unnecessarynotnulloperator)

<a id="detekt-detekt-potential-bugs-unnecessarysafecall"></a>

### `detekt/detekt.potential-bugs.UnnecessarySafeCall`

Unnecessary safe call.

- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.UnnecessarySafeCall","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#unnecessarysafecall)

<a id="detekt-detekt-potential-bugs-unreachablecatchblock"></a>

### `detekt/detekt.potential-bugs.UnreachableCatchBlock`

Unreachable catch block.

- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.UnreachableCatchBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#unreachablecatchblock)

<a id="detekt-detekt-potential-bugs-unreachablecode"></a>

### `detekt/detekt.potential-bugs.UnreachableCode`

Unreachable code.

- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.UnreachableCode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#unreachablecode)

<a id="detekt-detekt-potential-bugs-unsafecallonnullabletype"></a>

### `detekt/detekt.potential-bugs.UnsafeCallOnNullableType`

Unsafe call on nullable type.

- **Why it is on:** A one-way rule: nitpicker's detekt file turns it on and pins it, so a project cannot switch it off, lower its severity or exclude paths in detekt.yml. It narrows a spot where Kotlin offers several ways to the one allowed form.
- **Allowed form:** Handle null with `value ?: return`, `value?.let { ... }`, or `checkNotNull(value) { "why" }` when null is a bug.
- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.UnsafeCallOnNullableType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [detekt rule](https://detekt.dev/docs/rules/potential-bugs#unsafecallonnullabletype)

<a id="detekt-detekt-potential-bugs-unsafecast"></a>

### `detekt/detekt.potential-bugs.UnsafeCast`

Unsafe cast.

- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.UnsafeCast","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#unsafecast)

<a id="detekt-detekt-potential-bugs-unusedunaryoperator"></a>

### `detekt/detekt.potential-bugs.UnusedUnaryOperator`

Unused unary operator.

- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.UnusedUnaryOperator","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#unusedunaryoperator)

<a id="detekt-detekt-potential-bugs-uselesspostfixexpression"></a>

### `detekt/detekt.potential-bugs.UselessPostfixExpression`

Useless postfix expression.

- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.UselessPostfixExpression","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#uselesspostfixexpression)

<a id="detekt-detekt-potential-bugs-wrongequalstypeparameter"></a>

### `detekt/detekt.potential-bugs.WrongEqualsTypeParameter`

Wrong equals type parameter.

- **Exception:** If this is intended, add `{"rule":"detekt.potential-bugs.WrongEqualsTypeParameter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/potential-bugs#wrongequalstypeparameter)

<a id="detekt-detekt-style-dataclassshouldbeimmutable"></a>

### `detekt/detekt.style.DataClassShouldBeImmutable`

Data class should be immutable.

- **Why it is on:** A one-way rule: nitpicker's detekt file turns it on and pins it, so a project cannot switch it off, lower its severity or exclude paths in detekt.yml. It narrows a spot where Kotlin offers several ways to the one allowed form.
- **Allowed form:** Make the property a `val` and build a changed copy with `copy(...)`.
- **Exception:** If this is intended, add `{"rule":"detekt.style.DataClassShouldBeImmutable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [detekt rule](https://detekt.dev/docs/rules/style#dataclassshouldbeimmutable)

<a id="detekt-detekt-style-destructuringdeclarationwithtoomanyentries"></a>

### `detekt/detekt.style.DestructuringDeclarationWithTooManyEntries`

Destructuring declaration with too many entries.

- **Exception:** If this is intended, add `{"rule":"detekt.style.DestructuringDeclarationWithTooManyEntries","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#destructuringdeclarationwithtoomanyentries)

<a id="detekt-detekt-style-equalsnullcall"></a>

### `detekt/detekt.style.EqualsNullCall`

Equals null call.

- **Exception:** If this is intended, add `{"rule":"detekt.style.EqualsNullCall","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#equalsnullcall)

<a id="detekt-detekt-style-explicititlambdaparameter"></a>

### `detekt/detekt.style.ExplicitItLambdaParameter`

Explicit it lambda parameter.

- **Exception:** If this is intended, add `{"rule":"detekt.style.ExplicitItLambdaParameter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#explicititlambdaparameter)

<a id="detekt-detekt-style-forbiddencomment"></a>

### `detekt/detekt.style.ForbiddenComment`

Forbidden comment.

- **Why it is on:** A one-way rule: nitpicker's detekt file turns it on and pins it, so a project cannot switch it off, lower its severity or exclude paths in detekt.yml. It narrows a spot where Kotlin offers several ways to the one allowed form.
- **Exception:** If this is intended, add `{"rule":"detekt.style.ForbiddenComment","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [detekt rule](https://detekt.dev/docs/rules/style#forbiddencomment)

<a id="detekt-detekt-style-forbiddenimport"></a>

### `detekt/detekt.style.ForbiddenImport`

Forbidden import.

- **Why it is on:** A one-way rule: nitpicker's detekt file turns it on and pins it, so a project cannot switch it off, lower its severity or exclude paths in detekt.yml. It narrows a spot where Kotlin offers several ways to the one allowed form.
- **Exception:** If this is intended, add `{"rule":"detekt.style.ForbiddenImport","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [detekt rule](https://detekt.dev/docs/rules/style#forbiddenimport)

<a id="detekt-detekt-style-forbiddenmethodcall"></a>

### `detekt/detekt.style.ForbiddenMethodCall`

Forbidden method call.

- **Why it is on:** A one-way rule: nitpicker's detekt file turns it on and pins it, so a project cannot switch it off, lower its severity or exclude paths in detekt.yml. It narrows a spot where Kotlin offers several ways to the one allowed form.
- **Exception:** If this is intended, add `{"rule":"detekt.style.ForbiddenMethodCall","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [detekt rule](https://detekt.dev/docs/rules/style#forbiddenmethodcall)

<a id="detekt-detekt-style-forbiddenvoid"></a>

### `detekt/detekt.style.ForbiddenVoid`

Forbidden void.

- **Exception:** If this is intended, add `{"rule":"detekt.style.ForbiddenVoid","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#forbiddenvoid)

<a id="detekt-detekt-style-functiononlyreturningconstant"></a>

### `detekt/detekt.style.FunctionOnlyReturningConstant`

Function only returning constant.

- **Exception:** If this is intended, add `{"rule":"detekt.style.FunctionOnlyReturningConstant","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#functiononlyreturningconstant)

<a id="detekt-detekt-style-loopwithtoomanyjumpstatements"></a>

### `detekt/detekt.style.LoopWithTooManyJumpStatements`

Loop with too many jump statements.

- **Exception:** If this is intended, add `{"rule":"detekt.style.LoopWithTooManyJumpStatements","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#loopwithtoomanyjumpstatements)

<a id="detekt-detekt-style-magicnumber"></a>

### `detekt/detekt.style.MagicNumber`

Magic number.

- **Exception:** If this is intended, add `{"rule":"detekt.style.MagicNumber","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#magicnumber)

<a id="detekt-detekt-style-maxlinelength"></a>

### `detekt/detekt.style.MaxLineLength`

Max line length.

- **Exception:** If this is intended, add `{"rule":"detekt.style.MaxLineLength","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#maxlinelength)

<a id="detekt-detekt-style-maybeconst"></a>

### `detekt/detekt.style.MayBeConst`

May be const.

- **Exception:** If this is intended, add `{"rule":"detekt.style.MayBeConst","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#maybeconst)

<a id="detekt-detekt-style-modifierorder"></a>

### `detekt/detekt.style.ModifierOrder`

Modifier order.

- **Exception:** If this is intended, add `{"rule":"detekt.style.ModifierOrder","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#modifierorder)

<a id="detekt-detekt-style-nestedclassesvisibility"></a>

### `detekt/detekt.style.NestedClassesVisibility`

Nested classes visibility.

- **Exception:** If this is intended, add `{"rule":"detekt.style.NestedClassesVisibility","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#nestedclassesvisibility)

<a id="detekt-detekt-style-newlineatendoffile"></a>

### `detekt/detekt.style.NewLineAtEndOfFile`

New line at end of file.

- **Exception:** If this is intended, add `{"rule":"detekt.style.NewLineAtEndOfFile","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#newlineatendoffile)

<a id="detekt-detekt-style-objectliteraltolambda"></a>

### `detekt/detekt.style.ObjectLiteralToLambda`

Object literal to lambda.

- **Exception:** If this is intended, add `{"rule":"detekt.style.ObjectLiteralToLambda","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#objectliteraltolambda)

<a id="detekt-detekt-style-optionalabstractkeyword"></a>

### `detekt/detekt.style.OptionalAbstractKeyword`

Optional abstract keyword.

- **Exception:** If this is intended, add `{"rule":"detekt.style.OptionalAbstractKeyword","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#optionalabstractkeyword)

<a id="detekt-detekt-style-protectedmemberinfinalclass"></a>

### `detekt/detekt.style.ProtectedMemberInFinalClass`

Protected member in final class.

- **Exception:** If this is intended, add `{"rule":"detekt.style.ProtectedMemberInFinalClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#protectedmemberinfinalclass)

<a id="detekt-detekt-style-redundanthigherordermapusage"></a>

### `detekt/detekt.style.RedundantHigherOrderMapUsage`

Redundant higher order map usage.

- **Exception:** If this is intended, add `{"rule":"detekt.style.RedundantHigherOrderMapUsage","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#redundanthigherordermapusage)

<a id="detekt-detekt-style-returncount"></a>

### `detekt/detekt.style.ReturnCount`

Return count.

- **Exception:** If this is intended, add `{"rule":"detekt.style.ReturnCount","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#returncount)

<a id="detekt-detekt-style-safecast"></a>

### `detekt/detekt.style.SafeCast`

Safe cast.

- **Exception:** If this is intended, add `{"rule":"detekt.style.SafeCast","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#safecast)

<a id="detekt-detekt-style-serialversionuidinserializableclass"></a>

### `detekt/detekt.style.SerialVersionUIDInSerializableClass`

Serial version uid in serializable class.

- **Exception:** If this is intended, add `{"rule":"detekt.style.SerialVersionUIDInSerializableClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#serialversionuidinserializableclass)

<a id="detekt-detekt-style-throwscount"></a>

### `detekt/detekt.style.ThrowsCount`

Throws count.

- **Exception:** If this is intended, add `{"rule":"detekt.style.ThrowsCount","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#throwscount)

<a id="detekt-detekt-style-unnecessaryabstractclass"></a>

### `detekt/detekt.style.UnnecessaryAbstractClass`

Unnecessary abstract class.

- **Exception:** If this is intended, add `{"rule":"detekt.style.UnnecessaryAbstractClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#unnecessaryabstractclass)

<a id="detekt-detekt-style-unnecessaryapply"></a>

### `detekt/detekt.style.UnnecessaryApply`

Unnecessary apply.

- **Why it is on:** A one-way rule: nitpicker's detekt file turns it on and pins it, so a project cannot switch it off, lower its severity or exclude paths in detekt.yml. It narrows a spot where Kotlin offers several ways to the one allowed form.
- **Allowed form:** Remove `apply`; use it only to configure an object you just created.
- **Exception:** If this is intended, add `{"rule":"detekt.style.UnnecessaryApply","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [detekt rule](https://detekt.dev/docs/rules/style#unnecessaryapply)

<a id="detekt-detekt-style-unnecessaryfilter"></a>

### `detekt/detekt.style.UnnecessaryFilter`

Unnecessary filter.

- **Exception:** If this is intended, add `{"rule":"detekt.style.UnnecessaryFilter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#unnecessaryfilter)

<a id="detekt-detekt-style-unnecessaryinheritance"></a>

### `detekt/detekt.style.UnnecessaryInheritance`

Unnecessary inheritance.

- **Exception:** If this is intended, add `{"rule":"detekt.style.UnnecessaryInheritance","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#unnecessaryinheritance)

<a id="detekt-detekt-style-unnecessarylet"></a>

### `detekt/detekt.style.UnnecessaryLet`

Unnecessary let.

- **Why it is on:** A one-way rule: nitpicker's detekt file turns it on and pins it, so a project cannot switch it off, lower its severity or exclude paths in detekt.yml. It narrows a spot where Kotlin offers several ways to the one allowed form.
- **Allowed form:** Call the member directly; `let` is for `value?.let { ... }`.
- **Exception:** If this is intended, add `{"rule":"detekt.style.UnnecessaryLet","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [detekt rule](https://detekt.dev/docs/rules/style#unnecessarylet)

<a id="detekt-detekt-style-unusedparameter"></a>

### `detekt/detekt.style.UnusedParameter`

Unused parameter.

- **Exception:** If this is intended, add `{"rule":"detekt.style.UnusedParameter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#unusedparameter)

<a id="detekt-detekt-style-unusedprivateclass"></a>

### `detekt/detekt.style.UnusedPrivateClass`

Unused private class.

- **Exception:** If this is intended, add `{"rule":"detekt.style.UnusedPrivateClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#unusedprivateclass)

<a id="detekt-detekt-style-unusedprivatemember"></a>

### `detekt/detekt.style.UnusedPrivateMember`

Unused private member.

- **Exception:** If this is intended, add `{"rule":"detekt.style.UnusedPrivateMember","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#unusedprivatemember)

<a id="detekt-detekt-style-unusedprivateproperty"></a>

### `detekt/detekt.style.UnusedPrivateProperty`

Unused private property.

- **Exception:** If this is intended, add `{"rule":"detekt.style.UnusedPrivateProperty","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#unusedprivateproperty)

<a id="detekt-detekt-style-useanyornoneinsteadoffind"></a>

### `detekt/detekt.style.UseAnyOrNoneInsteadOfFind`

Use any or none instead of find.

- **Exception:** If this is intended, add `{"rule":"detekt.style.UseAnyOrNoneInsteadOfFind","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#useanyornoneinsteadoffind)

<a id="detekt-detekt-style-usearrayliteralsinannotations"></a>

### `detekt/detekt.style.UseArrayLiteralsInAnnotations`

Use array literals in annotations.

- **Exception:** If this is intended, add `{"rule":"detekt.style.UseArrayLiteralsInAnnotations","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#usearrayliteralsinannotations)

<a id="detekt-detekt-style-usechecknotnull"></a>

### `detekt/detekt.style.UseCheckNotNull`

Use check not null.

- **Exception:** If this is intended, add `{"rule":"detekt.style.UseCheckNotNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#usechecknotnull)

<a id="detekt-detekt-style-usecheckorerror"></a>

### `detekt/detekt.style.UseCheckOrError`

Use check or error.

- **Exception:** If this is intended, add `{"rule":"detekt.style.UseCheckOrError","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#usecheckorerror)

<a id="detekt-detekt-style-usedataclass"></a>

### `detekt/detekt.style.UseDataClass`

Use data class.

- **Why it is on:** A one-way rule: nitpicker's detekt file turns it on and pins it, so a project cannot switch it off, lower its severity or exclude paths in detekt.yml. It narrows a spot where Kotlin offers several ways to the one allowed form.
- **Exception:** If this is intended, add `{"rule":"detekt.style.UseDataClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [detekt rule](https://detekt.dev/docs/rules/style#usedataclass)

<a id="detekt-detekt-style-useisnullorempty"></a>

### `detekt/detekt.style.UseIsNullOrEmpty`

Use is null or empty.

- **Exception:** If this is intended, add `{"rule":"detekt.style.UseIsNullOrEmpty","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#useisnullorempty)

<a id="detekt-detekt-style-uselesscallonnotnull"></a>

### `detekt/detekt.style.UselessCallOnNotNull`

Useless call on not null.

- **Exception:** If this is intended, add `{"rule":"detekt.style.UselessCallOnNotNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#uselesscallonnotnull)

<a id="detekt-detekt-style-uselet"></a>

### `detekt/detekt.style.UseLet`

Use let.

- **Why it is on:** A one-way rule: nitpicker's detekt file turns it on and pins it, so a project cannot switch it off, lower its severity or exclude paths in detekt.yml. It narrows a spot where Kotlin offers several ways to the one allowed form.
- **Exception:** If this is intended, add `{"rule":"detekt.style.UseLet","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [detekt rule](https://detekt.dev/docs/rules/style#uselet)

<a id="detekt-detekt-style-useorempty"></a>

### `detekt/detekt.style.UseOrEmpty`

Use or empty.

- **Exception:** If this is intended, add `{"rule":"detekt.style.UseOrEmpty","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#useorempty)

<a id="detekt-detekt-style-userequire"></a>

### `detekt/detekt.style.UseRequire`

Use require.

- **Exception:** If this is intended, add `{"rule":"detekt.style.UseRequire","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#userequire)

<a id="detekt-detekt-style-userequirenotnull"></a>

### `detekt/detekt.style.UseRequireNotNull`

Use require not null.

- **Exception:** If this is intended, add `{"rule":"detekt.style.UseRequireNotNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#userequirenotnull)

<a id="detekt-detekt-style-utilityclasswithpublicconstructor"></a>

### `detekt/detekt.style.UtilityClassWithPublicConstructor`

Utility class with public constructor.

- **Exception:** If this is intended, add `{"rule":"detekt.style.UtilityClassWithPublicConstructor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#utilityclasswithpublicconstructor)

<a id="detekt-detekt-style-varcouldbeval"></a>

### `detekt/detekt.style.VarCouldBeVal`

Var could be val.

- **Exception:** If this is intended, add `{"rule":"detekt.style.VarCouldBeVal","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#varcouldbeval)

<a id="detekt-detekt-style-wildcardimport"></a>

### `detekt/detekt.style.WildcardImport`

Wildcard import.

- **Exception:** If this is intended, add `{"rule":"detekt.style.WildcardImport","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [detekt rule](https://detekt.dev/docs/rules/style#wildcardimport)
