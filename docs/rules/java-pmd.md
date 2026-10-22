# Java and Kotlin: PMD rules

PMD's errorprone and bestpractices categories and the rules nitpicker adds to them, for Java sources in the Java and Kotlin presets, with Gradle and Maven. This page lists 209 rules. [All pages](README.md).

The guide for these rules: [docs/java-preset.md](../java-preset.md).

Unless an entry says otherwise:

- **Presets:** Java and Kotlin
- **Analyzers:** `java` (Java); `kotlin` (Kotlin)
- **Builds:** Gradle and Maven
- **Why it is on:** PMD's errorprone and bestpractices categories run on main and test sources. Each rule names one allowed form of something Java allows several ways, or a defect.

<a id="pmd-abstractclasswithoutabstractmethod"></a>

### `pmd/AbstractClassWithoutAbstractMethod`

Abstract class without abstract method.

- **Allowed form:** Drop abstract if the class is complete, or declare the abstract method; use an interface or sealed interface for a pure contract.
- **Exception:** If this is intended, add `{"rule":"pmd/AbstractClassWithoutAbstractMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-accessorclassgeneration"></a>

### `pmd/AccessorClassGeneration`

Accessor class generation.

- **Allowed form:** Make the constructor package-private, or have callers use a static factory method declared inside the class.
- **Exception:** If this is intended, add `{"rule":"pmd/AccessorClassGeneration","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-accessormethodgeneration"></a>

### `pmd/AccessorMethodGeneration`

Accessor method generation.

- **Allowed form:** Make the member package-private, or move the access into the owning class and call a method there.
- **Exception:** If this is intended, add `{"rule":"pmd/AccessorMethodGeneration","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-arrayisstoreddirectly"></a>

### `pmd/ArrayIsStoredDirectly`

Array is stored directly.

- **Allowed form:** Store a copy: this.items = items.clone(), or take a List and keep List.copyOf(items).
- **Exception:** If this is intended, add `{"rule":"pmd/ArrayIsStoredDirectly","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-assignmentinoperand"></a>

### `pmd/AssignmentInOperand`

Assignment in operand.

- **Allowed form:** Assign in its own statement before the condition; read lines with reader.lines() or for (String line = r.readLine(); line != null; line = r.readLine()).
- **Exception:** If this is intended, add `{"rule":"pmd/AssignmentInOperand","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-assignmenttononfinalstatic"></a>

### `pmd/AssignmentToNonFinalStatic`

Assignment to non final static.

- **Allowed form:** Make it an instance field, or a static final field set once at its declaration; a constructor must never write a static field.
- **Exception:** If this is intended, add `{"rule":"pmd/AssignmentToNonFinalStatic","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-avoidaccessibilityalteration"></a>

### `pmd/AvoidAccessibilityAlteration`

Avoid accessibility alteration.

- **Allowed form:** Call the public API or add a package-private accessor; do not use setAccessible or reflection to reach private members.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidAccessibilityAlteration","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-avoidassertasidentifier"></a>

### `pmd/AvoidAssertAsIdentifier`

Avoid assert as identifier.

- **Allowed form:** Rename the variable, method or class that is called assert, since assert is a keyword in Java 1.4 and later.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidAssertAsIdentifier","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-avoidbranchingstatementaslastinloop"></a>

### `pmd/AvoidBranchingStatementAsLastInLoop`

Avoid branching statement as last in loop.

- **Allowed form:** Delete the trailing break, continue or return that makes the loop run once, or replace the loop with an if or a stream findFirst.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidBranchingStatementAsLastInLoop","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-avoidcallingfinalize"></a>

### `pmd/AvoidCallingFinalize`

Avoid calling finalize.

- **Allowed form:** Delete the finalize() call; release resources with try-with-resources on an AutoCloseable or call close() explicitly.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidCallingFinalize","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-avoidcatchinggenericexception"></a>

### `pmd/AvoidCatchingGenericException`

Avoid catching generic exception.

- **Allowed form:** Catch the specific exception types the call throws, e.g. NumberFormatException, and keep the try around that one call; in a test, use assertThrows.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidCatchingGenericException","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-avoidcatchingnpe"></a>

### `pmd/AvoidCatchingNPE`

Avoid catching npe.

- **Allowed form:** Remove the catch; check for null with Objects.requireNonNull or an if, or fix the code that produces the null.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidCatchingNPE","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-avoidcatchingthrowable"></a>

### `pmd/AvoidCatchingThrowable`

Avoid catching throwable.

- **Allowed form:** Catch the specific exception types the call can throw; let Error and other Throwables propagate.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidCatchingThrowable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-avoiddecimalliteralsinbigdecimalconstructor"></a>

### `pmd/AvoidDecimalLiteralsInBigDecimalConstructor`

Avoid decimal literals in big decimal constructor.

- **Allowed form:** Pass the value as a String, new BigDecimal("0.1"), so it is exact.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidDecimalLiteralsInBigDecimalConstructor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-avoidduplicateliterals"></a>

### `pmd/AvoidDuplicateLiterals`

Avoid duplicate literals.

- **Allowed form:** Extract the repeated string literal into a private static final constant and use the constant everywhere.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidDuplicateLiterals","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-avoidenumasidentifier"></a>

### `pmd/AvoidEnumAsIdentifier`

Avoid enum as identifier.

- **Allowed form:** Rename the identifier called enum, since enum is a keyword since Java 5.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidEnumAsIdentifier","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-avoidfieldnamematchingmethodname"></a>

### `pmd/AvoidFieldNameMatchingMethodName`

Avoid field name matching method name.

- **Allowed form:** Give the field and the method different names, or make the type a record so the accessor and the component are one thing.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidFieldNameMatchingMethodName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-avoidfieldnamematchingtypename"></a>

### `pmd/AvoidFieldNameMatchingTypeName`

Avoid field name matching type name.

- **Allowed form:** Rename the field so it differs from the enclosing class name; name it for its role, not its type.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidFieldNameMatchingTypeName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-avoidinstanceofchecksincatchclause"></a>

### `pmd/AvoidInstanceofChecksInCatchClause`

Avoid instanceof checks in catch clause.

- **Allowed form:** Write one catch clause per exception type, or a multi-catch (catch (A | B e)), instead of testing e with instanceof.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidInstanceofChecksInCatchClause","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-avoidliteralsinifcondition"></a>

### `pmd/AvoidLiteralsInIfCondition`

Avoid literals in if condition.

- **Allowed form:** Compare against a named private static final constant instead of the literal; 0 and -1 are fine.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidLiteralsInIfCondition","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-avoidlosingexceptioninformation"></a>

### `pmd/AvoidLosingExceptionInformation`

Avoid losing exception information.

- **Allowed form:** Delete the call whose result is thrown away, such as a bare e.getMessage();, or use its value; to keep the error, pass e on as the cause.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidLosingExceptionInformation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-avoidmessagedigestfield"></a>

### `pmd/AvoidMessageDigestField`

Avoid message digest field.

- **Allowed form:** Call MessageDigest.getInstance("SHA-256") inside the method that hashes, since MessageDigest is not thread-safe.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidMessageDigestField","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-avoidmultipleunaryoperators"></a>

### `pmd/AvoidMultipleUnaryOperators`

Avoid multiple unary operators.

- **Allowed form:** Delete the repeated unary operators (!!x, - -x, ~~x) or write the intended single operator.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidMultipleUnaryOperators","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-avoidprintstacktrace"></a>

### `pmd/AvoidPrintStackTrace`

Avoid print stack trace.

- **Allowed form:** Log with the logger and pass the exception as the last argument: logger.log(Level.ERROR, "message", e).
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidPrintStackTrace","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-avoidreassigningcatchvariables"></a>

### `pmd/AvoidReassigningCatchVariables`

Avoid reassigning catch variables.

- **Allowed form:** Copy the caught exception into a new local variable and change that instead of the catch parameter.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidReassigningCatchVariables","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-avoidreassigningloopvariables"></a>

### `pmd/AvoidReassigningLoopVariables`

Avoid reassigning loop variables.

- **Allowed form:** Leave the loop variable alone: compute into a separate local, or use a while loop with its own counter when you must skip elements.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidReassigningLoopVariables","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-avoidreassigningparameters"></a>

### `pmd/AvoidReassigningParameters`

Avoid reassigning parameters.

- **Allowed form:** Copy the parameter into a new local variable and change the local.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidReassigningParameters","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-avoidstringbufferfield"></a>

### `pmd/AvoidStringBufferField`

Avoid string buffer field.

- **Allowed form:** Keep the StringBuilder as a local in the method that builds the text and return the String.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidStringBufferField","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-avoidusinghardcodedip"></a>

### `pmd/AvoidUsingHardCodedIP`

Avoid using hard coded ip.

- **Allowed form:** Read the address from configuration or take it as a parameter; for loopback use InetAddress.getLoopbackAddress() or the host name localhost.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidUsingHardCodedIP","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-avoidusingoctalvalues"></a>

### `pmd/AvoidUsingOctalValues`

Avoid using octal values.

- **Allowed form:** Drop the leading zero for a decimal value, or write hex (0x1F), so the number is not read as octal.
- **Exception:** If this is intended, add `{"rule":"pmd/AvoidUsingOctalValues","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-brokennullcheck"></a>

### `pmd/BrokenNullCheck`

Broken null check.

- **Allowed form:** Fix the condition: use && for a != null guard and || for a == null guard, so the null case is checked before the dereference.
- **Exception:** If this is intended, add `{"rule":"pmd/BrokenNullCheck","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-callsuperfirst"></a>

### `pmd/CallSuperFirst`

Call super first.

- **Allowed form:** Call super.onCreate(...) (or the matching super method) as the first statement of the override.
- **Exception:** If this is intended, add `{"rule":"pmd/CallSuperFirst","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-callsuperlast"></a>

### `pmd/CallSuperLast`

Call super last.

- **Allowed form:** Call super.onDestroy(...) (or the matching super method) as the last statement of the override.
- **Exception:** If this is intended, add `{"rule":"pmd/CallSuperLast","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-checkresultset"></a>

### `pmd/CheckResultSet`

Check result set.

- **Allowed form:** Use the boolean result: while (rs.next()) { ... } or if (rs.next()) { ... }, and read columns inside.
- **Exception:** If this is intended, add `{"rule":"pmd/CheckResultSet","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-checkskipresult"></a>

### `pmd/CheckSkipResult`

Check skip result.

- **Allowed form:** Call in.skipNBytes(n), which skips exactly n bytes or throws, instead of skip(n).
- **Exception:** If this is intended, add `{"rule":"pmd/CheckSkipResult","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-classcastexceptionwithtoarray"></a>

### `pmd/ClassCastExceptionWithToArray`

Class cast exception with to array.

- **Allowed form:** Pass a correctly typed array to toArray (list.toArray(new String[0])) or use list.toArray(String[]::new).
- **Exception:** If this is intended, add `{"rule":"pmd/ClassCastExceptionWithToArray","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-clonemethodmustbepublic"></a>

### `pmd/CloneMethodMustBePublic`

Clone method must be public.

- **Allowed form:** Declare clone() public when you override it.
- **Exception:** If this is intended, add `{"rule":"pmd/CloneMethodMustBePublic","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-clonemethodmustimplementcloneable"></a>

### `pmd/CloneMethodMustImplementCloneable`

Clone method must implement cloneable.

- **Allowed form:** Make the class implement Cloneable, or drop clone() and offer a copy constructor or static copy factory.
- **Exception:** If this is intended, add `{"rule":"pmd/CloneMethodMustImplementCloneable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-clonemethodreturntypemustmatchclassname"></a>

### `pmd/CloneMethodReturnTypeMustMatchClassName`

Clone method return type must match class name.

- **Allowed form:** Declare clone() with the enclosing class as its covariant return type so callers need no cast.
- **Exception:** If this is intended, add `{"rule":"pmd/CloneMethodReturnTypeMustMatchClassName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-closeresource"></a>

### `pmd/CloseResource`

Close resource.

- **Allowed form:** Open the resource in a try-with-resources header so it is closed on every path, including exceptions.
- **Exception:** If this is intended, add `{"rule":"pmd/CloseResource","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-compareobjectswithequals"></a>

### `pmd/CompareObjectsWithEquals`

Compare objects with equals.

- **Allowed form:** Compare objects with Objects.equals(a, b) or a.equals(b); use == only for primitives, enums and identity checks on purpose.
- **Exception:** If this is intended, add `{"rule":"pmd/CompareObjectsWithEquals","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-comparisonwithnan"></a>

### `pmd/ComparisonWithNaN`

Comparison with na n.

- **Allowed form:** Test with Double.isNaN(x) or Float.isNaN(x); a comparison with NaN is always false.
- **Exception:** If this is intended, add `{"rule":"pmd/ComparisonWithNaN","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-confusingargumenttovarargsmethod"></a>

### `pmd/ConfusingArgumentToVarargsMethod`

Confusing argument to varargs method.

- **Allowed form:** Pass an explicit array of the right type (new Object[] {x}) or cast the null so the intended varargs call is made.
- **Exception:** If this is intended, add `{"rule":"pmd/ConfusingArgumentToVarargsMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-constantsininterface"></a>

### `pmd/ConstantsInInterface`

Constants in interface.

- **Allowed form:** Move the constants into a final class with a private constructor, or into an enum.
- **Exception:** If this is intended, add `{"rule":"pmd/ConstantsInInterface","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-constructorcallsoverridablemethod"></a>

### `pmd/ConstructorCallsOverridableMethod`

Constructor calls overridable method.

- **Allowed form:** Make the called method private or final, or make the class final, or move the call out of the constructor into a factory.
- **Exception:** If this is intended, add `{"rule":"pmd/ConstructorCallsOverridableMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-defaultlabelnotlastinswitch"></a>

### `pmd/DefaultLabelNotLastInSwitch`

Default label not last in switch.

- **Allowed form:** Move the default label to the end of the switch.
- **Exception:** If this is intended, add `{"rule":"pmd/DefaultLabelNotLastInSwitch","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-defaultlabelnotlastinswitchstmt"></a>

### `pmd/DefaultLabelNotLastInSwitchStmt`

Default label not last in switch stmt.

- **Allowed form:** Move the default label to the end of the switch.
- **Exception:** If this is intended, add `{"rule":"pmd/DefaultLabelNotLastInSwitchStmt","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-detachedtestcase"></a>

### `pmd/DetachedTestCase`

Detached test case.

- **Allowed form:** Annotate the method with @Test so JUnit runs it, or make it private if it is a helper.
- **Exception:** If this is intended, add `{"rule":"pmd/DetachedTestCase","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-donotcallgarbagecollectionexplicitly"></a>

### `pmd/DoNotCallGarbageCollectionExplicitly`

Do not call garbage collection explicitly.

- **Allowed form:** Delete the System.gc() or Runtime.gc() call; let the JVM manage memory, and fix the leak or tune the heap instead.
- **Exception:** If this is intended, add `{"rule":"pmd/DoNotCallGarbageCollectionExplicitly","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-donotextendjavalangthrowable"></a>

### `pmd/DoNotExtendJavaLangThrowable`

Do not extend java lang throwable.

- **Allowed form:** Extend Exception for a checked failure or RuntimeException for an unchecked one.
- **Exception:** If this is intended, add `{"rule":"pmd/DoNotExtendJavaLangThrowable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-donothardcodesdcard"></a>

### `pmd/DoNotHardCodeSDCard`

Do not hard code sd card.

- **Allowed form:** Get the directory from context.getExternalFilesDir(null) or another Context storage method, never a /sdcard path literal.
- **Exception:** If this is intended, add `{"rule":"pmd/DoNotHardCodeSDCard","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-donotterminatevm"></a>

### `pmd/DoNotTerminateVM`

Do not terminate vm.

- **Allowed form:** Return or throw to the caller and let main decide the exit code; only main may call System.exit.
- **Exception:** If this is intended, add `{"rule":"pmd/DoNotTerminateVM","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-donotthrowexceptioninfinally"></a>

### `pmd/DoNotThrowExceptionInFinally`

Do not throw exception in finally.

- **Allowed form:** Move the throw out of finally; keep finally for cleanup only, or use try-with-resources so close errors become suppressed exceptions.
- **Exception:** If this is intended, add `{"rule":"pmd/DoNotThrowExceptionInFinally","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-dontimportsun"></a>

### `pmd/DontImportSun`

Dont import sun.

- **Allowed form:** Use the public java.* or javax.* API instead of a sun.* class, or a supported library for the same job.
- **Exception:** If this is intended, add `{"rule":"pmd/DontImportSun","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-dontusefloattypeforloopindices"></a>

### `pmd/DontUseFloatTypeForLoopIndices`

Dont use float type for loop indices.

- **Allowed form:** Use an int or long loop counter and compute the float value from it inside the body.
- **Exception:** If this is intended, add `{"rule":"pmd/DontUseFloatTypeForLoopIndices","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-doublebraceinitialization"></a>

### `pmd/DoubleBraceInitialization`

Double brace initialization.

- **Allowed form:** Build the collection with List.of, Set.of or Map.of, or create it and call add or put in plain statements.
- **Exception:** If this is intended, add `{"rule":"pmd/DoubleBraceInitialization","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-emptycatchblock"></a>

### `pmd/EmptyCatchBlock`

Empty catch block.

- **Allowed form:** Handle the exception: return a failure value, log it and recover, or rethrow with the cause (throw new IllegalStateException(msg, e)).
- **Exception:** If this is intended, add `{"rule":"pmd/EmptyCatchBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-emptyfinalizer"></a>

### `pmd/EmptyFinalizer`

Empty finalizer.

- **Allowed form:** Delete the empty finalize() method; use try-with-resources or java.lang.ref.Cleaner for cleanup.
- **Exception:** If this is intended, add `{"rule":"pmd/EmptyFinalizer","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-equalsnull"></a>

### `pmd/EqualsNull`

Equals null.

- **Allowed form:** Replace x.equals(null) with x == null.
- **Exception:** If this is intended, add `{"rule":"pmd/EqualsNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-exhaustiveenumpredicate"></a>

### `pmd/ExhaustiveEnumPredicate`

Exhaustive enum predicate.

- **Scope:** Main sources only.
- **Why it is on:** A PMD rule nitpicker defines: it names one allowed form where the language offers several, and reports the other forms.
- **Allowed form:** These comparisons list only some constants of an enum of the project, so a constant added later silently falls into the other case. Classify every constant: a switch expression without default (adding a constant then fails to compile), or a boolean each constant declares (PAID(true)).
- **Exception:** If this is intended, add `{"rule":"pmd/ExhaustiveEnumPredicate","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-finalizedoesnotcallsuperfinalize"></a>

### `pmd/FinalizeDoesNotCallSuperFinalize`

Finalize does not call super finalize.

- **Allowed form:** Delete finalize() and clean up with try-with-resources or Cleaner; if it stays, end it with super.finalize() in a finally.
- **Exception:** If this is intended, add `{"rule":"pmd/FinalizeDoesNotCallSuperFinalize","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-finalizeonlycallssuperfinalize"></a>

### `pmd/FinalizeOnlyCallsSuperFinalize`

Finalize only calls super finalize.

- **Allowed form:** Delete the finalize() override that only calls super.finalize().
- **Exception:** If this is intended, add `{"rule":"pmd/FinalizeOnlyCallsSuperFinalize","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-finalizeoverloaded"></a>

### `pmd/FinalizeOverloaded`

Finalize overloaded.

- **Allowed form:** Rename the overloaded finalize(...) method, or delete finalize and use try-with-resources or Cleaner.
- **Exception:** If this is intended, add `{"rule":"pmd/FinalizeOverloaded","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-finalizeshouldbeprotected"></a>

### `pmd/FinalizeShouldBeProtected`

Finalize should be protected.

- **Allowed form:** Delete finalize() and use try-with-resources or Cleaner; if it stays, declare it protected, not public.
- **Exception:** If this is intended, add `{"rule":"pmd/FinalizeShouldBeProtected","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-fixedsleepintest"></a>

### `pmd/FixedSleepInTest`

Fixed sleep in test.

- **Scope:** Test sources only.
- **Why it is on:** A PMD rule nitpicker defines: it names one allowed form where the language offers several, and reports the other forms.
- **Allowed form:** A fixed wait makes the test slow and flaky: a sleep or parkNanos outside a polling loop, after(ms) with a check that could pass sooner, or pollDelay(...).until(() -> true). Wait on the condition: a loop that checks it against a deadline (a sleep inside that loop is allowed), or verify(mock, timeout(1000)) for a mock. A timed wait, wait(ms) or join(ms), returns early but lets the test go on unchecked when the time runs out: assert the result of join(Duration) or of a latch await. A sleep in a mock answer, a thread body or a test fake that implements or extends a main class is allowed.
- **Exception:** If this is intended, add `{"rule":"pmd/FixedSleepInTest","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-forloopcanbeforeach"></a>

### `pmd/ForLoopCanBeForeach`

For loop can be foreach.

- **Allowed form:** Iterate with for (Item item : items) since the index is only used to read the element.
- **Exception:** If this is intended, add `{"rule":"pmd/ForLoopCanBeForeach","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-forloopvariablecount"></a>

### `pmd/ForLoopVariableCount`

For loop variable count.

- **Allowed form:** Keep one variable in the for header; declare the others before the loop or use a while loop.
- **Exception:** If this is intended, add `{"rule":"pmd/ForLoopVariableCount","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-generatedonhandwrittencode"></a>

### `pmd/GeneratedOnHandWrittenCode`

Generated on hand written code.

- **Scope:** Main and test sources.
- **Why it is on:** A PMD rule nitpicker defines: it names one allowed form where the language offers several, and reports the other forms.
- **Allowed form:** JaCoCo and PIT skip code annotated @Generated, so this is not measured. Remove the annotation from hand-written code.
- **Exception:** If this is intended, add `{"rule":"pmd/GeneratedOnHandWrittenCode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-guardlogstatement"></a>

### `pmd/GuardLogStatement`

Guard log statement.

- **Allowed form:** Pass only constants and locals with {} placeholders; for a computed value pass a Supplier lambda or wrap the call in an isLoggable check.
- **Exception:** If this is intended, add `{"rule":"pmd/GuardLogStatement","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-idempotentoperations"></a>

### `pmd/IdempotentOperations`

Idempotent operations.

- **Allowed form:** Delete the self-assignment (x = x), or assign the value you meant.
- **Exception:** If this is intended, add `{"rule":"pmd/IdempotentOperations","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-implicitswitchfallthrough"></a>

### `pmd/ImplicitSwitchFallThrough`

Implicit switch fall through.

- **Allowed form:** Rewrite the switch in arrow form, case A, B -> ..., which cannot fall through; in a colon-form switch end every case with break, return or throw.
- **Exception:** If this is intended, add `{"rule":"pmd/ImplicitSwitchFallThrough","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-instantiationtogetclass"></a>

### `pmd/InstantiationToGetClass`

Instantiation to get class.

- **Allowed form:** Write the class literal (Foo.class) instead of new Foo().getClass().
- **Exception:** If this is intended, add `{"rule":"pmd/InstantiationToGetClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-invalidlogmessageformat"></a>

### `pmd/InvalidLogMessageFormat`

Invalid log message format.

- **Allowed form:** Make the number of {} placeholders equal to the number of arguments, and pass a Throwable as the last argument only.
- **Exception:** If this is intended, add `{"rule":"pmd/InvalidLogMessageFormat","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-jpaentityclass"></a>

### `pmd/JpaEntityClass`

Jpa entity class.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Make the entity a non-final class. Records and final classes cannot be JPA entities; use records for DTOs.
- **Exception:** If this is intended, add `{"rule":"pmd/JpaEntityClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-jpaenumstring"></a>

### `pmd/JpaEnumString`

Jpa enum string.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Write @Enumerated(EnumType.STRING) on this enum field or element collection, and @MapKeyEnumerated(EnumType.STRING) on a map with enum keys. The default stores the ordinal, so adding or reordering constants silently corrupts stored rows.
- **Exception:** If this is intended, add `{"rule":"pmd/JpaEnumString","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-jpaidentityhashcode"></a>

### `pmd/JpaIdentityHashCode`

Jpa identity hash code.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Return getClass().hashCode() from the hashCode of an entity, or hash an immutable business key; with Lombok, write @EqualsAndHashCode(onlyExplicitlyIncluded = true) and mark that key with @EqualsAndHashCode.Include. A hash of the generated id or of every field changes when the entity is saved, and a hash set then loses it.
- **Exception:** If this is intended, add `{"rule":"pmd/JpaIdentityHashCode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-jpalazyfetching"></a>

### `pmd/JpaLazyFetching`

Jpa lazy fetching.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Write fetch = FetchType.LAZY on every @ManyToOne and @OneToOne (they are eager by default) and never use EAGER; load what a query needs with join fetch.
- **Exception:** If this is intended, add `{"rule":"pmd/JpaLazyFetching","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-jpamanytomanycascade"></a>

### `pmd/JpaManyToManyCascade`

Jpa many to many cascade.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Do not cascade ALL or REMOVE on @ManyToMany: removing one parent deletes rows that other parents still share.
- **Exception:** If this is intended, add `{"rule":"pmd/JpaManyToManyCascade","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-jpamanytomanyset"></a>

### `pmd/JpaManyToManySet`

Jpa many to many set.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Map @ManyToMany as a Set (or a List with @OrderColumn). A plain List makes Hibernate delete and re-insert every join row when one element is removed.
- **Exception:** If this is intended, add `{"rule":"pmd/JpaManyToManySet","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-jpasequenceids"></a>

### `pmd/JpaSequenceIds`

Jpa sequence ids.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Generate ids with GenerationType.SEQUENCE (or UUID). IDENTITY and TABLE ids disable JDBC insert batching.
- **Exception:** If this is intended, add `{"rule":"pmd/JpaSequenceIds","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-jpaversion"></a>

### `pmd/JpaVersion`

Jpa version.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Add a @Version field next to the @Id, so concurrent updates fail instead of overwriting each other. Mark entities that are never updated with @Immutable.
- **Exception:** If this is intended, add `{"rule":"pmd/JpaVersion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-jumbledincrementer"></a>

### `pmd/JumbledIncrementer`

Jumbled incrementer.

- **Allowed form:** Use the loop's own variable in the update clause, and a different variable name in nested loops.
- **Exception:** If this is intended, add `{"rule":"pmd/JumbledIncrementer","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-junit4suitesshouldusesuiteannotation"></a>

### `pmd/JUnit4SuitesShouldUseSuiteAnnotation`

J unit4 suites should use suite annotation.

- **Allowed form:** Declare the suite with JUnit 5 @Suite and @SelectClasses or @SelectPackages instead of a static suite() method.
- **Exception:** If this is intended, add `{"rule":"pmd/JUnit4SuitesShouldUseSuiteAnnotation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-junit4testshoulduseafterannotation"></a>

### `pmd/JUnit4TestShouldUseAfterAnnotation`

J unit4 test should use after annotation.

- **Allowed form:** Annotate the cleanup method with @AfterEach; a method named tearDown does not run on its own.
- **Exception:** If this is intended, add `{"rule":"pmd/JUnit4TestShouldUseAfterAnnotation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-junit4testshouldusebeforeannotation"></a>

### `pmd/JUnit4TestShouldUseBeforeAnnotation`

J unit4 test should use before annotation.

- **Allowed form:** Annotate the setup method with @BeforeEach; a method named setUp does not run on its own.
- **Exception:** If this is intended, add `{"rule":"pmd/JUnit4TestShouldUseBeforeAnnotation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-junit4testshouldusetestannotation"></a>

### `pmd/JUnit4TestShouldUseTestAnnotation`

J unit4 test should use test annotation.

- **Allowed form:** Annotate each test method with @Test; a name starting with test does not make it run.
- **Exception:** If this is intended, add `{"rule":"pmd/JUnit4TestShouldUseTestAnnotation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-junit5testshouldbepackageprivate"></a>

### `pmd/JUnit5TestShouldBePackagePrivate`

J unit5 test should be package private.

- **Allowed form:** Drop public from JUnit 5 test classes and test methods; package-private is enough.
- **Exception:** If this is intended, add `{"rule":"pmd/JUnit5TestShouldBePackagePrivate","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-junitassertionsshouldincludemessage"></a>

### `pmd/JUnitAssertionsShouldIncludeMessage`

J unit assertions should include message.

- **Allowed form:** Add a failure message to the assertion, e.g. assertEquals(expected, actual, "total after discount"), or use assertThat(actual).as("total").
- **Exception:** If this is intended, add `{"rule":"pmd/JUnitAssertionsShouldIncludeMessage","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-junitspelling"></a>

### `pmd/JUnitSpelling`

J unit spelling.

- **Allowed form:** Rename the method to setUp or tearDown with that exact casing, or replace it with @BeforeEach or @AfterEach in JUnit 5.
- **Exception:** If this is intended, add `{"rule":"pmd/JUnitSpelling","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-junitstaticsuite"></a>

### `pmd/JUnitStaticSuite`

J unit static suite.

- **Allowed form:** Delete the JUnit 3 suite() method and group tests with @Nested classes or a JUnit 5 suite; if it stays, declare it public static.
- **Exception:** If this is intended, add `{"rule":"pmd/JUnitStaticSuite","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-junittestcontainstoomanyasserts"></a>

### `pmd/JUnitTestContainsTooManyAsserts`

J unit test contains too many asserts.

- **Allowed form:** Split the test so each covers one behavior, or compare one whole record or list with a single assertThat(actual).isEqualTo(expected).
- **Exception:** If this is intended, add `{"rule":"pmd/JUnitTestContainsTooManyAsserts","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-junittestsshouldincludeassert"></a>

### `pmd/JUnitTestsShouldIncludeAssert`

J unit tests should include assert.

- **Allowed form:** Assert on the result, e.g. assertThat(actual).isEqualTo(expected), or use assertThrows for an expected failure.
- **Exception:** If this is intended, add `{"rule":"pmd/JUnitTestsShouldIncludeAssert","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-junituseexpected"></a>

### `pmd/JUnitUseExpected`

J unit use expected.

- **Allowed form:** Replace the try/catch and fail() with assertThrows(IllegalStateException.class, () -> call()).
- **Exception:** If this is intended, add `{"rule":"pmd/JUnitUseExpected","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-literalsfirstincomparisons"></a>

### `pmd/LiteralsFirstInComparisons`

Literals first in comparisons.

- **Allowed form:** Put the literal first: "yes".equals(value), so a null value cannot throw.
- **Exception:** If this is intended, add `{"rule":"pmd/LiteralsFirstInComparisons","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-logstringconcatenation"></a>

### `pmd/LogStringConcatenation`

Log string concatenation.

- **Scope:** Main and test sources.
- **Why it is on:** A PMD rule nitpicker defines: it names one allowed form where the language offers several, and reports the other forms.
- **Allowed form:** Pass values as placeholders (LOG.info("user {}", user); {0} in System.Logger and java.util.logging), not a message built with + or String.format.
- **Exception:** If this is intended, add `{"rule":"pmd/LogStringConcatenation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-loosecoupling"></a>

### `pmd/LooseCoupling`

Loose coupling.

- **Allowed form:** Declare the type as the interface (List, Map, Set, Deque), not ArrayList, HashMap or LinkedList.
- **Exception:** If this is intended, add `{"rule":"pmd/LooseCoupling","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-methodreturnsinternalarray"></a>

### `pmd/MethodReturnsInternalArray`

Method returns internal array.

- **Allowed form:** Return items.clone(), or expose the data as List.copyOf(items) or an unmodifiable List.
- **Exception:** If this is intended, add `{"rule":"pmd/MethodReturnsInternalArray","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-methodwithsamenameasenclosingclass"></a>

### `pmd/MethodWithSameNameAsEnclosingClass`

Method with same name as enclosing class.

- **Allowed form:** Rename the method so it is not the class name; use a static factory such as of or create, or fix the intended constructor.
- **Exception:** If this is intended, add `{"rule":"pmd/MethodWithSameNameAsEnclosingClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-misplacednullcheck"></a>

### `pmd/MisplacedNullCheck`

Misplaced null check.

- **Allowed form:** Move the null check before the dereference, or fix the condition so it does not dereference when the value is null.
- **Exception:** If this is intended, add `{"rule":"pmd/MisplacedNullCheck","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-missingoverride"></a>

### `pmd/MissingOverride`

Missing override.

- **Allowed form:** Add @Override to the method that overrides or implements a supertype method.
- **Exception:** If this is intended, add `{"rule":"pmd/MissingOverride","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-missingserialversionuid"></a>

### `pmd/MissingSerialVersionUID`

Missing serial version uid.

- **Allowed form:** Declare private static final long serialVersionUID = 1L; in the class, or stop implementing Serializable if it is never serialized.
- **Exception:** If this is intended, add `{"rule":"pmd/MissingSerialVersionUID","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-missingstaticmethodinnoninstantiatableclass"></a>

### `pmd/MissingStaticMethodInNonInstantiatableClass`

Missing static method in non instantiatable class.

- **Allowed form:** Add a public static factory or accessor method, or make a constructor non-private, so the class can be used.
- **Exception:** If this is intended, add `{"rule":"pmd/MissingStaticMethodInNonInstantiatableClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-morethanonelogger"></a>

### `pmd/MoreThanOneLogger`

More than one logger.

- **Allowed form:** Keep one private static final logger per class and use it everywhere in that class.
- **Exception:** If this is intended, add `{"rule":"pmd/MoreThanOneLogger","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-negativewaitintest"></a>

### `pmd/NegativeWaitInTest`

Negative wait in test.

- **Scope:** Test sources only.
- **Why it is on:** A PMD rule nitpicker defines: it names one allowed form where the language offers several, and reports the other forms.
- **Allowed form:** Do not prove that something does not happen by waiting out a delay: after(ms).never() and during(...) pass only after the full wait, so the test is slow and depends on the timing. Give the code a Clock or a scheduler the test controls, move it past the delay and assert at once.
- **Exception:** If this is intended, add `{"rule":"pmd/NegativeWaitInTest","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-noncaselabelinswitch"></a>

### `pmd/NonCaseLabelInSwitch`

Non case label in switch.

- **Allowed form:** Move the label into a case, or delete it; a label inside a switch body that is not a case is never a jump target.
- **Exception:** If this is intended, add `{"rule":"pmd/NonCaseLabelInSwitch","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-noncaselabelinswitchstatement"></a>

### `pmd/NonCaseLabelInSwitchStatement`

Non case label in switch statement.

- **Allowed form:** Move the label into a case, or delete it; a label inside a switch body that is not a case is never a jump target.
- **Exception:** If this is intended, add `{"rule":"pmd/NonCaseLabelInSwitchStatement","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-nonexhaustiveswitch"></a>

### `pmd/NonExhaustiveSwitch`

Non exhaustive switch.

- **Allowed form:** Make it an exhaustive switch expression, or add a default branch that throws IllegalStateException.
- **Exception:** If this is intended, add `{"rule":"pmd/NonExhaustiveSwitch","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-nonserializableclass"></a>

### `pmd/NonSerializableClass`

Non serializable class.

- **Allowed form:** Make the field's type Serializable or mark the field transient; if the class is never serialized, stop implementing Serializable.
- **Exception:** If this is intended, add `{"rule":"pmd/NonSerializableClass","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-nonstaticinitializer"></a>

### `pmd/NonStaticInitializer`

Non static initializer.

- **Allowed form:** Move the initializer block's code into a constructor, or make the block static if it sets up static state.
- **Exception:** If this is intended, add `{"rule":"pmd/NonStaticInitializer","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-nullassignment"></a>

### `pmd/NullAssignment`

Null assignment.

- **Allowed form:** Restructure so the variable gets its value once: declare it where the value is known, return early, or extract a method; never write x = null.
- **Exception:** If this is intended, add `{"rule":"pmd/NullAssignment","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-onedeclarationperline"></a>

### `pmd/OneDeclarationPerLine`

One declaration per line.

- **Allowed form:** Declare each variable in its own statement: int width; int height;.
- **Exception:** If this is intended, add `{"rule":"pmd/OneDeclarationPerLine","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-overridebothequalsandhashcode"></a>

### `pmd/OverrideBothEqualsAndHashcode`

Override both equals and hashcode.

- **Allowed form:** Override equals and hashCode together, using Objects.hash and Objects.equals, or make the type a record.
- **Exception:** If this is intended, add `{"rule":"pmd/OverrideBothEqualsAndHashcode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-preservestacktrace"></a>

### `pmd/PreserveStackTrace`

Preserve stack trace.

- **Allowed form:** Pass the caught exception as the cause: throw new IllegalStateException("message", e).
- **Exception:** If this is intended, add `{"rule":"pmd/PreserveStackTrace","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-primitivewrapperinstantiation"></a>

### `pmd/PrimitiveWrapperInstantiation`

Primitive wrapper instantiation.

- **Allowed form:** Use Integer.valueOf(x), autoboxing, or the primitive itself instead of new Integer(x).
- **Exception:** If this is intended, add `{"rule":"pmd/PrimitiveWrapperInstantiation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-propercloneimplementation"></a>

### `pmd/ProperCloneImplementation`

Proper clone implementation.

- **Allowed form:** Build the result with super.clone() and return it, or drop clone() for a copy constructor or static copy factory.
- **Exception:** If this is intended, add `{"rule":"pmd/ProperCloneImplementation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-properlogger"></a>

### `pmd/ProperLogger`

Proper logger.

- **Allowed form:** Declare it private static final Log LOG = LogFactory.getLog(Foo.class), where Foo is the class that declares it.
- **Exception:** If this is intended, add `{"rule":"pmd/ProperLogger","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-replaceenumerationwithiterator"></a>

### `pmd/ReplaceEnumerationWithIterator`

Replace enumeration with iterator.

- **Allowed form:** Implement Iterator instead of Enumeration; where a legacy API demands an Enumeration, pass Collections.enumeration(list).
- **Exception:** If this is intended, add `{"rule":"pmd/ReplaceEnumerationWithIterator","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-replacehashtablewithmap"></a>

### `pmd/ReplaceHashtableWithMap`

Replace hashtable with map.

- **Allowed form:** Declare Map and create a HashMap, or a ConcurrentHashMap when threads share it.
- **Exception:** If this is intended, add `{"rule":"pmd/ReplaceHashtableWithMap","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-replacevectorwithlist"></a>

### `pmd/ReplaceVectorWithList`

Replace vector with list.

- **Allowed form:** Declare List and create an ArrayList, or use CopyOnWriteArrayList when threads share it.
- **Exception:** If this is intended, add `{"rule":"pmd/ReplaceVectorWithList","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-returnemptycollectionratherthannull"></a>

### `pmd/ReturnEmptyCollectionRatherThanNull`

Return empty collection rather than null.

- **Allowed form:** Return List.of(), Set.of(), Map.of() or Collections.emptyList(), or a new empty array, instead of null.
- **Exception:** If this is intended, add `{"rule":"pmd/ReturnEmptyCollectionRatherThanNull","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-returnfromfinallyblock"></a>

### `pmd/ReturnFromFinallyBlock`

Return from finally block.

- **Allowed form:** Move the return out of finally, and return from the try or after the whole statement, so exceptions are not lost.
- **Exception:** If this is intended, add `{"rule":"pmd/ReturnFromFinallyBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-simpledateformatneedslocale"></a>

### `pmd/SimpleDateFormatNeedsLocale`

Simple date format needs locale.

- **Allowed form:** Use DateTimeFormatter.ofPattern(pattern, Locale.ROOT) from java.time; if SimpleDateFormat stays, pass a Locale.
- **Exception:** If this is intended, add `{"rule":"pmd/SimpleDateFormatNeedsLocale","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-simplifiabletestassertion"></a>

### `pmd/SimplifiableTestAssertion`

Simplifiable test assertion.

- **Allowed form:** Use the assertion the message names, such as assertEquals, assertNull or assertFalse, in place of assertTrue on a comparison or negation.
- **Exception:** If this is intended, add `{"rule":"pmd/SimplifiableTestAssertion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-singlemethodsingleton"></a>

### `pmd/SingleMethodSingleton`

Single method singleton.

- **Allowed form:** Keep one getInstance method that returns the same instance, or use an enum singleton or inject the dependency.
- **Exception:** If this is intended, add `{"rule":"pmd/SingleMethodSingleton","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-singletonclassreturningnewinstance"></a>

### `pmd/SingletonClassReturningNewInstance`

Singleton class returning new instance.

- **Allowed form:** Return the single cached instance from getInstance, or drop the singleton and pass the object in through the constructor.
- **Exception:** If this is intended, add `{"rule":"pmd/SingletonClassReturningNewInstance","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-singularandpluralmember"></a>

### `pmd/SingularAndPluralMember`

Singular and plural member.

- **Scope:** Main sources only.
- **Why it is on:** A PMD rule nitpicker defines: it names one allowed form where the language offers several, and reports the other forms.
- **Allowed form:** A member and its plural (tag and tags) are two ways to pass the same data. Keep the plural and pass one item as a one-element list.
- **Exception:** If this is intended, add `{"rule":"pmd/SingularAndPluralMember","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springasyncexecutor"></a>

### `pmd/SpringAsyncExecutor`

Spring async executor.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Name a bounded executor bean, @Async("executorName"), and return CompletableFuture so failures reach the caller.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringAsyncExecutor","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springbeancollectionstate"></a>

### `pmd/SpringBeanCollectionState`

Spring bean collection state.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Fill a plain collection of a shared singleton bean only at startup (the constructor, @PostConstruct or afterPropertiesSet) and keep it as Map.copyOf or List.copyOf, or use a ConcurrentHashMap or a cache (@Cacheable). Changed after startup, request threads would write to it at once.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringBeanCollectionState","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springcomposedmapping"></a>

### `pmd/SpringComposedMapping`

Spring composed mapping.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Use @GetMapping, @PostMapping, @PutMapping, @PatchMapping or @DeleteMapping on methods. @RequestMapping belongs only on the class, for the path prefix.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringComposedMapping","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springconstructorinjection"></a>

### `pmd/SpringConstructorInjection`

Spring constructor injection.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Inject through the constructor into private final fields. Do not put @Autowired, @Inject, @Resource or @Value on fields or setters.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringConstructorInjection","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springcorswildcard"></a>

### `pmd/SpringCorsWildcard`

Spring cors wildcard.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** List the allowed origins from configuration instead of "*" when credentials are allowed; any site could then call this API as the signed-in user.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringCorsWildcard","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springcsrfdisabled"></a>

### `pmd/SpringCsrfDisabled`

Spring csrf disabled.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Keep CSRF protection on for session-based security. Turn it off only for a stateless API, in the same filter chain: SessionCreationPolicy.STATELESS or a NullSecurityContextRepository on servlet security, NoOpServerSecurityContextRepository on WebFlux, or oauth2ResourceServer with jwt or opaqueToken and every login form disabled.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringCsrfDisabled","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springdatabatchofone"></a>

### `pmd/SpringDataBatchOfOne`

Spring data batch of one.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Collect the entities of the whole loop and call saveAll or deleteAll once. Calling it with a one-element list on each iteration is still one write per entity.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringDataBatchOfOne","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springdataderivedquery"></a>

### `pmd/SpringDataDerivedQuery`

Spring data derived query.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Write this repository method with @Query (JPQL in a text block for JPA), naming the entity and every condition, instead of a query derived from the method name.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringDataDerivedQuery","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springdatafilterinquery"></a>

### `pmd/SpringDataFilterInQuery`

Spring data filter in query.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Filter and count in the database, with an @Query that has a where clause, a count query or an exists query, instead of loading the whole table with findAll().
- **Exception:** If this is intended, add `{"rule":"pmd/SpringDataFilterInQuery","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springdatamodifyingquery"></a>

### `pmd/SpringDataModifyingQuery`

Spring data modifying query.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Write @Modifying(clearAutomatically = true, flushAutomatically = true), so pending changes are flushed first and no stale entities stay in the persistence context.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringDataModifyingQuery","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springdatanamedparameters"></a>

### `pmd/SpringDataNamedParameters`

Spring data named parameters.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Bind query parameters by name (:email), not by position (?1); positions break silently when parameters are reordered.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringDataNamedParameters","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springdatanativequery"></a>

### `pmd/SpringDataNativeQuery`

Spring data native query.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Write the query in JPQL; native SQL is not checked at startup. If this one needs SQL, mark this method with @SuppressWarnings("PMD.SpringDataNativeQuery"), the only inline suppression nitpicker accepts.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringDataNativeQuery","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springdatanoflush"></a>

### `pmd/SpringDataNoFlush`

Spring data no flush.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Do not flush by hand. Let the transaction write changes at commit; an early flush defeats JDBC batching and hides ordering bugs.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringDataNoFlush","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springdatanosaveinloop"></a>

### `pmd/SpringDataNoSaveInLoop`

Spring data no save in loop.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Do not save or delete one entity per loop iteration. Collect the entities and call saveAll or deleteAll once.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringDataNoSaveInLoop","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springdataquerytextblock"></a>

### `pmd/SpringDataQueryTextBlock`

Spring data query text block.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Write a multi-part query as one text block (""") instead of joining strings with +.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringDataQueryTextBlock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springdatarowwriteinloop"></a>

### `pmd/SpringDataRowWriteInLoop`

Spring data row write in loop.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Write one set-based @Query that takes the whole list, for example where id in :ids, and call it once after the loop instead of one repository update or delete per iteration.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringDataRowWriteInLoop","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springdatasaveinloophelper"></a>

### `pmd/SpringDataSaveInLoopHelper`

Spring data save in loop helper.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Collect the entities and call saveAll or deleteAll once after the loop; when rows must fail one by one, call saveAll per batch and handle the error per batch. This loop calls a method of this class that saves or deletes one entity, so it still writes once per iteration.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringDataSaveInLoopHelper","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springhardcodeduser"></a>

### `pmd/SpringHardcodedUser`

Spring hardcoded user.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Load users from a UserDetailsService backed by the database, with passwords hashed by the delegating encoder. Do not put a user password in source code.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringHardcodedUser","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springhttpclientpercall"></a>

### `pmd/SpringHttpClientPerCall`

Spring http client per call.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Build the HTTP client once, from the injected RestClient.Builder or RestTemplateBuilder, and keep it in a final field or a @Bean. A client built in each call throws away its connection pool.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringHttpClientPerCall","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springhttpclienttimeouts"></a>

### `pmd/SpringHttpClientTimeouts`

Spring http client timeouts.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Build this HTTP client with connect and read timeouts, from the injected RestClient.Builder or RestTemplateBuilder (spring.http.client.* properties), with a request factory or connector that sets them, or with connectTimeout and readTimeout on the builder; give a Reactor Netty HttpClient a responseTimeout. A client without timeouts waits forever for a slow server.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringHttpClientTimeouts","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springimmutablebeans"></a>

### `pmd/SpringImmutableBeans`

Spring immutable beans.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Make this field of a bean final, static fields too. Beans are shared singletons, so keep per-call state in locals.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringImmutableBeans","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springliteconfiguration"></a>

### `pmd/SpringLiteConfiguration`

Spring lite configuration.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Write @Configuration(proxyBeanMethods = false) and take dependencies as @Bean method parameters instead of calling other @Bean methods.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringLiteConfiguration","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springnocomponentscan"></a>

### `pmd/SpringNoComponentScan`

Spring no component scan.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Put the @SpringBootApplication class in the top package and let it scan its own packages; do not add @ComponentScan or scanBasePackages.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringNoComponentScan","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springnocrossorigin"></a>

### `pmd/SpringNoCrossOrigin`

Spring no cross origin.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Configure CORS once, in a CorsConfigurationSource bean with origins from configuration, instead of @CrossOrigin on controllers.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringNoCrossOrigin","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springnoerrorleak"></a>

### `pmd/SpringNoErrorLeak`

Spring no error leak.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Log the exception and return a ProblemDetail with a fixed detail from this @ExceptionHandler. The message or stack trace of a generic, JDK or persistence exception exposes internals; messages of your own exception types are fine.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringNoErrorLeak","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springnolazyinjection"></a>

### `pmd/SpringNoLazyInjection`

Spring no lazy injection.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Remove @Lazy from this injection point. It hides a dependency cycle; break the cycle with a new component or an event instead.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringNoLazyInjection","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springnopostconstructio"></a>

### `pmd/SpringNoPostConstructIo`

Spring no post construct io.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Move startup work that calls a database or a remote service out of @PostConstruct into an ApplicationRunner or an @EventListener(ApplicationReadyEvent). @PostConstruct runs before the context is ready: there is no transaction around this call, other beans may not be proxied yet, and a failure stops the application from starting.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringNoPostConstructIo","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springnorequiresnew"></a>

### `pmd/SpringNoRequiresNew`

Spring no requires new.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Avoid Propagation.REQUIRES_NEW: each nested transaction holds a second connection and can exhaust the pool under load.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringNoRequiresNew","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springnoservicelocator"></a>

### `pmd/SpringNoServiceLocator`

Spring no service locator.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Inject the bean you need through the constructor instead of looking it up in the ApplicationContext or BeanFactory. Use ObjectProvider for optional or prototype beans.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringNoServiceLocator","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springnoswallowedtransactionexception"></a>

### `pmd/SpringNoSwallowedTransactionException`

Spring no swallowed transaction exception.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Do not swallow a broad or persistence exception inside a @Transactional method: the transaction may already be rollback-only, so the commit fails anyway. Rethrow it, or catch it in the caller.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringNoSwallowedTransactionException","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springnotransactionalcontroller"></a>

### `pmd/SpringNoTransactionalController`

Spring no transactional controller.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Put @Transactional on a service method, not on a controller; a controller transaction spans the whole request and response serialization.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringNoTransactionalController","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springpasswordencoder"></a>

### `pmd/SpringPasswordEncoder`

Spring password encoder.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Hash passwords with PasswordEncoderFactories.createDelegatingPasswordEncoder(). NoOpPasswordEncoder stores them in plain text, and the MD4, message-digest, LDAP SHA and standard SHA-256 encoders and User.withDefaultPasswordEncoder() are not safe for passwords.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringPasswordEncoder","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springpermitallanyrequest"></a>

### `pmd/SpringPermitAllAnyRequest`

Spring permit all any request.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Name the public paths in requestMatchers(...).permitAll(), or pathMatchers(...).permitAll() on WebFlux, and end with anyRequest().authenticated(), or anyExchange().authenticated(), so a new endpoint is protected by default.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringPermitAllAnyRequest","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springprofileonconfiguration"></a>

### `pmd/SpringProfileOnConfiguration`

Spring profile on configuration.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Put @Profile only on a @Configuration class or a @Bean method, so profiles choose beans and never branch business code.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringProfileOnConfiguration","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springproxymethodvisibility"></a>

### `pmd/SpringProxyMethodVisibility`

Spring proxy method visibility.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Make this proxied method public, non-final and non-static, in a non-final class. Spring never proxies final or static methods, and nitpicker keeps proxied methods public.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringProxyMethodVisibility","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springproxyselfcall"></a>

### `pmd/SpringProxySelfCall`

Spring proxy self call.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** This call stays inside the class, so it skips the proxy and the called method''s annotation does nothing. Move the annotated method to another bean and call it there.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringProxySelfCall","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springqueryconcatenation"></a>

### `pmd/SpringQueryConcatenation`

Spring query concatenation.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Write the query as constant text (a text block) and pass values as bind parameters; for a list of values use NamedParameterJdbcTemplate or JdbcClient with in (:ids). Joining or formatting values into SQL or JPQL allows injection.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringQueryConcatenation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springrestcontroller"></a>

### `pmd/SpringRestController`

Spring rest controller.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Use @RestController for a JSON controller and drop @ResponseBody.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringRestController","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springscheduledfixeddelay"></a>

### `pmd/SpringScheduledFixedDelay`

Spring scheduled fixed delay.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Use fixedDelay or cron instead of fixedRate, so a slow run never overlaps the next one.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringScheduledFixedDelay","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springtransactionalannotation"></a>

### `pmd/SpringTransactionalAnnotation`

Spring transactional annotation.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Use org.springframework.transaction.annotation.Transactional. The jakarta and javax annotations have no readOnly or timeout and roll back on different exceptions.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringTransactionalAnnotation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springtransactionalcheckedrollback"></a>

### `pmd/SpringTransactionalCheckedRollback`

Spring transactional checked rollback.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Add rollbackFor = Exception.class to this @Transactional, or throw an unchecked exception. A checked exception commits the work done so far instead of rolling it back.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringTransactionalCheckedRollback","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springtransactionalreadonlywrite"></a>

### `pmd/SpringTransactionalReadOnlyWrite`

Spring transactional read only write.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Put @Transactional without readOnly on this method: a write inside a read-only transaction is skipped or fails.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringTransactionalReadOnlyWrite","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springtypedconfiguration"></a>

### `pmd/SpringTypedConfiguration`

Spring typed configuration.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Read configuration through a @ConfigurationProperties record and pass the values in through constructors or parameters, not @Value, System.getenv, System.getProperty or Environment.getProperty. JVM properties such as java._, user._, javax._, jdk._ and http.* are fine.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringTypedConfiguration","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springtypedrequestbody"></a>

### `pmd/SpringTypedRequestBody`

Spring typed request body.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Bind this @RequestBody to a record with validation annotations, not to Object, JsonNode, Map<String, Object> or a list of those. Untyped payloads skip validation and allow mass assignment. A Map with typed values, such as Map<String, String>, is fine.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringTypedRequestBody","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springtypedresponse"></a>

### `pmd/SpringTypedResponse`

Spring typed response.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Return a record or a specific type from this handler, never Object, JsonNode, Map<String, Object>, ResponseEntity<?>, a list or Optional of those, or null. For no body return void or ResponseEntity<Void>, and for an error throw an exception that a @RestControllerAdvice maps to a ProblemDetail.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringTypedResponse","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springunusedcontext"></a>

### `pmd/SpringUnusedContext`

Spring unused context.

- **Scope:** Test sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** This @SpringBootTest starts the whole application context but uses nothing from it: no injected or mock bean, no MockMvc, WebTestClient, TestRestTemplate, CapturedOutput or ApplicationEvents, and no web server port. Make it a unit test that creates the class with new, or use a slice such as @WebMvcTest for one layer; @SpringBootTest is for integration and component tests.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringUnusedContext","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springvalidrequestbody"></a>

### `pmd/SpringValidRequestBody`

Spring valid request body.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Add @Valid to this @RequestBody; without it the record''s constraints are never checked.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringValidRequestBody","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-springvaluesecretdefault"></a>

### `pmd/SpringValueSecretDefault`

Spring value secret default.

- **Scope:** Main sources of a project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath.
- **Allowed form:** Read this secret without a default, so a missing value fails at startup; a secret with a built-in fallback ships to production unnoticed.
- **Exception:** If this is intended, add `{"rule":"pmd/SpringValueSecretDefault","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-staticejbfieldshouldbefinal"></a>

### `pmd/StaticEJBFieldShouldBeFinal`

Static ejb field should be final.

- **Allowed form:** Make the static field in the EJB final; keep per-call state in locals or a stateful bean field.
- **Exception:** If this is intended, add `{"rule":"pmd/StaticEJBFieldShouldBeFinal","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-staticforwardingwrapper"></a>

### `pmd/StaticForwardingWrapper`

Static forwarding wrapper.

- **Scope:** Main sources only.
- **Why it is on:** A PMD rule nitpicker defines: it names one allowed form where the language offers several, and reports the other forms.
- **Allowed form:** This static method only passes its parameters, in order, to another method. Call that method directly where this one is used and delete the wrapper. Factories named of or from and copies such as List.copyOf are allowed.
- **Exception:** If this is intended, add `{"rule":"pmd/StaticForwardingWrapper","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-stringbufferinstantiationwithchar"></a>

### `pmd/StringBufferInstantiationWithChar`

String buffer instantiation with char.

- **Allowed form:** Pass a String (new StringBuilder("a")), since new StringBuilder('a') sets a capacity of 97 and an empty buffer.
- **Exception:** If this is intended, add `{"rule":"pmd/StringBufferInstantiationWithChar","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-suspiciousequalsmethodname"></a>

### `pmd/SuspiciousEqualsMethodName`

Suspicious equals method name.

- **Allowed form:** Rename the method to equals(Object) if it is meant to override, or to a different name; fix the parameter type to Object.
- **Exception:** If this is intended, add `{"rule":"pmd/SuspiciousEqualsMethodName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-suspicioushashcodemethodname"></a>

### `pmd/SuspiciousHashcodeMethodName`

Suspicious hashcode method name.

- **Allowed form:** Rename the method to hashCode() if it is meant to override, or to a name that is not close to hashCode.
- **Exception:** If this is intended, add `{"rule":"pmd/SuspiciousHashcodeMethodName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-suspiciousoctalescape"></a>

### `pmd/SuspiciousOctalEscape`

Suspicious octal escape.

- **Allowed form:** Write the character as a unicode escape (\u0008) or a three-digit octal escape so the digits are not read together.
- **Exception:** If this is intended, add `{"rule":"pmd/SuspiciousOctalEscape","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-switchstmtsshouldhavedefault"></a>

### `pmd/SwitchStmtsShouldHaveDefault`

Switch stmts should have default.

- **Allowed form:** Make it an exhaustive switch expression, or add a default branch that throws IllegalStateException.
- **Exception:** If this is intended, add `{"rule":"pmd/SwitchStmtsShouldHaveDefault","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-systemprintln"></a>

### `pmd/SystemPrintln`

System println.

- **Allowed form:** Write through a logger, or take a PrintStream as a parameter so callers choose the stream.
- **Exception:** If this is intended, add `{"rule":"pmd/SystemPrintln","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-testclasswithouttestcases"></a>

### `pmd/TestClassWithoutTestCases`

Test class without test cases.

- **Allowed form:** Add @Test methods to the class, or rename it if it is a helper (for example TestInputGenerator becomes InputGenerator).
- **Exception:** If this is intended, add `{"rule":"pmd/TestClassWithoutTestCases","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-unconditionalifstatement"></a>

### `pmd/UnconditionalIfStatement`

Unconditional if statement.

- **Allowed form:** Delete the if with a constant true or false condition and keep only the branch that runs.
- **Exception:** If this is intended, add `{"rule":"pmd/UnconditionalIfStatement","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-unittestshouldincludeassert"></a>

### `pmd/UnitTestShouldIncludeAssert`

Unit test should include assert.

- **Allowed form:** Assert on the result, e.g. assertThat(actual).isEqualTo(expected), or use assertThrows for an expected failure.
- **Exception:** If this is intended, add `{"rule":"pmd/UnitTestShouldIncludeAssert","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-unittestshoulduseafterannotation"></a>

### `pmd/UnitTestShouldUseAfterAnnotation`

Unit test should use after annotation.

- **Allowed form:** Annotate the cleanup method with @AfterEach (or @AfterAll on a static method) or it never runs.
- **Exception:** If this is intended, add `{"rule":"pmd/UnitTestShouldUseAfterAnnotation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-unittestshouldusebeforeannotation"></a>

### `pmd/UnitTestShouldUseBeforeAnnotation`

Unit test should use before annotation.

- **Allowed form:** Annotate the setup method with @BeforeEach (or @BeforeAll on a static method) or it never runs.
- **Exception:** If this is intended, add `{"rule":"pmd/UnitTestShouldUseBeforeAnnotation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-unittestshouldusetestannotation"></a>

### `pmd/UnitTestShouldUseTestAnnotation`

Unit test should use test annotation.

- **Allowed form:** Annotate the method with @Test (or @ParameterizedTest) so JUnit runs it, or rename it if it is a helper.
- **Exception:** If this is intended, add `{"rule":"pmd/UnitTestShouldUseTestAnnotation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-unnecessarybooleanassertion"></a>

### `pmd/UnnecessaryBooleanAssertion`

Unnecessary boolean assertion.

- **Allowed form:** Delete assertTrue(true) and assertFalse(false) style calls, and assert on a real value of the code under test.
- **Exception:** If this is intended, add `{"rule":"pmd/UnnecessaryBooleanAssertion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-unnecessarycasechange"></a>

### `pmd/UnnecessaryCaseChange`

Unnecessary case change.

- **Allowed form:** Use equalsIgnoreCase in place of toUpperCase().equals(...) or toLowerCase().equals(...).
- **Exception:** If this is intended, add `{"rule":"pmd/UnnecessaryCaseChange","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-unnecessaryconversiontemporary"></a>

### `pmd/UnnecessaryConversionTemporary`

Unnecessary conversion temporary.

- **Allowed form:** Call the conversion on the value directly (Integer.toString(i), String.valueOf(i)) instead of building a wrapper object first.
- **Exception:** If this is intended, add `{"rule":"pmd/UnnecessaryConversionTemporary","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-unnecessaryvarargsarraycreation"></a>

### `pmd/UnnecessaryVarargsArrayCreation`

Unnecessary varargs array creation.

- **Allowed form:** Pass the elements directly: Arrays.asList("a", "b") instead of wrapping them in new String[] { ... }.
- **Exception:** If this is intended, add `{"rule":"pmd/UnnecessaryVarargsArrayCreation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-unusedassignment"></a>

### `pmd/UnusedAssignment`

Unused assignment.

- **Allowed form:** Remove the assignment, or use the value; drop the initializer when every path assigns before reading.
- **Exception:** If this is intended, add `{"rule":"pmd/UnusedAssignment","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-unusedformalparameter"></a>

### `pmd/UnusedFormalParameter`

Unused formal parameter.

- **Allowed form:** Remove the parameter and update the callers, or use it in the method body.
- **Exception:** If this is intended, add `{"rule":"pmd/UnusedFormalParameter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-unusedlocalvariable"></a>

### `pmd/UnusedLocalVariable`

Unused local variable.

- **Allowed form:** Remove the variable, or use it; keep the call's side effect as a plain statement.
- **Exception:** If this is intended, add `{"rule":"pmd/UnusedLocalVariable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-unusednullcheckinequals"></a>

### `pmd/UnusedNullCheckInEquals`

Unused null check in equals.

- **Allowed form:** Call equals on the value you just null-checked, a != null && a.equals(other), or drop the check and use Objects.equals(a, other).
- **Exception:** If this is intended, add `{"rule":"pmd/UnusedNullCheckInEquals","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-unusedprivatefield"></a>

### `pmd/UnusedPrivateField`

Unused private field.

- **Allowed form:** Remove the field, or use it.
- **Exception:** If this is intended, add `{"rule":"pmd/UnusedPrivateField","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-unusedprivatemethod"></a>

### `pmd/UnusedPrivateMethod`

Unused private method.

- **Allowed form:** Remove the method, or call it.
- **Exception:** If this is intended, add `{"rule":"pmd/UnusedPrivateMethod","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-usecollectionisempty"></a>

### `pmd/UseCollectionIsEmpty`

Use collection is empty.

- **Allowed form:** Call isEmpty() or !isEmpty() instead of comparing size() with 0 or 1.
- **Exception:** If this is intended, add `{"rule":"pmd/UseCollectionIsEmpty","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-usecorrectexceptionlogging"></a>

### `pmd/UseCorrectExceptionLogging`

Use correct exception logging.

- **Allowed form:** Pass the exception as the last argument (log.error("msg", e)), not as e.getMessage() or a placeholder value.
- **Exception:** If this is intended, add `{"rule":"pmd/UseCorrectExceptionLogging","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-useenumcollections"></a>

### `pmd/UseEnumCollections`

Use enum collections.

- **Allowed form:** Create EnumSet.noneOf(Key.class) or new EnumMap<>(Key.class) instead of a HashSet or HashMap keyed by the enum.
- **Exception:** If this is intended, add `{"rule":"pmd/UseEnumCollections","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-useequalstocomparestrings"></a>

### `pmd/UseEqualsToCompareStrings`

Use equals to compare strings.

- **Allowed form:** Compare strings with "literal".equals(x) or a.equals(b), never == or !=.
- **Exception:** If this is intended, add `{"rule":"pmd/UseEqualsToCompareStrings","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-uselessoperationonimmutable"></a>

### `pmd/UselessOperationOnImmutable`

Useless operation on immutable.

- **Allowed form:** Assign the result (s = s.trim(), x = x.add(y)) or delete the call, since String and BigDecimal methods return a new value.
- **Exception:** If this is intended, add `{"rule":"pmd/UselessOperationOnImmutable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-uselocalewithcaseconversions"></a>

### `pmd/UseLocaleWithCaseConversions`

Use locale with case conversions.

- **Allowed form:** Pass a locale: s.toUpperCase(Locale.ROOT) or s.toLowerCase(Locale.ROOT).
- **Exception:** If this is intended, add `{"rule":"pmd/UseLocaleWithCaseConversions","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-useproperclassloader"></a>

### `pmd/UseProperClassLoader`

Use proper class loader.

- **Allowed form:** Use Thread.currentThread().getContextClassLoader() instead of calling getClassLoader() on a Class.
- **Exception:** If this is intended, add `{"rule":"pmd/UseProperClassLoader","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-usestandardcharsets"></a>

### `pmd/UseStandardCharsets`

Use standard charsets.

- **Allowed form:** Use StandardCharsets.UTF_8 instead of Charset.forName("UTF-8").
- **Exception:** If this is intended, add `{"rule":"pmd/UseStandardCharsets","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-usetrywithresources"></a>

### `pmd/UseTryWithResources`

Use try with resources.

- **Allowed form:** Declare the resource in the try header, try (var in = Files.newInputStream(path)) { ... }, and drop the finally that closes it.
- **Exception:** If this is intended, add `{"rule":"pmd/UseTryWithResources","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.

<a id="pmd-usevarargs"></a>

### `pmd/UseVarargs`

Use varargs.

- **Allowed form:** Declare the last parameter as varargs: String... names.
- **Exception:** If this is intended, add `{"rule":"pmd/UseVarargs","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-whileloopwithliteralboolean"></a>

### `pmd/WhileLoopWithLiteralBoolean`

While loop with literal boolean.

- **Allowed form:** Write do { } while (true) as while (true) { }, replace do { } while (false) with a plain block, and delete a while (false) loop.
- **Exception:** If this is intended, add `{"rule":"pmd/WhileLoopWithLiteralBoolean","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. The message gives no exception route because the flagged code is a defect; an entry still lifts it if a reviewer agrees.
