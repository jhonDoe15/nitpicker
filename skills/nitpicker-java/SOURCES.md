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
