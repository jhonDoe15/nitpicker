# Java and Kotlin: Error Prone checks M to Z and NullAway

The Error Prone checks from M to Z and NullAway that the Java and Kotlin presets compile Java sources with: Java with Gradle or Maven, Kotlin with Gradle. This page lists 284 rules. [All pages](README.md).

The guide for these rules: [docs/java-preset/error-prone-and-nullaway.md](../java-preset/error-prone-and-nullaway.md).

Unless an entry says otherwise:

- **Presets:** Java and Kotlin
- **Analyzers:** `java` (Java); `kotlin` (Kotlin)
- **Builds:** Gradle and Maven

<a id="errorprone-malformedinlinetag"></a>

### `errorprone/MalformedInlineTag`

This Javadoc tag is malformed. The correct syntax is {@tag and not @{tag.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MalformedInlineTag).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/MalformedInlineTag","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MalformedInlineTag)

<a id="errorprone-mathabsolutenegative"></a>

### `errorprone/MathAbsoluteNegative`

Math.abs() does not always give a non-negative result. Please consider other methods for positive numbers, such as IntMath.saturatedAbs() or Math.floorMod().

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MathAbsoluteNegative).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/MathAbsoluteNegative","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MathAbsoluteNegative)

<a id="errorprone-mathroundintlong"></a>

### `errorprone/MathRoundIntLong`

Math.round(Integer) results in truncation.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MathRoundIntLong).
- **Fix:** With `nitpicker --fix --rule errorprone/MathRoundIntLong`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/MathRoundIntLong","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MathRoundIntLong)

<a id="errorprone-memoizeconstantvisitorstatelookups"></a>

### `errorprone/MemoizeConstantVisitorStateLookups`

Anytime you need to look up a constant value from VisitorState, improve performance by creating a cache for it with VisitorState.memoize.

- **Labels:** performance
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MemoizeConstantVisitorStateLookups).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/MemoizeConstantVisitorStateLookups","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MemoizeConstantVisitorStateLookups)

<a id="errorprone-memorysegmentreferenceequality"></a>

### `errorprone/MemorySegmentReferenceEquality`

Do not compare MemorySegments using reference equality.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MemorySegmentReferenceEquality).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/MemorySegmentReferenceEquality","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MemorySegmentReferenceEquality)

<a id="errorprone-misformattedtestdata"></a>

### `errorprone/MisformattedTestData`

This test data will be more readable if correctly formatted.

- **Labels:** tests, style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MisformattedTestData).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/MisformattedTestData","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MisformattedTestData)

<a id="errorprone-mislabeledandroidstring"></a>

### `errorprone/MislabeledAndroidString`

Certain resources in `android.R.string` have names that do not match their content.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MislabeledAndroidString).
- **Fix:** With `nitpicker --fix --rule errorprone/MislabeledAndroidString`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/MislabeledAndroidString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MislabeledAndroidString)

<a id="errorprone-misleadingemptyvarargs"></a>

### `errorprone/MisleadingEmptyVarargs`

`thenThrow` with no arguments is a no-op, despite reading like it makes the mock throw.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MisleadingEmptyVarargs).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/MisleadingEmptyVarargs","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MisleadingEmptyVarargs)

<a id="errorprone-misleadingescapedspace"></a>

### `errorprone/MisleadingEscapedSpace`

Using \s anywhere except at the end of a line in a text block is potentially misleading.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MisleadingEscapedSpace).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/MisleadingEscapedSpace","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MisleadingEscapedSpace)

<a id="errorprone-misplacedscopeannotations"></a>

### `errorprone/MisplacedScopeAnnotations`

Scope annotations used as qualifier annotations don't have any effect. Move the scope annotation to the binding location or delete it.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MisplacedScopeAnnotations).
- **Fix:** With `nitpicker --fix --rule errorprone/MisplacedScopeAnnotations`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/MisplacedScopeAnnotations","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MisplacedScopeAnnotations)

<a id="errorprone-missingbraces"></a>

### `errorprone/MissingBraces`

The Google Java Style Guide requires braces to be used with if, else, for, do and while statements, even when the body is empty or contains only a single statement.

- **Labels:** style
- **Scope:** Off in a project that uses Lombok.
- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s4.1.1-braces-always-used).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/MissingBraces","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s4.1.1-braces-always-used)

<a id="errorprone-missingcasesinenumswitch"></a>

### `errorprone/MissingCasesInEnumSwitch`

Switches on enum types should either handle all values, or have a default case.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingCasesInEnumSwitch).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/MissingCasesInEnumSwitch","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingCasesInEnumSwitch)

<a id="errorprone-missingdefault"></a>

### `errorprone/MissingDefault`

The Google Java Style Guide requires that each switch statement includes a default statement group (even if it contains no code) unless the switch statement covers all values of an enum.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingDefault).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/MissingDefault","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingDefault)

<a id="errorprone-missingfail"></a>

### `errorprone/MissingFail`

Not calling fail() when expecting an exception masks bugs.

- **Labels:** tests, bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingFail).
- **Fix:** With `nitpicker --fix --rule errorprone/MissingFail`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/MissingFail","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingFail)

<a id="errorprone-missingimplementscomparable"></a>

### `errorprone/MissingImplementsComparable`

Classes implementing valid compareTo function should implement Comparable interface.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingImplementsComparable).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/MissingImplementsComparable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingImplementsComparable)

<a id="errorprone-missingoverride"></a>

### `errorprone/MissingOverride`

Method overrides method in supertype; expected @Override.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingOverride).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/MissingOverride","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingOverride)

<a id="errorprone-missingrefasterannotation"></a>

### `errorprone/MissingRefasterAnnotation`

The Refaster template contains a method without any Refaster annotations.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingRefasterAnnotation).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/MissingRefasterAnnotation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingRefasterAnnotation)

<a id="errorprone-missingruntimeretention"></a>

### `errorprone/MissingRuntimeRetention`

Scoping and qualifier annotations must have runtime retention.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingRuntimeRetention).
- **Fix:** With `nitpicker --fix --rule errorprone/MissingRuntimeRetention`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/MissingRuntimeRetention","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingRuntimeRetention)

<a id="errorprone-missingsummary"></a>

### `errorprone/MissingSummary`

A summary line is required on public/protected Javadocs.

- **Labels:** style
- **Scope:** Off in a project that uses Lombok.
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s7.2-summary-fragment).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/MissingSummary","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s7.2-summary-fragment)

<a id="errorprone-missingsupercall"></a>

### `errorprone/MissingSuperCall`

Overriding method is missing a call to overridden super method.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingSuperCall).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/MissingSuperCall","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingSuperCall)

<a id="errorprone-missingtestcall"></a>

### `errorprone/MissingTestCall`

A terminating method call is required for a test helper to have any effect.

- **Labels:** bug, tests
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingTestCall).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/MissingTestCall","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MissingTestCall)

<a id="errorprone-misuseddayofyear"></a>

### `errorprone/MisusedDayOfYear`

Use of 'DD' (day of year) in a date pattern with 'MM' (month of year) is not likely to be intentional, as it would lead to dates like 'March 73rd'.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MisusedDayOfYear).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/MisusedDayOfYear","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MisusedDayOfYear)

<a id="errorprone-misusedweekyear"></a>

### `errorprone/MisusedWeekYear`

Use of "YYYY" (week year) in a date pattern without "ww" (week in year). You probably meant to use "yyyy" (year) instead.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MisusedWeekYear).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/MisusedWeekYear","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MisusedWeekYear)

<a id="errorprone-mixedarraydimensions"></a>

### `errorprone/MixedArrayDimensions`

C-style array declarations should not be used.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MixedArrayDimensions).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/MixedArrayDimensions","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MixedArrayDimensions)

<a id="errorprone-mixeddescriptors"></a>

### `errorprone/MixedDescriptors`

The field number passed into #findFieldByNumber belongs to a different proto to the Descriptor.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MixedDescriptors).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/MixedDescriptors","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MixedDescriptors)

<a id="errorprone-mixedmutabilityreturntype"></a>

### `errorprone/MixedMutabilityReturnType`

This method returns both mutable and immutable collections or maps from different paths. This may be confusing for users of the method.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MixedMutabilityReturnType).
- **Fix:** With `nitpicker --fix --rule errorprone/MixedMutabilityReturnType`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/MixedMutabilityReturnType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MixedMutabilityReturnType)

<a id="errorprone-mockillegalthrows"></a>

### `errorprone/MockIllegalThrows`

This exception can't be thrown by the mocked method.

- **Labels:** bug, tests
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MockIllegalThrows).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/MockIllegalThrows","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MockIllegalThrows)

<a id="errorprone-mockitodosetup"></a>

### `errorprone/MockitoDoSetup`

Prefer using when/thenReturn over doReturn/when for additional type safety.

- **Labels:** tests
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MockitoDoSetup).
- **Fix:** With `nitpicker --fix --rule errorprone/MockitoDoSetup`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/MockitoDoSetup","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MockitoDoSetup)

<a id="errorprone-mockitousage"></a>

### `errorprone/MockitoUsage`

Missing method call for verify(mock) here.

- **Labels:** tests, bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MockitoUsage).
- **Fix:** With `nitpicker --fix --rule errorprone/MockitoUsage`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/MockitoUsage","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MockitoUsage)

<a id="errorprone-mocknotusedinproduction"></a>

### `errorprone/MockNotUsedInProduction`

This mock is instantiated and configured, but is never passed to production code. It should be either removed or used.

- **Labels:** tests
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MockNotUsedInProduction).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/MockNotUsedInProduction","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MockNotUsedInProduction)

<a id="errorprone-modifiedbutnotused"></a>

### `errorprone/ModifiedButNotUsed`

A collection or proto builder was created, but its values were never accessed.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ModifiedButNotUsed).
- **Fix:** With `nitpicker --fix --rule errorprone/ModifiedButNotUsed`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ModifiedButNotUsed","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ModifiedButNotUsed)

<a id="errorprone-modifycollectioninenhancedforloop"></a>

### `errorprone/ModifyCollectionInEnhancedForLoop`

Modifying a collection while iterating over it in a loop may cause a ConcurrentModificationException to be thrown or lead to undefined behavior.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ModifyCollectionInEnhancedForLoop).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/ModifyCollectionInEnhancedForLoop","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ModifyCollectionInEnhancedForLoop)

<a id="errorprone-modifyingcollectionwithitself"></a>

### `errorprone/ModifyingCollectionWithItself`

Using a collection function with itself as the argument.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ModifyingCollectionWithItself).
- **Fix:** With `nitpicker --fix --rule errorprone/ModifyingCollectionWithItself`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ModifyingCollectionWithItself","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ModifyingCollectionWithItself)

<a id="errorprone-modifysourcecollectioninstream"></a>

### `errorprone/ModifySourceCollectionInStream`

Modifying the backing source during stream operations may cause unintended results.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ModifySourceCollectionInStream).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/ModifySourceCollectionInStream","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ModifySourceCollectionInStream)

<a id="errorprone-morethanoneinjectableconstructor"></a>

### `errorprone/MoreThanOneInjectableConstructor`

This class has more than one @Inject-annotated constructor. Please remove the @Inject annotation from all but one of them.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MoreThanOneInjectableConstructor).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/MoreThanOneInjectableConstructor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MoreThanOneInjectableConstructor)

<a id="errorprone-morethanonequalifier"></a>

### `errorprone/MoreThanOneQualifier`

Using more than one qualifier annotation on the same element is not allowed.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MoreThanOneQualifier).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/MoreThanOneQualifier","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MoreThanOneQualifier)

<a id="errorprone-multimapkeys"></a>

### `errorprone/MultimapKeys`

Iterating over `Multimap.keys()` does not collapse duplicates. Did you mean `keySet()`?

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MultimapKeys).
- **Fix:** With `nitpicker --fix --rule errorprone/MultimapKeys`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/MultimapKeys","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MultimapKeys)

<a id="errorprone-multiplenullnessannotations"></a>

### `errorprone/MultipleNullnessAnnotations`

This type use has conflicting nullness annotations.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MultipleNullnessAnnotations).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/MultipleNullnessAnnotations","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MultipleNullnessAnnotations)

<a id="errorprone-multipleparallelorsequentialcalls"></a>

### `errorprone/MultipleParallelOrSequentialCalls`

Multiple calls to either parallel or sequential are unnecessary and cause confusion.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MultipleParallelOrSequentialCalls).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/MultipleParallelOrSequentialCalls","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MultipleParallelOrSequentialCalls)

<a id="errorprone-multipletoplevelclasses"></a>

### `errorprone/MultipleTopLevelClasses`

Source files should not contain multiple top-level class declarations.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s3.4.1-one-top-level-class).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/MultipleTopLevelClasses","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s3.4.1-one-top-level-class)

<a id="errorprone-multipleunaryoperatorsinmethodcall"></a>

### `errorprone/MultipleUnaryOperatorsInMethodCall`

Avoid having multiple unary operators acting on the same variable in a method call.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MultipleUnaryOperatorsInMethodCall).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/MultipleUnaryOperatorsInMethodCall","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MultipleUnaryOperatorsInMethodCall)

<a id="errorprone-multivariabledeclaration"></a>

### `errorprone/MultiVariableDeclaration`

Variable declarations should declare only one variable.

- **Labels:** style
- **Scope:** Off in a project that uses Lombok.
- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s4.8.2.1-variables-per-declaration).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/MultiVariableDeclaration","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s4.8.2.1-variables-per-declaration)

<a id="errorprone-mustbeclosedchecker"></a>

### `errorprone/MustBeClosedChecker`

This method returns a resource which must be managed carefully, not just left for garbage collection. If it is a constant that will persist for the lifetime of your program, move it to a private static final field. Otherwise, you should use it in a try-with-resources.

- **Labels:** reliability
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MustBeClosedChecker).
- **Fix:** With `nitpicker --fix --rule errorprone/MustBeClosedChecker`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/MustBeClosedChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MustBeClosedChecker)

<a id="errorprone-mutableguicemodule"></a>

### `errorprone/MutableGuiceModule`

Fields in Guice modules should be final.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MutableGuiceModule).
- **Fix:** With `nitpicker --fix --rule errorprone/MutableGuiceModule`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/MutableGuiceModule","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MutableGuiceModule)

<a id="errorprone-mutablepublicarray"></a>

### `errorprone/MutablePublicArray`

Non-empty arrays are mutable, so this `public static final` array is not a constant and can be modified by clients of this class. Prefer an ImmutableList, or provide an accessor method that returns a defensive copy.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/MutablePublicArray).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/MutablePublicArray","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/MutablePublicArray)

<a id="errorprone-namedlikecontextualkeyword"></a>

### `errorprone/NamedLikeContextualKeyword`

Avoid naming of classes and methods that is similar to contextual keywords. When invoking such a method, qualify it.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NamedLikeContextualKeyword).
- **Fix:** With `nitpicker --fix --rule errorprone/NamedLikeContextualKeyword`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/NamedLikeContextualKeyword","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NamedLikeContextualKeyword)

<a id="errorprone-narrowcalculation"></a>

### `errorprone/NarrowCalculation`

This calculation may lose precision compared to its target type.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NarrowCalculation).
- **Fix:** With `nitpicker --fix --rule errorprone/NarrowCalculation`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/NarrowCalculation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NarrowCalculation)

<a id="errorprone-narrowingcompoundassignment"></a>

### `errorprone/NarrowingCompoundAssignment`

Compound assignments may hide dangerous casts.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NarrowingCompoundAssignment).
- **Fix:** With `nitpicker --fix --rule errorprone/NarrowingCompoundAssignment`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/NarrowingCompoundAssignment","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NarrowingCompoundAssignment)

<a id="errorprone-ncopiesofchar"></a>

### `errorprone/NCopiesOfChar`

The first argument to nCopies is the number of copies, and the second is the item to copy.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NCopiesOfChar).
- **Fix:** With `nitpicker --fix --rule errorprone/NCopiesOfChar`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/NCopiesOfChar","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NCopiesOfChar)

<a id="errorprone-negativeboolean"></a>

### `errorprone/NegativeBoolean`

Prefer positive boolean names.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NegativeBoolean).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/NegativeBoolean","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NegativeBoolean)

<a id="errorprone-negativecharliteral"></a>

### `errorprone/NegativeCharLiteral`

Casting a negative signed literal to an (unsigned) char might be misleading.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NegativeCharLiteral).
- **Fix:** With `nitpicker --fix --rule errorprone/NegativeCharLiteral`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/NegativeCharLiteral","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NegativeCharLiteral)

<a id="errorprone-nestedinstanceofconditions"></a>

### `errorprone/NestedInstanceOfConditions`

Nested instanceOf conditions of disjoint types create blocks of code that never execute.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NestedInstanceOfConditions).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/NestedInstanceOfConditions","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NestedInstanceOfConditions)

<a id="errorprone-newfilesystem"></a>

### `errorprone/NewFileSystem`

Starting in JDK 13, this call is ambiguous with FileSystem.newFileSystem(Path,Map).

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NewFileSystem).
- **Fix:** With `nitpicker --fix --rule errorprone/NewFileSystem`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/NewFileSystem","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NewFileSystem)

<a id="errorprone-noallocation"></a>

### `errorprone/NoAllocation`

@NoAllocation was specified on this method, but something was found that would trigger an allocation.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NoAllocation).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/NoAllocation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NoAllocation)

<a id="errorprone-nocanignorereturnvalueonclasses"></a>

### `errorprone/NoCanIgnoreReturnValueOnClasses`

@CanIgnoreReturnValue should not be applied to classes as it almost always overmatches (as it applies to constructors and all methods), and the CIRVness isn't conferred to its subclasses.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NoCanIgnoreReturnValueOnClasses).
- **Fix:** With `nitpicker --fix --rule errorprone/NoCanIgnoreReturnValueOnClasses`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/NoCanIgnoreReturnValueOnClasses","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NoCanIgnoreReturnValueOnClasses)

<a id="errorprone-nonatomicvolatileupdate"></a>

### `errorprone/NonAtomicVolatileUpdate`

This update of a volatile variable is non-atomic.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NonAtomicVolatileUpdate).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/NonAtomicVolatileUpdate","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NonAtomicVolatileUpdate)

<a id="errorprone-noncanonicalstaticimport"></a>

### `errorprone/NonCanonicalStaticImport`

Static import of type uses non-canonical name.

- **Labels:** style
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NonCanonicalStaticImport).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/NonCanonicalStaticImport","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NonCanonicalStaticImport)

<a id="errorprone-noncanonicalstaticmemberimport"></a>

### `errorprone/NonCanonicalStaticMemberImport`

Static import of member uses non-canonical name.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NonCanonicalStaticMemberImport).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/NonCanonicalStaticMemberImport","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NonCanonicalStaticMemberImport)

<a id="errorprone-noncanonicaltype"></a>

### `errorprone/NonCanonicalType`

This type is referred to by a non-canonical name, which may be misleading.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NonCanonicalType).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/NonCanonicalType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NonCanonicalType)

<a id="errorprone-nonfinalcompiletimeconstant"></a>

### `errorprone/NonFinalCompileTimeConstant`

@CompileTimeConstant parameters should be final or effectively final.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NonFinalCompileTimeConstant).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/NonFinalCompileTimeConstant","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NonFinalCompileTimeConstant)

<a id="errorprone-nonfinalstaticfield"></a>

### `errorprone/NonFinalStaticField`

Static fields should almost always be final.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NonFinalStaticField).
- **Fix:** With `nitpicker --fix --rule errorprone/NonFinalStaticField`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/NonFinalStaticField","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NonFinalStaticField)

<a id="errorprone-nonoverridingequals"></a>

### `errorprone/NonOverridingEquals`

Equals method doesn't override Object.equals.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NonOverridingEquals).
- **Fix:** With `nitpicker --fix --rule errorprone/NonOverridingEquals`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/NonOverridingEquals","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NonOverridingEquals)

<a id="errorprone-nonruntimeannotation"></a>

### `errorprone/NonRuntimeAnnotation`

Calling getAnnotation on an annotation that is not retained at runtime.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NonRuntimeAnnotation).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/NonRuntimeAnnotation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NonRuntimeAnnotation)

<a id="errorprone-notjavadoc"></a>

### `errorprone/NotJavadoc`

Avoid using `/**` for comments which aren't actually Javadoc.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NotJavadoc).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/NotJavadoc","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NotJavadoc)

<a id="errorprone-nullableconstructor"></a>

### `errorprone/NullableConstructor`

Constructors should not be annotated with @Nullable since they cannot return null.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NullableConstructor).
- **Fix:** With `nitpicker --fix --rule errorprone/NullableConstructor`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/NullableConstructor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NullableConstructor)

<a id="errorprone-nullableoncontainingclass"></a>

### `errorprone/NullableOnContainingClass`

Type-use nullability annotations should annotate the inner class, not the outer class (e.g., write `A.@Nullable B` instead of `@Nullable A.B`).

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NullableOnContainingClass).
- **Fix:** With `nitpicker --fix --rule errorprone/NullableOnContainingClass`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/NullableOnContainingClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NullableOnContainingClass)

<a id="errorprone-nullableoptional"></a>

### `errorprone/NullableOptional`

Using an Optional variable which is expected to possibly be null is discouraged. It is best to indicate the absence of the value by assigning it an empty optional.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NullableOptional).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/NullableOptional","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NullableOptional)

<a id="errorprone-nullableprimitive"></a>

### `errorprone/NullablePrimitive`

Nullness annotations should not be used for primitive types since they cannot be null.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NullablePrimitive).
- **Fix:** With `nitpicker --fix --rule errorprone/NullablePrimitive`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/NullablePrimitive","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NullablePrimitive)

<a id="errorprone-nullableprimitivearray"></a>

### `errorprone/NullablePrimitiveArray`

@Nullable type annotations should not be used for primitive types since they cannot be null.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NullablePrimitiveArray).
- **Fix:** With `nitpicker --fix --rule errorprone/NullablePrimitiveArray`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/NullablePrimitiveArray","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NullablePrimitiveArray)

<a id="errorprone-nullabletypeparameter"></a>

### `errorprone/NullableTypeParameter`

Nullness annotations directly on type parameters are interpreted differently by different tools.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NullableTypeParameter).
- **Fix:** With `nitpicker --fix --rule errorprone/NullableTypeParameter`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/NullableTypeParameter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NullableTypeParameter)

<a id="errorprone-nullablevoid"></a>

### `errorprone/NullableVoid`

Void-returning methods should not be annotated with nullness annotations, since they cannot return null.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NullableVoid).
- **Fix:** With `nitpicker --fix --rule errorprone/NullableVoid`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/NullableVoid","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NullableVoid)

<a id="errorprone-nullablewildcard"></a>

### `errorprone/NullableWildcard`

Nullness annotations directly on wildcard types are interpreted differently by different tools.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NullableWildcard).
- **Fix:** With `nitpicker --fix --rule errorprone/NullableWildcard`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/NullableWildcard","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NullableWildcard)

<a id="errorprone-nullargumentfornonnullparameter"></a>

### `errorprone/NullArgumentForNonNullParameter`

Null is not permitted for this parameter.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NullArgumentForNonNullParameter).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/NullArgumentForNonNullParameter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NullArgumentForNonNullParameter)

<a id="errorprone-nullaway"></a>

### `errorprone/NullAway`

Nullability type error.

- **Labels:** bug
- **Scope:** Main sources only; off in a project without main classes in a named package.
- **Why it is on:** NullAway is an Error Prone plugin: the main packages of the project are non-null unless marked, so a null that reaches a place that does not allow it is a finding.
- **Allowed form:** Annotate a field, parameter or return value that may be null with the @Nullable the project already uses (JSpecify's org.jspecify.annotations.Nullable when it uses none) and check it before use, or give a non-null value.
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/NullAway","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [NullAway](https://github.com/uber/NullAway)

<a id="errorprone-nullneedscastforvarargs"></a>

### `errorprone/NullNeedsCastForVarargs`

This call passes a null array, so it always produces NullPointerException. To pass a null element, cast to the element type.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NullNeedsCastForVarargs).
- **Fix:** With `nitpicker --fix --rule errorprone/NullNeedsCastForVarargs`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/NullNeedsCastForVarargs","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NullNeedsCastForVarargs)

<a id="errorprone-nulloptional"></a>

### `errorprone/NullOptional`

Passing a literal null to an Optional parameter is almost certainly a mistake. Did you mean to provide an empty Optional?

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NullOptional).
- **Fix:** With `nitpicker --fix --rule errorprone/NullOptional`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/NullOptional","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NullOptional)

<a id="errorprone-nullternary"></a>

### `errorprone/NullTernary`

This conditional expression may evaluate to null, which will result in an NPE when the result is unboxed.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/NullTernary).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/NullTernary","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/NullTernary)

<a id="errorprone-objectequalsforprimitives"></a>

### `errorprone/ObjectEqualsForPrimitives`

Avoid unnecessary boxing by using plain == for primitive types.

- **Labels:** performance
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ObjectEqualsForPrimitives).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/ObjectEqualsForPrimitives","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ObjectEqualsForPrimitives)

<a id="errorprone-objectshashcodeprimitive"></a>

### `errorprone/ObjectsHashCodePrimitive`

Objects.hashCode(Object o) should not be passed a primitive value.

- **Labels:** performance
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ObjectsHashCodePrimitive).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/ObjectsHashCodePrimitive","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ObjectsHashCodePrimitive)

<a id="errorprone-objecttostring"></a>

### `errorprone/ObjectToString`

Calling toString on Objects that don't override toString() doesn't provide useful information.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ObjectToString).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/ObjectToString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ObjectToString)

<a id="errorprone-operatorprecedence"></a>

### `errorprone/OperatorPrecedence`

Use grouping parenthesis to make the operator precedence explicit.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/OperatorPrecedence).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/OperatorPrecedence","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OperatorPrecedence)

<a id="errorprone-optionalequality"></a>

### `errorprone/OptionalEquality`

Comparison using reference equality instead of value equality.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/OptionalEquality).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/OptionalEquality","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OptionalEquality)

<a id="errorprone-optionalmaptooptional"></a>

### `errorprone/OptionalMapToOptional`

Mapping to another Optional will yield a nested Optional. Did you mean flatMap?

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/OptionalMapToOptional).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/OptionalMapToOptional","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OptionalMapToOptional)

<a id="errorprone-optionalmapunusedvalue"></a>

### `errorprone/OptionalMapUnusedValue`

Optional.ifPresent is preferred over Optional.map when the return value is unused.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/OptionalMapUnusedValue).
- **Fix:** With `nitpicker --fix --rule errorprone/OptionalMapUnusedValue`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/OptionalMapUnusedValue","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OptionalMapUnusedValue)

<a id="errorprone-optionalnotpresent"></a>

### `errorprone/OptionalNotPresent`

This Optional has been confirmed to be empty at this point, so the call to `get()` or `orElseThrow()` will always throw.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/OptionalNotPresent).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/OptionalNotPresent","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OptionalNotPresent)

<a id="errorprone-optionalofredundantmethod"></a>

### `errorprone/OptionalOfRedundantMethod`

Optional.of() always returns a non-empty optional. Using ifPresent/isPresent/orElse/orElseGet/orElseThrow/isPresent/or/orNull method on it is unnecessary and most probably a bug.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/OptionalOfRedundantMethod).
- **Fix:** With `nitpicker --fix --rule errorprone/OptionalOfRedundantMethod`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/OptionalOfRedundantMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OptionalOfRedundantMethod)

<a id="errorprone-orphanedformatstring"></a>

### `errorprone/OrphanedFormatString`

String literal contains format specifiers, but is not passed to a format method.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/OrphanedFormatString).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/OrphanedFormatString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OrphanedFormatString)

<a id="errorprone-outlinenone"></a>

### `errorprone/OutlineNone`

Setting CSS outline style to none or 0 (while not otherwise providing visual focus indicators) is inaccessible for users navigating a web page without a mouse.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/OutlineNone).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/OutlineNone","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OutlineNone)

<a id="errorprone-overlappingqualifierandscopeannotation"></a>

### `errorprone/OverlappingQualifierAndScopeAnnotation`

Annotations cannot be both Scope annotations and Qualifier annotations: this causes confusion when trying to use them.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/OverlappingQualifierAndScopeAnnotation).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/OverlappingQualifierAndScopeAnnotation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OverlappingQualifierAndScopeAnnotation)

<a id="errorprone-overrides"></a>

### `errorprone/Overrides`

Varargs doesn't agree for overridden method.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/Overrides).
- **Fix:** With `nitpicker --fix --rule errorprone/Overrides`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/Overrides","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/Overrides)

<a id="errorprone-overridesguiceinjectablemethod"></a>

### `errorprone/OverridesGuiceInjectableMethod`

This method is not annotated with @Inject, but it overrides a method that is annotated with @com.google.inject.Inject. Guice will inject this method, and it is recommended to annotate it explicitly.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/OverridesGuiceInjectableMethod).
- **Fix:** With `nitpicker --fix --rule errorprone/OverridesGuiceInjectableMethod`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/OverridesGuiceInjectableMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OverridesGuiceInjectableMethod)

<a id="errorprone-overridesjavaxinjectablemethod"></a>

### `errorprone/OverridesJavaxInjectableMethod`

This method is not annotated with @Inject, but it overrides a method that is annotated with @javax.inject.Inject. The method will not be Injected.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/OverridesJavaxInjectableMethod).
- **Fix:** With `nitpicker --fix --rule errorprone/OverridesJavaxInjectableMethod`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/OverridesJavaxInjectableMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OverridesJavaxInjectableMethod)

<a id="errorprone-overridethrowabletostring"></a>

### `errorprone/OverrideThrowableToString`

To return a custom message with a Throwable class, one should override getMessage() instead of toString().

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/OverrideThrowableToString).
- **Fix:** With `nitpicker --fix --rule errorprone/OverrideThrowableToString`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/OverrideThrowableToString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OverrideThrowableToString)

<a id="errorprone-overridingmethodinconsistentargumentnameschecker"></a>

### `errorprone/OverridingMethodInconsistentArgumentNamesChecker`

Arguments of overriding method are inconsistent with overridden method.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/OverridingMethodInconsistentArgumentNamesChecker).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/OverridingMethodInconsistentArgumentNamesChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/OverridingMethodInconsistentArgumentNamesChecker)

<a id="errorprone-packageinfo"></a>

### `errorprone/PackageInfo`

Declaring types inside package-info.java files is very bad form.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/PackageInfo).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/PackageInfo","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PackageInfo)

<a id="errorprone-packagelocation"></a>

### `errorprone/PackageLocation`

Package names should match the directory they are declared in.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/PackageLocation).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/PackageLocation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PackageLocation)

<a id="errorprone-parametercomment"></a>

### `errorprone/ParameterComment`

Non-standard parameter comment; prefer `/* paramName= */ arg`.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ParameterComment).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/ParameterComment","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ParameterComment)

<a id="errorprone-parametername"></a>

### `errorprone/ParameterName`

Detects `/* name= */`-style comments on actual parameters where the name doesn't match the formal parameter.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ParameterName).
- **Fix:** With `nitpicker --fix --rule errorprone/ParameterName`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ParameterName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ParameterName)

<a id="errorprone-parametersbutnotparameterized"></a>

### `errorprone/ParametersButNotParameterized`

This test has @Parameters but is using the default JUnit4 runner. The parameters will have no effect.

- **Labels:** bug, tests
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ParametersButNotParameterized).
- **Fix:** With `nitpicker --fix --rule errorprone/ParametersButNotParameterized`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ParametersButNotParameterized","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ParametersButNotParameterized)

<a id="errorprone-parcelablecreator"></a>

### `errorprone/ParcelableCreator`

Detects classes which implement Parcelable but don't have CREATOR.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ParcelableCreator).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/ParcelableCreator","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ParcelableCreator)

<a id="errorprone-patternmatchinginstanceof"></a>

### `errorprone/PatternMatchingInstanceof`

This code can be simplified to use a pattern-matching instanceof.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/PatternMatchingInstanceof).
- **Fix:** With `nitpicker --fix --rule errorprone/PatternMatchingInstanceof`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/PatternMatchingInstanceof","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PatternMatchingInstanceof)

<a id="errorprone-periodfrom"></a>

### `errorprone/PeriodFrom`

Period.from(Period) returns itself; from(Duration) throws a runtime exception.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/PeriodFrom).
- **Fix:** With `nitpicker --fix --rule errorprone/PeriodFrom`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/PeriodFrom","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PeriodFrom)

<a id="errorprone-periodgettemporalunit"></a>

### `errorprone/PeriodGetTemporalUnit`

Period.get() only works with YEARS, MONTHS, or DAYS.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/PeriodGetTemporalUnit).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/PeriodGetTemporalUnit","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PeriodGetTemporalUnit)

<a id="errorprone-periodtimemath"></a>

### `errorprone/PeriodTimeMath`

When adding or subtracting from a Period, Duration is incompatible.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/PeriodTimeMath).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/PeriodTimeMath","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PeriodTimeMath)

<a id="errorprone-preconditionschecknotnullrepeated"></a>

### `errorprone/PreconditionsCheckNotNullRepeated`

Including the first argument of checkNotNull in the failure message is not useful, as it will always be `null`.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/PreconditionsCheckNotNullRepeated).
- **Fix:** With `nitpicker --fix --rule errorprone/PreconditionsCheckNotNullRepeated`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/PreconditionsCheckNotNullRepeated","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PreconditionsCheckNotNullRepeated)

<a id="errorprone-preconditionsinvalidplaceholder"></a>

### `errorprone/PreconditionsInvalidPlaceholder`

Preconditions only accepts the %s placeholder in error message strings.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/PreconditionsInvalidPlaceholder).
- **Fix:** With `nitpicker --fix --rule errorprone/PreconditionsInvalidPlaceholder`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/PreconditionsInvalidPlaceholder","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PreconditionsInvalidPlaceholder)

<a id="errorprone-preferinstanceofovergetkind"></a>

### `errorprone/PreferInstanceofOverGetKind`

Prefer instanceof over getKind() checks where possible, as these work well with pattern matching instanceofs.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/PreferInstanceofOverGetKind).
- **Fix:** With `nitpicker --fix --rule errorprone/PreferInstanceofOverGetKind`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/PreferInstanceofOverGetKind","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PreferInstanceofOverGetKind)

<a id="errorprone-preferjavatimeoverload"></a>

### `errorprone/PreferJavaTimeOverload`

Prefer using java.time-based APIs when available. Note that this checker does not and cannot guarantee that the overloads have equivalent semantics, but that is generally the case with overloaded methods.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/PreferJavaTimeOverload).
- **Fix:** With `nitpicker --fix --rule errorprone/PreferJavaTimeOverload`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/PreferJavaTimeOverload","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PreferJavaTimeOverload)

<a id="errorprone-prefertestparameter"></a>

### `errorprone/PreferTestParameter`

When exhaustively testing all values of a single enum or boolean parameter, prefer @TestParameter over @TestParameters.

- **Labels:** tests
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/PreferTestParameter).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/PreferTestParameter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PreferTestParameter)

<a id="errorprone-preferthrowstag"></a>

### `errorprone/PreferThrowsTag`

Prefer the @throws javadoc tag instead of @exception.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/PreferThrowsTag).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/PreferThrowsTag","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PreferThrowsTag)

<a id="errorprone-primitivearraypassedtovarargsmethod"></a>

### `errorprone/PrimitiveArrayPassedToVarargsMethod`

Passing a primitive array to a varargs method is usually wrong.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/PrimitiveArrayPassedToVarargsMethod).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/PrimitiveArrayPassedToVarargsMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PrimitiveArrayPassedToVarargsMethod)

<a id="errorprone-primitiveatomicreference"></a>

### `errorprone/PrimitiveAtomicReference`

Using compareAndSet with boxed primitives is dangerous, as reference rather than value equality is used. Consider using AtomicInteger, AtomicLong, AtomicBoolean from JDK or AtomicDouble from Guava instead.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/PrimitiveAtomicReference).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/PrimitiveAtomicReference","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PrimitiveAtomicReference)

<a id="errorprone-privateconstructorfornoninstantiablemodule"></a>

### `errorprone/PrivateConstructorForNoninstantiableModule`

Add a private constructor to modules that will not be instantiated by Dagger.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/PrivateConstructorForNoninstantiableModule).
- **Fix:** With `nitpicker --fix --rule errorprone/PrivateConstructorForNoninstantiableModule`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/PrivateConstructorForNoninstantiableModule","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PrivateConstructorForNoninstantiableModule)

<a id="errorprone-privateconstructorforutilityclass"></a>

### `errorprone/PrivateConstructorForUtilityClass`

Classes which are not intended to be instantiated should be made non-instantiable with a private constructor. This includes utility classes (classes with only static members), and the main class.

- **Labels:** maintainability
- **Scope:** Not reported in classes annotated com.tngtech.archunit.junit.AnalyzeClasses, org.springframework.boot.SpringBootConfiguration, org.springframework.boot.autoconfigure.SpringBootApplication, org.springframework.context.annotation.Configuration.
- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/PrivateConstructorForUtilityClass).
- **Fix:** With `nitpicker --fix --rule errorprone/PrivateConstructorForUtilityClass`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/PrivateConstructorForUtilityClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PrivateConstructorForUtilityClass)

<a id="errorprone-privatesecuritycontractprotoaccess"></a>

### `errorprone/PrivateSecurityContractProtoAccess`

Access to a private protocol buffer field is forbidden. This protocol buffer carries a security contract, and can only be created using an approved library. Direct access to the fields is forbidden.

- **Labels:** security
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/PrivateSecurityContractProtoAccess).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/PrivateSecurityContractProtoAccess","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PrivateSecurityContractProtoAccess)

<a id="errorprone-protectedmembersinfinalclass"></a>

### `errorprone/ProtectedMembersInFinalClass`

Protected members in final classes can be package-private.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ProtectedMembersInFinalClass).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/ProtectedMembersInFinalClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ProtectedMembersInFinalClass)

<a id="errorprone-protobuilderreturnvalueignored"></a>

### `errorprone/ProtoBuilderReturnValueIgnored`

Unnecessary call to proto's #build() method. If you don't consume the return value of #build(), the result is discarded and the only effect is to verify that all required fields are set, which can be expressed more directly with #isInitialized().

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ProtoBuilderReturnValueIgnored).
- **Fix:** With `nitpicker --fix --rule errorprone/ProtoBuilderReturnValueIgnored`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ProtoBuilderReturnValueIgnored","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ProtoBuilderReturnValueIgnored)

<a id="errorprone-protocolbufferordinal"></a>

### `errorprone/ProtocolBufferOrdinal`

To get the tag number of a protocol buffer enum, use getNumber() instead.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ProtocolBufferOrdinal).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/ProtocolBufferOrdinal","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ProtocolBufferOrdinal)

<a id="errorprone-protodurationgetsecondsgetnano"></a>

### `errorprone/ProtoDurationGetSecondsGetNano`

GetNanos() only accesses the underlying nanosecond-adjustment of the duration.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ProtoDurationGetSecondsGetNano).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/ProtoDurationGetSecondsGetNano","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ProtoDurationGetSecondsGetNano)

<a id="errorprone-protostringfieldreferenceequality"></a>

### `errorprone/ProtoStringFieldReferenceEquality`

Comparing protobuf fields of type String using reference equality.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ProtoStringFieldReferenceEquality).
- **Fix:** With `nitpicker --fix --rule errorprone/ProtoStringFieldReferenceEquality`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ProtoStringFieldReferenceEquality","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ProtoStringFieldReferenceEquality)

<a id="errorprone-prototimestampgetsecondsgetnano"></a>

### `errorprone/ProtoTimestampGetSecondsGetNano`

GetNanos() only accesses the underlying nanosecond-adjustment of the instant.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ProtoTimestampGetSecondsGetNano).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/ProtoTimestampGetSecondsGetNano","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ProtoTimestampGetSecondsGetNano)

<a id="errorprone-prototruthmixeddescriptors"></a>

### `errorprone/ProtoTruthMixedDescriptors`

The arguments passed to `ignoringFields` are inconsistent with the proto which is the subject of the assertion.

- **Labels:** bug, tests
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ProtoTruthMixedDescriptors).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/ProtoTruthMixedDescriptors","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ProtoTruthMixedDescriptors)

<a id="errorprone-providesmethodoutsideofmodule"></a>

### `errorprone/ProvidesMethodOutsideOfModule`

@Provides methods need to be declared in a Module to have any effect.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ProvidesMethodOutsideOfModule).
- **Fix:** With `nitpicker --fix --rule errorprone/ProvidesMethodOutsideOfModule`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ProvidesMethodOutsideOfModule","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ProvidesMethodOutsideOfModule)

<a id="errorprone-publicapinamedstreamshouldreturnstream"></a>

### `errorprone/PublicApiNamedStreamShouldReturnStream`

Public methods named stream() are generally expected to return a type whose name ends with Stream. Consider choosing a different method name instead.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/PublicApiNamedStreamShouldReturnStream).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/PublicApiNamedStreamShouldReturnStream","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/PublicApiNamedStreamShouldReturnStream)

<a id="errorprone-qualifierorscopeoninjectmethod"></a>

### `errorprone/QualifierOrScopeOnInjectMethod`

Qualifiers/Scope annotations on @Inject methods don't have any effect. Move the qualifier annotation to the binding location.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/QualifierOrScopeOnInjectMethod).
- **Fix:** With `nitpicker --fix --rule errorprone/QualifierOrScopeOnInjectMethod`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/QualifierOrScopeOnInjectMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/QualifierOrScopeOnInjectMethod)

<a id="errorprone-qualifierwithtypeuse"></a>

### `errorprone/QualifierWithTypeUse`

Injection frameworks currently don't understand Qualifiers in TYPE_PARAMETER or TYPE_USE contexts.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/QualifierWithTypeUse).
- **Fix:** With `nitpicker --fix --rule errorprone/QualifierWithTypeUse`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/QualifierWithTypeUse","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/QualifierWithTypeUse)

<a id="errorprone-randomcast"></a>

### `errorprone/RandomCast`

Casting a random number in the range [0.0, 1.0) to an integer or long always results in 0.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RandomCast).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/RandomCast","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RandomCast)

<a id="errorprone-randommodinteger"></a>

### `errorprone/RandomModInteger`

Use Random.nextInt(int). Random.nextInt() % n can have negative results.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RandomModInteger).
- **Fix:** With `nitpicker --fix --rule errorprone/RandomModInteger`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/RandomModInteger","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RandomModInteger)

<a id="errorprone-reachabilityfenceusage"></a>

### `errorprone/ReachabilityFenceUsage`

ReachabilityFence should always be called inside a finally block.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ReachabilityFenceUsage).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/ReachabilityFenceUsage","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ReachabilityFenceUsage)

<a id="errorprone-recordaccessorincompactconstructor"></a>

### `errorprone/RecordAccessorInCompactConstructor`

Record accessors read uninitialized fields inside a compact constructor. Use the component parameter instead.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RecordAccessorInCompactConstructor).
- **Fix:** With `nitpicker --fix --rule errorprone/RecordAccessorInCompactConstructor`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/RecordAccessorInCompactConstructor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RecordAccessorInCompactConstructor)

<a id="errorprone-recordcomponentaccessorannotationconflict"></a>

### `errorprone/RecordComponentAccessorAnnotationConflict`

Annotation on record component is ignored.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RecordComponentAccessorAnnotationConflict).
- **Fix:** With `nitpicker --fix --rule errorprone/RecordComponentAccessorAnnotationConflict`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/RecordComponentAccessorAnnotationConflict","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RecordComponentAccessorAnnotationConflict)

<a id="errorprone-recordcomponentoverride"></a>

### `errorprone/RecordComponentOverride`

@Override annotations on record components don't do anything.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RecordComponentOverride).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/RecordComponentOverride","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RecordComponentOverride)

<a id="errorprone-rectintersectreturnvalueignored"></a>

### `errorprone/RectIntersectReturnValueIgnored`

Return value of android.graphics.Rect.intersect() must be checked.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RectIntersectReturnValueIgnored).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/RectIntersectReturnValueIgnored","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RectIntersectReturnValueIgnored)

<a id="errorprone-redundantcontrolflow"></a>

### `errorprone/RedundantControlFlow`

This continue statement is redundant and can be removed. It may be misleading.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RedundantControlFlow).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/RedundantControlFlow","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RedundantControlFlow)

<a id="errorprone-redundantnullcheck"></a>

### `errorprone/RedundantNullCheck`

Null check on an expression that is statically determined to be non-null according to language semantics or nullness annotations.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RedundantNullCheck).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/RedundantNullCheck","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RedundantNullCheck)

<a id="errorprone-redundantoverride"></a>

### `errorprone/RedundantOverride`

This overriding method is redundant, and can be removed.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RedundantOverride).
- **Fix:** With `nitpicker --fix --rule errorprone/RedundantOverride`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/RedundantOverride","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RedundantOverride)

<a id="errorprone-redundantsettercall"></a>

### `errorprone/RedundantSetterCall`

A field was set twice in the same chained expression.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RedundantSetterCall).
- **Fix:** With `nitpicker --fix --rule errorprone/RedundantSetterCall`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/RedundantSetterCall","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RedundantSetterCall)

<a id="errorprone-redundantthrows"></a>

### `errorprone/RedundantThrows`

Thrown exception is a subtype of another.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RedundantThrows).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/RedundantThrows","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RedundantThrows)

<a id="errorprone-refactorswitch"></a>

### `errorprone/RefactorSwitch`

This switch can be refactored to be more readable.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RefactorSwitch).
- **Fix:** With `nitpicker --fix --rule errorprone/RefactorSwitch`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/RefactorSwitch","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RefactorSwitch)

<a id="errorprone-referenceequality"></a>

### `errorprone/ReferenceEquality`

Comparison using reference equality instead of value equality.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ReferenceEquality).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/ReferenceEquality","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ReferenceEquality)

<a id="errorprone-referstodaggercodegen"></a>

### `errorprone/RefersToDaggerCodegen`

Don't refer to Dagger's internal or generated code.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RefersToDaggerCodegen).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/RefersToDaggerCodegen","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RefersToDaggerCodegen)

<a id="errorprone-requiredmodifiers"></a>

### `errorprone/RequiredModifiers`

This annotation is missing required modifiers as specified by its @RequiredModifiers annotation.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RequiredModifiers).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/RequiredModifiers","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RequiredModifiers)

<a id="errorprone-restrictedapi"></a>

### `errorprone/RestrictedApi`

Check for non-allowlisted callers to RestrictedApiChecker.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RestrictedApi).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/RestrictedApi","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RestrictedApi)

<a id="errorprone-rethrowreflectiveoperationexceptionaslinkageerror"></a>

### `errorprone/RethrowReflectiveOperationExceptionAsLinkageError`

Prefer LinkageError for rethrowing ReflectiveOperationException as unchecked.

- **Labels:** reliability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RethrowReflectiveOperationExceptionAsLinkageError).
- **Fix:** With `nitpicker --fix --rule errorprone/RethrowReflectiveOperationExceptionAsLinkageError`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/RethrowReflectiveOperationExceptionAsLinkageError","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RethrowReflectiveOperationExceptionAsLinkageError)

<a id="errorprone-returnattheendofvoidfunction"></a>

### `errorprone/ReturnAtTheEndOfVoidFunction`

`return;` is unnecessary at the end of void methods and constructors.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ReturnAtTheEndOfVoidFunction).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/ReturnAtTheEndOfVoidFunction","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ReturnAtTheEndOfVoidFunction)

<a id="errorprone-returnfromvoid"></a>

### `errorprone/ReturnFromVoid`

Void methods should not have a @return tag.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ReturnFromVoid).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/ReturnFromVoid","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ReturnFromVoid)

<a id="errorprone-returnsnullcollection"></a>

### `errorprone/ReturnsNullCollection`

Method has a collection return type and returns {@code null} in some cases but does not annotate the method as @Nullable. See Effective Java 3rd Edition Item 54.

- **Labels:** reliability
- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ReturnsNullCollection).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/ReturnsNullCollection","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ReturnsNullCollection)

<a id="errorprone-returnvalueignored"></a>

### `errorprone/ReturnValueIgnored`

Return value of this method must be used.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ReturnValueIgnored).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/ReturnValueIgnored","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ReturnValueIgnored)

<a id="errorprone-robolectricshadowdirectlyon"></a>

### `errorprone/RobolectricShadowDirectlyOn`

Migrate off a deprecated overload of org.robolectric.shadow.api.Shadow#directlyOn.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RobolectricShadowDirectlyOn).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/RobolectricShadowDirectlyOn","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RobolectricShadowDirectlyOn)

<a id="errorprone-rulenotrun"></a>

### `errorprone/RuleNotRun`

This TestRule isn't annotated with @Rule, so won't be run.

- **Labels:** bug, tests
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RuleNotRun).
- **Fix:** With `nitpicker --fix --rule errorprone/RuleNotRun`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/RuleNotRun","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RuleNotRun)

<a id="errorprone-rxreturnvalueignored"></a>

### `errorprone/RxReturnValueIgnored`

Returned Rx objects must be checked. Ignoring a returned Rx value means it is never scheduled for execution.

- **Labels:** bug, async
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/RxReturnValueIgnored).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/RxReturnValueIgnored","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/RxReturnValueIgnored)

<a id="errorprone-samenamebutdifferent"></a>

### `errorprone/SameNameButDifferent`

This type name shadows another in a way that may be confusing.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SameNameButDifferent).
- **Fix:** With `nitpicker --fix --rule errorprone/SameNameButDifferent`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/SameNameButDifferent","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SameNameButDifferent)

<a id="errorprone-scannerusedelimiter"></a>

### `errorprone/ScannerUseDelimiter`

Scanner.useDelimiter is not an efficient way to read an entire InputStream.

- **Labels:** performance
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ScannerUseDelimiter).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/ScannerUseDelimiter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ScannerUseDelimiter)

<a id="errorprone-scopeonmodule"></a>

### `errorprone/ScopeOnModule`

Scopes on modules have no function and will soon be an error.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ScopeOnModule).
- **Fix:** With `nitpicker --fix --rule errorprone/ScopeOnModule`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ScopeOnModule","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ScopeOnModule)

<a id="errorprone-selfalwaysreturnsthis"></a>

### `errorprone/SelfAlwaysReturnsThis`

Non-abstract instance methods named 'self()' or 'getThis()' that return the enclosing class must always 'return this'.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SelfAlwaysReturnsThis).
- **Fix:** With `nitpicker --fix --rule errorprone/SelfAlwaysReturnsThis`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/SelfAlwaysReturnsThis","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SelfAlwaysReturnsThis)

<a id="errorprone-selfassertion"></a>

### `errorprone/SelfAssertion`

This assertion will always fail or succeed.

- **Labels:** bug, tests
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SelfAssertion).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/SelfAssertion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SelfAssertion)

<a id="errorprone-selfassignment"></a>

### `errorprone/SelfAssignment`

Variable assigned to itself.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SelfAssignment).
- **Fix:** With `nitpicker --fix --rule errorprone/SelfAssignment`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/SelfAssignment","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SelfAssignment)

<a id="errorprone-selfcomparison"></a>

### `errorprone/SelfComparison`

An object is compared to itself.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SelfComparison).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/SelfComparison","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SelfComparison)

<a id="errorprone-selfequals"></a>

### `errorprone/SelfEquals`

Testing an object for equality with itself will always be true.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SelfEquals).
- **Fix:** With `nitpicker --fix --rule errorprone/SelfEquals`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/SelfEquals","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SelfEquals)

<a id="errorprone-selfset"></a>

### `errorprone/SelfSet`

This setter seems to be invoked with a value from its own getter. Is it redundant?

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SelfSet).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/SelfSet","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SelfSet)

<a id="errorprone-setunrecognized"></a>

### `errorprone/SetUnrecognized`

Setting a proto field to an UNRECOGNIZED value will result in an exception at runtime when building.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SetUnrecognized).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/SetUnrecognized","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SetUnrecognized)

<a id="errorprone-shortcircuitboolean"></a>

### `errorprone/ShortCircuitBoolean`

Prefer the short-circuiting boolean operators && and || to & and |.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ShortCircuitBoolean).
- **Fix:** With `nitpicker --fix --rule errorprone/ShortCircuitBoolean`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ShortCircuitBoolean","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ShortCircuitBoolean)

<a id="errorprone-shouldhaveevenargs"></a>

### `errorprone/ShouldHaveEvenArgs`

This method must be called with an even number of arguments.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ShouldHaveEvenArgs).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/ShouldHaveEvenArgs","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ShouldHaveEvenArgs)

<a id="errorprone-sizegreaterthanorequalszero"></a>

### `errorprone/SizeGreaterThanOrEqualsZero`

Comparison of a size >= 0 is always true, did you intend to check for non-emptiness?

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SizeGreaterThanOrEqualsZero).
- **Fix:** With `nitpicker --fix --rule errorprone/SizeGreaterThanOrEqualsZero`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/SizeGreaterThanOrEqualsZero","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SizeGreaterThanOrEqualsZero)

<a id="errorprone-statementswitchtoexpressionswitch"></a>

### `errorprone/StatementSwitchToExpressionSwitch`

This statement switch can be converted to a new-style arrow switch.

- **Labels:** simplification
- **Scope:** Off in a project that uses Lombok.
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/StatementSwitchToExpressionSwitch).
- **Fix:** With `nitpicker --fix --rule errorprone/StatementSwitchToExpressionSwitch`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/StatementSwitchToExpressionSwitch","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StatementSwitchToExpressionSwitch)

<a id="errorprone-staticassignmentinconstructor"></a>

### `errorprone/StaticAssignmentInConstructor`

This assignment is to a static field. Mutating static state from a constructor is highly error-prone.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/StaticAssignmentInConstructor).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/StaticAssignmentInConstructor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StaticAssignmentInConstructor)

<a id="errorprone-staticassignmentofthrowable"></a>

### `errorprone/StaticAssignmentOfThrowable`

Saving instances of Throwable in static fields is discouraged, prefer to create them on-demand when an exception is thrown.

- **Labels:** reliability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/StaticAssignmentOfThrowable).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/StaticAssignmentOfThrowable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StaticAssignmentOfThrowable)

<a id="errorprone-staticguardedbyinstance"></a>

### `errorprone/StaticGuardedByInstance`

Writes to static fields should not be guarded by instance locks.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/StaticGuardedByInstance).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/StaticGuardedByInstance","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StaticGuardedByInstance)

<a id="errorprone-staticmockmember"></a>

### `errorprone/StaticMockMember`

@Mock members of test classes shouldn't share state between tests and preferably be non-static.

- **Labels:** tests
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/StaticMockMember).
- **Fix:** With `nitpicker --fix --rule errorprone/StaticMockMember`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/StaticMockMember","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StaticMockMember)

<a id="errorprone-staticqualifiedusingexpression"></a>

### `errorprone/StaticQualifiedUsingExpression`

A static variable or method should be qualified with a class name, not expression.

- **Labels:** style
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/StaticQualifiedUsingExpression).
- **Fix:** With `nitpicker --fix --rule errorprone/StaticQualifiedUsingExpression`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/StaticQualifiedUsingExpression","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StaticQualifiedUsingExpression)

<a id="errorprone-streamresourceleak"></a>

### `errorprone/StreamResourceLeak`

Streams that encapsulate a closeable resource should be closed using try-with-resources.

- **Labels:** reliability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/StreamResourceLeak).
- **Fix:** With `nitpicker --fix --rule errorprone/StreamResourceLeak`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/StreamResourceLeak","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StreamResourceLeak)

<a id="errorprone-streamtoiterable"></a>

### `errorprone/StreamToIterable`

Using stream::iterator creates a one-shot Iterable, which may cause surprising failures.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/StreamToIterable).
- **Fix:** With `nitpicker --fix --rule errorprone/StreamToIterable`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/StreamToIterable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StreamToIterable)

<a id="errorprone-streamtostring"></a>

### `errorprone/StreamToString`

Calling toString on a Stream does not provide useful information.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/StreamToString).
- **Fix:** With `nitpicker --fix --rule errorprone/StreamToString`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/StreamToString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StreamToString)

<a id="errorprone-stringbuilderinitwithchar"></a>

### `errorprone/StringBuilderInitWithChar`

StringBuilder does not have a char constructor; this invokes the int constructor.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/StringBuilderInitWithChar).
- **Fix:** With `nitpicker --fix --rule errorprone/StringBuilderInitWithChar`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/StringBuilderInitWithChar","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StringBuilderInitWithChar)

<a id="errorprone-stringcaselocaleusage"></a>

### `errorprone/StringCaseLocaleUsage`

Specify a `Locale` when calling `String#to{Lower,Upper}Case`. (Note: there are multiple suggested fixes; the third may be most appropriate if you're dealing with ASCII Strings.).

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/StringCaseLocaleUsage).
- **Fix:** With `nitpicker --fix --rule errorprone/StringCaseLocaleUsage`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/StringCaseLocaleUsage","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StringCaseLocaleUsage)

<a id="errorprone-stringcharset"></a>

### `errorprone/StringCharset`

Prefer StandardCharsets over using string names for charsets.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/StringCharset).
- **Fix:** With `nitpicker --fix --rule errorprone/StringCharset`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/StringCharset","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StringCharset)

<a id="errorprone-stringconcattotextblock"></a>

### `errorprone/StringConcatToTextBlock`

This string literal can be written more clearly as a text block.

- **Labels:** simplification
- **Scope:** Off in a project that uses Lombok.
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/StringConcatToTextBlock).
- **Fix:** With `nitpicker --fix --rule errorprone/StringConcatToTextBlock`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/StringConcatToTextBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StringConcatToTextBlock)

<a id="errorprone-stringjoin"></a>

### `errorprone/StringJoin`

String.join(CharSequence) performs no joining (it always returns the empty string); String.join(CharSequence, CharSequence) performs no joining (it just returns the 2nd parameter).

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/StringJoin).
- **Fix:** With `nitpicker --fix --rule errorprone/StringJoin`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/StringJoin","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StringJoin)

<a id="errorprone-stringsplitter"></a>

### `errorprone/StringSplitter`

String.split(String) has surprising behavior.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/StringSplitter).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/StringSplitter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StringSplitter)

<a id="errorprone-stronglytypebytestring"></a>

### `errorprone/StronglyTypeByteString`

This primitive byte array is only used to construct ByteStrings. It would be clearer to strongly type the field instead.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/StronglyTypeByteString).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/StronglyTypeByteString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StronglyTypeByteString)

<a id="errorprone-stronglytypetime"></a>

### `errorprone/StronglyTypeTime`

This primitive integral type is only used to construct time types. It would be clearer to strongly type the field instead.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/StronglyTypeTime).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/StronglyTypeTime","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/StronglyTypeTime)

<a id="errorprone-substringofzero"></a>

### `errorprone/SubstringOfZero`

String.substring(0) returns the original String.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SubstringOfZero).
- **Fix:** With `nitpicker --fix --rule errorprone/SubstringOfZero`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/SubstringOfZero","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SubstringOfZero)

<a id="errorprone-sunapi"></a>

### `errorprone/SunApi`

Usage of internal proprietary API which may be removed in a future release.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SunApi).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/SunApi","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SunApi)

<a id="errorprone-supercalltoobjectmethod"></a>

### `errorprone/SuperCallToObjectMethod`

`super.equals(obj)` and `super.hashCode()` are often bugs when they call the methods defined in `java.lang.Object`.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SuperCallToObjectMethod).
- **Fix:** With `nitpicker --fix --rule errorprone/SuperCallToObjectMethod`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/SuperCallToObjectMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SuperCallToObjectMethod)

<a id="errorprone-suppresswarningsdeprecated"></a>

### `errorprone/SuppressWarningsDeprecated`

Suppressing "deprecated" is probably a typo for "deprecation".

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SuppressWarningsDeprecated).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/SuppressWarningsDeprecated","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SuppressWarningsDeprecated)

<a id="errorprone-suppresswarningswithoutexplanation"></a>

### `errorprone/SuppressWarningsWithoutExplanation`

Use of @SuppressWarnings should be accompanied by a comment describing why the warning is safe to ignore.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SuppressWarningsWithoutExplanation).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/SuppressWarningsWithoutExplanation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SuppressWarningsWithoutExplanation)

<a id="errorprone-swigmemoryleak"></a>

### `errorprone/SwigMemoryLeak`

SWIG generated code that can't call a C++ destructor will leak memory.

- **Labels:** reliability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SwigMemoryLeak).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/SwigMemoryLeak","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SwigMemoryLeak)

<a id="errorprone-switchdefault"></a>

### `errorprone/SwitchDefault`

The default case of a switch should appear at the end of the last statement group.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SwitchDefault).
- **Fix:** With `nitpicker --fix --rule errorprone/SwitchDefault`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/SwitchDefault","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SwitchDefault)

<a id="errorprone-symboltostring"></a>

### `errorprone/SymbolToString`

Element#toString shouldn't be used for comparison as it is expensive and fragile.

- **Labels:** performance
- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SymbolToString).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/SymbolToString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SymbolToString)

<a id="errorprone-synchronizeonnonfinalfield"></a>

### `errorprone/SynchronizeOnNonFinalField`

Synchronizing on non-final fields is not safe: if the field is ever updated, different threads may end up locking on different objects.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SynchronizeOnNonFinalField).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/SynchronizeOnNonFinalField","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SynchronizeOnNonFinalField)

<a id="errorprone-systemconsolenull"></a>

### `errorprone/SystemConsoleNull`

System.console() no longer returns null in JDK 22 and newer versions.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SystemConsoleNull).
- **Fix:** With `nitpicker --fix --rule errorprone/SystemConsoleNull`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/SystemConsoleNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SystemConsoleNull)

<a id="errorprone-systemexitoutsidemain"></a>

### `errorprone/SystemExitOutsideMain`

Code that contains System.exit() is untestable.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SystemExitOutsideMain).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/SystemExitOutsideMain","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SystemExitOutsideMain)

<a id="errorprone-systemout"></a>

### `errorprone/SystemOut`

Production code should not print to standard out or standard error. Standard out and standard error should only be used for debugging.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/SystemOut).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/SystemOut","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/SystemOut)

<a id="errorprone-temporalaccessorgetchronofield"></a>

### `errorprone/TemporalAccessorGetChronoField`

TemporalAccessor.get() only works for certain values of ChronoField.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TemporalAccessorGetChronoField).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/TemporalAccessorGetChronoField","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TemporalAccessorGetChronoField)

<a id="errorprone-testexceptionchecker"></a>

### `errorprone/TestExceptionChecker`

Using @Test(expected=...) is discouraged, since the test will pass if any statement in the test method throws the expected exception.

- **Labels:** tests
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TestExceptionChecker).
- **Fix:** With `nitpicker --fix --rule errorprone/TestExceptionChecker`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/TestExceptionChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TestExceptionChecker)

<a id="errorprone-testparametersnotinitialized"></a>

### `errorprone/TestParametersNotInitialized`

This test has @TestParameter fields but is using the default JUnit4 runner. The parameters will not be initialised beyond their default value.

- **Labels:** bug, tests
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TestParametersNotInitialized).
- **Fix:** With `nitpicker --fix --rule errorprone/TestParametersNotInitialized`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/TestParametersNotInitialized","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TestParametersNotInitialized)

<a id="errorprone-theorybutnotheories"></a>

### `errorprone/TheoryButNoTheories`

This test has members annotated with @Theory, @DataPoint, or @DataPoints but is using the default JUnit4 runner.

- **Labels:** bug, tests
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TheoryButNoTheories).
- **Fix:** With `nitpicker --fix --rule errorprone/TheoryButNoTheories`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/TheoryButNoTheories","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TheoryButNoTheories)

<a id="errorprone-threadbuildernamewithplaceholder"></a>

### `errorprone/ThreadBuilderNameWithPlaceholder`

Thread.Builder.name() does not accept placeholders (e.g., %d or %s). threadBuilder.name(String) accepts a constant name and threadBuilder.name(String, int) accepts a constant name prefix and an initial counter value.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ThreadBuilderNameWithPlaceholder).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/ThreadBuilderNameWithPlaceholder","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ThreadBuilderNameWithPlaceholder)

<a id="errorprone-threadjoinloop"></a>

### `errorprone/ThreadJoinLoop`

Thread.join needs to be immediately surrounded by a loop until it succeeds. Consider using Uninterruptibles.joinUninterruptibly.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ThreadJoinLoop).
- **Fix:** With `nitpicker --fix --rule errorprone/ThreadJoinLoop`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ThreadJoinLoop","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ThreadJoinLoop)

<a id="errorprone-threadlocalusage"></a>

### `errorprone/ThreadLocalUsage`

ThreadLocals should be stored in static fields.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ThreadLocalUsage).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/ThreadLocalUsage","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ThreadLocalUsage)

<a id="errorprone-threadprioritycheck"></a>

### `errorprone/ThreadPriorityCheck`

Relying on the thread scheduler is discouraged.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ThreadPriorityCheck).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/ThreadPriorityCheck","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ThreadPriorityCheck)

<a id="errorprone-threelettertimezoneid"></a>

### `errorprone/ThreeLetterTimeZoneID`

Three-letter time zone identifiers are deprecated, may be ambiguous, and might not do what you intend; the full IANA time zone ID should be used instead.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ThreeLetterTimeZoneID).
- **Fix:** With `nitpicker --fix --rule errorprone/ThreeLetterTimeZoneID`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ThreeLetterTimeZoneID","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ThreeLetterTimeZoneID)

<a id="errorprone-throwableequalshashcode"></a>

### `errorprone/ThrowableEqualsHashCode`

Overriding Throwable.equals() or hashCode() is discouraged.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ThrowableEqualsHashCode).
- **Fix:** With `nitpicker --fix --rule errorprone/ThrowableEqualsHashCode`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ThrowableEqualsHashCode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ThrowableEqualsHashCode)

<a id="errorprone-throwifuncheckedknownchecked"></a>

### `errorprone/ThrowIfUncheckedKnownChecked`

ThrowIfUnchecked(knownCheckedException) is a no-op.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ThrowIfUncheckedKnownChecked).
- **Fix:** With `nitpicker --fix --rule errorprone/ThrowIfUncheckedKnownChecked`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ThrowIfUncheckedKnownChecked","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ThrowIfUncheckedKnownChecked)

<a id="errorprone-throwifuncheckedknownunchecked"></a>

### `errorprone/ThrowIfUncheckedKnownUnchecked`

`throwIfUnchecked(knownUnchecked)` is equivalent to `throw knownUnchecked`.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ThrowIfUncheckedKnownUnchecked).
- **Fix:** With `nitpicker --fix --rule errorprone/ThrowIfUncheckedKnownUnchecked`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ThrowIfUncheckedKnownUnchecked","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ThrowIfUncheckedKnownUnchecked)

<a id="errorprone-thrownull"></a>

### `errorprone/ThrowNull`

Throwing 'null' always results in a NullPointerException being thrown.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ThrowNull).
- **Fix:** With `nitpicker --fix --rule errorprone/ThrowNull`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ThrowNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ThrowNull)

<a id="errorprone-throwspecificexceptions"></a>

### `errorprone/ThrowSpecificExceptions`

Base exception classes should be treated as abstract. If the exception is intended to be caught, throw a domain-specific exception. Otherwise, prefer a more specific exception for clarity. Common alternatives include: AssertionError, IllegalArgumentException, IllegalStateException, and (Guava's) VerifyException.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ThrowSpecificExceptions).
- **Fix:** With `nitpicker --fix --rule errorprone/ThrowSpecificExceptions`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/ThrowSpecificExceptions","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ThrowSpecificExceptions)

<a id="errorprone-timeinstaticinitializer"></a>

### `errorprone/TimeInStaticInitializer`

Accessing the current time in a static initialiser captures the time at class loading, which is rarely desirable.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TimeInStaticInitializer).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/TimeInStaticInitializer","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TimeInStaticInitializer)

<a id="errorprone-timeunitconversionchecker"></a>

### `errorprone/TimeUnitConversionChecker`

This TimeUnit conversion looks buggy: converting from a smaller unit to a larger unit (and passing a constant), converting to/from the same TimeUnit, or converting TimeUnits where the result is statically known to be 0 or 1 are all buggy patterns.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TimeUnitConversionChecker).
- **Fix:** With `nitpicker --fix --rule errorprone/TimeUnitConversionChecker`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/TimeUnitConversionChecker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TimeUnitConversionChecker)

<a id="errorprone-timeunitmismatch"></a>

### `errorprone/TimeUnitMismatch`

An value that appears to be represented in one unit is used where another appears to be required (e.g., seconds where nanos are needed).

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TimeUnitMismatch).
- **Fix:** With `nitpicker --fix --rule errorprone/TimeUnitMismatch`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/TimeUnitMismatch","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TimeUnitMismatch)

<a id="errorprone-tostringreturnsnull"></a>

### `errorprone/ToStringReturnsNull`

An implementation of Object.toString() should never return null.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ToStringReturnsNull).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/ToStringReturnsNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ToStringReturnsNull)

<a id="errorprone-traditionalswitchexpression"></a>

### `errorprone/TraditionalSwitchExpression`

Prefer -> switches for switch expressions.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TraditionalSwitchExpression).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/TraditionalSwitchExpression","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TraditionalSwitchExpression)

<a id="errorprone-transientmisuse"></a>

### `errorprone/TransientMisuse`

Static fields are implicitly transient, so the explicit modifier is unnecessary.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TransientMisuse).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/TransientMisuse","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TransientMisuse)

<a id="errorprone-treetostring"></a>

### `errorprone/TreeToString`

Tree#toString shouldn't be used for Trees deriving from the code being compiled, as it discards whitespace and comments.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TreeToString).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/TreeToString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TreeToString)

<a id="errorprone-truthassertexpected"></a>

### `errorprone/TruthAssertExpected`

The actual and expected values appear to be swapped, which results in poor assertion failure messages. The actual value should come first.

- **Labels:** tests
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TruthAssertExpected).
- **Fix:** With `nitpicker --fix --rule errorprone/TruthAssertExpected`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/TruthAssertExpected","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TruthAssertExpected)

<a id="errorprone-truthconstantasserts"></a>

### `errorprone/TruthConstantAsserts`

Truth Library assert is called on a constant.

- **Labels:** tests
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TruthConstantAsserts).
- **Fix:** With `nitpicker --fix --rule errorprone/TruthConstantAsserts`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/TruthConstantAsserts","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TruthConstantAsserts)

<a id="errorprone-truthcontainsexactlyelementsinusage"></a>

### `errorprone/TruthContainsExactlyElementsInUsage`

ContainsExactly is preferred over containsExactlyElementsIn when creating new iterables.

- **Labels:** tests
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TruthContainsExactlyElementsInUsage).
- **Fix:** With `nitpicker --fix --rule errorprone/TruthContainsExactlyElementsInUsage`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/TruthContainsExactlyElementsInUsage","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TruthContainsExactlyElementsInUsage)

<a id="errorprone-truthgetordefault"></a>

### `errorprone/TruthGetOrDefault`

Asserting on getOrDefault is unclear; prefer containsEntry or doesNotContainKey.

- **Labels:** tests
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TruthGetOrDefault).
- **Fix:** With `nitpicker --fix --rule errorprone/TruthGetOrDefault`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/TruthGetOrDefault","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TruthGetOrDefault)

<a id="errorprone-truthincompatibletype"></a>

### `errorprone/TruthIncompatibleType`

Argument is not compatible with the subject's type.

- **Labels:** bug, tests
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TruthIncompatibleType).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/TruthIncompatibleType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TruthIncompatibleType)

<a id="errorprone-tryfailrefactoring"></a>

### `errorprone/TryFailRefactoring`

Prefer assertThrows to try/fail.

- **Labels:** tests
- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TryFailRefactoring).
- **Fix:** With `nitpicker --fix --rule errorprone/TryFailRefactoring`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/TryFailRefactoring","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TryFailRefactoring)

<a id="errorprone-tryfailthrowable"></a>

### `errorprone/TryFailThrowable`

Catching Throwable/Error masks failures from fail() or assert\*() in the try block.

- **Labels:** bug, tests
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TryFailThrowable).
- **Fix:** With `nitpicker --fix --rule errorprone/TryFailThrowable`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/TryFailThrowable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TryFailThrowable)

<a id="errorprone-trywithresourcesvariable"></a>

### `errorprone/TryWithResourcesVariable`

This variable is unnecessary, the try-with-resources resource can be a reference to a final or effectively final variable.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TryWithResourcesVariable).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/TryWithResourcesVariable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TryWithResourcesVariable)

<a id="errorprone-typeequals"></a>

### `errorprone/TypeEquals`

TypeMirror should be compared using Types#isSameType, not equality operators or equals().

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TypeEquals).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/TypeEquals","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TypeEquals)

<a id="errorprone-typenameshadowing"></a>

### `errorprone/TypeNameShadowing`

Type parameter declaration shadows another named type.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TypeNameShadowing).
- **Fix:** With `nitpicker --fix --rule errorprone/TypeNameShadowing`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/TypeNameShadowing","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TypeNameShadowing)

<a id="errorprone-typeparameternaming"></a>

### `errorprone/TypeParameterNaming`

Type parameters must be a single letter with an optional numeric suffix, or an UpperCamelCase name followed by the letter 'T'.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s5.2.8-type-variable-names).
- **Fix:** With `nitpicker --fix --rule errorprone/TypeParameterNaming`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/TypeParameterNaming","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html#s5.2.8-type-variable-names)

<a id="errorprone-typeparameterqualifier"></a>

### `errorprone/TypeParameterQualifier`

Type parameter used as type qualifier.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TypeParameterQualifier).
- **Fix:** With `nitpicker --fix --rule errorprone/TypeParameterQualifier`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/TypeParameterQualifier","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TypeParameterQualifier)

<a id="errorprone-typeparametershadowing"></a>

### `errorprone/TypeParameterShadowing`

Type parameter declaration overrides another type parameter already declared.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TypeParameterShadowing).
- **Fix:** With `nitpicker --fix --rule errorprone/TypeParameterShadowing`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/TypeParameterShadowing","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TypeParameterShadowing)

<a id="errorprone-typeparameterunusedinformals"></a>

### `errorprone/TypeParameterUnusedInFormals`

Declaring a type parameter that is only used in the return type is a misuse of generics: operations on the type parameter are unchecked, it hides unsafe casts at invocations of the method, and it interacts badly with method overload resolution.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TypeParameterUnusedInFormals).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/TypeParameterUnusedInFormals","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TypeParameterUnusedInFormals)

<a id="errorprone-typetostring"></a>

### `errorprone/TypeToString`

TypeMirror#toString shouldn't be used for comparison as it is expensive and fragile.

- **Labels:** performance
- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/TypeToString).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/TypeToString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/TypeToString)

<a id="errorprone-undefinedequals"></a>

### `errorprone/UndefinedEquals`

This type is not guaranteed to implement a useful equals() method.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UndefinedEquals).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/UndefinedEquals","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UndefinedEquals)

<a id="errorprone-unescapedentity"></a>

### `errorprone/UnescapedEntity`

Javadoc is interpreted as HTML, so HTML entities such as &, \<, > must be escaped. If this finding seems wrong (e.g. is within a @code or @literal tag), check whether the tag could be malformed and not recognised by the compiler.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnescapedEntity).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnescapedEntity","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnescapedEntity)

<a id="errorprone-ungroupedoverloads"></a>

### `errorprone/UngroupedOverloads`

Constructors and methods with the same name should appear sequentially with no other code in between, even when modifiers such as static or private differ between the methods. Please re-order or re-name methods.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UngroupedOverloads).
- **Fix:** With `nitpicker --fix --rule errorprone/UngroupedOverloads`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/UngroupedOverloads","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UngroupedOverloads)

<a id="errorprone-unicodedirectionalitycharacters"></a>

### `errorprone/UnicodeDirectionalityCharacters`

Unicode directionality modifiers can be used to conceal code in many editors.

- **Labels:** security
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnicodeDirectionalityCharacters).
- **Fix:** With `nitpicker --fix --rule errorprone/UnicodeDirectionalityCharacters`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnicodeDirectionalityCharacters","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnicodeDirectionalityCharacters)

<a id="errorprone-unicodeescape"></a>

### `errorprone/UnicodeEscape`

Using unicode escape sequences for printable ASCII characters is obfuscated, and potentially dangerous.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnicodeEscape).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnicodeEscape","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnicodeEscape)

<a id="errorprone-unicodeincode"></a>

### `errorprone/UnicodeInCode`

Avoid using non-ASCII Unicode characters outside of comments and literals, as they can be confusing.

- **Labels:** style
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnicodeInCode).
- **Fix:** With `nitpicker --fix --rule errorprone/UnicodeInCode`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnicodeInCode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnicodeInCode)

<a id="errorprone-unnecessarilyfullyqualified"></a>

### `errorprone/UnnecessarilyFullyQualified`

This fully qualified name is unambiguous to the compiler if imported.

- **Labels:** simplification
- **Scope:** Off in a project that uses Lombok.
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessarilyFullyQualified).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessarilyFullyQualified","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessarilyFullyQualified)

<a id="errorprone-unnecessarilyusedvalue"></a>

### `errorprone/UnnecessarilyUsedValue`

The result of this API is ignorable, so it does not need to be captured / assigned into an `unused` variable.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessarilyUsedValue).
- **Fix:** With `nitpicker --fix --rule errorprone/UnnecessarilyUsedValue`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessarilyUsedValue","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessarilyUsedValue)

<a id="errorprone-unnecessarilyvisible"></a>

### `errorprone/UnnecessarilyVisible`

Some methods (such as those annotated with @Inject or @Provides) are only intended to be called by a framework, and so should have default visibility.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessarilyVisible).
- **Fix:** With `nitpicker --fix --rule errorprone/UnnecessarilyVisible`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessarilyVisible","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessarilyVisible)

<a id="errorprone-unnecessaryanonymousclass"></a>

### `errorprone/UnnecessaryAnonymousClass`

Implementing a functional interface is unnecessary; prefer to implement the functional interface method directly and use a method reference instead.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryAnonymousClass).
- **Fix:** With `nitpicker --fix --rule errorprone/UnnecessaryAnonymousClass`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryAnonymousClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryAnonymousClass)

<a id="errorprone-unnecessaryassignment"></a>

### `errorprone/UnnecessaryAssignment`

Fields annotated with @Inject/@Mock/@TestParameter should not be manually assigned to, as they should be initialized by a framework. Remove the assignment if a framework is being used, or the annotation if one isn't.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryAssignment).
- **Fix:** With `nitpicker --fix --rule errorprone/UnnecessaryAssignment`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryAssignment","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryAssignment)

<a id="errorprone-unnecessaryasync"></a>

### `errorprone/UnnecessaryAsync`

Variables which are initialized and do not escape the current scope do not need to worry about concurrency. Using the non-concurrent type will reduce overhead and verbosity.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryAsync).
- **Fix:** With `nitpicker --fix --rule errorprone/UnnecessaryAsync`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryAsync","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryAsync)

<a id="errorprone-unnecessaryboxedassignment"></a>

### `errorprone/UnnecessaryBoxedAssignment`

This expression can be implicitly boxed.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryBoxedAssignment).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryBoxedAssignment","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryBoxedAssignment)

<a id="errorprone-unnecessaryboxedvariable"></a>

### `errorprone/UnnecessaryBoxedVariable`

It is unnecessary for this variable to be boxed. Use the primitive instead.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryBoxedVariable).
- **Fix:** With `nitpicker --fix --rule errorprone/UnnecessaryBoxedVariable`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryBoxedVariable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryBoxedVariable)

<a id="errorprone-unnecessarybreakinswitch"></a>

### `errorprone/UnnecessaryBreakInSwitch`

This break is unnecessary, fallthrough does not occur in -> switches.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryBreakInSwitch).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryBreakInSwitch","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryBreakInSwitch)

<a id="errorprone-unnecessarychecknotnull"></a>

### `errorprone/UnnecessaryCheckNotNull`

This null check is unnecessary; the expression can never be null.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryCheckNotNull).
- **Fix:** With `nitpicker --fix --rule errorprone/UnnecessaryCheckNotNull`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryCheckNotNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryCheckNotNull)

<a id="errorprone-unnecessarycopy"></a>

### `errorprone/UnnecessaryCopy`

This collection is already immutable (just not ImmutableList/ImmutableMap); copying it is unnecessary.

- **Labels:** performance
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryCopy).
- **Fix:** With `nitpicker --fix --rule errorprone/UnnecessaryCopy`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryCopy","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryCopy)

<a id="errorprone-unnecessarylongtointconversion"></a>

### `errorprone/UnnecessaryLongToIntConversion`

Converting a long or Long to an int to pass as a long parameter is usually not necessary. If this conversion is intentional, consider `Longs.constrainToRange()` instead.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryLongToIntConversion).
- **Fix:** With `nitpicker --fix --rule errorprone/UnnecessaryLongToIntConversion`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryLongToIntConversion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryLongToIntConversion)

<a id="errorprone-unnecessarymethodinvocationmatcher"></a>

### `errorprone/UnnecessaryMethodInvocationMatcher`

It is not necessary to wrap a MethodMatcher with methodInvocation().

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryMethodInvocationMatcher).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryMethodInvocationMatcher","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryMethodInvocationMatcher)

<a id="errorprone-unnecessarymethodreference"></a>

### `errorprone/UnnecessaryMethodReference`

This method reference is unnecessary, and can be replaced with the variable itself.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryMethodReference).
- **Fix:** With `nitpicker --fix --rule errorprone/UnnecessaryMethodReference`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryMethodReference","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryMethodReference)

<a id="errorprone-unnecessaryoptionalget"></a>

### `errorprone/UnnecessaryOptionalGet`

This code can be simplified by directly using the lambda parameters instead of calling get..() on optional.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryOptionalGet).
- **Fix:** With `nitpicker --fix --rule errorprone/UnnecessaryOptionalGet`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryOptionalGet","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryOptionalGet)

<a id="errorprone-unnecessaryparentheses"></a>

### `errorprone/UnnecessaryParentheses`

These parentheses are unnecessary; it is unlikely the code will be misinterpreted without them.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryParentheses).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryParentheses","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryParentheses)

<a id="errorprone-unnecessaryqualifier"></a>

### `errorprone/UnnecessaryQualifier`

A qualifier annotation has no effect here.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryQualifier).
- **Fix:** With `nitpicker --fix --rule errorprone/UnnecessaryQualifier`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryQualifier","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryQualifier)

<a id="errorprone-unnecessarysemicolon"></a>

### `errorprone/UnnecessarySemicolon`

Unnecessary semicolons should be omitted. For empty block statements, prefer {}.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessarySemicolon).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessarySemicolon","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessarySemicolon)

<a id="errorprone-unnecessarysetdefault"></a>

### `errorprone/UnnecessarySetDefault`

Unnecessary call to NullPointerTester#setDefault.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessarySetDefault).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessarySetDefault","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessarySetDefault)

<a id="errorprone-unnecessarystaticimport"></a>

### `errorprone/UnnecessaryStaticImport`

Using static imports for types is unnecessary.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryStaticImport).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryStaticImport","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryStaticImport)

<a id="errorprone-unnecessarystringbuilder"></a>

### `errorprone/UnnecessaryStringBuilder`

Prefer string concatenation over explicitly using `StringBuilder#append`, since `+` reads better and has equivalent or better performance.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryStringBuilder).
- **Fix:** With `nitpicker --fix --rule errorprone/UnnecessaryStringBuilder`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryStringBuilder","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryStringBuilder)

<a id="errorprone-unnecessarytestmethodprefix"></a>

### `errorprone/UnnecessaryTestMethodPrefix`

A `test` prefix for a JUnit4 test is redundant, and a holdover from JUnit3. The `@Test` annotation makes it clear it's a test.

- **Labels:** tests, style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryTestMethodPrefix).
- **Fix:** With `nitpicker --fix --rule errorprone/UnnecessaryTestMethodPrefix`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryTestMethodPrefix","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryTestMethodPrefix)

<a id="errorprone-unnecessarytypeargument"></a>

### `errorprone/UnnecessaryTypeArgument`

Non-generic methods should not be invoked with type arguments.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryTypeArgument).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnnecessaryTypeArgument","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnnecessaryTypeArgument)

<a id="errorprone-unrecognisedjavadoctag"></a>

### `errorprone/UnrecognisedJavadocTag`

This Javadoc tag wasn't recognised by the parser. Is it malformed somehow, perhaps with mismatched braces?

- **Labels:** style
- **Scope:** Off in a project that uses Lombok.
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnrecognisedJavadocTag).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnrecognisedJavadocTag","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnrecognisedJavadocTag)

<a id="errorprone-unsafefinalization"></a>

### `errorprone/UnsafeFinalization`

Finalizer may run before native code finishes execution.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnsafeFinalization).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnsafeFinalization","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnsafeFinalization)

<a id="errorprone-unsafelocaleusage"></a>

### `errorprone/UnsafeLocaleUsage`

Possible unsafe operation related to the java.util.Locale class.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnsafeLocaleUsage).
- **Fix:** With `nitpicker --fix --rule errorprone/UnsafeLocaleUsage`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnsafeLocaleUsage","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnsafeLocaleUsage)

<a id="errorprone-unsafereflectiveconstructioncast"></a>

### `errorprone/UnsafeReflectiveConstructionCast`

Prefer `asSubclass` instead of casting the result of `newInstance`, to detect classes of incorrect type before invoking their constructors. This way, if the class is of the incorrect type, it will throw an exception before invoking its constructor.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnsafeReflectiveConstructionCast).
- **Fix:** With `nitpicker --fix --rule errorprone/UnsafeReflectiveConstructionCast`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnsafeReflectiveConstructionCast","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnsafeReflectiveConstructionCast)

<a id="errorprone-unsafewildcard"></a>

### `errorprone/UnsafeWildcard`

Certain wildcard types can confuse the compiler.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnsafeWildcard).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnsafeWildcard","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnsafeWildcard)

<a id="errorprone-unsynchronizedoverridessynchronized"></a>

### `errorprone/UnsynchronizedOverridesSynchronized`

Unsynchronized method overrides a synchronized method.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnsynchronizedOverridesSynchronized).
- **Fix:** With `nitpicker --fix --rule errorprone/UnsynchronizedOverridesSynchronized`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnsynchronizedOverridesSynchronized","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnsynchronizedOverridesSynchronized)

<a id="errorprone-unusedanonymousclass"></a>

### `errorprone/UnusedAnonymousClass`

Instance created but never used.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnusedAnonymousClass).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnusedAnonymousClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnusedAnonymousClass)

<a id="errorprone-unusedcollectionmodifiedinplace"></a>

### `errorprone/UnusedCollectionModifiedInPlace`

Collection is modified in place, but the result is not used.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnusedCollectionModifiedInPlace).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnusedCollectionModifiedInPlace","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnusedCollectionModifiedInPlace)

<a id="errorprone-unusedexception"></a>

### `errorprone/UnusedException`

This catch block catches an exception and re-throws another, but swallows the caught exception rather than setting it as a cause. This can make debugging harder.

- **Labels:** reliability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnusedException).
- **Fix:** With `nitpicker --fix --rule errorprone/UnusedException`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnusedException","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnusedException)

<a id="errorprone-unusedlabel"></a>

### `errorprone/UnusedLabel`

This label is unused.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnusedLabel).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnusedLabel","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnusedLabel)

<a id="errorprone-unusedmethod"></a>

### `errorprone/UnusedMethod`

Unused.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnusedMethod).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnusedMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnusedMethod)

<a id="errorprone-unusednestedclass"></a>

### `errorprone/UnusedNestedClass`

This nested class is unused, and can be removed.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnusedNestedClass).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnusedNestedClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnusedNestedClass)

<a id="errorprone-unusedtypeparameter"></a>

### `errorprone/UnusedTypeParameter`

This type parameter is unused and can be removed.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UnusedTypeParameter).
- **Fix:** With `nitpicker --fix --rule errorprone/UnusedTypeParameter`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/UnusedTypeParameter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UnusedTypeParameter)

<a id="errorprone-urlequalshashcode"></a>

### `errorprone/URLEqualsHashCode`

Avoid hash-based containers of java.net.URL--the containers rely on equals() and hashCode(), which cause java.net.URL to make blocking internet connections.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/URLEqualsHashCode).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/URLEqualsHashCode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/URLEqualsHashCode)

<a id="errorprone-urlinsee"></a>

### `errorprone/UrlInSee`

URLs should not be used in @see tags; they are designed for Java elements which could be used with @link.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UrlInSee).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/UrlInSee","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UrlInSee)

<a id="errorprone-usebinds"></a>

### `errorprone/UseBinds`

@Binds is a more efficient and declarative mechanism for delegating a binding.

- **Labels:** maintainability
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UseBinds).
- **Fix:** With `nitpicker --fix --rule errorprone/UseBinds`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/UseBinds","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UseBinds)

<a id="errorprone-usecorrectassertintests"></a>

### `errorprone/UseCorrectAssertInTests`

Java assert is used in testing code. For testing purposes, prefer using Truth-based assertions.

- **Labels:** tests
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/UseCorrectAssertInTests).
- **Fix:** With `nitpicker --fix --rule errorprone/UseCorrectAssertInTests`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/UseCorrectAssertInTests","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/UseCorrectAssertInTests)

<a id="errorprone-variablenamesameastype"></a>

### `errorprone/VariableNameSameAsType`

VariableName and type with the same name would refer to the static field instead of the class.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/VariableNameSameAsType).
- **Fix:** With `nitpicker --fix --rule errorprone/VariableNameSameAsType`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/VariableNameSameAsType","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/VariableNameSameAsType)

<a id="errorprone-vartypename"></a>

### `errorprone/VarTypeName`

`var` should not be used as a type name.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/VarTypeName).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/VarTypeName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/VarTypeName)

<a id="errorprone-voidused"></a>

### `errorprone/VoidUsed`

Using a Void-typed variable is potentially confusing, and can be replaced with a literal `null`.

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/VoidUsed).
- **Fix:** With `nitpicker --fix --rule errorprone/VoidUsed`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/VoidUsed","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/VoidUsed)

<a id="errorprone-waitnotinloop"></a>

### `errorprone/WaitNotInLoop`

Because of spurious wakeups, Object.wait() and Condition.await() must always be called in a loop.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/WaitNotInLoop).
- **Fix:** With `nitpicker --fix --rule errorprone/WaitNotInLoop`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/WaitNotInLoop","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/WaitNotInLoop)

<a id="errorprone-wakelockreleaseddangerously"></a>

### `errorprone/WakelockReleasedDangerously`

On Android versions \< P, a wakelock acquired with a timeout may be released by the system before calling `release`, even after checking `isHeld()`. If so, it will throw a RuntimeException. Please wrap in a try/catch block.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/WakelockReleasedDangerously).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/WakelockReleasedDangerously","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/WakelockReleasedDangerously)

<a id="errorprone-wildcardimport"></a>

### `errorprone/WildcardImport`

Wildcard imports, static or otherwise, should not be used.

- **Labels:** style
- **Why it is on:** Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it. Error Prone has it off by default; nitpicker turns it on.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html?cl=head#s3.3.1-wildcard-imports).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/WildcardImport","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://google.github.io/styleguide/javaguide.html?cl=head#s3.3.1-wildcard-imports)

<a id="errorprone-wrongoneof"></a>

### `errorprone/WrongOneof`

This field is guaranteed not to be set given it's within a switch over a one_of.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/WrongOneof).
- **Fix:** None: fix it by hand.
- **Exception:** If this is intended, add `{"rule":"errorprone/WrongOneof","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/WrongOneof)

<a id="errorprone-xorpower"></a>

### `errorprone/XorPower`

The `^` operator is binary XOR, not a power operator.

- **Labels:** bug
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/XorPower).
- **Fix:** With `nitpicker --fix --rule errorprone/XorPower`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"errorprone/XorPower","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/XorPower)

<a id="errorprone-zoneidofz"></a>

### `errorprone/ZoneIdOfZ`

Use ZoneOffset.UTC instead of ZoneId.of("Z").

- **Labels:** simplification
- **Why it is on:** Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.
- **Allowed form:** See the tool's documentation: [Error Prone bug pattern](https://errorprone.info/bugpattern/ZoneIdOfZ).
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/ZoneIdOfZ","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Error Prone bug pattern](https://errorprone.info/bugpattern/ZoneIdOfZ)
