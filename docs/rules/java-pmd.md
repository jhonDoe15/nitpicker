# Java and Kotlin: PMD rules

PMD's bestpractices, design, errorprone, multithreading, performance and security categories, as far as nitpicker's rulesets keep them, and the rules nitpicker adds to them, for Java sources in the Java and Kotlin presets. This page lists 249 rules. [All pages](README.md).

The guide for these rules: [docs/java-preset.md](../java-preset.md).

The descriptions of PMD's own rules are from PMD 7.7.0, under its BSD-style licence.

In the Java preset, an entry of `exceptions` names a finding as it prints, `<tool>/<rule>` with one of the tools `pmd`, `spotbugs`, `errorprone`, `archunit`, `google-java-format`, `palantir-java-format`, `jacoco`, `checkstyle`, `crap`, `duplicates`, `pit`, `structure`, `coupling`, `spring` and `test-runtime`, or one of these rules: `function-lines-limit`, `function-statements-limit`, `function-control-nesting-limit`, `function-parameters-limit`, `crap-score-limit`, `crap-coverage-unknown`, `changed-branch-coverage`, `mutant-survived`, `mutant-nocoverage`, `duplicate-clone`, `stability-direction`, `file-lines-limit`, `line-length-limit`, `folder-files-limit`, `slow-test`, `committed-env-file`, `committed-private-key`, `committed-binary`, `large-file`, `committed-build-output`, `co-change`, `duplicate-definition`, `exported-name-collision`, `sibling-copy-edit`, `test-only-export`, `doc-comment-content`, `test-console-output`, `folder-depth-limit`, `class-methods-limit`, `class-fields-limit` and `inheritance-depth-limit`. The Kotlin preset takes the same `<tool>/<rule>` form for the Java sources of a mixed module.

Unless an entry says otherwise:

- **Presets:** Java and Kotlin
- **Analyzers:** `java` (Java); `kotlin` (Kotlin)
- **Builds:** Gradle and Maven (Java); Gradle (Kotlin)

<a id="pmd-abstractclasswithoutabstractmethod"></a>

### `pmd/AbstractClassWithoutAbstractMethod`

The abstract class does not contain any abstract methods.

- **Why it is on:** An abstract class suggests an incomplete implementation, which is to be completed by subclasses implementing the abstract methods. If the class is intended to be used as a base class only (not to be instantiated directly) a protected constructor can be provided to prevent direct instantiation.
- **Allowed form:** Drop abstract if the class is complete, or declare the abstract method; use an interface or sealed interface for a pure contract.
- **Exception:** If this is intended, add `{"rule":"pmd/AbstractClassWithoutAbstractMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#abstractclasswithoutabstractmethod)

<a id="pmd-accessorclassgeneration"></a>

### `pmd/AccessorClassGeneration`

Instantiation by way of private constructors from outside the constructor's class often causes the generation of an accessor.

- **Why it is on:** A factory method, or non-privatization of the constructor can eliminate this situation. The generated class file is actually an interface. It gives the accessing class the ability to invoke a new hidden package scope constructor that takes the interface as a supplementary parameter. This turns a private constructor effectively into one with package scope, and is challenging to discern. Note: This rule is only executed for Java 10 or lower. Since Java 11, [JEP 181: Nest-Based Access Control](https://openjdk.org/jeps/181) has been implemented. This means that in Java 11 and above accessor classes are not generated anymore.
- **Allowed form:** Make the constructor package-private, or have callers use a static factory method declared inside the class.
- **Exception:** If this is intended, add `{"rule":"pmd/AccessorClassGeneration","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#accessorclassgeneration)

<a id="pmd-accessormethodgeneration"></a>

### `pmd/AccessorMethodGeneration`

When accessing private fields / methods from another class, the Java compiler will generate accessor methods with package-private visibility.

- **Why it is on:** This adds overhead, and to the dex method count on Android. This situation can be avoided by changing the visibility of the field / method from private to package-private. Note: This rule is only executed for Java 10 or lower. Since Java 11, [JEP 181: Nest-Based Access Control](https://openjdk.org/jeps/181) has been implemented. This means that in Java 11 and above accessor classes are not generated anymore.
- **Allowed form:** Make the member package-private, or move the access into the owning class and call a method there.
- **Exception:** If this is intended, add `{"rule":"pmd/AccessorMethodGeneration","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#accessormethodgeneration)

<a id="pmd-addemptystring"></a>

### `pmd/AddEmptyString`

The conversion of literals to strings by concatenating them with empty strings is inefficient.

- **Why it is on:** It is much better to use one of the type-specific `toString()` methods instead or `String.valueOf()`.
- **Allowed form:** Delete the "" when another operand is already a String (i + "x"); when the value is the only other operand, write String.valueOf(value).
- **Exception:** If this is intended, add `{"rule":"pmd/AddEmptyString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_performance.html#addemptystring)

<a id="pmd-appendcharacterwithchar"></a>

### `pmd/AppendCharacterWithChar`

Avoid concatenating characters as strings in StringBuffer/StringBuilder.append methods.

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Append a single character as a char literal: append('x').
- **Exception:** If this is intended, add `{"rule":"pmd/AppendCharacterWithChar","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_performance.html#appendcharacterwithchar)

<a id="pmd-arrayisstoreddirectly"></a>

### `pmd/ArrayIsStoredDirectly`

Constructors and methods receiving arrays should clone objects and store the copy.

- **Why it is on:** This prevents future changes from the user from affecting the original array.
- **Allowed form:** Store a copy: this.items = items.clone(), or take a List and keep List.copyOf(items).
- **Exception:** If this is intended, add `{"rule":"pmd/ArrayIsStoredDirectly","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#arrayisstoreddirectly)

<a id="pmd-assignmentinoperand"></a>

### `pmd/AssignmentInOperand`

Avoid assignments in operands; this can make code more complicated and harder to read.

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Assign in its own statement before the condition; read lines with reader.lines() or for (String line = r.readLine(); line != null; line = r.readLine()).
- **Exception:** If this is intended, add `{"rule":"pmd/AssignmentInOperand","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#assignmentinoperand)

<a id="pmd-assignmenttononfinalstatic"></a>

### `pmd/AssignmentToNonFinalStatic`

Identifies a possible unsafe usage of a static field.

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Make it an instance field, or a static final field set once at its declaration; a constructor must never write a static field.
- **Exception:** If this is intended, add `{"rule":"pmd/AssignmentToNonFinalStatic","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#assignmenttononfinalstatic)

<a id="pmd-avoidaccessibilityalteration"></a>

### `pmd/AvoidAccessibilityAlteration`

Methods such as `getDeclaredConstructors()`, `getDeclaredMethods()`, and `getDeclaredFields()` also return private constructors, methods and fields.

- **Why it is on:** These can be made accessible by calling `setAccessible(true)`. This gives access to normally protected data which violates the principle of encapsulation. This rule detects calls to `setAccessible` and finds possible accessibility alterations. If the call to `setAccessible` is wrapped within a `PrivilegedAction`, then the access alteration is assumed to be deliberate and is not reported. Note that with Java 17 the Security Manager, which is used for `PrivilegedAction` execution, is deprecated: [JEP 411: Deprecate the Security Manager for Removal](https://openjdk.org/jeps/411). For future-proof code, deliberate access alteration should be suppressed using the usual suppression methods (e.g. by using `@SuppressWarnings` annotation).
- **Allowed form:** Call the public API or add a package-private accessor; do not use setAccessible or reflection to reach private members.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidAccessibilityAlteration","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#avoidaccessibilityalteration)

<a id="pmd-avoidarrayloops"></a>

### `pmd/AvoidArrayLoops`

Instead of manually copying data between two arrays, use the more efficient `Arrays.copyOf` or `System.arraycopy` method instead.

- **Why it is on:** To copy only part of the array, use `Arrays.copyOfRange` or `System.arraycopy`. If you want to copy/move elements inside the same array (e.g. shift the elements), use `System.arraycopy`.
- **Allowed form:** Copy with System.arraycopy(source, sourceStart, target, targetStart, length) instead of an element-by-element loop.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidArrayLoops","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_performance.html#avoidarrayloops)

<a id="pmd-avoidassertasidentifier"></a>

### `pmd/AvoidAssertAsIdentifier`

Use of the term `assert` will conflict with newer versions of Java since it is a reserved word.

- **Why it is on:** Since Java 1.4, the token `assert` became a reserved word and using it as an identifier will result in a compilation failure for Java 1.4 and later. This rule is therefore only useful for old Java code before Java 1.4. It can be used to identify problematic code prior to a Java update.
- **Allowed form:** Rename the variable, method or class that is called assert, since assert is a keyword in Java 1.4 and later.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidAssertAsIdentifier","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#avoidassertasidentifier)

<a id="pmd-avoidbranchingstatementaslastinloop"></a>

### `pmd/AvoidBranchingStatementAsLastInLoop`

Using a branching statement as the last part of a loop may be a bug, and/or is confusing.

- **Why it is on:** Ensure that the usage is not a bug, or consider using another approach.
- **Allowed form:** Delete the trailing break, continue or return that makes the loop run once, or replace the loop with an if or a stream findFirst.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidBranchingStatementAsLastInLoop","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#avoidbranchingstatementaslastinloop)

<a id="pmd-avoidcalendardatecreation"></a>

### `pmd/AvoidCalendarDateCreation`

Problem: `java.util.Calendar` is a heavyweight object and expensive to create.

- **Why it is on:** It should only be used, if calendar calculations are needed. Solution: Use `new Date()`, Java 8+ `java.time.LocalDateTime.now()` or `ZonedDateTime.now()`.
- **Allowed form:** Read the current time from an injected java.time.Clock: Instant.now(clock).
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidCalendarDateCreation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_performance.html#avoidcalendardatecreation)

<a id="pmd-avoidcallingfinalize"></a>

### `pmd/AvoidCallingFinalize`

The method Object.finalize() is called by the garbage collector on an object when garbage collection determines that there are no more references to the object.

- **Why it is on:** It should not be invoked by application logic. Note that Oracle has declared Object.finalize() as deprecated since JDK 9.
- **Allowed form:** Delete the finalize() call; release resources with try-with-resources on an AutoCloseable or call close() explicitly.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidCallingFinalize","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#avoidcallingfinalize)

<a id="pmd-avoidcatchinggenericexception"></a>

### `pmd/AvoidCatchingGenericException`

Avoid catching generic exceptions such as NullPointerException, RuntimeException, Exception in try-catch block.

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Catch the specific exception types the call throws, e.g. NumberFormatException, and keep the try around that one call; in a test, use assertThrows.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidCatchingGenericException","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_design.html#avoidcatchinggenericexception)

<a id="pmd-avoidcatchingnpe"></a>

### `pmd/AvoidCatchingNPE`

Code should never throw NullPointerExceptions under normal circumstances.

- **Why it is on:** A catch block may hide the original error, causing other, more subtle problems later on.
- **Allowed form:** Remove the catch; check for null with Objects.requireNonNull or an if, or fix the code that produces the null.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidCatchingNPE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#avoidcatchingnpe)

<a id="pmd-avoidcatchingthrowable"></a>

### `pmd/AvoidCatchingThrowable`

Catching Throwable errors is not recommended since its scope is very broad.

- **Why it is on:** It includes runtime issues such as OutOfMemoryError that should be exposed and managed separately.
- **Allowed form:** Catch the specific exception types the call can throw; let Error and other Throwables propagate.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidCatchingThrowable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#avoidcatchingthrowable)

<a id="pmd-avoiddecimalliteralsinbigdecimalconstructor"></a>

### `pmd/AvoidDecimalLiteralsInBigDecimalConstructor`

One might assume that the result of "new BigDecimal(0.1)" is exactly equal to 0.1, but it is actually equal to .1000000000000000055511151231257827021181583404541015625.

- **Why it is on:** This is because 0.1 cannot be represented exactly as a double (or as a binary fraction of any finite length). Thus, the long value that is being passed in to the constructor is not exactly equal to 0.1, appearances notwithstanding. The (String) constructor, on the other hand, is perfectly predictable: 'new BigDecimal("0.1")' is exactly equal to 0.1, as one would expect. Therefore, it is generally recommended that the (String) constructor be used in preference to this one.
- **Allowed form:** Pass the value as a String, new BigDecimal("0.1"), so it is exact.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidDecimalLiteralsInBigDecimalConstructor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#avoiddecimalliteralsinbigdecimalconstructor)

<a id="pmd-avoidduplicateliterals"></a>

### `pmd/AvoidDuplicateLiterals`

Code containing duplicate String literals can usually be improved by declaring the String as a constant field.

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Extract the repeated string literal into a private static final constant and use the constant everywhere.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidDuplicateLiterals","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#avoidduplicateliterals)

<a id="pmd-avoidenumasidentifier"></a>

### `pmd/AvoidEnumAsIdentifier`

Use of the term `enum` will conflict with newer versions of Java since it is a reserved word.

- **Why it is on:** Since Java 1.5, the token `enum` became a reserved word and using it as an identifier will result in a compilation failure for Java 1.5 and later. This rule is therefore only useful for old Java code before Java 1.5. It can be used to identify problematic code prior to a Java update.
- **Allowed form:** Rename the identifier called enum, since enum is a keyword since Java 5.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidEnumAsIdentifier","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#avoidenumasidentifier)

<a id="pmd-avoidfieldnamematchingmethodname"></a>

### `pmd/AvoidFieldNameMatchingMethodName`

It can be confusing to have a field name with the same name as a method.

- **Why it is on:** While this is permitted, having information (field) and actions (method) is not clear naming. Developers versed in Smalltalk often prefer this approach as the methods denote accessor methods.
- **Allowed form:** Give the field and the method different names, or make the type a record so the accessor and the component are one thing.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidFieldNameMatchingMethodName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#avoidfieldnamematchingmethodname)

<a id="pmd-avoidfieldnamematchingtypename"></a>

### `pmd/AvoidFieldNameMatchingTypeName`

It is somewhat confusing to have a field name matching the declaring type name.

- **Why it is on:** This probably means that type and/or field names should be chosen more carefully.
- **Allowed form:** Rename the field so it differs from the enclosing class name; name it for its role, not its type.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidFieldNameMatchingTypeName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#avoidfieldnamematchingtypename)

<a id="pmd-avoidfilestream"></a>

### `pmd/AvoidFileStream`

The FileInputStream and FileOutputStream classes contains a finalizer method which will cause garbage collection pauses.

- **Why it is on:** See [JDK-8080225](https://bugs.openjdk.org/browse/JDK-8080225) for details. The FileReader and FileWriter constructors instantiate FileInputStream and FileOutputStream, again causing garbage collection issues while finalizer methods are called. \* Use `Files.newInputStream(Paths.get(fileName))` instead of `new FileInputStream(fileName)`. \* Use `Files.newOutputStream(Paths.get(fileName))` instead of `new FileOutputStream(fileName)`. \* Use `Files.newBufferedReader(Paths.get(fileName))` instead of `new FileReader(fileName)`. \* Use `Files.newBufferedWriter(Paths.get(fileName))` instead of `new FileWriter(fileName)`. Please note, that the `java.nio` API does not throw a `FileNotFoundException` anymore, instead it throws a `NoSuchFileException`. If your code dealt explicitly with a `FileNotFoundException`, then this needs to be adjusted. Both exceptions are subclasses of `IOException`, so catching that one covers both.
- **Allowed form:** Replace it with its Files form: Files.newInputStream, newOutputStream, newBufferedReader or newBufferedWriter for the matching java.io class.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidFileStream","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_performance.html#avoidfilestream)

<a id="pmd-avoidinstanceofchecksincatchclause"></a>

### `pmd/AvoidInstanceofChecksInCatchClause`

Each caught exception type should be handled in its own catch clause.

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Write one catch clause per exception type, or a multi-catch (catch (A | B e)), instead of testing e with instanceof.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidInstanceofChecksInCatchClause","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#avoidinstanceofchecksincatchclause)

<a id="pmd-avoidliteralsinifcondition"></a>

### `pmd/AvoidLiteralsInIfCondition`

Avoid using hard-coded literals in conditional statements.

- **Why it is on:** By declaring them as static variables or private members with descriptive names maintainability is enhanced. By default, the literals "-1" and "0" are ignored. More exceptions can be defined with the property "ignoreMagicNumbers". The rule doesn't consider deeper expressions by default, but this can be enabled via the property `ignoreExpressions`. With this property set to false, if-conditions like `i == 1 + 5` are reported as well. Note that in that case, the property ignoreMagicNumbers is not taken into account, if there are multiple literals involved in such an expression.
- **Allowed form:** Compare against a named private static final constant instead of the literal; 0 and -1 are fine.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidLiteralsInIfCondition","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#avoidliteralsinifcondition)

<a id="pmd-avoidlosingexceptioninformation"></a>

### `pmd/AvoidLosingExceptionInformation`

Statements in a catch block that invoke accessors on the exception without using the information only add to code size.

- **Why it is on:** Either remove the invocation, or use the return result.
- **Allowed form:** Delete the call whose result is thrown away, such as a bare e.getMessage();, or use its value; to keep the error, pass e on as the cause.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidLosingExceptionInformation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#avoidlosingexceptioninformation)

<a id="pmd-avoidmessagedigestfield"></a>

### `pmd/AvoidMessageDigestField`

Declaring a MessageDigest instance as a field make this instance directly available to multiple threads.

- **Why it is on:** Such sharing of MessageDigest instances should be avoided if possible since it leads to wrong results if the access is not synchronized correctly. Just create a new instance and use it locally, where you need it. Creating a new instance is easier than synchronizing access to a shared instance.
- **Allowed form:** Call MessageDigest.getInstance("SHA-256") inside the method that hashes, since MessageDigest is not thread-safe.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidMessageDigestField","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#avoidmessagedigestfield)

<a id="pmd-avoidmultipleunaryoperators"></a>

### `pmd/AvoidMultipleUnaryOperators`

The use of multiple unary operators may be problematic, and/or confusing.

- **Why it is on:** Ensure that the intended usage is not a bug, or consider simplifying the expression.
- **Allowed form:** Delete the repeated unary operators (!!x, - -x, ~~x) or write the intended single operator.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidMultipleUnaryOperators","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#avoidmultipleunaryoperators)

<a id="pmd-avoidprintstacktrace"></a>

### `pmd/AvoidPrintStackTrace`

Avoid printStackTrace(); use a logger call instead.

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Log with the logger and pass the exception as the last argument: logger.log(Level.ERROR, "message", e).
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidPrintStackTrace","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#avoidprintstacktrace)

<a id="pmd-avoidreassigningcatchvariables"></a>

### `pmd/AvoidReassigningCatchVariables`

Reassigning exception variables caught in a catch statement should be avoided because of:.

- **Why it is on:** 1) If it is needed, multi catch can be easily added and code will still compile. 2) Following the principle of least surprise we want to make sure that a variable caught in a catch statement is always the one thrown in a try block.
- **Allowed form:** Copy the caught exception into a new local variable and change that instead of the catch parameter.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidReassigningCatchVariables","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#avoidreassigningcatchvariables)

<a id="pmd-avoidreassigningloopvariables"></a>

### `pmd/AvoidReassigningLoopVariables`

Reassigning loop variables can lead to hard-to-find bugs.

- **Why it is on:** Prevent or limit how these variables can be changed. In foreach-loops, configured by the `foreachReassign` property: - `deny`: Report any reassignment of the loop variable in the loop body. This is the default. - `allow`: Don't check the loop variable. - `firstOnly`: Report any reassignments of the loop variable, except as the first statement in the loop body. This is useful if some kind of normalization or clean-up of the value before using is permitted, but any other change of the variable is not. In for-loops, configured by the `forReassign` property: - `deny`: Report any reassignment of the control variable in the loop body. This is the default. - `allow`: Don't check the control variable. - `skip`: Report any reassignments of the control variable, except conditional increments/decrements (`++`, `--`, `+=`, `-=`). This prevents accidental reassignments or unconditional increments of the control variable.
- **Allowed form:** Leave the loop variable alone: compute into a separate local, or use a while loop with its own counter when you must skip elements.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidReassigningLoopVariables","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#avoidreassigningloopvariables)

<a id="pmd-avoidreassigningparameters"></a>

### `pmd/AvoidReassigningParameters`

Reassigning values to incoming parameters of a method or constructor is not recommended, as this can make the code more difficult to understand.

- **Why it is on:** The code is often read with the assumption that parameter values don't change and an assignment violates therefore the principle of least astonishment. This is especially a problem if the parameter is documented e.g. in the method's javadoc and the new content differs from the original documented content. Use temporary local variables instead. This allows you to assign a new name, which makes the code better understandable. Note that this rule considers both methods and constructors. If there are multiple assignments for a formal parameter, then only the first assignment is reported.
- **Allowed form:** Copy the parameter into a new local variable and change the local.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidReassigningParameters","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#avoidreassigningparameters)

<a id="pmd-avoidstringbufferfield"></a>

### `pmd/AvoidStringBufferField`

StringBuffers/StringBuilders can grow considerably, and so may become a source of memory leaks if held within objects with long lifetimes.

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Keep the StringBuilder as a local in the method that builds the text and return the String.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidStringBufferField","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#avoidstringbufferfield)

<a id="pmd-avoidsynchronizedatmethodlevel"></a>

### `pmd/AvoidSynchronizedAtMethodLevel`

Method-level synchronization will pin virtual threads and can cause performance problems.

- **Why it is on:** Additionally, it can cause problems when new code is added to the method. Block-level ReentrantLock helps to ensure that only the code that needs mutual exclusion will be locked.
- **Allowed form:** Guard the state with a private final ReentrantLock: lock.lock() right before try, lock.unlock() in finally.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidSynchronizedAtMethodLevel","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_multithreading.html#avoidsynchronizedatmethodlevel)

<a id="pmd-avoidsynchronizedstatement"></a>

### `pmd/AvoidSynchronizedStatement`

Synchronization will pin virtual threads and can cause performance problems.

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Guard the state with a private final ReentrantLock: lock.lock() right before try, lock.unlock() in finally.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidSynchronizedStatement","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_multithreading.html#avoidsynchronizedstatement)

<a id="pmd-avoidthreadgroup"></a>

### `pmd/AvoidThreadGroup`

Avoid using java.lang.ThreadGroup; although it is intended to be used in a threaded environment it contains methods that are not thread-safe.

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Run and stop the threads through an ExecutorService instead of a ThreadGroup.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidThreadGroup","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_multithreading.html#avoidthreadgroup)

<a id="pmd-avoidusinghardcodedip"></a>

### `pmd/AvoidUsingHardCodedIP`

Application with hard-coded IP addresses can become impossible to deploy in some cases.

- **Why it is on:** Externalizing IP adresses is preferable.
- **Allowed form:** Read the address from configuration or take it as a parameter; for loopback use InetAddress.getLoopbackAddress() or the host name localhost.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidUsingHardCodedIP","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#avoidusinghardcodedip)

<a id="pmd-avoidusingoctalvalues"></a>

### `pmd/AvoidUsingOctalValues`

Integer literals should not start with zero since this denotes that the rest of literal will be interpreted as an octal value.

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Drop the leading zero for a decimal value, or write hex (0x1F), so the number is not read as octal.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidUsingOctalValues","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#avoidusingoctalvalues)

<a id="pmd-bigintegerinstantiation"></a>

### `pmd/BigIntegerInstantiation`

Don't create instances of already existing BigInteger (`BigInteger.ZERO`, `BigInteger.ONE`), for Java 1.5 onwards, BigInteger.TEN and BigDecimal (`BigDecimal.ZERO`, `BigDecimal.ONE`, `BigDecimal.TEN`) and for Java 9 onwards `BigInteger.TWO`.

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Use the constant (BigInteger.ZERO, ONE, TWO, TEN or BigDecimal.ZERO, ONE, TEN) instead of creating the value.
- **Exception:** If this is intended, add `{"rule":"pmd/BigIntegerInstantiation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_performance.html#bigintegerinstantiation)

<a id="pmd-brokennullcheck"></a>

### `pmd/BrokenNullCheck`

The null check is broken since it will throw a NullPointerException itself.

- **Why it is on:** It is likely that you used || instead of && or vice versa.
- **Allowed form:** Fix the condition: use && for a != null guard and || for a == null guard, so the null case is checked before the dereference.
- **Exception:** If this is intended, add `{"rule":"pmd/BrokenNullCheck","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#brokennullcheck)

<a id="pmd-callsuperfirst"></a>

### `pmd/CallSuperFirst`

Super should be called at the start of the method.

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Call super.onCreate(...) (or the matching super method) as the first statement of the override.
- **Exception:** If this is intended, add `{"rule":"pmd/CallSuperFirst","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#callsuperfirst)

<a id="pmd-callsuperlast"></a>

### `pmd/CallSuperLast`

Super should be called at the end of the method.

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Call super.onDestroy(...) (or the matching super method) as the last statement of the override.
- **Exception:** If this is intended, add `{"rule":"pmd/CallSuperLast","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#callsuperlast)

<a id="pmd-checkresultset"></a>

### `pmd/CheckResultSet`

Always check the return values of navigation methods (next, previous, first, last) of a ResultSet.

- **Why it is on:** If the value return is 'false', it should be handled properly.
- **Allowed form:** Use the boolean result: while (rs.next()) { ... } or if (rs.next()) { ... }, and read columns inside.
- **Exception:** If this is intended, add `{"rule":"pmd/CheckResultSet","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#checkresultset)

<a id="pmd-checkskipresult"></a>

### `pmd/CheckSkipResult`

The skip() method may skip a smaller number of bytes than requested.

- **Why it is on:** Check the returned value to find out if it was the case or not.
- **Allowed form:** Call in.skipNBytes(n), which skips exactly n bytes or throws, instead of skip(n).
- **Exception:** If this is intended, add `{"rule":"pmd/CheckSkipResult","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#checkskipresult)

<a id="pmd-classcastexceptionwithtoarray"></a>

### `pmd/ClassCastExceptionWithToArray`

When deriving an array of a specific class from your Collection, one should provide an array of the same class as the parameter of the `toArray()` method.

- **Why it is on:** Doing otherwise will result in a `ClassCastException`.
- **Allowed form:** Pass a correctly typed array to toArray (list.toArray(new String[0])) or use list.toArray(String[]::new).
- **Exception:** If this is intended, add `{"rule":"pmd/ClassCastExceptionWithToArray","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#classcastexceptionwithtoarray)

<a id="pmd-classloadeffect"></a>

### `pmd/ClassLoadEffect`

In main sources: a call with an external effect that runs while the class loads: in a `static` block or `static` field initializer (interface constants too), an enum constant's arguments or body fields, an anonymous class created in one of those (double-brace initialization), the field, instance initializer or constructor of an instance the class creates in its own `static` code (`static final Db INSTANCE = new Db()`, `new Box<>()`, a `static` factory such as `INSTANCE = create()`, a constructor that `this(...)` reaches from the one created), or a method of the same class that one of those calls without a receiver, on `this` or through the class name. Effects, by resolved type: JDBC (`DriverManager.getConnection`, `DataSource.getConnection`, `Persistence.createEntityManagerFactory`), pools and clients that connect when built (`new HikariDataSource(config)`, `MongoClients.create`, Lettuce `RedisClient.connect`, `new KafkaProducer`), network calls (`HttpClient.send`, `URL.openConnection`/`openStream`, `new Socket(host, port)`, `new ServerSocket(port)`, `DatagramSocket`, `InetAddress.getByName`/`getLocalHost`, OkHttp and Retrofit `Call.execute`, Apache `HttpClient.execute`, `RestTemplate` requests, `RestClient` `retrieve()`, a `WebClient` result that is `block()`ed or subscribed), file I/O (every `Files` method, statically imported ones too, `FileInputStream`, `FileOutputStream`, `FileReader`, `FileWriter`, `RandomAccessFile`, `ZipFile`, a `PrintWriter`, `PrintStream` or `Formatter` on a file name, a `Scanner` on a `File` or `Path`, `File` methods that touch the disk), processes, threads and waits (`ProcessBuilder.start`/`startPipeline`, `Runtime.exec`, `Thread.start`, `Thread.Builder.start`, `Thread.sleep`, `Executors.new*`, `new ThreadPoolExecutor`, `new ForkJoinPool`, `new Timer`, executor, pool and timer `submit`/`execute`/`invoke*`/`schedule*` (`ForkJoinPool.commonPool().submit(...)` too), `CompletableFuture.runAsync`/`supplyAsync`) and JVM-wide settings (`System.setProperty`, `setOut`, `setErr`, `Runtime.addShutdownHook`, `Locale.setDefault`, `TimeZone.setDefault`, `Thread.setDefaultUncaughtExceptionHandler`). The message names the call, the class that loads and the member that runs it.

- **Scope:** Main sources only.
- **Why it is on:** A PMD rule nitpicker defines: it names one allowed form where the language offers several, and reports the other forms.
- **Allowed form:** Do this work in a method that main or the framework calls after startup (a @Bean method, an ApplicationRunner) and pass the result in, or create it on first use in a lazy holder class: this call runs while its class loads (in a static field or block, an enum constant, the constructor or initializer of an instance created at load, or a method one of them calls), so it connects, starts threads, sleeps or touches files in whatever order classes load, and in every test that touches the class. Constants, loggers, Pattern.compile and collections can stay static, and the class with main is not checked.
- **Exception:** If this is intended, add `{"rule":"pmd/ClassLoadEffect","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-clonemethodmustbepublic"></a>

### `pmd/CloneMethodMustBePublic`

The java manual says "By convention, classes that implement this interface should override Object.clone (which is protected) with a public method.".

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Declare clone() public when you override it.
- **Exception:** If this is intended, add `{"rule":"pmd/CloneMethodMustBePublic","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#clonemethodmustbepublic)

<a id="pmd-clonemethodmustimplementcloneable"></a>

### `pmd/CloneMethodMustImplementCloneable`

The method clone() should only be implemented if the class implements the Cloneable interface with the exception of a final method that only throws CloneNotSupportedException.

- **Why it is on:** The rule can also detect, if the class implements or extends a Cloneable class.
- **Allowed form:** Make the class implement Cloneable, or drop clone() and offer a copy constructor or static copy factory.
- **Exception:** If this is intended, add `{"rule":"pmd/CloneMethodMustImplementCloneable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#clonemethodmustimplementcloneable)

<a id="pmd-clonemethodreturntypemustmatchclassname"></a>

### `pmd/CloneMethodReturnTypeMustMatchClassName`

If a class implements `Cloneable` the return type of the method `clone()` must be the class name.

- **Why it is on:** That way, the caller of the clone method doesn't need to cast the returned clone to the correct type. Note: Such a covariant return type is only possible with Java 1.5 or higher.
- **Allowed form:** Declare clone() with the enclosing class as its covariant return type so callers need no cast.
- **Exception:** If this is intended, add `{"rule":"pmd/CloneMethodReturnTypeMustMatchClassName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#clonemethodreturntypemustmatchclassname)

<a id="pmd-closeresource"></a>

### `pmd/CloseResource`

Ensure that resources (like `java.sql.Connection`, `java.sql.Statement`, and `java.sql.ResultSet` objects and any subtype of `java.lang.AutoCloseable`) are always closed after use.

- **Why it is on:** Failing to do so might result in resource leaks. Note: It suffices to configure the super type, e.g. `java.lang.AutoCloseable`, so that this rule automatically triggers on any subtype (e.g. `java.io.FileInputStream`). Additionally specifying `java.sql.Connection` helps in detecting the types, if the type resolution / auxclasspath is not correctly setup. Note: Since PMD 6.16.0 the default value for the property `types` contains `java.lang.AutoCloseable` and detects now cases where the standard `java.io.*Stream` classes are involved. In order to restore the old behaviour, just remove "AutoCloseable" from the types.
- **Allowed form:** Open the resource in a try-with-resources header so it is closed on every path, including exceptions.
- **Exception:** If this is intended, add `{"rule":"pmd/CloseResource","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#closeresource)

<a id="pmd-compareobjectswithequals"></a>

### `pmd/CompareObjectsWithEquals`

Use `equals()` to compare object references; avoid comparing them with `==`.

- **Why it is on:** Since comparing objects with named constants is useful in some cases (eg, when defining constants for sentinel values), the rule ignores comparisons against fields with all-caps name (eg `this == SENTINEL`), which is a common naming convention for constant fields. You may allow some types to be compared by reference by listing the exceptions in the `typesThatCompareByReference` property.
- **Allowed form:** Compare objects with Objects.equals(a, b) or a.equals(b); use == only for primitives, enums and identity checks on purpose.
- **Exception:** If this is intended, add `{"rule":"pmd/CompareObjectsWithEquals","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#compareobjectswithequals)

<a id="pmd-comparisonwithnan"></a>

### `pmd/ComparisonWithNaN`

Reports comparisons with double and float `NaN` (Not-a-Number) values.

- **Why it is on:** These are [specified](https://docs.oracle.com/javase/specs/jls/se8/html/jls-15.html#jls-15.21.1) to have unintuitive behavior: NaN is considered unequal to itself. This means a check like `someDouble == Double.NaN` will always return false, even if `someDouble` is really the NaN value. To test whether a value is the NaN value, one should instead use `Double.isNaN(someDouble)` (or `Float.isNaN`). The `!=` operator should be treated similarly. Finally, comparisons like `someDouble <= Double.NaN` are nonsensical and will always evaluate to false. This rule has been renamed from "BadComparison" in PMD 6.36.0.
- **Allowed form:** Test with Double.isNaN(x) or Float.isNaN(x); a comparison with NaN is always false.
- **Exception:** If this is intended, add `{"rule":"pmd/ComparisonWithNaN","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#comparisonwithnan)

<a id="pmd-compatibilityshim"></a>

### `pmd/CompatibilityShim`

In main sources: a `@Deprecated` annotation on a class, method, field or constructor. Methods with `@Override` are skipped, since overriding a deprecated method needs the annotation.

- **Scope:** Main sources only.
- **Why it is on:** A PMD rule nitpicker defines: it names one allowed form where the language offers several, and reports the other forms.
- **Allowed form:** A @Deprecated declaration keeps the old API next to its replacement. Delete it and change its callers to the replacement in the same change.
- **Exception:** If this is intended, add `{"rule":"pmd/CompatibilityShim","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-confusingargumenttovarargsmethod"></a>

### `pmd/ConfusingArgumentToVarargsMethod`

Reports a confusing argument passed to a varargs method.

- **Why it is on:** This can occur when an array is passed as a single varargs argument, when the array type is not exactly the type of array that the varargs method expects. If, that array is a subtype of the component type of the expected array type, then it might not be clear what value the called varargs method will receive.
- **Allowed form:** Pass an explicit array of the right type (new Object[] {x}) or cast the null so the intended varargs call is made.
- **Exception:** If this is intended, add `{"rule":"pmd/ConfusingArgumentToVarargsMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#confusingargumenttovarargsmethod)

<a id="pmd-consecutiveappendsshouldreuse"></a>

### `pmd/ConsecutiveAppendsShouldReuse`

Consecutive calls to StringBuffer/StringBuilder .append should be chained, reusing the target object.

- **Why it is on:** This can improve the performance by producing a smaller bytecode, reducing overhead and improving inlining. A complete analysis can be found [here](https://github.com/pmd/pmd/issues/202#issuecomment-274349067)
- **Allowed form:** Chain the appends on the same builder in one statement: sb.append(a).append(b).
- **Exception:** If this is intended, add `{"rule":"pmd/ConsecutiveAppendsShouldReuse","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_performance.html#consecutiveappendsshouldreuse)

<a id="pmd-consecutiveliteralappends"></a>

### `pmd/ConsecutiveLiteralAppends`

Consecutively calling StringBuffer/StringBuilder.append(...) with literals should be avoided.

- **Why it is on:** Since the literals are constants, they can already be combined into a single String literal and this String can be appended in a single method call.
- **Allowed form:** Join the adjacent literals into one append: append("ab").
- **Exception:** If this is intended, add `{"rule":"pmd/ConsecutiveLiteralAppends","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_performance.html#consecutiveliteralappends)

<a id="pmd-constantsininterface"></a>

### `pmd/ConstantsInInterface`

Using constants in interfaces is a bad practice.

- **Why it is on:** Interfaces define types, constants are implementation details better placed in classes or enums. If the constants are best viewed as members of an enumerated type, you should export them with an enum type. For other scenarios, consider using a utility class. See Effective Java's 'Use interfaces only to define types'.
- **Allowed form:** Move the constants into a final class with a private constructor, or into an enum.
- **Exception:** If this is intended, add `{"rule":"pmd/ConstantsInInterface","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#constantsininterface)

<a id="pmd-constructorcallsoverridablemethod"></a>

### `pmd/ConstructorCallsOverridableMethod`

Reports calls to overridable methods on `this` during object initialization.

- **Why it is on:** These are invoked on an incompletely constructed object and can be difficult to debug if overridden. This is because the subclass usually assumes that the superclass is completely initialized in all methods. If that is not the case, bugs can appear in the constructor, for instance, some fields that are still null may cause a NullPointerException or be stored somewhere else to blow up later. To avoid this problem, only use methods that are static, private, or final in constructors. Note that those methods also must not call overridable methods transitively to be safe.
- **Allowed form:** Make the called method private or final, or make the class final, or move the call out of the constructor into a factory.
- **Exception:** If this is intended, add `{"rule":"pmd/ConstructorCallsOverridableMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#constructorcallsoverridablemethod)

<a id="pmd-defaultlabelnotlastinswitch"></a>

### `pmd/DefaultLabelNotLastInSwitch`

By convention, the default label should be the last label in a switch statement or switch expression.

- **Why it is on:** Note: This rule has been renamed from "DefaultLabelNotLastInSwitchStmt" with PMD 7.7.0.
- **Allowed form:** Move the default label to the end of the switch.
- **Exception:** If this is intended, add `{"rule":"pmd/DefaultLabelNotLastInSwitch","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#defaultlabelnotlastinswitch)

<a id="pmd-defaultlabelnotlastinswitchstmt"></a>

### `pmd/DefaultLabelNotLastInSwitchStmt`

By convention, the default label should be the last label in a switch statement or switch expression.

- **Why it is on:** Note: This rule has been renamed from "DefaultLabelNotLastInSwitchStmt" with PMD 7.7.0.
- **Allowed form:** Move the default label to the end of the switch.
- **Exception:** If this is intended, add `{"rule":"pmd/DefaultLabelNotLastInSwitchStmt","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#defaultlabelnotlastinswitch)

<a id="pmd-detachedtestcase"></a>

### `pmd/DetachedTestCase`

The method appears to be a test case since it has public or default visibility, non-static access, no arguments, no return value, has no annotations, but is a member of a class that has one or more JUnit test cases.

- **Why it is on:** If it is a utility method, it should likely have private visibility. If it is an ignored test, it should be annotated with @Test and @Ignore.
- **Allowed form:** Annotate the method with @Test so JUnit runs it, or make it private if it is a helper.
- **Exception:** If this is intended, add `{"rule":"pmd/DetachedTestCase","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#detachedtestcase)

<a id="pmd-donotcallgarbagecollectionexplicitly"></a>

### `pmd/DoNotCallGarbageCollectionExplicitly`

Calls to `System.gc()`, `Runtime.getRuntime().gc()`, and `System.runFinalization()` are not advised.

- **Why it is on:** Code should have the same behavior whether the garbage collection is disabled using the option `-Xdisableexplicitgc` or not. Moreover, "modern" JVMs do a very good job handling garbage collections. If memory usage issues unrelated to memory leaks develop within an application, it should be dealt with JVM options rather than within the code itself.
- **Allowed form:** Delete the System.gc() or Runtime.gc() call; let the JVM manage memory, and fix the leak or tune the heap instead.
- **Exception:** If this is intended, add `{"rule":"pmd/DoNotCallGarbageCollectionExplicitly","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#donotcallgarbagecollectionexplicitly)

<a id="pmd-donotextendjavalangthrowable"></a>

### `pmd/DoNotExtendJavaLangThrowable`

Extend Exception or RuntimeException instead of Throwable.

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Extend Exception for a checked failure or RuntimeException for an unchecked one.
- **Exception:** If this is intended, add `{"rule":"pmd/DoNotExtendJavaLangThrowable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#donotextendjavalangthrowable)

<a id="pmd-donothardcodesdcard"></a>

### `pmd/DoNotHardCodeSDCard`

Use Environment.getExternalStorageDirectory() instead of "/sdcard".

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Get the directory from context.getExternalFilesDir(null) or another Context storage method, never a /sdcard path literal.
- **Exception:** If this is intended, add `{"rule":"pmd/DoNotHardCodeSDCard","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#donothardcodesdcard)

<a id="pmd-donotterminatevm"></a>

### `pmd/DoNotTerminateVM`

Web applications should not call `System.exit()`, since only the web container or the application server should stop the JVM.

- **Why it is on:** Otherwise a web application would terminate all other applications running on the same application server. This rule also checks for the equivalent calls `Runtime.getRuntime().exit()` and `Runtime.getRuntime().halt()`. This rule has been renamed from "DoNotCallSystemExit" in PMD 6.29.0.
- **Allowed form:** Return or throw to the caller and let main decide the exit code; only main may call System.exit.
- **Exception:** If this is intended, add `{"rule":"pmd/DoNotTerminateVM","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#donotterminatevm)

<a id="pmd-donotthrowexceptioninfinally"></a>

### `pmd/DoNotThrowExceptionInFinally`

Throwing exceptions within a 'finally' block is confusing since they may mask other exceptions or code defects.

- **Why it is on:** Note: This is a PMD implementation of the Lint4j rule "A throw in a finally block"
- **Allowed form:** Move the throw out of finally; keep finally for cleanup only, or use try-with-resources so close errors become suppressed exceptions.
- **Exception:** If this is intended, add `{"rule":"pmd/DoNotThrowExceptionInFinally","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#donotthrowexceptioninfinally)

<a id="pmd-dontcallthreadrun"></a>

### `pmd/DontCallThreadRun`

Explicitly calling Thread.run() method will execute in the caller's thread of control.

- **Why it is on:** Instead, call Thread.start() for the intended behavior.
- **Allowed form:** Call start(); run() runs the body on the calling thread.
- **Exception:** If this is intended, add `{"rule":"pmd/DontCallThreadRun","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_multithreading.html#dontcallthreadrun)

<a id="pmd-dontimportsun"></a>

### `pmd/DontImportSun`

Avoid importing anything from the 'sun.\*' packages.

- **Why it is on:** These packages are not portable and are likely to change. If you find yourself having to depend on Sun APIs, confine this dependency to as small a scope as possible, for instance by writing a stable wrapper class around the unstable API. You can then suppress this rule in the implementation of the wrapper.
- **Allowed form:** Use the public java.\* or javax.\* API instead of a sun.\* class, or a supported library for the same job.
- **Exception:** If this is intended, add `{"rule":"pmd/DontImportSun","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#dontimportsun)

<a id="pmd-dontusefloattypeforloopindices"></a>

### `pmd/DontUseFloatTypeForLoopIndices`

Don't use floating point for loop indices.

- **Why it is on:** If you must use floating point, use double unless you're certain that float provides enough precision and you have a compelling performance need (space or time).
- **Allowed form:** Use an int or long loop counter and compute the float value from it inside the body.
- **Exception:** If this is intended, add `{"rule":"pmd/DontUseFloatTypeForLoopIndices","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#dontusefloattypeforloopindices)

<a id="pmd-doublebraceinitialization"></a>

### `pmd/DoubleBraceInitialization`

Double brace initialisation is a pattern to initialise eg collections concisely.

- **Why it is on:** But it implicitly generates a new .class file, and the object holds a strong reference to the enclosing object. For those reasons, it is preferable to initialize the object normally, even though it's verbose. This rule counts any anonymous class which only has a single initializer as an instance of double-brace initialization. There is currently no way to find out whether a method called in the initializer is not accessible from outside the anonymous class, and those legit cases should be suppressed for the time being.
- **Allowed form:** Build the collection with List.of, Set.of or Map.of, or create it and call add or put in plain statements.
- **Exception:** If this is intended, add `{"rule":"pmd/DoubleBraceInitialization","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#doublebraceinitialization)

<a id="pmd-doublecheckedlocking"></a>

### `pmd/DoubleCheckedLocking`

Partially created objects can be returned by the Double Checked Locking pattern when used in Java.

- **Why it is on:** An optimizing JRE may assign a reference to the baz variable before it calls the constructor of the object the reference points to. Note: With Java 5, you can make Double checked locking work, if you declare the variable to be `volatile`. For more details refer to: \<http://www.javaworld.com/javaworld/jw-02-2001/jw-0209-double.html> or \<http://www.cs.umd.edu/~pugh/java/memoryModel/DoubleCheckedLocking.html>
- **Allowed form:** Initialize the value eagerly in a final field (static final for a static); class initialization already defers it to first use.
- **Exception:** If this is intended, add `{"rule":"pmd/DoubleCheckedLocking","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_multithreading.html#doublecheckedlocking)

<a id="pmd-emptycatchblock"></a>

### `pmd/EmptyCatchBlock`

Empty Catch Block finds instances where an exception is caught, but nothing is done.

- **Why it is on:** In most circumstances, this swallows an exception which should either be acted on or reported.
- **Allowed form:** Handle the exception: return a failure value, log it and recover, or rethrow with the cause (throw new IllegalStateException(msg, e)).
- **Exception:** If this is intended, add `{"rule":"pmd/EmptyCatchBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#emptycatchblock)

<a id="pmd-emptyfinalizer"></a>

### `pmd/EmptyFinalizer`

Empty finalize methods serve no purpose and should be removed.

- **Why it is on:** Note that Oracle has declared Object.finalize() as deprecated since JDK 9.
- **Allowed form:** Delete the empty finalize() method; use try-with-resources or java.lang.ref.Cleaner for cleanup.
- **Exception:** If this is intended, add `{"rule":"pmd/EmptyFinalizer","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#emptyfinalizer)

<a id="pmd-equalsnull"></a>

### `pmd/EqualsNull`

Tests for null should not use the equals() method.

- **Why it is on:** The '==' operator should be used instead.
- **Allowed form:** Replace x.equals(null) with x == null.
- **Exception:** If this is intended, add `{"rule":"pmd/EqualsNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#equalsnull)

<a id="pmd-exhaustiveenumpredicate"></a>

### `pmd/ExhaustiveEnumPredicate`

In main sources: a boolean in a value position (returned, assigned, a lambda body, also inside a larger `&&`/`||` or as a ternary condition there) that compares one subject that reading cannot change (a variable, a `this` field, a no-argument `getX()`/`isX()` call, a record accessor; not `it.next()` or another call) with some constants of one enum, qualified or static-imported (`s == PAID || s == SHIPPED`, `o.status() != A && o.status() != B`, `EnumSet.of(A, B).contains(s)`).

- **Scope:** Main sources only.
- **Why it is on:** A PMD rule nitpicker defines: it names one allowed form where the language offers several, and reports the other forms.
- **Allowed form:** These comparisons list only some constants of an enum of the project, so a constant added later silently falls into the other case. Classify every constant: a switch expression without default (adding a constant then fails to compile), or a boolean each constant declares (PAID(true)).
- **Exception:** If this is intended, add `{"rule":"pmd/ExhaustiveEnumPredicate","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-finalizedoesnotcallsuperfinalize"></a>

### `pmd/FinalizeDoesNotCallSuperFinalize`

If the finalize() is implemented, its last action should be to call super.finalize.

- **Why it is on:** Note that Oracle has declared Object.finalize() as deprecated since JDK 9.
- **Allowed form:** Delete finalize() and clean up with try-with-resources or Cleaner; if it stays, end it with super.finalize() in a finally.
- **Exception:** If this is intended, add `{"rule":"pmd/FinalizeDoesNotCallSuperFinalize","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#finalizedoesnotcallsuperfinalize)

<a id="pmd-finalizeonlycallssuperfinalize"></a>

### `pmd/FinalizeOnlyCallsSuperFinalize`

If the finalize() is implemented, it should do something besides just calling super.finalize().

- **Why it is on:** Note that Oracle has declared Object.finalize() as deprecated since JDK 9.
- **Allowed form:** Delete the finalize() override that only calls super.finalize().
- **Exception:** If this is intended, add `{"rule":"pmd/FinalizeOnlyCallsSuperFinalize","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#finalizeonlycallssuperfinalize)

<a id="pmd-finalizeoverloaded"></a>

### `pmd/FinalizeOverloaded`

Methods named finalize() should not have parameters.

- **Why it is on:** It is confusing and most likely an attempt to overload Object.finalize(). It will not be called by the VM. Note that Oracle has declared Object.finalize() as deprecated since JDK 9.
- **Allowed form:** Rename the overloaded finalize(...) method, or delete finalize and use try-with-resources or Cleaner.
- **Exception:** If this is intended, add `{"rule":"pmd/FinalizeOverloaded","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#finalizeoverloaded)

<a id="pmd-finalizeshouldbeprotected"></a>

### `pmd/FinalizeShouldBeProtected`

When overriding the finalize(), the new method should be set as protected.

- **Why it is on:** If made public, other classes may invoke it at inappropriate times. Note that Oracle has declared Object.finalize() as deprecated since JDK 9.
- **Allowed form:** Delete finalize() and use try-with-resources or Cleaner; if it stays, declare it protected, not public.
- **Exception:** If this is intended, add `{"rule":"pmd/FinalizeShouldBeProtected","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#finalizeshouldbeprotected)

<a id="pmd-fixedsleepintest"></a>

### `pmd/FixedSleepInTest`

In tests: `Thread.sleep`, `TimeUnit.X.sleep`, `LockSupport.parkNanos`, `wait(ms)` and `join(ms)` (and an unchecked `join(Duration)`) outside a polling loop; Mockito's `after(ms)` with a check that could pass sooner (`after(ms)`, `.atLeastOnce()`, `.times(n)`); Playwright's `page.waitForTimeout(...)`; Awaitility's `until(() -> true)`. A sleep in a mock answer (`doAnswer`, `thenAnswer`) or in a thread body (`new Thread`, an executor, `CompletableFuture.runAsync`) is not flagged, nor one in a test-source class without test methods that implements or extends a type of the main sources (a fake that simulates latency; `messages/latency-fakes.mjs`). `join(ms)` and `wait(ms)` get a timed-wait message: they return early, so the advice is to assert the result of `join(Duration)` or a latch `await`, not to poll.

- **Scope:** Test sources only.
- **Why it is on:** A PMD rule nitpicker defines: it names one allowed form where the language offers several, and reports the other forms.
- **Allowed form:** A fixed wait makes the test slow and flaky: a sleep or parkNanos outside a polling loop, after(ms) with a check that could pass sooner, or pollDelay(...).until(() -> true). Wait on the condition: a loop that checks it against a deadline (a sleep inside that loop is allowed), or verify(mock, timeout(1000)) for a mock. A timed wait, wait(ms) or join(ms), returns early but lets the test go on unchecked when the time runs out: assert the result of join(Duration) or of a latch await. A sleep in a mock answer, a thread body or a test fake that implements or extends a main class is allowed.
- **Exception:** If this is intended, add `{"rule":"pmd/FixedSleepInTest","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-forloopcanbeforeach"></a>

### `pmd/ForLoopCanBeForeach`

Reports loops that can be safely replaced with the foreach syntax.

- **Why it is on:** The rule considers loops over lists, arrays and iterators. A loop is safe to replace if it only uses the index variable to access an element of the list or array, only has one update statement, and loops through every element of the list or array left to right.
- **Allowed form:** Iterate with for (Item item : items) since the index is only used to read the element.
- **Exception:** If this is intended, add `{"rule":"pmd/ForLoopCanBeForeach","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#forloopcanbeforeach)

<a id="pmd-forloopvariablecount"></a>

### `pmd/ForLoopVariableCount`

Having a lot of control variables in a 'for' loop makes it harder to see what range of values the loop iterates over.

- **Why it is on:** By default this rule allows a regular 'for' loop with only one variable.
- **Allowed form:** Keep one variable in the for header; declare the others before the loop or use a while loop.
- **Exception:** If this is intended, add `{"rule":"pmd/ForLoopVariableCount","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#forloopvariablecount)

<a id="pmd-generatedonhandwrittencode"></a>

### `pmd/GeneratedOnHandWrittenCode`

Remove the annotation from hand-written code: JaCoCo skips code carrying an annotation whose name contains Generated, and PIT skips @Generated, so this is not measured. Put the JPA @GeneratedValue on the field.

- **Scope:** Main and test sources.
- **Why it is on:** A PMD rule nitpicker defines: it names one allowed form where the language offers several, and reports the other forms.
- **Exception:** If this is intended, add `{"rule":"pmd/GeneratedOnHandWrittenCode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-guardlogstatement"></a>

### `pmd/GuardLogStatement`

Whenever using a log level, one should check if it is actually enabled, or otherwise skip the associate String creation and manipulation, as well as any method calls.

- **Why it is on:** An alternative to checking the log level are substituting parameters, formatters or lazy logging with lambdas. The available alternatives depend on the actual logging framework.
- **Allowed form:** Pass only constants and locals with {} placeholders; for a computed value pass a Supplier lambda or wrap the call in an isLoggable check.
- **Exception:** If this is intended, add `{"rule":"pmd/GuardLogStatement","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#guardlogstatement)

<a id="pmd-hardcodedcryptokey"></a>

### `pmd/HardCodedCryptoKey`

Do not use hard coded values for cryptographic operations.

- **Why it is on:** Please store keys outside of source code.
- **Allowed form:** Read the key at run time from the deployment's secret store; keep no key bytes in source.
- **Exception:** If this is intended, add `{"rule":"pmd/HardCodedCryptoKey","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_security.html#hardcodedcryptokey)

<a id="pmd-idempotentoperations"></a>

### `pmd/IdempotentOperations`

Avoid idempotent operations - they have no effect.

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Delete the self-assignment (x = x), or assign the value you meant.
- **Exception:** If this is intended, add `{"rule":"pmd/IdempotentOperations","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#idempotentoperations)

<a id="pmd-implicitswitchfallthrough"></a>

### `pmd/ImplicitSwitchFallThrough`

Switch statements without break or return statements for each case option may indicate problematic behaviour.

- **Why it is on:** Empty cases are ignored as these indicate an intentional fall-through. You can ignore a violation by commenting `// fallthrough` before the case label which is reached by fallthrough, or with `@SuppressWarnings("fallthrough")`. This rule has been renamed from "MissingBreakInSwitch" in PMD 6.37.0.
- **Allowed form:** Rewrite the switch in arrow form, case A, B -> ..., which cannot fall through; in a colon-form switch end every case with break, return or throw.
- **Exception:** If this is intended, add `{"rule":"pmd/ImplicitSwitchFallThrough","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#implicitswitchfallthrough)

<a id="pmd-inefficientemptystringcheck"></a>

### `pmd/InefficientEmptyStringCheck`

String.trim().length() == 0 (or String.trim().isEmpty() for the same reason) is an inefficient way to check if a String is really blank, as it creates a new String object just to check its size.

- **Why it is on:** Consider creating a static function that loops through a string, checking Character.isWhitespace() on each character and returning false if a non-whitespace character is found.
- **Allowed form:** Call s.isBlank() instead of trimming and checking the result for emptiness.
- **Exception:** If this is intended, add `{"rule":"pmd/InefficientEmptyStringCheck","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_performance.html#inefficientemptystringcheck)

<a id="pmd-inefficientstringbuffering"></a>

### `pmd/InefficientStringBuffering`

Avoid concatenating non-literals in a StringBuffer constructor or append() since intermediate buffers will need to be be created and destroyed by the JVM.

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Give each value its own append: sb.append(a).append(b), not sb.append(a + b).
- **Exception:** If this is intended, add `{"rule":"pmd/InefficientStringBuffering","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_performance.html#inefficientstringbuffering)

<a id="pmd-insecurecryptoiv"></a>

### `pmd/InsecureCryptoIv`

Do not use hard coded initialization vector in cryptographic operations.

- **Why it is on:** Please use a randomly generated IV.
- **Allowed form:** Generate a fresh IV for each encryption with SecureRandom.nextBytes and store it with the ciphertext.
- **Exception:** If this is intended, add `{"rule":"pmd/InsecureCryptoIv","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_security.html#insecurecryptoiv)

<a id="pmd-instantiationtogetclass"></a>

### `pmd/InstantiationToGetClass`

Avoid instantiating an object just to call getClass() on it; use the .class public member instead.

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Write the class literal (Foo.class) instead of new Foo().getClass().
- **Exception:** If this is intended, add `{"rule":"pmd/InstantiationToGetClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#instantiationtogetclass)

<a id="pmd-invalidlogmessageformat"></a>

### `pmd/InvalidLogMessageFormat`

Check for messages in slf4j and log4j2 (since 6.19.0) loggers with non matching number of arguments and placeholders.

- **Why it is on:** Since 6.32.0 in addition to parameterized message placeholders (`{}`) also format specifiers of string formatted messages are supported (`%s`). This rule has been renamed from "InvalidSlf4jMessageFormat" in PMD 6.19.0.
- **Allowed form:** Make the number of {} placeholders equal to the number of arguments, and pass a Throwable as the last argument only.
- **Exception:** If this is intended, add `{"rule":"pmd/InvalidLogMessageFormat","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#invalidlogmessageformat)

<a id="pmd-jpaentityclass"></a>

### `pmd/JpaEntityClass`

Make the entity a non-final class. Records and final classes cannot be JPA entities; use records for DTOs.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Make the entity an open class that is not a data class: apply the all-open plugin for @Entity, @MappedSuperclass and @Embeddable (allOpen { annotation("jakarta.persistence.Entity") ... } next to kotlin("plugin.jpa")), or write open class. Hibernate cannot proxy a final class, so lazy loading stops working, and a data class compares and hashes every property; use data classes for DTOs.
- **Exception:** If this is intended, add `{"rule":"pmd/JpaEntityClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-jpaenumstring"></a>

### `pmd/JpaEnumString`

Write @Enumerated(EnumType.STRING) on this enum field or element collection, and @MapKeyEnumerated(EnumType.STRING) on a map with enum keys. The default stores the ordinal, so adding or reordering constants silently corrupts stored rows.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Write @Enumerated(EnumType.STRING) on this enum property or element collection, and @MapKeyEnumerated(EnumType.STRING) on a map with enum keys. The default stores the ordinal, so adding or reordering constants silently corrupts stored rows.
- **Exception:** If this is intended, add `{"rule":"pmd/JpaEnumString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-jpaidentityhashcode"></a>

### `pmd/JpaIdentityHashCode`

Return getClass().hashCode() from the hashCode of an entity, or hash an immutable business key; with Lombok, write @EqualsAndHashCode(onlyExplicitlyIncluded = true) and mark that key with @EqualsAndHashCode.Include. A hash of the generated id or of every field changes when the entity is saved, and a hash set then loses it.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Return javaClass.hashCode() from the hashCode of an entity, or hash an immutable business key, and do not make an entity with a generated id a data class. A hash of the generated id or of every property changes when the entity is saved, and a hash set then loses it.
- **Exception:** If this is intended, add `{"rule":"pmd/JpaIdentityHashCode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-jpalazyfetching"></a>

### `pmd/JpaLazyFetching`

Write fetch = FetchType.LAZY on every @ManyToOne and @OneToOne (they are eager by default) and never use EAGER; load what a query needs with join fetch.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Write fetch = FetchType.LAZY on every @ManyToOne and @OneToOne (they are eager by default) and never use EAGER; load what a query needs with join fetch.
- **Exception:** If this is intended, add `{"rule":"pmd/JpaLazyFetching","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-jpamanytomanycascade"></a>

### `pmd/JpaManyToManyCascade`

Cascade only PERSIST and MERGE on @ManyToMany, never ALL or REMOVE: removing one parent deletes rows that other parents still share.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Cascade only PERSIST and MERGE on @ManyToMany, never ALL or REMOVE: removing one parent deletes rows that other parents still share.
- **Exception:** If this is intended, add `{"rule":"pmd/JpaManyToManyCascade","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-jpamanytomanyset"></a>

### `pmd/JpaManyToManySet`

Map @ManyToMany as a Set (or a List with @OrderColumn). A plain List makes Hibernate delete and re-insert every join row when one element is removed.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Map @ManyToMany as a MutableSet (or a MutableList with @OrderColumn). A plain list makes Hibernate delete and re-insert every join row when one element is removed.
- **Exception:** If this is intended, add `{"rule":"pmd/JpaManyToManySet","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-jpasequenceids"></a>

### `pmd/JpaSequenceIds`

Generate ids with GenerationType.SEQUENCE (or UUID). IDENTITY and TABLE ids disable JDBC insert batching.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Generate ids with GenerationType.SEQUENCE (or UUID). IDENTITY and TABLE ids disable JDBC insert batching.
- **Exception:** If this is intended, add `{"rule":"pmd/JpaSequenceIds","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-jpaversion"></a>

### `pmd/JpaVersion`

Add a @Version field next to the @Id, so concurrent updates fail instead of overwriting each other. Mark entities that are never updated with @Immutable.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Add a @Version property next to the @Id, so concurrent updates fail instead of overwriting each other. Mark entities that are never updated with @Immutable.
- **Exception:** If this is intended, add `{"rule":"pmd/JpaVersion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-jumbledincrementer"></a>

### `pmd/JumbledIncrementer`

Avoid jumbled loop incrementers - it's usually a mistake, and is confusing even if intentional.

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Use the loop's own variable in the update clause, and a different variable name in nested loops.
- **Exception:** If this is intended, add `{"rule":"pmd/JumbledIncrementer","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#jumbledincrementer)

<a id="pmd-junit4suitesshouldusesuiteannotation"></a>

### `pmd/JUnit4SuitesShouldUseSuiteAnnotation`

In JUnit 3, test suites are indicated by the suite() method.

- **Why it is on:** In JUnit 4, suites are indicated through the @RunWith(Suite.class) annotation.
- **Allowed form:** Declare the suite with JUnit 5 @Suite and @SelectClasses or @SelectPackages instead of a static suite() method.
- **Exception:** If this is intended, add `{"rule":"pmd/JUnit4SuitesShouldUseSuiteAnnotation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#junit4suitesshouldusesuiteannotation)

<a id="pmd-junit4testshoulduseafterannotation"></a>

### `pmd/JUnit4TestShouldUseAfterAnnotation`

This rule detects methods called `tearDown()` that are not properly annotated as a cleanup method.

- **Why it is on:** This is primarily intended to assist in upgrading from JUnit 3, where tear down methods were required to be called `tearDown()`. To a lesser extent, this may help detect omissions even under newer JUnit versions or under TestNG, as long as you are following this convention to name the methods. \* JUnit 4 will only execute methods annotated with `@After` after running each test. \* JUnit 5 introduced `@AfterEach` and `@AfterAll` annotations to execute methods after each test or after all tests in the class, respectively. \* TestNG provides the annotations `@AfterMethod` and `@AfterClass` to execute methods after each test or after tests in the class, respectively. Note: This rule was named JUnit4TestShouldUseAfterAnnotation before PMD 7.7.0.
- **Allowed form:** Annotate the cleanup method with @AfterEach; a method named tearDown does not run on its own.
- **Exception:** If this is intended, add `{"rule":"pmd/JUnit4TestShouldUseAfterAnnotation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#unittestshoulduseafterannotation)

<a id="pmd-junit4testshouldusebeforeannotation"></a>

### `pmd/JUnit4TestShouldUseBeforeAnnotation`

This rule detects methods called `setUp()` that are not properly annotated as a setup method.

- **Why it is on:** This is primarily intended to assist in upgrading from JUnit 3, where setup methods were required to be called `setUp()`. To a lesser extent, this may help detect omissions even under newer JUnit versions or under TestNG, as long as you are following this convention to name the methods. \* JUnit 4 will only execute methods annotated with `@Before` before all tests. \* JUnit 5 introduced `@BeforeEach` and `@BeforeAll` annotations to execute methods before each test or before all tests in the class, respectively. \* TestNG provides the annotations `@BeforeMethod` and `@BeforeClass` to execute methods before each test or before tests in the class, respectively. Note: This rule was named JUnit4TestShouldUseBeforeAnnotation before PMD 7.7.0.
- **Allowed form:** Annotate the setup method with @BeforeEach; a method named setUp does not run on its own.
- **Exception:** If this is intended, add `{"rule":"pmd/JUnit4TestShouldUseBeforeAnnotation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#unittestshouldusebeforeannotation)

<a id="pmd-junit4testshouldusetestannotation"></a>

### `pmd/JUnit4TestShouldUseTestAnnotation`

The rule will detect any test method starting with "test" that is not properly annotated, and will therefore not be run.

- **Why it is on:** In JUnit 4, only methods annotated with the `@Test` annotation are executed. In JUnit 5, one of the following annotations should be used for tests: `@Test`, `@RepeatedTest`, `@TestFactory`, `@TestTemplate` or `@ParameterizedTest`. In TestNG, only methods annotated with the `@Test` annotation are executed. Note: This rule was named JUnit4TestShouldUseTestAnnotation before PMD 7.7.0.
- **Allowed form:** Annotate each test method with @Test; a name starting with test does not make it run.
- **Exception:** If this is intended, add `{"rule":"pmd/JUnit4TestShouldUseTestAnnotation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#unittestshouldusetestannotation)

<a id="pmd-junit5testshouldbepackageprivate"></a>

### `pmd/JUnit5TestShouldBePackagePrivate`

Reports JUnit 5 test classes and methods that are not package-private.

- **Why it is on:** Contrary to JUnit 4 tests, which required public visibility to be run by the engine, JUnit 5 tests can also be run if they're package-private. Marking them as such is a good practice to limit their visibility. Test methods are identified as those which use `@Test`, `@RepeatedTest`, `@TestFactory`, `@TestTemplate` or `@ParameterizedTest`.
- **Allowed form:** Drop public from JUnit 5 test classes and test methods; package-private is enough.
- **Exception:** If this is intended, add `{"rule":"pmd/JUnit5TestShouldBePackagePrivate","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#junit5testshouldbepackageprivate)

<a id="pmd-junitassertionsshouldincludemessage"></a>

### `pmd/JUnitAssertionsShouldIncludeMessage`

Unit assertions should include an informative message - i.e., use the three-argument version of `assertEquals()`, not the two-argument version.

- **Why it is on:** This rule supports tests using JUnit (3, 4 and 5) and TestNG. Note: This rule was named JUnitAssertionsShouldIncludeMessage before PMD 7.7.0.
- **Allowed form:** Add a failure message to the assertion, e.g. assertEquals(expected, actual, "total after discount"), or use assertThat(actual).as("total").
- **Exception:** If this is intended, add `{"rule":"pmd/JUnitAssertionsShouldIncludeMessage","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#unittestassertionsshouldincludemessage)

<a id="pmd-junitspelling"></a>

### `pmd/JUnitSpelling`

In JUnit 3, the setUp method is used to set up all data entities required in running tests.

- **Why it is on:** The tearDown method is used to clean up all data entities required in running tests. You should not misspell method name if you want your test to set up and clean up everything correctly.
- **Allowed form:** Rename the method to setUp or tearDown with that exact casing, or replace it with @BeforeEach or @AfterEach in JUnit 5.
- **Exception:** If this is intended, add `{"rule":"pmd/JUnitSpelling","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#junitspelling)

<a id="pmd-junitstaticsuite"></a>

### `pmd/JUnitStaticSuite`

The suite() method in a JUnit test needs to be both public and static.

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Delete the JUnit 3 suite() method and group tests with @Nested classes or a JUnit 5 suite; if it stays, declare it public static.
- **Exception:** If this is intended, add `{"rule":"pmd/JUnitStaticSuite","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#junitstaticsuite)

<a id="pmd-junittestcontainstoomanyasserts"></a>

### `pmd/JUnitTestContainsTooManyAsserts`

Unit tests should not contain too many asserts.

- **Why it is on:** Many asserts are indicative of a complex test, for which it is harder to verify correctness. Consider breaking the test scenario into multiple, shorter test scenarios. Customize the maximum number of assertions used by this Rule to suit your needs. This rule checks for JUnit (3, 4 and 5) and TestNG Tests. Note: This rule was named JUnitTestContainsTooManyAsserts before PMD 7.7.0.
- **Allowed form:** Split the test so each covers one behavior, or compare one whole record or list with a single assertThat(actual).isEqualTo(expected).
- **Exception:** If this is intended, add `{"rule":"pmd/JUnitTestContainsTooManyAsserts","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#unittestcontainstoomanyasserts)

<a id="pmd-junittestsshouldincludeassert"></a>

### `pmd/JUnitTestsShouldIncludeAssert`

Unit tests should include at least one assertion.

- **Why it is on:** This makes the tests more robust, and using assert with messages provide the developer a clearer idea of what the test does. This rule checks for JUnit (3, 4 and 5) and TestNG Tests. Note: This rule was named JUnitTestsShouldIncludeAssert before PMD 7.7.0.
- **Allowed form:** Assert on the result, e.g. assertThat(actual).isEqualTo(expected), or use assertThrows for an expected failure.
- **Exception:** If this is intended, add `{"rule":"pmd/JUnitTestsShouldIncludeAssert","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#unittestshouldincludeassert)

<a id="pmd-junituseexpected"></a>

### `pmd/JUnitUseExpected`

In JUnit4, use the @Test(expected) annotation to denote tests that should throw exceptions.

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Replace the try/catch and fail() with assertThrows(IllegalStateException.class, () -> call()).
- **Exception:** If this is intended, add `{"rule":"pmd/JUnitUseExpected","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#junituseexpected)

<a id="pmd-legacycalendarapi"></a>

### `pmd/LegacyCalendarApi`

In main sources: the overloads that read the default time zone: `Calendar.getInstance()` and `Calendar.getInstance(Locale)`, `new GregorianCalendar()` with no arguments, a `Locale` or date fields, and `new SimpleDateFormat(...)` unless the variable it is assigned to gets `setTimeZone(...)` in the same method or class. Passing a `TimeZone` is not flagged.

- **Scope:** Main sources only.
- **Why it is on:** A PMD rule nitpicker defines: it names one allowed form where the language offers several, and reports the other forms.
- **Allowed form:** Calendar.getInstance() and new GregorianCalendar() without a time zone, and new SimpleDateFormat(...) without setTimeZone, read the default time zone and are not thread-safe. Use java.time with an explicit zone: Instant, or ZonedDateTime.now(clock), and a DateTimeFormatter with withZone(zone). Passing a TimeZone to Calendar.getInstance or the GregorianCalendar constructor is allowed.
- **Exception:** If this is intended, add `{"rule":"pmd/LegacyCalendarApi","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-literalsfirstincomparisons"></a>

### `pmd/LiteralsFirstInComparisons`

Position literals first in all String comparisons, if the second argument is null then NullPointerExceptions can be avoided, they will just return false.

- **Why it is on:** Note that switching literal positions for compareTo and compareToIgnoreCase may change the result, see examples.
- **Allowed form:** Put the literal first: "yes".equals(value), so a null value cannot throw.
- **Exception:** If this is intended, add `{"rule":"pmd/LiteralsFirstInComparisons","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#literalsfirstincomparisons)

<a id="pmd-logstringconcatenation"></a>

### `pmd/LogStringConcatenation`

Pass values as placeholders (LOG.info("user {}", user); {0} in System.Logger and java.util.logging), not a message built with + or String.format.

- **Scope:** Main and test sources.
- **Why it is on:** A PMD rule nitpicker defines: it names one allowed form where the language offers several, and reports the other forms.
- **Exception:** If this is intended, add `{"rule":"pmd/LogStringConcatenation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-loosecoupling"></a>

### `pmd/LooseCoupling`

Excessive coupling to implementation types (e.g., `HashSet`) limits your ability to use alternate implementations in the future as requirements change.

- **Why it is on:** Whenever available, declare variables and parameters using a more general type (e.g, `Set`). This rule reports uses of concrete collection types. User-defined types that should be treated the same as interfaces can be configured with the property `allowedTypes`.
- **Allowed form:** Declare the type as the interface (List, Map, Set, Deque), not ArrayList, HashMap or LinkedList.
- **Exception:** If this is intended, add `{"rule":"pmd/LooseCoupling","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#loosecoupling)

<a id="pmd-methodreturnsinternalarray"></a>

### `pmd/MethodReturnsInternalArray`

Exposing internal arrays to the caller violates object encapsulation since elements can be removed or replaced outside of the object that owns it.

- **Why it is on:** It is safer to return a copy of the array.
- **Allowed form:** Return items.clone(), or expose the data as List.copyOf(items) or an unmodifiable List.
- **Exception:** If this is intended, add `{"rule":"pmd/MethodReturnsInternalArray","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#methodreturnsinternalarray)

<a id="pmd-methodwithsamenameasenclosingclass"></a>

### `pmd/MethodWithSameNameAsEnclosingClass`

A method should not have the same name as its containing class.

- **Why it is on:** This would be confusing as it would look like a constructor.
- **Allowed form:** Rename the method so it is not the class name; use a static factory such as of or create, or fix the intended constructor.
- **Exception:** If this is intended, add `{"rule":"pmd/MethodWithSameNameAsEnclosingClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#methodwithsamenameasenclosingclass)

<a id="pmd-misplacednullcheck"></a>

### `pmd/MisplacedNullCheck`

The null check here is misplaced.

- **Why it is on:** If the variable is null a `NullPointerException` will be thrown. Either the check is useless (the variable will never be `null`) or it is incorrect.
- **Allowed form:** Move the null check before the dereference, or fix the condition so it does not dereference when the value is null.
- **Exception:** If this is intended, add `{"rule":"pmd/MisplacedNullCheck","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#misplacednullcheck)

<a id="pmd-missingoverride"></a>

### `pmd/MissingOverride`

Annotating overridden methods with @Override ensures at compile time that the method really overrides one, which helps refactoring and clarifies intent.

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Add @Override to the method that overrides or implements a supertype method.
- **Exception:** If this is intended, add `{"rule":"pmd/MissingOverride","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#missingoverride)

<a id="pmd-missingserialversionuid"></a>

### `pmd/MissingSerialVersionUID`

Serializable classes should provide a serialVersionUID field.

- **Why it is on:** The serialVersionUID field is also needed for abstract base classes. Each individual class in the inheritance chain needs an own serialVersionUID field. See also [Should an abstract class have a serialVersionUID](https://stackoverflow.com/questions/893259/should-an-abstract-class-have-a-serialversionuid).
- **Allowed form:** Declare private static final long serialVersionUID = 1L; in the class, or stop implementing Serializable if it is never serialized.
- **Exception:** If this is intended, add `{"rule":"pmd/MissingSerialVersionUID","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#missingserialversionuid)

<a id="pmd-missingstaticmethodinnoninstantiatableclass"></a>

### `pmd/MissingStaticMethodInNonInstantiatableClass`

A class that has private constructors and does not have any static methods or fields cannot be used.

- **Why it is on:** When one of the private constructors is annotated with one of the annotations, then the class is not considered non-instantiatable anymore and no violation will be reported. See the property `annotations`.
- **Allowed form:** Add a public static factory or accessor method, or make a constructor non-private, so the class can be used.
- **Exception:** If this is intended, add `{"rule":"pmd/MissingStaticMethodInNonInstantiatableClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#missingstaticmethodinnoninstantiatableclass)

<a id="pmd-morethanonelogger"></a>

### `pmd/MoreThanOneLogger`

Normally only one logger is used in each class.

- **Why it is on:** This rule supports slf4j, log4j, Java Util Logging and log4j2 (since 6.19.0).
- **Allowed form:** Keep one private static final logger per class and use it everywhere in that class.
- **Exception:** If this is intended, add `{"rule":"pmd/MoreThanOneLogger","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#morethanonelogger)

<a id="pmd-mutationignoremarker"></a>

### `pmd/MutationIgnoreMarker`

Remove the annotation and kill the mutants with a test: PIT does not mutate code annotated @DoNotMutate or @CoverageIgnore.

- **Scope:** Main and test sources.
- **Why it is on:** A PMD rule nitpicker defines: it names one allowed form where the language offers several, and reports the other forms.
- **Exception:** If this is intended, add `{"rule":"pmd/MutationIgnoreMarker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-negativewaitintest"></a>

### `pmd/NegativeWaitInTest`

In tests: Mockito's `after(ms)` with `never()`, `times(0)`, `atMost(n)` or `atMostOnce()`, and Awaitility's `during(...)`, which prove that nothing happens by waiting out a delay.

- **Scope:** Test sources only.
- **Why it is on:** A PMD rule nitpicker defines: it names one allowed form where the language offers several, and reports the other forms.
- **Allowed form:** Do not prove that something does not happen by waiting out a delay: after(ms).never() and during(...) pass only after the full wait, so the test is slow and depends on the timing. Give the code a Clock or a scheduler the test controls, move it past the delay and assert at once.
- **Exception:** If this is intended, add `{"rule":"pmd/NegativeWaitInTest","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-noncaselabelinswitch"></a>

### `pmd/NonCaseLabelInSwitch`

A non-case label (e.g. a named break/continue label) was present in a switch statement or switch expression.

- **Why it is on:** This is legal, but confusing. It is easy to mix up the case labels and the non-case labels. Note: This rule was renamed from `NonCaseLabelInSwitchStatement` with PMD 7.7.0.
- **Allowed form:** Move the label into a case, or delete it; a label inside a switch body that is not a case is never a jump target.
- **Exception:** If this is intended, add `{"rule":"pmd/NonCaseLabelInSwitch","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#noncaselabelinswitch)

<a id="pmd-noncaselabelinswitchstatement"></a>

### `pmd/NonCaseLabelInSwitchStatement`

A non-case label (e.g. a named break/continue label) was present in a switch statement or switch expression.

- **Why it is on:** This is legal, but confusing. It is easy to mix up the case labels and the non-case labels. Note: This rule was renamed from `NonCaseLabelInSwitchStatement` with PMD 7.7.0.
- **Allowed form:** Move the label into a case, or delete it; a label inside a switch body that is not a case is never a jump target.
- **Exception:** If this is intended, add `{"rule":"pmd/NonCaseLabelInSwitchStatement","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#noncaselabelinswitch)

<a id="pmd-nonexhaustiveswitch"></a>

### `pmd/NonExhaustiveSwitch`

Switch statements should be exhaustive, to make their control flow easier to follow.

- **Why it is on:** This can be achieved by adding a `default` case, or, if the switch is on an enum type, by ensuring there is one switch branch for each enum constant. This rule doesn't consider Switch Statements, that use Pattern Matching, since for these the compiler already ensures that all cases are covered. The same is true for Switch Expressions, which are also not considered by this rule.
- **Allowed form:** Make it an exhaustive switch expression, or add a default branch that throws IllegalStateException.
- **Exception:** If this is intended, add `{"rule":"pmd/NonExhaustiveSwitch","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#nonexhaustiveswitch)

<a id="pmd-nonserializableclass"></a>

### `pmd/NonSerializableClass`

If a class is marked as `Serializable`, then all fields need to be serializable as well.

- **Why it is on:** In order to exclude a field, it can be marked as transient. Static fields are not considered. This rule reports all fields, that are not serializable. If a class implements the methods to perform manual serialization (`writeObject`, `readObject`) or uses a replacement object (`writeReplace`, `readResolve`) then this class is ignored. Note: This rule has been revamped with PMD 6.52.0. It was previously called "BeanMembersShouldSerialize". The property `prefix` has been deprecated, since in a serializable class all fields have to be serializable regardless of the name.
- **Allowed form:** Make the field's type Serializable or mark the field transient; if the class is never serialized, stop implementing Serializable.
- **Exception:** If this is intended, add `{"rule":"pmd/NonSerializableClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#nonserializableclass)

<a id="pmd-nonstaticinitializer"></a>

### `pmd/NonStaticInitializer`

A non-static initializer block will be called any time a constructor is invoked (just prior to invoking the constructor).

- **Why it is on:** While this is a valid language construct, it is rarely used and is confusing.
- **Allowed form:** Move the initializer block's code into a constructor, or make the block static if it sets up static state.
- **Exception:** If this is intended, add `{"rule":"pmd/NonStaticInitializer","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#nonstaticinitializer)

<a id="pmd-nonthreadsafesingleton"></a>

### `pmd/NonThreadSafeSingleton`

Non-thread safe singletons can result in bad state changes.

- **Why it is on:** Eliminate static singletons if possible by instantiating the object directly. Static singletons are usually not needed as only a single instance exists anyway. Other possible fixes are to synchronize the entire method or to use an [initialize-on-demand holder class](https://en.wikipedia.org/wiki/Initialization-on-demand_holder_idiom). Refrain from using the double-checked locking pattern. The Java Memory Model doesn't guarantee it to work unless the variable is declared as `volatile`, adding an uneeded performance penalty. [Reference](http://www.cs.umd.edu/~pugh/java/memoryModel/DoubleCheckedLocking.html) See Effective Java, item 48.
- **Allowed form:** Initialize the instance eagerly: private static final T INSTANCE = new T(); class initialization already defers it to first use.
- **Exception:** If this is intended, add `{"rule":"pmd/NonThreadSafeSingleton","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_multithreading.html#nonthreadsafesingleton)

<a id="pmd-nullassignment"></a>

### `pmd/NullAssignment`

Assigning a "null" to a variable (outside of its declaration) is usually bad form.

- **Why it is on:** Sometimes, this type of assignment is an indication that the programmer doesn't completely understand what is going on in the code. NOTE: This sort of assignment may used in some cases to dereference objects and encourage garbage collection.
- **Allowed form:** Restructure so the variable gets its value once: declare it where the value is known, return early, or extract a method; never write x = null.
- **Exception:** If this is intended, add `{"rule":"pmd/NullAssignment","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#nullassignment)

<a id="pmd-onedeclarationperline"></a>

### `pmd/OneDeclarationPerLine`

Java allows the use of several variables declaration of the same type on one line.

- **Why it is on:** However, it can lead to quite messy code. This rule looks for several declarations on the same line.
- **Allowed form:** Declare each variable in its own statement: int width; int height;.
- **Exception:** If this is intended, add `{"rule":"pmd/OneDeclarationPerLine","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#onedeclarationperline)

<a id="pmd-optimizabletoarraycall"></a>

### `pmd/OptimizableToArrayCall`

Calls to a collection's `toArray(E[])` method should specify a target array of zero size.

- **Why it is on:** This allows the JVM to optimize the memory allocation and copying as much as possible. Previous versions of this rule (pre PMD 6.0.0) suggested the opposite, but current JVM implementations perform always better, when they have full control over the target array. And allocation an array via reflection is nowadays as fast as the direct allocation. See also [Arrays of Wisdom of the Ancients](https://shipilev.net/blog/2016/arrays-wisdom-ancients/) Note: If you don't need an array of the correct type, then the simple `toArray()` method without an array is faster, but returns only an array of type `Object[]`.
- **Allowed form:** Pass a zero-length array: list.toArray(new String[0]).
- **Exception:** If this is intended, add `{"rule":"pmd/OptimizableToArrayCall","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_performance.html#optimizabletoarraycall)

<a id="pmd-overridebothequalsandhashcode"></a>

### `pmd/OverrideBothEqualsAndHashcode`

Override both public boolean Object.equals(Object other), and public int Object.hashCode(), or override neither.

- **Why it is on:** Even if you are inheriting a hashCode() from a parent class, consider implementing hashCode and explicitly delegating to your superclass.
- **Allowed form:** Override equals and hashCode together, using Objects.hash and Objects.equals, or make the type a record.
- **Exception:** If this is intended, add `{"rule":"pmd/OverrideBothEqualsAndHashcode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#overridebothequalsandhashcode)

<a id="pmd-parametermutation"></a>

### `pmd/ParameterMutation`

In public methods and constructors: a change to a parameter in place: a mutating call on a `Collection` or `Map` parameter (`add`, `addAll`, `remove`, `removeIf`, `clear`, `put`, `putAll`, `merge`, `compute*`, `replaceAll`, `sort`, `set`, `push`, `pop`, `poll`, `offer` and the other mutators), `Arrays.sort`, `fill`, `setAll` or `Collections.sort`, `shuffle`, `reverse`, `swap`, `rotate`, `addAll` on a parameter, or a write to an element of an array parameter, also a multi-dimensional one (`counts[0] = 0`, `counts[1]++`, `grid[0][1] = 3`). A parameter stored in a field or a local variable and changed there (`this.items = items; this.items.add(x)`, `var alias = items; alias.add(x)`) counts. Reading an element (`v = values[0]`, `t += values[1]`) does not. Not flagged: private methods and constructors, methods of private, local or anonymous classes, concurrent types used to share work (`BlockingQueue`, `ConcurrentMap`, `CopyOnWrite*`), `@Override` methods, and a change made after the parameter was rebound to a copy of itself.

- **Scope:** Main sources only.
- **Why it is on:** A PMD rule nitpicker defines: it names one allowed form where the language offers several, and reports the other forms.
- **Allowed form:** This changes the collection, map or array the caller passed in. Build and return a new one (List.copyOf, a stream, new ArrayList\<>(items) filled and returned), or copy the parameter first and change the copy.
- **Exception:** If this is intended, add `{"rule":"pmd/ParameterMutation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-preservestacktrace"></a>

### `pmd/PreserveStackTrace`

Reports exceptions that are thrown from within a catch block, yet don't refer to the exception parameter declared by that catch block.

- **Why it is on:** The stack trace of the original exception could be lost, which makes the thrown exception less informative. To preserve the stack trace, the original exception may be used as the cause of the new exception, using `Throwable#initCause`, or passed as a constructor argument to the new exception. It may also be preserved using `Throwable#addSuppressed`. The rule actually assumes that any method or constructor that takes the original exception as argument preserves the original stack trace. The rule allows `InvocationTargetException` and `PrivilegedActionException` to be replaced by their cause exception. The discarded part of the stack trace is in those cases only JDK-internal code, which is not very useful. The rule also ignores exceptions whose name starts with `ignored`.
- **Allowed form:** Pass the caught exception as the cause: throw new IllegalStateException("message", e).
- **Exception:** If this is intended, add `{"rule":"pmd/PreserveStackTrace","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#preservestacktrace)

<a id="pmd-primitivewrapperinstantiation"></a>

### `pmd/PrimitiveWrapperInstantiation`

Reports usages of primitive wrapper constructors.

- **Why it is on:** They are deprecated since Java 9 and should not be used. Even before Java 9, they can be replaced with usage of the corresponding static `valueOf` factory method (which may be automatically inserted by the compiler since Java 1.5). This has the advantage that it may reuse common instances instead of creating a new instance each time. Note that for `Boolean`, the named constants `Boolean.TRUE` and `Boolean.FALSE` are preferred instead of `Boolean.valueOf`.
- **Allowed form:** Use Integer.valueOf(x), autoboxing, or the primitive itself instead of new Integer(x).
- **Exception:** If this is intended, add `{"rule":"pmd/PrimitiveWrapperInstantiation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#primitivewrapperinstantiation)

<a id="pmd-propercloneimplementation"></a>

### `pmd/ProperCloneImplementation`

Object clone() should be implemented with super.clone().

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Build the result with super.clone() and return it, or drop clone() for a copy constructor or static copy factory.
- **Exception:** If this is intended, add `{"rule":"pmd/ProperCloneImplementation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#propercloneimplementation)

<a id="pmd-properlogger"></a>

### `pmd/ProperLogger`

A logger should normally be defined private static final and be associated with the correct class.

- **Why it is on:** `private final Log log;` is also allowed for rare cases where loggers need to be passed around, with the restriction that the logger needs to be passed into the constructor.
- **Allowed form:** Declare it private static final Log LOG = LogFactory.getLog(Foo.class), where Foo is the class that declares it.
- **Exception:** If this is intended, add `{"rule":"pmd/ProperLogger","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#properlogger)

<a id="pmd-redundantfieldinitializer"></a>

### `pmd/RedundantFieldInitializer`

Java will initialize fields with known default values so any explicit initialization of those same defaults is redundant and results in a larger class file (approximately three additional bytecode instructions per field).

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Delete the initializer; Java already sets the field to 0, false or null.
- **Exception:** If this is intended, add `{"rule":"pmd/RedundantFieldInitializer","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_performance.html#redundantfieldinitializer)

<a id="pmd-replaceenumerationwithiterator"></a>

### `pmd/ReplaceEnumerationWithIterator`

Consider replacing Enumeration usages with the newer java.util.Iterator.

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Implement Iterator instead of Enumeration; where a legacy API demands an Enumeration, pass Collections.enumeration(list).
- **Exception:** If this is intended, add `{"rule":"pmd/ReplaceEnumerationWithIterator","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#replaceenumerationwithiterator)

<a id="pmd-replacehashtablewithmap"></a>

### `pmd/ReplaceHashtableWithMap`

Consider replacing Hashtable usage with the newer java.util.Map if thread safety is not required.

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Declare Map and create a HashMap, or a ConcurrentHashMap when threads share it.
- **Exception:** If this is intended, add `{"rule":"pmd/ReplaceHashtableWithMap","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#replacehashtablewithmap)

<a id="pmd-replacevectorwithlist"></a>

### `pmd/ReplaceVectorWithList`

Consider replacing Vector usages with the newer java.util.ArrayList if expensive thread-safe operations are not required.

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Declare List and create an ArrayList, or use CopyOnWriteArrayList when threads share it.
- **Exception:** If this is intended, add `{"rule":"pmd/ReplaceVectorWithList","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#replacevectorwithlist)

<a id="pmd-returnemptycollectionratherthannull"></a>

### `pmd/ReturnEmptyCollectionRatherThanNull`

For any method that returns an collection (such as an array, Collection or Map), it is better to return an empty one rather than a null reference.

- **Why it is on:** This removes the need for null checking all results and avoids inadvertent NullPointerExceptions. See Effective Java, 3rd Edition, Item 54: Return empty collections or arrays instead of null
- **Allowed form:** Return List.of(), Set.of(), Map.of() or Collections.emptyList(), or a new empty array, instead of null.
- **Exception:** If this is intended, add `{"rule":"pmd/ReturnEmptyCollectionRatherThanNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#returnemptycollectionratherthannull)

<a id="pmd-returnfromfinallyblock"></a>

### `pmd/ReturnFromFinallyBlock`

Avoid returning from a finally block, this can discard exceptions.

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Move the return out of finally, and return from the try or after the whole statement, so exceptions are not lost.
- **Exception:** If this is intended, add `{"rule":"pmd/ReturnFromFinallyBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#returnfromfinallyblock)

<a id="pmd-simpledateformatneedslocale"></a>

### `pmd/SimpleDateFormatNeedsLocale`

Be sure to specify a Locale when creating SimpleDateFormat instances to ensure that locale-appropriate formatting is used.

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Use DateTimeFormatter.ofPattern(pattern, Locale.ROOT) from java.time; if SimpleDateFormat stays, pass a Locale.
- **Exception:** If this is intended, add `{"rule":"pmd/SimpleDateFormatNeedsLocale","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#simpledateformatneedslocale)

<a id="pmd-simplifiabletestassertion"></a>

### `pmd/SimplifiableTestAssertion`

Reports test assertions that may be simplified using a more specific assertion method.

- **Why it is on:** This enables better error messages, and makes the assertions more readable.
- **Allowed form:** Use the assertion the message names, such as assertEquals, assertNull or assertFalse, in place of assertTrue on a comparison or negation.
- **Exception:** If this is intended, add `{"rule":"pmd/SimplifiableTestAssertion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#simplifiabletestassertion)

<a id="pmd-singlemethodsingleton"></a>

### `pmd/SingleMethodSingleton`

Some classes contain overloaded getInstance.

- **Why it is on:** The problem with overloaded getInstance methods is that the instance created using the overloaded method is not cached and so, for each call and new objects will be created for every invocation.
- **Allowed form:** Keep one getInstance method that returns the same instance, or use an enum singleton or inject the dependency.
- **Exception:** If this is intended, add `{"rule":"pmd/SingleMethodSingleton","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#singlemethodsingleton)

<a id="pmd-singletonclassreturningnewinstance"></a>

### `pmd/SingletonClassReturningNewInstance`

A singleton class should only ever have one instance.

- **Why it is on:** Failure to check whether an instance has already been created may result in multiple instances being created.
- **Allowed form:** Return the single cached instance from getInstance, or drop the singleton and pass the object in through the constructor.
- **Exception:** If this is intended, add `{"rule":"pmd/SingletonClassReturningNewInstance","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#singletonclassreturningnewinstance)

<a id="pmd-singularandpluralmember"></a>

### `pmd/SingularAndPluralMember`

In main sources: a record, or a `@ConfigurationProperties` class or a class nested in one, with both `tag` and `tags` (`-s`, `-es`, `y`/`ies`) where the plural is a `List`, `Set`, `Collection`, `Iterable` or array of the singular's type.

- **Scope:** Main sources only.
- **Why it is on:** A PMD rule nitpicker defines: it names one allowed form where the language offers several, and reports the other forms.
- **Allowed form:** A member and its plural (tag and tags) are two ways to pass the same data. Keep the plural and pass one item as a one-element list.
- **Exception:** If this is intended, add `{"rule":"pmd/SingularAndPluralMember","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springasyncexecutor"></a>

### `pmd/SpringAsyncExecutor`

Name a bounded executor bean, @Async("executorName"), and return CompletableFuture so failures reach the caller.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Name a bounded executor bean, @Async("executorName"), and return CompletableFuture so failures reach the caller.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringAsyncExecutor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springbeancollectionstate"></a>

### `pmd/SpringBeanCollectionState`

Fill a plain collection of a shared singleton bean only at startup (the constructor, @PostConstruct or afterPropertiesSet) and keep it as Map.copyOf or List.copyOf, or use a ConcurrentHashMap or a cache (@Cacheable). Changed after startup, request threads would write to it at once.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Fill a plain collection of a shared singleton bean only at startup (the constructor, an init block, @PostConstruct or afterPropertiesSet) and keep it read-only (toMap(), toList()), or use a ConcurrentHashMap or a cache (@Cacheable). Changed after startup, request threads would write to it at once.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringBeanCollectionState","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springcomposedmapping"></a>

### `pmd/SpringComposedMapping`

Use @GetMapping, @PostMapping, @PutMapping, @PatchMapping or @DeleteMapping on methods. @RequestMapping belongs only on the class, for the path prefix.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Use @GetMapping, @PostMapping, @PutMapping, @PatchMapping or @DeleteMapping on functions. @RequestMapping belongs only on the class, for the path prefix.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringComposedMapping","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springconstructorinjection"></a>

### `pmd/SpringConstructorInjection`

Inject through the constructor into private final fields. Do not put @Autowired, @Inject, @Resource or @Value on fields or setters.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Inject through the primary constructor into private val properties. Do not put @Autowired, @Inject, @Resource or @Value on properties, lateinit vars or setter functions, and drop @Autowired from the only constructor.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringConstructorInjection","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springcorswildcard"></a>

### `pmd/SpringCorsWildcard`

List the allowed origins from configuration instead of "\*" when credentials are allowed; any site could then call this API as the signed-in user.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** List the allowed origins from configuration instead of "\*" when credentials are allowed; any site could then call this API as the signed-in user.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringCorsWildcard","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springcsrfdisabled"></a>

### `pmd/SpringCsrfDisabled`

Keep CSRF protection on for session-based security. Turn it off only for a stateless API, in the same filter chain: SessionCreationPolicy.STATELESS or a NullSecurityContextRepository on servlet security, NoOpServerSecurityContextRepository on WebFlux, or oauth2ResourceServer with jwt or opaqueToken and every login form disabled.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Keep CSRF protection on for session-based security. Turn it off only for a stateless API, in the same filter chain: SessionCreationPolicy.STATELESS or a NullSecurityContextRepository on servlet security, NoOpServerSecurityContextRepository on WebFlux, or oauth2ResourceServer with jwt or opaqueToken and every login form disabled.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringCsrfDisabled","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springdatabatchofone"></a>

### `pmd/SpringDataBatchOfOne`

Collect the entities of the whole loop and call saveAll or deleteAll once. Calling it with a one-element list on each iteration is still one write per entity.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Collect the entities of the whole loop and call saveAll or deleteAll once. Calling it with a one-element list on each iteration is still one write per entity.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringDataBatchOfOne","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springdataderivedquery"></a>

### `pmd/SpringDataDerivedQuery`

Write this repository method with @Query (JPQL in a text block for JPA), naming the entity and every condition, instead of a query derived from the method name.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Write this repository function with @Query (JPQL in a raw string for JPA), naming the entity and every condition, instead of a query derived from the function name.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringDataDerivedQuery","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springdatafilterinquery"></a>

### `pmd/SpringDataFilterInQuery`

Filter and count in the database, with an @Query that has a where clause, a count query or an exists query, instead of loading the whole table with findAll().

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Filter and count in the database, with an @Query that has a where clause, a count query or an exists query, instead of loading the whole table with findAll().
- **Exception:** If this is intended, add `{"rule":"pmd/SpringDataFilterInQuery","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springdatamodifyingquery"></a>

### `pmd/SpringDataModifyingQuery`

Write @Modifying(clearAutomatically = true, flushAutomatically = true), so pending changes are flushed first and no stale entities stay in the persistence context.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Write @Modifying(clearAutomatically = true, flushAutomatically = true), so pending changes are flushed first and no stale entities stay in the persistence context.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringDataModifyingQuery","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springdatanamedparameters"></a>

### `pmd/SpringDataNamedParameters`

Bind query parameters by name (:email), not by position (?1); positions break silently when parameters are reordered.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Bind query parameters by name (:email), not by position (?1); positions break silently when parameters are reordered.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringDataNamedParameters","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springdatanativequery"></a>

### `pmd/SpringDataNativeQuery`

Write the query in JPQL; native SQL is not checked at startup. If this one needs SQL, mark this method with @SuppressWarnings("PMD.SpringDataNativeQuery"), the only inline suppression nitpicker accepts.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Write the query in JPQL; native SQL is not checked at startup. If this one needs SQL, mark this function with @Suppress("PMD.SpringDataNativeQuery"), the only inline suppression nitpicker accepts.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringDataNativeQuery","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springdatanoflush"></a>

### `pmd/SpringDataNoFlush`

Let the transaction write changes at commit and remove this flush; an early flush defeats JDBC batching and hides ordering bugs.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Let the transaction write changes at commit and remove this flush; an early flush defeats JDBC batching and hides ordering bugs.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringDataNoFlush","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springdatanosaveinloop"></a>

### `pmd/SpringDataNoSaveInLoop`

Collect the entities and call saveAll or deleteAll once, instead of saving or deleting one entity per loop iteration.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Collect the entities and call saveAll or deleteAll once, instead of saving or deleting one entity per loop iteration.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringDataNoSaveInLoop","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springdataquerytextblock"></a>

### `pmd/SpringDataQueryTextBlock`

Write a multi-part query as one text block (""") instead of joining strings with +.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Write a multi-part query as one raw string (""") instead of joining strings with +.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringDataQueryTextBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springdatarowwriteinloop"></a>

### `pmd/SpringDataRowWriteInLoop`

Write one set-based @Query that takes the whole list, for example where id in :ids, and call it once after the loop instead of one repository update or delete per iteration.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Write one set-based @Query that takes the whole list, for example where id in :ids, and call it once after the loop instead of one repository update or delete per iteration.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringDataRowWriteInLoop","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springdatasaveinloophelper"></a>

### `pmd/SpringDataSaveInLoopHelper`

Collect the entities and call saveAll or deleteAll once after the loop; when rows must fail one by one, call saveAll per batch and handle the error per batch. This loop calls a method of this class that saves or deletes one entity, so it still writes once per iteration.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Collect the entities and call saveAll or deleteAll once after the loop; when rows must fail one by one, call saveAll per batch and handle the error per batch. This loop calls a function of this class that saves or deletes one entity, so it still writes once per iteration.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringDataSaveInLoopHelper","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springhardcodeduser"></a>

### `pmd/SpringHardcodedUser`

Load users from a UserDetailsService backed by the database, with passwords hashed by the delegating encoder. Do not put a user password in source code.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Load users from a UserDetailsService backed by the database, with passwords hashed by the delegating encoder. Do not put a user password in source code.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringHardcodedUser","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springhttpclientpercall"></a>

### `pmd/SpringHttpClientPerCall`

Build the HTTP client once, from the injected RestClient.Builder or RestTemplateBuilder, and keep it in a final field or a @Bean. A client built in each call throws away its connection pool.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Build the HTTP client once, from the injected RestClient.Builder or RestTemplateBuilder, and keep it in a private val or a @Bean. A client built in each call throws away its connection pool.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringHttpClientPerCall","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springhttpclienttimeouts"></a>

### `pmd/SpringHttpClientTimeouts`

Build this HTTP client with connect and read timeouts, from the injected RestClient.Builder or RestTemplateBuilder (spring.http.client.\* properties), with a request factory or connector that sets them, or with connectTimeout and readTimeout on the builder; give a Reactor Netty HttpClient a responseTimeout. A client without timeouts waits forever for a slow server.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Build this HTTP client with connect and read timeouts, from the injected RestClient.Builder or RestTemplateBuilder (spring.http.client.\* properties), with a request factory or connector that sets them, or with connectTimeout and readTimeout on the builder; give a Reactor Netty HttpClient a responseTimeout. A client without timeouts waits forever for a slow server.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringHttpClientTimeouts","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springimmutablebeans"></a>

### `pmd/SpringImmutableBeans`

Make this field of a bean final, static fields too. Beans are shared singletons, so keep per-call state in locals.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Make this property of a bean a val. Beans are shared singletons, so keep per-call state in locals.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringImmutableBeans","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springliteconfiguration"></a>

### `pmd/SpringLiteConfiguration`

Write @Configuration(proxyBeanMethods = false) and take dependencies as @Bean method parameters instead of calling other @Bean methods.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Write @Configuration(proxyBeanMethods = false) and take dependencies as @Bean function parameters instead of calling other @Bean functions.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringLiteConfiguration","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springnocomponentscan"></a>

### `pmd/SpringNoComponentScan`

Put the @SpringBootApplication class in the top package and let it scan its own packages; do not add @ComponentScan or scanBasePackages.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Put the @SpringBootApplication class in the top package and let it scan its own packages; do not add @ComponentScan or scanBasePackages.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringNoComponentScan","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springnocrossorigin"></a>

### `pmd/SpringNoCrossOrigin`

Configure CORS once, in a CorsConfigurationSource bean with origins from configuration, instead of @CrossOrigin on controllers.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Configure CORS once, in a CorsConfigurationSource bean with origins from configuration, instead of @CrossOrigin on controllers.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringNoCrossOrigin","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springnoerrorleak"></a>

### `pmd/SpringNoErrorLeak`

Log the exception and return a ProblemDetail with a fixed detail from this @ExceptionHandler. The message or stack trace of a generic, JDK or persistence exception exposes internals; messages of your own exception types are fine.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Log the exception and return a ProblemDetail with a fixed detail from this @ExceptionHandler. The message or stack trace of a generic, JDK or persistence exception exposes internals; messages of your own exception types are fine.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringNoErrorLeak","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springnolazyinjection"></a>

### `pmd/SpringNoLazyInjection`

Remove @Lazy from this injection point. It hides a dependency cycle; break the cycle with a new component or an event instead.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Remove @Lazy from this injection point. It hides a dependency cycle; break the cycle with a new component or an event instead.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringNoLazyInjection","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springnopostconstructio"></a>

### `pmd/SpringNoPostConstructIo`

Move startup work that calls a database or a remote service out of @PostConstruct, afterPropertiesSet or a @Bean initMethod (and the private helpers only they call) into an ApplicationRunner or an @EventListener(ApplicationReadyEvent). These run before the context is ready: there is no transaction around this call, other beans may not be proxied yet, and a failure stops the application from starting.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Move startup work that calls a database or a remote service out of @PostConstruct, afterPropertiesSet or a @Bean initMethod (and the private helpers only they call) into an ApplicationRunner or an @EventListener(ApplicationReadyEvent::class). These run before the context is ready: there is no transaction around this call, other beans may not be proxied yet, and a failure stops the application from starting.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringNoPostConstructIo","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springnorequiresnew"></a>

### `pmd/SpringNoRequiresNew`

Keep the default REQUIRED propagation and drop Propagation.REQUIRES_NEW: each nested transaction holds a second connection and can exhaust the pool under load.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Keep the default REQUIRED propagation and drop Propagation.REQUIRES_NEW: each nested transaction holds a second connection and can exhaust the pool under load.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringNoRequiresNew","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springnoservicelocator"></a>

### `pmd/SpringNoServiceLocator`

Inject the bean you need through the constructor instead of looking it up in the ApplicationContext or BeanFactory. Use ObjectProvider for optional or prototype beans.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Inject the bean you need through the constructor instead of looking it up in the ApplicationContext or BeanFactory. Use ObjectProvider for optional or prototype beans.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringNoServiceLocator","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springnoswallowedtransactionexception"></a>

### `pmd/SpringNoSwallowedTransactionException`

Rethrow a broad or persistence exception caught inside a @Transactional method, or catch it in the caller. Swallowed there, by a catch without throw, it leaves the transaction rollback-only, so the commit fails anyway.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Rethrow a broad or persistence exception caught inside a @Transactional function (throw, error(), getOrThrow(), or a getOrElse, onFailure or fold that throws), or catch it in the caller. Swallowed there, by a catch without throw or a runCatching that never rethrows, it leaves the transaction rollback-only, so the commit fails anyway.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringNoSwallowedTransactionException","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springnotransactionalcontroller"></a>

### `pmd/SpringNoTransactionalController`

Put @Transactional on a service method, not on a controller; a controller transaction spans the whole request and response serialization.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Put @Transactional on a service function, not on a controller; a controller transaction spans the whole request and response serialization.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringNoTransactionalController","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springpasswordencoder"></a>

### `pmd/SpringPasswordEncoder`

Hash passwords with PasswordEncoderFactories.createDelegatingPasswordEncoder(). NoOpPasswordEncoder stores them in plain text, and the MD4, message-digest, LDAP SHA and standard SHA-256 encoders and User.withDefaultPasswordEncoder() are not safe for passwords.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Hash passwords with PasswordEncoderFactories.createDelegatingPasswordEncoder(). NoOpPasswordEncoder stores them in plain text, and the MD4, message-digest, LDAP SHA and standard SHA-256 encoders and User.withDefaultPasswordEncoder() are not safe for passwords.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringPasswordEncoder","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springpermitallanyrequest"></a>

### `pmd/SpringPermitAllAnyRequest`

Name the public paths in requestMatchers(...).permitAll(), or pathMatchers(...).permitAll() on WebFlux, and end with anyRequest().authenticated(), or anyExchange().authenticated(), so a new endpoint is protected by default.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Name the public paths in requestMatchers(...).permitAll() (authorize("/public/\*\*", permitAll) in the Kotlin DSL), or pathMatchers(...).permitAll() on WebFlux, and end with anyRequest().authenticated() (authorize(anyRequest, authenticated)), or anyExchange().authenticated(), so a new endpoint is protected by default.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringPermitAllAnyRequest","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springprofileonconfiguration"></a>

### `pmd/SpringProfileOnConfiguration`

Put @Profile only on a @Configuration class or a @Bean method, so profiles choose beans and never branch business code.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Put @Profile only on a @Configuration class or a @Bean function, so profiles choose beans and never branch business code.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringProfileOnConfiguration","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springproxymethodvisibility"></a>

### `pmd/SpringProxyMethodVisibility`

Make this proxied method public, non-final and non-static, in a non-final class. Spring never proxies final or static methods, and nitpicker keeps proxied methods public.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Make this proxied function public, and let Spring subclass it: apply the kotlin("plugin.spring") compiler plugin (or write open class and open fun), and keep it out of objects and companion objects. Spring never proxies private, final or static functions, and nitpicker keeps proxied functions public.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringProxyMethodVisibility","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springproxyselfcall"></a>

### `pmd/SpringProxySelfCall`

Move the annotated method to another bean and call it there. This call stays inside the class, so it skips the proxy and the called method's annotation does nothing.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Move the annotated function to another bean and call it there. This call stays inside the class, so it skips the proxy and the called function's annotation does nothing.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringProxySelfCall","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springqueryconcatenation"></a>

### `pmd/SpringQueryConcatenation`

Write the query as constant text (a text block) and pass values as bind parameters; for a list of values use NamedParameterJdbcTemplate or JdbcClient with in (:ids). Joining or formatting values into SQL or JPQL allows injection.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringQueryConcatenation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springrestcontroller"></a>

### `pmd/SpringRestController`

Use @RestController for a JSON controller and drop @ResponseBody.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Use @RestController for a JSON controller and drop @ResponseBody.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringRestController","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springscheduledfixeddelay"></a>

### `pmd/SpringScheduledFixedDelay`

Use fixedDelay or cron instead of fixedRate, so a slow run never overlaps the next one.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Use fixedDelay or cron instead of fixedRate, so a slow run never overlaps the next one.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringScheduledFixedDelay","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springtransactionalannotation"></a>

### `pmd/SpringTransactionalAnnotation`

Use org.springframework.transaction.annotation.Transactional. The jakarta and javax annotations have no readOnly or timeout and roll back on different exceptions.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Use org.springframework.transaction.annotation.Transactional. The jakarta and javax annotations have no readOnly or timeout and roll back on different exceptions.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringTransactionalAnnotation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springtransactionalcheckedrollback"></a>

### `pmd/SpringTransactionalCheckedRollback`

Add rollbackFor = Exception.class to this @Transactional, or throw an unchecked exception. A checked exception commits the work done so far instead of rolling it back.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Add rollbackFor = [Exception::class] to this @Transactional, or throw an unchecked exception. Kotlin lets any function throw a checked exception, and a checked exception commits the work done so far instead of rolling it back.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringTransactionalCheckedRollback","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springtransactionalreadonlywrite"></a>

### `pmd/SpringTransactionalReadOnlyWrite`

Put @Transactional without readOnly on this method: a write inside a read-only transaction is skipped or fails.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Put @Transactional without readOnly on this function: a write inside a read-only transaction is skipped or fails.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringTransactionalReadOnlyWrite","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springtypedconfiguration"></a>

### `pmd/SpringTypedConfiguration`

Read configuration through a @ConfigurationProperties record and pass the values in through constructors or parameters, not @Value, System.getenv, System.getProperty or Environment.getProperty. JVM properties such as java.\*, user.\*, javax.\*, jdk.\* and http.\* are fine.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Read configuration through a @ConfigurationProperties data class and pass the values in through constructors or parameters, not @Value, System.getProperty or Environment.getProperty. JVM properties such as java.\*, user.\*, javax.\*, jdk.\* and http.\* are fine.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringTypedConfiguration","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springtypedrequestbody"></a>

### `pmd/SpringTypedRequestBody`

Bind this @RequestBody to a record with validation annotations, not to Object, JsonNode, Map\<String, Object> or a list of those. Untyped payloads skip validation and allow mass assignment. A Map with typed values, such as Map\<String, String>, is fine.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Bind this @RequestBody to a data class with validation annotations, not to Any, JsonNode, Map\<String, Any> or a list of those. Untyped payloads skip validation and allow mass assignment. A Map with typed values, such as Map\<String, String>, is fine.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringTypedRequestBody","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springtypedresponse"></a>

### `pmd/SpringTypedResponse`

Return a record or a specific type from this handler, never Object, JsonNode, Map\<String, Object>, ResponseEntity\<?>, a list or Optional of those, or null. For no body return void or ResponseEntity\<Void>, and for an error throw an exception that a @RestControllerAdvice maps to a ProblemDetail.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Return a data class or a specific type from this handler, never Any, JsonNode, Map\<String, Any>, ResponseEntity\<\*>, a list or Mono of those, or null. For no body return Unit or ResponseEntity\<Void>, and for an error throw an exception that a @RestControllerAdvice maps to a ProblemDetail.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringTypedResponse","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springunusedcontext"></a>

### `pmd/SpringUnusedContext`

A `@SpringBootTest` class (no superclass, no `RANDOM_PORT` or `DEFINED_PORT`, also static-imported, no type-level `@MockBean`, `@MockitoBean`, `@SpyBean` or `@MockitoSpyBean`) with a non-empty test method that injects nothing: no `@Autowired`, `@Inject`, `@Resource`, `@Value`, `@MockBean`/`@MockitoBean`/`@SpyBean`/`@TestBean` or server port field, parameter or setter, no `MockMvc`, `WebTestClient`, `TestRestTemplate`, `ApplicationContext`, `CapturedOutput` or `ApplicationEvents`, no constructor parameters, Lombok's `@AllArgsConstructor` with an instance field or `@RequiredArgsConstructor` with a `final` or `@NonNull` field counted as one (JUnit can only call such a constructor when Spring autowires it, through `@TestConstructor(autowireMode = ALL)`, `spring.test.constructor.autowire.mode=all` or an `@Autowired` constructor, so the class needs no check of how).

- **Scope:** Test sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** This @SpringBootTest starts the whole application context but uses nothing from it: no injected or mock bean, no MockMvc, WebTestClient, TestRestTemplate, CapturedOutput or ApplicationEvents, and no web server port. Make it a unit test that creates the class with new, or use a slice such as @WebMvcTest for one layer; @SpringBootTest is for integration and component tests.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringUnusedContext","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springvalidrequestbody"></a>

### `pmd/SpringValidRequestBody`

Add @Valid to this @RequestBody; without it the record's constraints are never checked.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Add @Valid to this @RequestBody; without it the data class's constraints are never checked.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringValidRequestBody","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springvaluesecretdefault"></a>

### `pmd/SpringValueSecretDefault`

Read this secret without a default, so a missing value fails at startup; a secret with a built-in fallback ships to production unnoticed.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Message in Kotlin:** Read this secret without a default, so a missing value fails at startup; a secret with a built-in fallback ships to production unnoticed.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringValueSecretDefault","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-staticejbfieldshouldbefinal"></a>

### `pmd/StaticEJBFieldShouldBeFinal`

According to the J2EE specification, an EJB should not have any static fields with write access.

- **Why it is on:** However, static read-only fields are allowed. This ensures proper behavior especially when instances are distributed by the container on several JREs.
- **Allowed form:** Make the static field in the EJB final; keep per-call state in locals or a stateful bean field.
- **Exception:** If this is intended, add `{"rule":"pmd/StaticEJBFieldShouldBeFinal","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#staticejbfieldshouldbefinal)

<a id="pmd-staticforwardingwrapper"></a>

### `pmd/StaticForwardingWrapper`

In main sources: a static method with parameters whose body only passes them, in order, to another static or same-class method (`return Prices.sum(a, b);`).

- **Scope:** Main sources only.
- **Why it is on:** A PMD rule nitpicker defines: it names one allowed form where the language offers several, and reports the other forms.
- **Allowed form:** This static method only passes its parameters, in order, to another method. Call that method directly where this one is used and delete the wrapper. Factories named of or from and copies such as List.copyOf are allowed.
- **Exception:** If this is intended, add `{"rule":"pmd/StaticForwardingWrapper","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-stringbufferinstantiationwithchar"></a>

### `pmd/StringBufferInstantiationWithChar`

Individual character values provided as initialization arguments will be converted into integers.

- **Why it is on:** This can lead to internal buffer sizes that are larger than expected.
- **Allowed form:** Pass a String (new StringBuilder("a")), since new StringBuilder('a') sets a capacity of 97 and an empty buffer.
- **Exception:** If this is intended, add `{"rule":"pmd/StringBufferInstantiationWithChar","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#stringbufferinstantiationwithchar)

<a id="pmd-stringinstantiation"></a>

### `pmd/StringInstantiation`

Avoid instantiating String objects; this is usually unnecessary since they are immutable and can be safely shared.

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Use the String itself instead of new String(s); for a StringBuilder or StringBuffer, call sb.toString().
- **Exception:** If this is intended, add `{"rule":"pmd/StringInstantiation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_performance.html#stringinstantiation)

<a id="pmd-stringtostring"></a>

### `pmd/StringToString`

Avoid calling toString() on objects already known to be string instances; this is unnecessary.

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Delete the toString() call; the value is already a String.
- **Exception:** If this is intended, add `{"rule":"pmd/StringToString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_performance.html#stringtostring)

<a id="pmd-suspiciousequalsmethodname"></a>

### `pmd/SuspiciousEqualsMethodName`

The method name and parameter number are suspiciously close to `Object.equals`, which can denote an intention to override it.

- **Why it is on:** However, the method does not override `Object.equals`, but overloads it instead. Overloading `Object.equals` method is confusing for other programmers, error-prone and hard to maintain, especially when using inheritance, because `@Override` annotations used in subclasses can provide a false sense of security. For more information on `Object.equals` method, see Effective Java, 3rd Edition, Item 10: Obey the general contract when overriding equals.
- **Allowed form:** Rename the method to equals(Object) if it is meant to override, or to a different name; fix the parameter type to Object.
- **Exception:** If this is intended, add `{"rule":"pmd/SuspiciousEqualsMethodName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#suspiciousequalsmethodname)

<a id="pmd-suspicioushashcodemethodname"></a>

### `pmd/SuspiciousHashcodeMethodName`

The method name and return type are suspiciously close to hashCode(), which may denote an intention to override the hashCode() method.

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Rename the method to hashCode() if it is meant to override, or to a name that is not close to hashCode.
- **Exception:** If this is intended, add `{"rule":"pmd/SuspiciousHashcodeMethodName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#suspicioushashcodemethodname)

<a id="pmd-suspiciousoctalescape"></a>

### `pmd/SuspiciousOctalEscape`

A suspicious octal escape sequence was found inside a String literal.

- **Why it is on:** The Java language specification (section 3.10.6) says an octal escape sequence inside a literal String shall consist of a backslash followed by: OctalDigit | OctalDigit OctalDigit | ZeroToThree OctalDigit OctalDigit Any octal escape sequence followed by non-octal digits can be confusing, e.g. "\038" is interpreted as the octal escape sequence "\03" followed by the literal character "8".
- **Allowed form:** Write the character as a unicode escape (\u0008) or a three-digit octal escape so the digits are not read together.
- **Exception:** If this is intended, add `{"rule":"pmd/SuspiciousOctalEscape","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#suspiciousoctalescape)

<a id="pmd-switchstmtsshouldhavedefault"></a>

### `pmd/SwitchStmtsShouldHaveDefault`

Switch statements should be exhaustive, to make their control flow easier to follow.

- **Why it is on:** This can be achieved by adding a `default` case, or, if the switch is on an enum type, by ensuring there is one switch branch for each enum constant. This rule doesn't consider Switch Statements, that use Pattern Matching, since for these the compiler already ensures that all cases are covered. The same is true for Switch Expressions, which are also not considered by this rule.
- **Allowed form:** Make it an exhaustive switch expression, or add a default branch that throws IllegalStateException.
- **Exception:** If this is intended, add `{"rule":"pmd/SwitchStmtsShouldHaveDefault","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#nonexhaustiveswitch)

<a id="pmd-systemprintln"></a>

### `pmd/SystemPrintln`

References to System.(out|err).print are usually intended for debugging purposes and can remain in the codebase even in production code.

- **Why it is on:** By using a logger one can enable/disable this behaviour at will (and by priority) and avoid clogging the Standard out log.
- **Allowed form:** Write through a logger, or take a PrintStream as a parameter so callers choose the stream.
- **Exception:** If this is intended, add `{"rule":"pmd/SystemPrintln","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#systemprintln)

<a id="pmd-taskoutlivestryresource"></a>

### `pmd/TaskOutlivesTryResource`

In main and test sources: a task started inside a try-with-resources block that uses a resource of that try, with nothing waiting for it after it starts and unconditionally before the block ends: `submit`, `execute` or `schedule*` on an `Executor` or `CompletionService`, `Timer.schedule*`, `CompletableFuture.supplyAsync`/`runAsync`, `thenXxxAsync`, `Thread.startVirtualThread`, `new Thread(...).start()` or `Thread.ofVirtual().start(...)`, whose lambda, method reference, anonymous class or task constructor argument reads the resource, when the result is discarded, returned or kept in a variable nothing reads. The message names the call that started the task.

- **Scope:** Main and test sources.
- **Why it is on:** A PMD rule nitpicker defines: it names one allowed form where the language offers several, and reports the other forms.
- **Allowed form:** The task started by {0}() reads a resource of its try-with-resources, but nothing waits for it after it starts, unconditionally, before the block ends, so the resource is closed while the task can still run. Wait inside the block: get() or join() on the future, awaitTermination or close on the executor, take() or a timed poll() on its CompletionService, await() on a latch or barrier, or declare the executor as a later resource of the same try so it closes first and waits. Or open the resource inside the task.
- **Exception:** If this is intended, add `{"rule":"pmd/TaskOutlivesTryResource","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-testclasswithouttestcases"></a>

### `pmd/TestClassWithoutTestCases`

Test classes typically end with the suffix "Test", "Tests" or "TestCase".

- **Why it is on:** Having a non-test class with that name is not a good practice, since most people will assume it is a test case. Test classes have test methods named "testXXX" (JUnit3) or use annotations (e.g. `@Test`). The suffix can be configured using the property `testClassPattern`. To disable the detection of possible test classes by name, set this property to an empty string.
- **Allowed form:** Add @Test methods to the class, or rename it if it is a helper (for example TestInputGenerator becomes InputGenerator).
- **Exception:** If this is intended, add `{"rule":"pmd/TestClassWithoutTestCases","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#testclasswithouttestcases)

<a id="pmd-toofewbranchesforaswitchstatement"></a>

### `pmd/TooFewBranchesForASwitchStatement`

Switch statements are intended to be used to support complex branching behaviour.

- **Why it is on:** Using a switch for only a few cases is ill-advised, since switches are not as easy to understand as if-else statements. In these cases use the if-else statement to increase code readability. Note: This rule was named TooFewBranchesForASwitchStatement before PMD 7.7.0.
- **Allowed form:** Write the decision as an if/else instead of a switch with fewer than three branches.
- **Exception:** If this is intended, add `{"rule":"pmd/TooFewBranchesForASwitchStatement","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_performance.html#toofewbranchesforswitch)

<a id="pmd-tristateboolean"></a>

### `pmd/TriStateBoolean`

In main sources: a boxed `Boolean` (not `Boolean` inside `Optional<...>`, `List<...>` or another type argument) as a method or constructor parameter, a method return type, a field or a record component. Methods with `@Override` are skipped, and so is data mapped from outside: a parameter, field or record component annotated `@RequestParam`, `@RequestBody`, `@RequestHeader`, `@PathVariable`, `@JsonProperty`, `@Column` or `@Field`, and a field of a class annotated `@Entity`, `@Embeddable`, `@MappedSuperclass` or `@Document`.

- **Scope:** Main sources only.
- **Why it is on:** A PMD rule nitpicker defines: it names one allowed form where the language offers several, and reports the other forms.
- **Allowed form:** A boxed Boolean can be true, false or null, so this has three states that the type does not name. Use an enum that names each state (Mode.ON, Mode.OFF, Mode.AUTO), or a primitive boolean when absence means nothing.
- **Exception:** If this is intended, add `{"rule":"pmd/TriStateBoolean","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-unboundedfanout"></a>

### `pmd/UnboundedFanOut`

In main sources: a stream `map`/`forEach`/`flatMap` lambda (also a `this::helper` reference), an enhanced `for`, or an indexed `for` up to `size()`/`length` over a collection, whose element work starts a task that makes a remote or message call: `CompletableFuture.supplyAsync`/`runAsync` on the default pool or a cached, per-task or virtual-thread executor, `submit`/`execute`/`invokeAll`/`invokeAny` on such an executor, `Thread.startVirtualThread`, `Thread.ofVirtual().start`, `new Thread(...).start()`, or `HttpClient.sendAsync`.

- **Scope:** Main sources only.
- **Why it is on:** A PMD rule nitpicker defines: it names one allowed form where the language offers several, and reports the other forms.
- **Allowed form:** This loop or stream starts a remote or message call on a new task for every element of a collection at once, so a large collection exhausts the connections or rate limit of the remote service. Run the tasks on a fixed pool (Executors.newFixedThreadPool(8) passed to supplyAsync or used for submit), take a Semaphore permit around each call, or work through fixed-size batches (Lists.partition(items, 20)). An exception fits only when the collection is always small.
- **Exception:** If this is intended, add `{"rule":"pmd/UnboundedFanOut","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-unconditionalifstatement"></a>

### `pmd/UnconditionalIfStatement`

Do not use "if" statements whose conditionals are always true or always false.

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Delete the if with a constant true or false condition and keep only the branch that runs.
- **Exception:** If this is intended, add `{"rule":"pmd/UnconditionalIfStatement","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#unconditionalifstatement)

<a id="pmd-unittestshouldincludeassert"></a>

### `pmd/UnitTestShouldIncludeAssert`

Unit tests should include at least one assertion.

- **Why it is on:** This makes the tests more robust, and using assert with messages provide the developer a clearer idea of what the test does. This rule checks for JUnit (3, 4 and 5) and TestNG Tests. Note: This rule was named JUnitTestsShouldIncludeAssert before PMD 7.7.0.
- **Allowed form:** Assert on the result, e.g. assertThat(actual).isEqualTo(expected), or use assertThrows for an expected failure.
- **Exception:** If this is intended, add `{"rule":"pmd/UnitTestShouldIncludeAssert","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#unittestshouldincludeassert)

<a id="pmd-unittestshoulduseafterannotation"></a>

### `pmd/UnitTestShouldUseAfterAnnotation`

This rule detects methods called `tearDown()` that are not properly annotated as a cleanup method.

- **Why it is on:** This is primarily intended to assist in upgrading from JUnit 3, where tear down methods were required to be called `tearDown()`. To a lesser extent, this may help detect omissions even under newer JUnit versions or under TestNG, as long as you are following this convention to name the methods. \* JUnit 4 will only execute methods annotated with `@After` after running each test. \* JUnit 5 introduced `@AfterEach` and `@AfterAll` annotations to execute methods after each test or after all tests in the class, respectively. \* TestNG provides the annotations `@AfterMethod` and `@AfterClass` to execute methods after each test or after tests in the class, respectively. Note: This rule was named JUnit4TestShouldUseAfterAnnotation before PMD 7.7.0.
- **Allowed form:** Annotate the cleanup method with @AfterEach (or @AfterAll on a static method) or it never runs.
- **Exception:** If this is intended, add `{"rule":"pmd/UnitTestShouldUseAfterAnnotation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#unittestshoulduseafterannotation)

<a id="pmd-unittestshouldusebeforeannotation"></a>

### `pmd/UnitTestShouldUseBeforeAnnotation`

This rule detects methods called `setUp()` that are not properly annotated as a setup method.

- **Why it is on:** This is primarily intended to assist in upgrading from JUnit 3, where setup methods were required to be called `setUp()`. To a lesser extent, this may help detect omissions even under newer JUnit versions or under TestNG, as long as you are following this convention to name the methods. \* JUnit 4 will only execute methods annotated with `@Before` before all tests. \* JUnit 5 introduced `@BeforeEach` and `@BeforeAll` annotations to execute methods before each test or before all tests in the class, respectively. \* TestNG provides the annotations `@BeforeMethod` and `@BeforeClass` to execute methods before each test or before tests in the class, respectively. Note: This rule was named JUnit4TestShouldUseBeforeAnnotation before PMD 7.7.0.
- **Allowed form:** Annotate the setup method with @BeforeEach (or @BeforeAll on a static method) or it never runs.
- **Exception:** If this is intended, add `{"rule":"pmd/UnitTestShouldUseBeforeAnnotation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#unittestshouldusebeforeannotation)

<a id="pmd-unittestshouldusetestannotation"></a>

### `pmd/UnitTestShouldUseTestAnnotation`

The rule will detect any test method starting with "test" that is not properly annotated, and will therefore not be run.

- **Why it is on:** In JUnit 4, only methods annotated with the `@Test` annotation are executed. In JUnit 5, one of the following annotations should be used for tests: `@Test`, `@RepeatedTest`, `@TestFactory`, `@TestTemplate` or `@ParameterizedTest`. In TestNG, only methods annotated with the `@Test` annotation are executed. Note: This rule was named JUnit4TestShouldUseTestAnnotation before PMD 7.7.0.
- **Allowed form:** Annotate the method with @Test (or @ParameterizedTest) so JUnit runs it, or rename it if it is a helper.
- **Exception:** If this is intended, add `{"rule":"pmd/UnitTestShouldUseTestAnnotation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#unittestshouldusetestannotation)

<a id="pmd-unnecessarybooleanassertion"></a>

### `pmd/UnnecessaryBooleanAssertion`

A JUnit test assertion with a boolean literal is unnecessary since it always will evaluate to the same thing.

- **Why it is on:** Consider using flow control (in case of `assertTrue(false)` or similar) or simply removing statements like `assertTrue(true)` and `assertFalse(false)`. If you just want a test to halt after finding an error, use the `fail()` method and provide an indication message of why it did.
- **Allowed form:** Delete assertTrue(true) and assertFalse(false) style calls, and assert on a real value of the code under test.
- **Exception:** If this is intended, add `{"rule":"pmd/UnnecessaryBooleanAssertion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#unnecessarybooleanassertion)

<a id="pmd-unnecessarycasechange"></a>

### `pmd/UnnecessaryCaseChange`

Using equalsIgnoreCase() is faster than using toUpperCase/toLowerCase().equals().

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Use equalsIgnoreCase in place of toUpperCase().equals(...) or toLowerCase().equals(...).
- **Exception:** If this is intended, add `{"rule":"pmd/UnnecessaryCaseChange","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#unnecessarycasechange)

<a id="pmd-unnecessaryconversiontemporary"></a>

### `pmd/UnnecessaryConversionTemporary`

Avoid the use temporary objects when converting primitives to Strings.

- **Why it is on:** Use the static conversion methods on the wrapper classes instead.
- **Allowed form:** Call the conversion on the value directly (Integer.toString(i), String.valueOf(i)) instead of building a wrapper object first.
- **Exception:** If this is intended, add `{"rule":"pmd/UnnecessaryConversionTemporary","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#unnecessaryconversiontemporary)

<a id="pmd-unnecessaryvarargsarraycreation"></a>

### `pmd/UnnecessaryVarargsArrayCreation`

Reports explicit array creation when a varargs is expected.

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Pass the elements directly: Arrays.asList("a", "b") instead of wrapping them in new String[] { ... }.
- **Exception:** If this is intended, add `{"rule":"pmd/UnnecessaryVarargsArrayCreation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#unnecessaryvarargsarraycreation)

<a id="pmd-unsynchronizedstaticformatter"></a>

### `pmd/UnsynchronizedStaticFormatter`

Instances of `java.text.Format` are generally not synchronized.

- **Why it is on:** Sun recommends using separate format instances for each thread. If multiple threads must access a static formatter, the formatter must be synchronized on block level.
- **Allowed form:** Format dates with a static final DateTimeFormatter; create any other Format (DecimalFormat, MessageFormat) as a local where it is used.
- **Exception:** If this is intended, add `{"rule":"pmd/UnsynchronizedStaticFormatter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_multithreading.html#unsynchronizedstaticformatter)

<a id="pmd-unusedassignment"></a>

### `pmd/UnusedAssignment`

Reports assignments to variables that are never used before the variable is overwritten, or goes out of scope.

- **Why it is on:** Unused assignments are those for which 1. The variable is never read after the assignment, or 2. The assigned value is always overwritten by other assignments before the next read of the variable. The rule tracks assignements to fields of `this`, and static fields of the current class. This may cause some false positives in timing-sensitive concurrent code, which the rule cannot detect. The rule may be suppressed with the standard `@SuppressWarnings("unused")` tag. The rule subsumes {% rule "UnusedLocalVariable" %}, and {% rule "UnusedFormalParameter" %}. Those violations are filtered out by default, in case you already have enabled those rules, but may be enabled with the property `reportUnusedVariables`. Variables whose name starts with `ignored` or `unused` are filtered out, as is standard practice for exceptions. Limitations: \* The rule currently cannot know which method calls throw exceptions, or which exceptions they throw. In the body of a try block, every method or constructor call is assumed to throw. This may cause false-negatives. The only other language construct that is assumed to throw is the `throw` statement, in particular, things like `assert` statements, or NullPointerExceptions on dereference are ignored. \* The rule cannot resolve assignments across constructors, when they're called with the special `this(...)` syntax. This may cause false-negatives. Both of those limitations may be partly relaxed in PMD 7.
- **Allowed form:** Remove the assignment, or use the value; drop the initializer when every path assigns before reading.
- **Exception:** If this is intended, add `{"rule":"pmd/UnusedAssignment","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#unusedassignment)

<a id="pmd-unusedformalparameter"></a>

### `pmd/UnusedFormalParameter`

Reports parameters of methods and constructors that are not referenced them in the method body.

- **Why it is on:** Parameters whose name starts with `ignored` or `unused` are filtered out. Removing unused formal parameters from public methods could cause a ripple effect through the code base. Hence, by default, this rule only considers private methods. To include non-private methods, set the `checkAll` property to `true`.
- **Allowed form:** Remove the parameter and update the callers, or use it in the method body.
- **Exception:** If this is intended, add `{"rule":"pmd/UnusedFormalParameter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#unusedformalparameter)

<a id="pmd-unusedlocalvariable"></a>

### `pmd/UnusedLocalVariable`

Detects when a local variable is declared and/or assigned, but not used.

- **Why it is on:** Variables whose name starts with `ignored` or `unused` are filtered out.
- **Allowed form:** Remove the variable, or use it; keep the call's side effect as a plain statement.
- **Exception:** If this is intended, add `{"rule":"pmd/UnusedLocalVariable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#unusedlocalvariable)

<a id="pmd-unusednullcheckinequals"></a>

### `pmd/UnusedNullCheckInEquals`

After checking an object reference for null, you should invoke equals() on that object rather than passing it to another object's equals() method.

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Call equals on the value you just null-checked, a != null && a.equals(other), or drop the check and use Objects.equals(a, other).
- **Exception:** If this is intended, add `{"rule":"pmd/UnusedNullCheckInEquals","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#unusednullcheckinequals)

<a id="pmd-unusedprivatefield"></a>

### `pmd/UnusedPrivateField`

Detects when a private field is declared and/or assigned a value, but not used.

- **Why it is on:** Since PMD 6.50.0 private fields are ignored, if the fields are annotated with any annotation or the enclosing class has any annotation. Annotations often enable a framework (such as dependency injection, mocking or e.g. Lombok) which use the fields by reflection or other means. This usage can't be detected by static code analysis. Previously these frameworks where explicitly allowed by listing their annotations in the property "ignoredAnnotations", but that turned out to be prone of false positive for any not explicitly considered framework.
- **Allowed form:** Remove the field, or use it.
- **Exception:** If this is intended, add `{"rule":"pmd/UnusedPrivateField","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#unusedprivatefield)

<a id="pmd-unusedprivatemethod"></a>

### `pmd/UnusedPrivateMethod`

Unused Private Method detects when a private method is declared but is unused.

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Remove the method, or call it.
- **Exception:** If this is intended, add `{"rule":"pmd/UnusedPrivateMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#unusedprivatemethod)

<a id="pmd-usearraylistinsteadofvector"></a>

### `pmd/UseArrayListInsteadOfVector`

ArrayList is a much better Collection implementation than Vector if thread-safe operation is not required.

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Use new ArrayList\<>() instead of new Vector\<>().
- **Exception:** If this is intended, add `{"rule":"pmd/UseArrayListInsteadOfVector","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_performance.html#usearraylistinsteadofvector)

<a id="pmd-usearraysaslist"></a>

### `pmd/UseArraysAsList`

The `java.util.Arrays` class has a `asList()` method that should be used when you want to create a new List from an array of objects.

- **Why it is on:** It is faster than executing a loop to copy all the elements of the array one by one. Note that the result of `Arrays.asList()` is backed by the specified array, changes in the returned list will result in the array to be modified. For that reason, it is not possible to add new elements to the returned list of `Arrays.asList()` (UnsupportedOperationException). You must use `new ArrayList<>(Arrays.asList(...))` if that is inconvenient for you (e.g. because of concurrent access).
- **Allowed form:** Replace the loop with Collections.addAll(target, array).
- **Exception:** If this is intended, add `{"rule":"pmd/UseArraysAsList","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_performance.html#usearraysaslist)

<a id="pmd-usecollectionisempty"></a>

### `pmd/UseCollectionIsEmpty`

The isEmpty() method on java.util.Collection is provided to determine if a collection has any elements.

- **Why it is on:** Comparing the value of size() to 0 does not convey intent as well as the isEmpty() method.
- **Allowed form:** Call isEmpty() or !isEmpty() instead of comparing size() with 0 or 1.
- **Exception:** If this is intended, add `{"rule":"pmd/UseCollectionIsEmpty","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#usecollectionisempty)

<a id="pmd-usecorrectexceptionlogging"></a>

### `pmd/UseCorrectExceptionLogging`

To make sure the full stacktrace is printed out, use the logging statement with two arguments: a String and a Throwable.

- **Why it is on:** This rule only applies to [Apache Commons Logging](https://commons.apache.org/proper/commons-logging/).
- **Allowed form:** Pass the exception as the last argument (log.error("msg", e)), not as e.getMessage() or a placeholder value.
- **Exception:** If this is intended, add `{"rule":"pmd/UseCorrectExceptionLogging","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#usecorrectexceptionlogging)

<a id="pmd-useenumcollections"></a>

### `pmd/UseEnumCollections`

Wherever possible, use `EnumSet` or `EnumMap` instead of `HashSet` and `HashMap` when the keys are of an enum type.

- **Why it is on:** The specialized enum collections are more space- and time-efficient. This rule reports constructor expressions for hash sets or maps whose key type is an enum type.
- **Allowed form:** Create EnumSet.noneOf(Key.class) or new EnumMap\<>(Key.class) instead of a HashSet or HashMap keyed by the enum.
- **Exception:** If this is intended, add `{"rule":"pmd/UseEnumCollections","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#useenumcollections)

<a id="pmd-useequalstocomparestrings"></a>

### `pmd/UseEqualsToCompareStrings`

Using '==' or '!=' to compare strings is only reliable if the interned string (`String#intern()`) is used on both sides.

- **Why it is on:** Use the `equals()` method instead.
- **Allowed form:** Compare strings with "literal".equals(x) or a.equals(b), never == or !=.
- **Exception:** If this is intended, add `{"rule":"pmd/UseEqualsToCompareStrings","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#useequalstocomparestrings)

<a id="pmd-useindexofchar"></a>

### `pmd/UseIndexOfChar`

Use String.indexOf(char) when checking for the index of a single character; it executes faster.

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Pass a single character as a char literal: indexOf('x').
- **Exception:** If this is intended, add `{"rule":"pmd/UseIndexOfChar","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_performance.html#useindexofchar)

<a id="pmd-useiostreamswithapachecommonsfileitem"></a>

### `pmd/UseIOStreamsWithApacheCommonsFileItem`

Problem: Use of [FileItem.get()](https://javadoc.io/static/commons-fileupload/commons-fileupload/1.5/org/apache/commons/fileupload/FileItem.html#get--) and [FileItem.getString()](https://javadoc.io/static/commons-fileupload/commons-fileupload/1.5/org/apache/commons/fileupload/FileItem.html#getString--) could exhaust memory since they load the entire file into memory.

- **Why it is on:** Solution: Use [FileItem.getInputStream()](https://javadoc.io/static/commons-fileupload/commons-fileupload/1.5/org/apache/commons/fileupload/FileItem.html#getInputStream--) and buffering.
- **Allowed form:** Read the upload through item.getInputStream() instead of get() or getString().
- **Exception:** If this is intended, add `{"rule":"pmd/UseIOStreamsWithApacheCommonsFileItem","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_performance.html#useiostreamswithapachecommonsfileitem)

<a id="pmd-uselessoperationonimmutable"></a>

### `pmd/UselessOperationOnImmutable`

An operation on an immutable object will not change the object itself since the result of the operation is a new object.

- **Why it is on:** Therefore, ignoring the result of such an operation is likely a mistake. The operation can probably be removed. This rule recognizes the types `String`, `BigDecimal`, `BigInteger` or any type from `java.time.*` as immutable.
- **Allowed form:** Assign the result (s = s.trim(), x = x.add(y)) or delete the call, since String and BigDecimal methods return a new value.
- **Exception:** If this is intended, add `{"rule":"pmd/UselessOperationOnImmutable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#uselessoperationonimmutable)

<a id="pmd-uselessstringvalueof"></a>

### `pmd/UselessStringValueOf`

No need to call String.valueOf to append to a string; just use the valueOf() argument directly.

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Delete the String.valueOf call and pass the value itself to + or append.
- **Exception:** If this is intended, add `{"rule":"pmd/UselessStringValueOf","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_performance.html#uselessstringvalueof)

<a id="pmd-uselocalewithcaseconversions"></a>

### `pmd/UseLocaleWithCaseConversions`

When doing `String::toLowerCase()/toUpperCase()` conversions, use an explicit locale argument to specify the case transformation rules.

- **Why it is on:** Using `String::toLowerCase()` without arguments implicitly uses `Locale::getDefault()`. The problem is that the default locale depends on the current JVM setup (and usually on the system in which it is running). Using the system default may be exactly what you want (e.g. if you are manipulating strings you got through standard input), but it may as well not be the case (e.g. if you are getting the string over the network or a file, and the encoding is well-defined and independent of the environment). In the latter case, using the default locale makes the case transformation brittle, as it may yield unexpected results on a machine whose locale has other case translation rules. For example, in Turkish, the uppercase form of `i` is `İ` (U+0130, not ASCII) and not `I` (U+0049) as in English. The rule is intended to force developers to think about locales when dealing with strings. By taking a conscious decision about the choice of locale at the time of writing, you reduce the risk of surprising behaviour down the line, and communicate your intent to future readers.
- **Allowed form:** Pass a locale: s.toUpperCase(Locale.ROOT) or s.toLowerCase(Locale.ROOT).
- **Exception:** If this is intended, add `{"rule":"pmd/UseLocaleWithCaseConversions","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#uselocalewithcaseconversions)

<a id="pmd-usenotifyallinsteadofnotify"></a>

### `pmd/UseNotifyAllInsteadOfNotify`

Thread.notify() awakens a thread monitoring the object.

- **Why it is on:** If more than one thread is monitoring, then only one is chosen. The thread chosen is arbitrary; thus its usually safer to call notifyAll() instead.
- **Allowed form:** Replace wait/notify with a Condition from a private final ReentrantLock: await() in a loop, signalAll().
- **Exception:** If this is intended, add `{"rule":"pmd/UseNotifyAllInsteadOfNotify","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_multithreading.html#usenotifyallinsteadofnotify)

<a id="pmd-useproperclassloader"></a>

### `pmd/UseProperClassLoader`

In J2EE, the getClassLoader() method might not work as expected.

- **Why it is on:** Use Thread.currentThread().getContextClassLoader() instead.
- **Allowed form:** Use Thread.currentThread().getContextClassLoader() instead of calling getClassLoader() on a Class.
- **Exception:** If this is intended, add `{"rule":"pmd/UseProperClassLoader","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_errorprone.html#useproperclassloader)

<a id="pmd-usestandardcharsets"></a>

### `pmd/UseStandardCharsets`

Starting with Java 7, StandardCharsets provides constants for common Charset objects, such as UTF-8.

- **Why it is on:** Using the constants is less error prone, and can provide a small performance advantage compared to `Charset.forName(...)` since no scan across the internal `Charset` caches is needed.
- **Allowed form:** Use StandardCharsets.UTF_8 instead of Charset.forName("UTF-8").
- **Exception:** If this is intended, add `{"rule":"pmd/UseStandardCharsets","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#usestandardcharsets)

<a id="pmd-usestringbufferforstringappends"></a>

### `pmd/UseStringBufferForStringAppends`

The use of the '+=' operator for appending strings causes the JVM to create and use an internal StringBuffer.

- **Why it is on:** If a non-trivial number of these concatenations are being used then the explicit use of a StringBuilder or threadsafe StringBuffer is recommended to avoid this.
- **Allowed form:** Build the text in a local StringBuilder in the loop and call toString() once after it.
- **Exception:** If this is intended, add `{"rule":"pmd/UseStringBufferForStringAppends","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_performance.html#usestringbufferforstringappends)

<a id="pmd-usestringbufferlength"></a>

### `pmd/UseStringBufferLength`

Use StringBuffer.length() to determine StringBuffer length rather than using StringBuffer.toString().equals("") or StringBuffer.toString().length() == ...

- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.
- **Allowed form:** Call sb.length() instead of converting the builder to a String first.
- **Exception:** If this is intended, add `{"rule":"pmd/UseStringBufferLength","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_performance.html#usestringbufferlength)

<a id="pmd-usetrywithresources"></a>

### `pmd/UseTryWithResources`

Java 7 introduced the try-with-resources statement.

- **Why it is on:** This statement ensures that each resource is closed at the end of the statement. It avoids the need of explicitly closing the resources in a finally block. Additionally exceptions are better handled: If an exception occurred both in the `try` block and `finally` block, then the exception from the try block was suppressed. With the `try`-with-resources statement, the exception thrown from the try-block is preserved.
- **Allowed form:** Declare the resource in the try header, try (var in = Files.newInputStream(path)) { ... }, and drop the finally that closes it.
- **Exception:** If this is intended, add `{"rule":"pmd/UseTryWithResources","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#usetrywithresources)

<a id="pmd-usevarargs"></a>

### `pmd/UseVarargs`

Java 5 introduced the varargs parameter declaration for methods and constructors.

- **Why it is on:** This syntactic sugar provides flexibility for users of these methods and constructors, allowing them to avoid having to deal with the creation of an array. Byte arrays in any method and String arrays in `public static void main(String[])` methods are ignored.
- **Allowed form:** Declare the last parameter as varargs: String... names.
- **Exception:** If this is intended, add `{"rule":"pmd/UseVarargs","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#usevarargs)

<a id="pmd-whileloopwithliteralboolean"></a>

### `pmd/WhileLoopWithLiteralBoolean`

`do {} while (true);` requires reading the end of the statement before it is apparent that it loops forever, whereas `while (true) {}` is easier to understand.

- **Why it is on:** `do {} while (false);` is redundant, and if an inner variable scope is required, a block `{}` is sufficient. `while (false) {}` will never execute the block and can be removed in its entirety.
- **Allowed form:** Write do { } while (true) as while (true) { }, replace do { } while (false) with a plain block, and delete a while (false) loop.
- **Exception:** If this is intended, add `{"rule":"pmd/WhileLoopWithLiteralBoolean","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
- **See also:** [PMD rule documentation](https://docs.pmd-code.org/pmd-doc-7.7.0/pmd_rules_java_bestpractices.html#whileloopwithliteralboolean)
