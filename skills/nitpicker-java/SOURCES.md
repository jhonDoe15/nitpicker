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
`languages/java/fix/errorprone/checks/safe-checks.mjs`.

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

`java-extract-near-duplicate` is a safe recipe for `structure/near-duplicate`. It parses each main
source file with the tree-sitter grammar of the rule, finds the pairs with the engine and filters of
the rule, and works on a `same` or `parameterizable` pair of methods in one class. The first copy
becomes a private method placed after it, static when the body reads no instance state, and both
bodies become one call. Signatures, `throws` clauses and annotations stay.

- A differing literal, or a parameter of the method that nothing writes, becomes a parameter named
  after what it flows into. A differing call or any other expression is not passed: a `Supplier`
  would need the static type of the expression, which the text does not give, so the finding stays.
- A literal in a `case` label, an annotation or a loop condition, an `int` literal that could narrow
  to `byte`, `short` or `char`, a method with type parameters or varargs, copies with different
  `throws`, a copy that is the only static one, copies in an interface, an enum, a record or an
  anonymous class, a name the file already uses, and a copy in more than one pair are left alone.
- Type holes are not turned into type parameters: `new URL(text)` against `new URI(text)` cannot be
  written with a type parameter, and a changed signature would change callers.
- Pairs in two classes or two files are not looked at. On gson, the URL and URI adapters are
  anonymous classes and the SqlDate and SqlTime adapters are in two files, so the recipe changes
  nothing there.

`java-extract-partial-run` is the same for the `partial-run` verdict, for two methods of one class.
The new method is private, static when the run reads no instance state, and placed after the first
method. It takes the locals and parameters the run reads, and copies the `throws` clause that the
two methods share.

- The value the code after the run uses is returned, with the type of its declaration. A run that
  ends with `return` becomes `return call()`. A `var` declaration, an array declarator or an
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

The full list is `languages/java/fix/errorprone/checks/review-checks.mjs`.

## Left out

32 checks never get a fix from `--fix`, listed in
`languages/java/fix/errorprone/checks/left-out-checks.mjs`:

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

| Rule                                                                                                                                                 | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pmd/LiteralsFirstInComparisons`                                                                                                                     | built, review: `x.equals("a")` becomes `"a".equals(x)` for a `String` receiver (the same for `equalsIgnoreCase` and `contentEquals`). A null `x` no longer throws and the call returns false, which can hide a bug                                                                                                                                                                                                                                                                        |
| `pmd/UseStandardCharsets`                                                                                                                            | built, safe: `Charset.forName("UTF-8")` becomes `StandardCharsets.UTF_8` for the six standard names                                                                                                                                                                                                                                                                                                                                                                                       |
| `pmd/SpringComposedMapping`                                                                                                                          | built, safe: `@RequestMapping(method = GET, ...)` on a method becomes `@GetMapping(...)`, for one of GET, POST, PUT, PATCH, DELETE. Several methods, other attributes and HEAD, OPTIONS or TRACE are left                                                                                                                                                                                                                                                                                 |
| `pmd/SpringRestController`                                                                                                                           | built, safe: `@ResponseBody` is dropped inside a `@RestController`, and `@Controller` with a class-level `@ResponseBody` becomes `@RestController`                                                                                                                                                                                                                                                                                                                                        |
| `pmd/LogStringConcatenation`                                                                                                                         | built, safe: a message built with `+` or `String.format` or `formatted` (with `%s` and `%d` only) becomes `{}` placeholders, for SLF4J and Log4j 2. Left: `java.util.logging`, `System.Logger` and Commons Logging (`{0}` formatting changes numbers and quotes, and Commons Logging has no placeholders), a message holding a brace, a constant message, a throwable operand                                                                                                             |
| `pmd/UseCollectionIsEmpty`                                                                                                                           | built, safe: `size() == 0`, `size() > 0` and the equal forms (also with the literal first) on a `Collection` or `Map` become `isEmpty()` or `!isEmpty()`                                                                                                                                                                                                                                                                                                                                  |
| `pmd/PreserveStackTrace`                                                                                                                             | built, review: `throw new X(...)` in a catch block gets the caught exception as its last argument when `X` has exactly one matching constructor that takes a `Throwable` after the same arguments                                                                                                                                                                                                                                                                                         |
| `pmd/SpringConstructorInjection`                                                                                                                     | built, review: `@Autowired`, `@Inject` and `@Value` fields of a class with no constructor become final fields set by a new constructor (`@Qualifier`, `@Named` and `@Value` move to its parameters); the annotation on the only constructor is dropped. Left: setters, `@Resource`, `@Autowired(required = false)`, fields with other annotations, fields assigned elsewhere, Lombok constructors. It can turn a circular dependency that field injection tolerated into a start-up error |
| `pmd/DetachedTestCase`                                                                                                                               | built, review: a public, void, parameterless, unannotated method of a test class gets the `@Test` its sibling tests use (JUnit 5, JUnit 4 or TestNG; skipped when the class mixes them). The test then runs and may fail                                                                                                                                                                                                                                                                  |
| `pmd/RetryInTest`                                                                                                                                    | built, review: `@RetryingTest` and `@RepeatedIfExceptionsTest` become JUnit 5 `@Test`, and a TestNG `retryAnalyzer` attribute is dropped. Left: `IRetryAnalyzer` implementations and `setRetryAnalyzer` calls                                                                                                                                                                                                                                                                             |
| `pmd/MutationIgnoreMarker`                                                                                                                           | built, review: `@DoNotMutate` and `@CoverageIgnore` are removed, so mutation testing sees the code again                                                                                                                                                                                                                                                                                                                                                                                  |
| `pmd/GeneratedOnHandWrittenCode`                                                                                                                     | built, review: an annotation whose name holds `Generated` is removed from a class or method, except JPA `@GeneratedValue`                                                                                                                                                                                                                                                                                                                                                                 |
| `checkstyle/ArrayTypeStyle`, `checkstyle/MultipleVariableDeclarations`, `checkstyle/NeedBraces`, `checkstyle/AvoidStarImport`, `checkstyle/UpperEll` | skipped: the Error Prone twins above (`MixedArrayDimensions`, `MultiVariableDeclaration`, `MissingBraces`, `WildcardImport`) and `java-upper-ell` clear the finding                                                                                                                                                                                                                                                                                                                       |
| PMD twins listed above (`UnusedPrivateMethod`, `MissingOverride`, `UselessParentheses`, ...)                                                         | skipped for the same reason                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Checkstyle and PMD naming rules                                                                                                                      | not built, see above                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| the rest of the roughly 68 rules with one rewrite                                                                                                    | not built yet: only the rules above have a check. Each further rule is one class in the fix-checks folder, one entry in `languages/java/fix/errorprone/own/own-checks.mjs` and one fixture                                                                                                                                                                                                                                                                                                |

A hunk that merges the fixes of two checks (Error Prone writes one hunk for changes a few lines
apart) is reported under the nearest rule. A fix that spans several places, such as the import a
check removes, can be kept in part when only some of the lines were changed: select these rules on a
file you reviewed.
