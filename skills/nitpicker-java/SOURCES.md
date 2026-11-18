# Sources and decisions

Why the Java and Kotlin skills treat Error Prone fixes as they do. The preset itself is described
in `docs/java-preset/error-prone-and-nullaway.md`; this page records which Error Prone checks
`--fix` applies, which it applies only on request, and which it never applies.

## How the fixes are applied

- `--fix` compiles the project with the gate's own settings plus
  `-XepPatchChecks:<checks> -XepPatchLocation:<folder>`. Error Prone then runs only those checks and
  writes `error-prone.patch`. `IN_PLACE` is never used, because it would rewrite every file the
  compile reads, changed or not.
- nitpicker keeps the hunks that touch a line changed against the merge base. A new file counts as
  all changed. Error Prone writes the import lines a fix needs as a separate hunk: such a hunk is
  kept only for the imports a kept hunk uses.
- Each kept hunk becomes a checked `replace` edit. The engine's stale-byte check and the hunk's old
  lines must both match, so a file that changed after the compile is left alone.
- A hunk is named after the check whose diagnostic sits nearest to it. The patch run reports its
  diagnostics beside the patch.
- Pinned version: Error Prone 2.50.0. The counts below come from the classes of that jar that
  reference `SuggestedFix` or `Fix`, an upper bound: some checks emit a fix only in some cases.

## Safe list (applied by a plain `--fix`)

58 checks whose fix keeps behaviour and ends in the form the preset asks for. They are in
`languages/java/fix/errorprone/checks/safe-checks.mts`.

- Layout and syntax with no meaning of their own: `AnnotationPosition`, `MissingBraces`,
  `MixedArrayDimensions`, `MultiVariableDeclaration`, `OperatorPrecedence`,
  `UnnecessaryParentheses`, `UnnecessarySemicolon`, `EmptyTopLevelDeclaration`,
  `UnicodeEscape`, `LongLiteralLowerCaseSuffix`.
- Redundant code: `ExtendsObject`, `RedundantControlFlow`, `ReturnAtTheEndOfVoidFunction`,
  `UnnecessaryBreakInSwitch`, `UnnecessaryTypeArgument`, `UnnecessaryBoxedAssignment`,
  `ExplicitArrayForVarargs`, `MultipleParallelOrSequentialCalls`, `RedundantThrows`,
  `TransientMisuse`, `RecordComponentOverride`, `DeprecatedVariable`, `UnusedLabel`,
  `TryWithResourcesVariable`, `ProtectedMembersInFinalClass`, `ZoneIdOfZ`.
- Equal forms: `BooleanLiteral`, `BoxingComparator`, `CanonicalDuration`, `HashtableContains`,
  `JavaDurationGetSecondsToToSeconds`, `ObjectEqualsForPrimitives`, `ObjectsHashCodePrimitive`,
  `FloatingPointLiteralPrecision`, `IntFloatConversion`, `IntLiteralCast`, `LongDoubleConversion`,
  `LongFloatConversion`, `AssertThrowsBlockToExpression`.
- Imports and names: `UnnecessarilyFullyQualified`, `UnnecessaryStaticImport`,
  `NonCanonicalStaticImport`, `NonCanonicalStaticMemberImport`, `NonCanonicalType`,
  `WildcardImport`.
- Annotations and comments that only name what the compiler already knows: `MissingOverride`,
  `SuppressWarningsDeprecated`, `NotJavadoc`, `ParameterComment`.
- Documentation tags: `EmptyBlockTag`, `InvalidThrowsLink`, `MalformedInlineTag`,
  `PreferThrowsTag`, `ReturnFromVoid`, `UnescapedEntity`, `UrlInSee`.
- Dead private code: `UnusedMethod`, `UnusedNestedClass`. Removing what nothing calls keeps behaviour
  unless something reaches it by reflection, which Error Prone already exempts for the usual
  annotations.

PMD twins the same fix clears, so the Java source recipes of AF15 do not repeat them:
`UnusedPrivateMethod` (with `UnusedMethod`), `MissingOverride`, `UselessParentheses`,
`UnnecessaryFullyQualifiedName`, `UnnecessaryBoxing`, `UnnecessaryReturn`,
`UnnecessarySemicolon`, `ControlStatementBraces` (with `MissingBraces`),
`UnnecessaryVarargsArrayCreation`. Checkstyle twins: `UpperEll` (the `java-upper-ell` recipe
already covers it, and its edit overlaps the Error Prone one, so the second is skipped),
`ArrayTypeStyle`, `MultipleVariableDeclarations`, `NeedBraces`, `AvoidStarImport`.

## Near-duplicate extraction

`java-extract-near-duplicate` is a review recipe for `structure/near-duplicate`: it runs only with `--fix --rule`, because nothing compiles the result. It parses each main
source file with the tree-sitter grammar of the rule, finds the pairs with the engine and filters of
the rule, and works on a `same` or `parameterizable` pair of methods in one class, or in two files
of one folder (see below). The first copy
becomes a private method placed after it, static when the body reads no instance state, and both
bodies become one call. Signatures, `throws` clauses and annotations stay. A `@SuppressWarnings`
annotation of the first copy moves to the new method. Imports that only the moved code used are
removed from the files that lose them.

- A differing literal becomes a parameter named after what it flows into. A differing call or name read
  becomes a `Supplier` parameter named `<name>Supplier` (`IntSupplier`, `LongSupplier`,
  `DoubleSupplier` or `BooleanSupplier` for `int`, `long`, `double` and `boolean`), and the helper calls it
  where the expression stood, so its timing and its count do not change. The type comes from where
  the expression flows: the declared type of a non-`final` local it initializes, the return type when
  it is returned, or `boolean` in an `if` condition. Anywhere else (an argument, an operand, a loop
  condition), in a `final` local, in a `try` block (a lambda cannot throw the checked exceptions the
  `catch` expects), in a method that has `throws`, inside a lambda or a nested class (a `return`
  there belongs to that code), a hole used with two declared types gets one `Supplier` for each type, on a `byte`, `short`, `char` or `float`, or when it reads a local of the copied code or
  a parameter the method writes, the finding stays. A lambda, an assignment, an increment or an
  anonymous class inside the expression keeps it too.
- A differing type becomes a type parameter (`<T>`, `<U>`, ...) of the helper, which stays callable with the
  signatures of both copies: the callers infer it. The type must be a plain class name, alone or as the
  argument of a generic type or an array, and sit in a parameter, return or local declaration or in a type
  argument. A type may be qualified (`java.sql.Date` against `Time`). The finding stays for a primitive,
  for a generic class that differs in its own name, for a type in a cast, in an `instanceof`, in a class
  literal or in a `throws`, and when the body calls a method on a value of the type, passes it to a call, or reads it
  through a lambda: without the compiler the recipe cannot tell that the call still means the same for a
  type parameter. A collection of the type may be iterated, sized, and filled with `add`, `put` and
  the like, and its elements may be returned, assigned or compared with `==`.
- A type that differs after `new` (`new URL(text)` against `new URI(text)`) becomes a constructor
  parameter: a method reference (`URL::new`) of a nested functional interface that the recipe
  writes (`StringCreator<T, E extends Exception>`, named after the argument types, with a `create`
  method that `throws E`). The helper calls `creator.create(text)` where the copy called the
  constructor, so the arguments are evaluated at the same place, once. `E` is inferred at each call
  from the constructor, so a checked exception of the constructor reaches the same callers as before,
  and the helper declares it. The arguments must have a type the recipe can write: a literal, a local
  or a parameter with a declared type, or a call of a few JDK getters (`Date.getTime`,
  `String.length`, `trim`). The constructor must be returned, assigned or declared into a local that is
  not `var`: as a receiver or an argument its type would change the overload a call picks. The interface
  is private in the enclosing class for copies in one class, and package-private in the shared class for
  copies in two files. The finding stays when its name is taken.
- A catch clause whose exception type differs (`MalformedURLException` against `URISyntaxException`) keeps
  its place in the helper, which takes the class (`Class<E> failure`) and catches `Exception`: an
  exception that is not a `failure` is rethrown as it was, the others reach the original handler as `E`.
  The recipe does this only when the `try` block holds nothing that can throw another checked exception
  (no call, `new` or `throw` besides the differing constructors), the clause is the last one of the
  `try`, and the handler uses the exception only for `Throwable` methods or as an argument of a `new`:
  the argument then has the type `E` instead of the exception, so the class of that `new` must have
  exactly one constructor with that many parameters (read from the class in the same file or in the
  project sources, or one of a few JDK exception classes). Otherwise another overload could be
  picked, and the finding stays. A catch type that is a well-known unchecked exception is not tied to
  the creator: the creator gets its own exception parameter, and an exception the clause does not
  handle is rethrown as it was. A catch type of `Throwable` or an `Error` is left alone, and so is a
  tied catch whose constructor throws a checked exception the catch type does not name (`Exception`
  covers any). The class of a constructor is found like Java finds it: the enclosing classes and the
  top-level types of the file, then the single imports, the package and the imports on demand; a name
  that stays unsure leaves the finding. When javac rejects the result, `--fix` rolls it back.
- A constructor that is returned or stored as a declared type (`CharSequence` for `StringBuilder` and
  `StringBuffer`) bounds the type parameter by that type. A parameterized or array type there is left
  alone.
- A differing type with a common supertype that the recipe knows (`java.sql.Date`, `Time` and
  `Timestamp` extend `java.util.Date`) becomes a parameter of the supertype, when the value is only
  compared with `null` or passed to `format` of a `DateFormat`. The overload that `format` picks is the
  same for both types.
- A copy that matches the other only after the rule rewrote its code (an early `return` against an
  `else`) is extracted when the recipe can line up the copies as written.
- In two files, a capitalized name of the shared code must mean the same type in both files: the
  same single import, a class of the package, or the same imports on demand. The name of the new class
  must be free in the package folder of every language folder of the source set (`src/main/java`,
  `src/main/kotlin` and `src/main/groovy`, or the `src/test` folders for a test source set; any other
  layout has the one folder), and sources under `build`, `target`, `out`, `generated-sources` and
  `generated/java` folders are not touched (a package folder named `generated` is extracted).
- A comment that only the second copy has moves above the call in the second copy.
- A literal in a `case` label, an annotation or a loop condition, in a `final` local (a constant
  that a `case` label or a narrowing could use), in a sum or other expression that is narrowed to
  `byte`, `short` or `char`, an `int` literal that could narrow to them, a method with type parameters or varargs, copies with different
  `throws`, a copy that is the only static one, copies in an interface, an enum or a record, a name the file already uses, and a copy in more than one pair are left alone.
- The helper is static only when the code provably uses no instance state. A capitalized name that
  a superclass or interface may declare, or a call whose name a static and an instance method (or a
  supertype) could both match, is ambiguous, and the finding stays.
- A file that uses CRLF keeps CRLF in the inserted text.
- The methods of two anonymous classes of one class are extracted into a private static method of the
  enclosing class, placed after the member that holds the first anonymous class. The enclosing class must
  be a top-level or static class, the anonymous classes may declare only methods, and the shared code
  must read no instance state of the class (the helper is static). The enclosing class must be
  a class, not an enum, record or interface, and the anonymous classes must not sit in a generic method or
  next to a local class. The rule only reports anonymous classes declared as fields, so the method-local
  shape is never offered to the recipe.
- Two methods in two files of one folder (one package) become a static method of a new package-private
  final class with a private constructor, in that folder, named after the words the two class names
  share (`SqlDateTypeAdapter` and `SqlTimeTypeAdapter` give `SqlTypeAdapters`). It matches the fix
  plan, which puts the function beside copies that sit in one folder. The new file starts with the
  header comment, the package line and the imports the code needs, and carries the
  `@SuppressWarnings` of the first class. Both copies call `SharedClass.sharedName(...)`. All the pairs of
  the same two files go into the same class. The state of a class is passed in: `this` as the lock of a
  `synchronized` block becomes an `Object` parameter, and a `final` instance field both copies read (the
  same name and type) becomes a parameter of its type. The recipe leaves the finding when the copies
  use any other `this`, a non-`final` field, a static member or a method of the class, a type nested in
  the class, two packages, a class that has type parameters or is not top-level, or when the class
  name is taken: the file exists, or another file of the package uses the name. Copies in two
  folders are left alone, and so is a pair in two named classes of one file.
- On gson, the three pairs of copies are extracted this way: the `read` methods of the URL and URI
  adapters, the `read` methods of the SqlDate and SqlTime adapters, and their `write` methods, whose
  shared type is bounded by `java.util.Date` because the code only compares the value with `null` or
  passes it to `format` of a `DateFormat`. The two `write` copies and the two `read` copies of the Sql
  adapters are one fix, so the new class carries all of their shared methods at once.

`java-extract-partial-run` is a review recipe too, for the `partial-run` verdict, for two methods of one class.
The new method is private, static when the run reads no instance state, and placed after the first
method. It takes the locals and parameters the run reads, and copies the `throws` clause that the
two methods share.

- The value the code after the run uses is returned, with the type of its declaration. A run that
  ends with `return` becomes `return call()`. An input declared with C-style brackets
  (`String tags[]`) is typed with its brackets. A comment between the statements of the run that
  only the second copy has declines. A `var` declaration, an array declarator or an
  annotation on that declaration is left alone, because the new method must name the type.
- The rest of the cases are as for TypeScript, and a run inside a `try` that has a `catch` is left
  alone too, because the new method would have to declare the checked exceptions of the run.
- Different `throws` clauses, a method with type parameters, a different static modifier, a
  different type in an input and different thrown classes decline.
- Without a compile step the recipe does not check the result. It declines whenever a type, a
  definite assignment or a checked exception could change.

## Review list (applied only when the run selects the rule)

281 checks. Their fix is correct for the finding but one of these holds, so a person asks for it:

- it changes behaviour on purpose, because the code was a bug (`ArrayEquals`, `ArrayToString`,
  `DeadException`, `EqualsNaN`, `NCopiesOfChar`, `ShortCircuitBoolean`, `RandomModInteger`);
- it changes a signature, visibility or a modifier other files may rely on (`ClassCanBeStatic`,
  `FieldCanBeFinal`, `NonFinalStaticField`, `EffectivelyPrivate`, `CheckedExceptionNotThrown`,
  `UnnecessaryBoxedVariable`, `PrivateConstructorForUtilityClass`, `UnusedTypeParameter`);
- it renames a symbol (`IdentifierName`, `TypeParameterNaming`, `UnnecessaryTestMethodPrefix`,
  `InconsistentCapitalization`, `VariableNameSameAsType`);
- it rewrites a larger shape (`StatementSwitchToExpressionSwitch`, `PatternMatchingInstanceof`,
  `UngroupedOverloads`, `RefactorSwitch`, `FieldCanBeLocal`, `AssertThrowsMinimizer`);
- it needs a library the project may not have, or only matters for one (Guice, Dagger, AutoValue,
  Flogger, Truth, Mockito, JUnit, Joda-Time, protobuf, Android);
- its fix spans several places that must change together (`FieldCanBeLocal`, `BadImport`), and the
  hunk filter cannot tell a partly kept fix from a whole one. Select these on a file you reviewed.

The full list is `languages/java/fix/errorprone/checks/review-checks.mts`.

## Left out

32 checks never get a fix from `--fix`, listed in
`languages/java/fix/errorprone/checks/left-out-checks.mts`:

- the fix inserts a comment, which recipes never do: `MissingDefault`,
  `SuppressWarningsWithoutExplanation`, `MissingSummary`, `ArgumentSelectionDefectChecker`;
- the fix only helps people who write Error Prone checks: `ASTHelpersSuggestions`,
  `BugPatternNaming`, `InjectOnBugCheckers`, `DoNotClaimAnnotations`, `MemoizeConstantVisitorStateLookups`,
  `UnnecessaryMethodInvocationMatcher`, `MisformattedTestData`, `SymbolToString`, `TreeToString`,
  `TypeToString`;
- the preset turns the check off, because its fix fights another allowed form: `ForEachIterable`
  (crashes Error Prone on record patterns) and `FieldCanBeStatic` (crashes it on Lombok getters);
- the fix is a guess without a safe form: `StringSplitter` (Guava's `Splitter`, a dependency the
  preset does not ask for), `ObjectToString`, `UndefinedEquals`, `ErroneousBitwiseExpression`,
  `ComparisonContractViolated`, `DistinctVarargsChecker`, `FromTemporalAccessor`,
  `FuturesGetCheckedIllegalExceptionType`, `ClassInitializationDeadlock`, `DeeplyNested`,
  `MockNotUsedInProduction`, `MoreThanOneQualifier`, `PreferTestParameter`,
  `RobolectricShadowDirectlyOn`, `UnnecessarySetDefault`, `WakelockReleasedDangerously`.

A test keeps the three lists apart and checks that none names a check the preset turns off.

## Fix-only checks for PMD and Checkstyle rules

PMD and Checkstyle ship no fixes. Where a rule has one correct rewrite, nitpicker ships an Error
Prone `BugChecker` that suggests it. The sources are in `languages/java/gradle/errorprone/fix-checks/`
(package `nitpicker.fix`, Apache-2.0, registered through `META-INF/services`).

- The patch compile of `--fix` passes `-XepNitpickerFixChecks:<folder>`. `ErrorProneReport.java`
  compiles the folder against the same Error Prone jars the compile uses, puts the classes on the
  processor path and drops the flag before Error Prone sees it. Nothing else loads them: the gate
  never compiles or runs them, so they never produce a finding.
- Each check is named after the rule it fixes. A hunk of the patch is labelled with the check whose
  diagnostic sits nearest, and the recipe reports it as `pmd/<Rule>`, the finding PMD raised.
- A check edits the file it reports on. Error Prone cannot edit another compilation unit, so no
  check renames a public symbol. The naming rules are not covered: `IdentifierName` on the review
  list above already renames fields, locals, parameters and constants of one file, and a rename that
  must reach other files stays a person's job.
- An import a fix leaves unused is removed only when no other text in the file names it.
- A check does not touch what it cannot rewrite with certainty, for example a `@Resource` field.

### Rule status

| Rule                                                                                                                                                 | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pmd/LiteralsFirstInComparisons`                                                                                                                     | built, review: `x.equals("a")` becomes `"a".equals(x)` for a `String` receiver (the same for `equalsIgnoreCase` and `contentEquals`). A null `x` no longer throws and the call returns false, which can hide a bug                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `pmd/UseStandardCharsets`                                                                                                                            | built, safe: `Charset.forName("UTF-8")` becomes `StandardCharsets.UTF_8` for the six standard names                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `pmd/SpringComposedMapping`                                                                                                                          | built, safe: `@RequestMapping(method = GET, ...)` on a method becomes `@GetMapping(...)`, for one of GET, POST, PUT, PATCH, DELETE. Several methods, other attributes and HEAD, OPTIONS or TRACE are left                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `pmd/SpringRestController`                                                                                                                           | built, safe: `@ResponseBody` is dropped inside a `@RestController`, and `@Controller` with a class-level `@ResponseBody` becomes `@RestController`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `pmd/LogStringConcatenation`                                                                                                                         | built, safe: a message built with `+` or `String.format` or `formatted` (with `%s` and `%d` only) becomes `{}` placeholders, for SLF4J and Log4j 2. Left: `java.util.logging`, `System.Logger` and Commons Logging (`{0}` formatting changes numbers and quotes, and Commons Logging has no placeholders), a message holding a brace, a constant message, a throwable operand, a reference array that would be the only value (the varargs overload would log its first element). Literal operands next to the text join the message                                                                                                                                                                                                                                                                                                                                                                                    |
| `pmd/UseCollectionIsEmpty`                                                                                                                           | built, safe: `size() == 0`, `size() > 0` and the equal forms (also with the literal first) on a `Collection` or `Map` become `isEmpty()` or `!isEmpty()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `pmd/SpringDataNoSaveInLoop`                                                                                                                         | built, review: a `save`, `saveAndFlush`, `delete` or `deleteById` call on a Spring Data repository that is the last step of a `for` loop or a `forEach` lambda is collected into a list declared before the loop and sent once with `saveAll`, `saveAllAndFlush`, `deleteAll` or `deleteAllById` after it; a loop that only writes its own element becomes one batch call on the collection. Left: a loop that reads the returned entity or anything the write changes, calls another repository, entity manager, JDBC or bean method, a `this` method, returns, throws, breaks to a label, a `while` loop, a parallel stream, a `Map.forEach`, a write inside `try`, `switch` or after other statements of the pass, a repository field that can change, and an element type that cannot be named. Review: the writes now happen after the loop, so a failure stops all of them, and entity listeners run in one batch |
| `pmd/SpringDataBatchOfOne`                                                                                                                           | built, review: `saveAll`, `saveAllAndFlush`, `deleteAll`, `deleteAllById` or `deleteAllInBatch` called with `List.of(x)`, `Set.of(x)`, `Collections.singletonList(x)` or `Collections.singleton(x)` in a loop gets the same rewrite as `pmd/SpringDataNoSaveInLoop`, under the same declines. Left: a one-element list built in the body with `add`, a factory given an array, and a call whose result is used                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `pmd/PreserveStackTrace`                                                                                                                             | built, review: `throw new X(...)` in a catch block gets the caught exception as its last argument when `X` has exactly one matching constructor that takes a `Throwable` after the same arguments                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `pmd/SpringConstructorInjection`                                                                                                                     | built, review: `@Autowired`, `@Inject` and `@Value` fields of a class with no constructor become final fields set by a new constructor (`@Qualifier`, `@Named` and `@Value` move to its parameters); the annotation on the only constructor is dropped. Left: setters, `@Resource`, `@Autowired(required = false)`, fields with other annotations, fields assigned elsewhere, Lombok constructors. It can turn a circular dependency that field injection tolerated into a start-up error                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `pmd/DetachedTestCase`                                                                                                                               | built, review: a public, void, parameterless, unannotated method of a test class gets the `@Test` its sibling tests use (JUnit 5, JUnit 4 or TestNG; skipped when the class mixes them). The test then runs and may fail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `pmd/RetryInTest`                                                                                                                                    | built, review: `@RetryingTest` and `@RepeatedIfExceptionsTest` become JUnit 5 `@Test`, and a TestNG `retryAnalyzer` attribute is dropped. Left: `IRetryAnalyzer` implementations and `setRetryAnalyzer` calls                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `pmd/MutationIgnoreMarker`                                                                                                                           | built, review: `@DoNotMutate` and `@CoverageIgnore` are removed, so mutation testing sees the code again                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `pmd/GeneratedOnHandWrittenCode`                                                                                                                     | built, review: an annotation whose name holds `Generated` is removed from a class or method, except JPA `@GeneratedValue`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `effects/EntityLoadedForExistence`                                                                                                                   | built, review: `findById(id).isPresent()`, `isEmpty()`, `orElse(null) != null` and `== null`, a single-row `findByX(args)` tested with `isPresent`, `isEmpty` or null, and `countByX(args)` compared with zero or one become `existsById(id)` or `existsByX(args)` (negated when absent), only when the Spring Data repository interface declares or inherits exactly one abstract `existsByX` taking the same arguments; declined for `@Query` or other Spring Data annotated finders, `findFirst`/`findTop`/`Distinct`/`OrderBy` names without an exact `exists` twin, derived names that differ in keywords, finders declared in a fragment or as a default method, and a result stored in a variable or used further                                                                                                                                                                                                |
| `checkstyle/ArrayTypeStyle`, `checkstyle/MultipleVariableDeclarations`, `checkstyle/NeedBraces`, `checkstyle/AvoidStarImport`, `checkstyle/UpperEll` | skipped: the Error Prone twins above (`MixedArrayDimensions`, `MultiVariableDeclaration`, `MissingBraces`, `WildcardImport`) and `java-upper-ell` clear the finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| PMD twins listed above (`UnusedPrivateMethod`, `MissingOverride`, `UselessParentheses`, ...)                                                         | skipped for the same reason                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Checkstyle and PMD naming rules                                                                                                                      | not built, see above                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| the rest of the roughly 68 rules with one rewrite                                                                                                    | not built yet: only the rules above have a check. Each further rule is one class in the fix-checks folder, one entry in `languages/java/fix/errorprone/own/own-checks.mts` and one fixture                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

A hunk that merges the fixes of two checks (Error Prone writes one hunk for changes a few lines
apart) is reported under the nearest rule. In the patch compile the Error Prone report gives each
diagnostic the end line of the statement it starts, and every hunk inside that span (or adding lines
right before or after it) of a fix-only check's diagnostic is kept or dropped as one, so a
rewrite that declares something before a loop, edits it and finishes after it is never half applied
when the change touched only one of those lines. A fix of an upstream Error Prone check that spans
several places, such as the import a check removes, can still be kept in part when only some of the
lines were changed: select these rules on a file you reviewed.
