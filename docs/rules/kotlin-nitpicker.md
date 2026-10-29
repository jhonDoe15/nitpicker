# Kotlin: nitpicker source checks

The Kotlin source checks, the compiler warnings and the ktlint and ktfmt format checks of the Kotlin preset. This page lists 35 rules. [All pages](README.md).

The guide for these rules: [docs/kotlin-preset.md#source-checks](../kotlin-preset.md#source-checks).

In the Kotlin preset, an entry of `exceptions` names a detekt rule as `detekt.<ruleset>.<Rule>`, one of these rules: `catch-log-without-exception`, `test-without-assertion`, `function-lines-limit`, `function-statements-limit`, `function-control-nesting-limit`, `function-parameters-limit`, `crap-score-limit`, `crap-coverage-unknown`, `changed-branch-coverage`, `mutant-survived`, `mutant-nocoverage`, `duplicate-clone`, `stability-direction`, `file-lines-limit`, `line-length-limit`, `folder-files-limit`, `slow-test`, `committed-env-file`, `committed-private-key`, `committed-binary`, `large-file`, `committed-build-output`, `co-change`, `test-only-export`, `test-console-output`, `folder-depth-limit`, `class-methods-limit`, `class-fields-limit`, `inheritance-depth-limit`, `test-runtime/slow-test`, `test-runtime/test-console-output`, `test-runtime/test-not-run`, `coupling/test-only-export`, `kotlin-source/GeneratedOnHandWrittenCode`, `kotlin-source/MutationIgnoreMarker`, `kotlin-source/CommentedOutCode`, `kotlin-source/MutableModuleState`, `kotlin-source/GenericTypeName`, `kotlin-source/GenericPackageName`, `kotlin-source/LogStringConcatenation`, `kotlin-source/ShellCommand`, `kotlin-source/IoCallInLoop`, `kotlin-source/CatchOnlyLogsOrReturnsDefault`, `kotlin-source/BooleanFlagParameter`, `kotlin-source/HardcodedSecret`, `kotlin-source/CredentialLiteral`, `kotlin-source/SecretInLog`, `kotlin-source/TestClassWithoutTestCases`, `kotlin-source/DetachedTestCase`, `kotlin-source/TestHelperInSource`, `kotlin-source/SqlStringBuilding`, `kotlin-source/WeakHash`, `kotlin-source/TlsVerificationOff`, `kotlin-source/HttpWithoutTimeout`, `kotlin-source/UnsafeDeserialization`, `kotlinc/deprecation`, `kotlinc/unchecked`, `kotlinc/cast`, `kotlinc/lint-not-run`, `pmd/FixedSleepInTest`, `pmd/NegativeWaitInTest`, `pmd/DisabledTest`, `pmd/FocusedTest`, `pmd/AssertionInControlFlow`, `pmd/CoroutineEscapesTest`, `pmd/SpringUnusedContext`, `pmd/ExhaustiveEnumPredicate`, `pmd/StaticForwardingWrapper`, `pmd/SingularAndPluralMember`, `pmd/ClassLoadEffect`, `pmd/SpringConstructorInjection`, `pmd/SpringImmutableBeans`, `pmd/SpringNoServiceLocator`, `pmd/SpringNoLazyInjection`, `pmd/SpringLiteConfiguration`, `pmd/SpringNoComponentScan`, `pmd/SpringBeanCollectionState`, `pmd/SpringHttpClientPerCall`, `pmd/SpringHttpClientTimeouts`, `pmd/SpringNoPostConstructIo`, `pmd/SpringTypedConfiguration`, `pmd/SpringValueSecretDefault`, `pmd/SpringProfileOnConfiguration`, `pmd/SpringProxyMethodVisibility`, `pmd/SpringProxySelfCall`, `pmd/SpringTransactionalAnnotation`, `pmd/SpringNoTransactionalController`, `pmd/SpringNoRequiresNew`, `pmd/SpringNoSwallowedTransactionException`, `pmd/SpringTransactionalCheckedRollback`, `pmd/SpringTransactionalReadOnlyWrite`, `pmd/SpringAsyncExecutor`, `pmd/SpringScheduledFixedDelay`, `pmd/SpringComposedMapping`, `pmd/SpringRestController`, `pmd/SpringValidRequestBody`, `pmd/SpringTypedResponse`, `pmd/SpringTypedRequestBody`, `pmd/SpringNoErrorLeak`, `pmd/SpringNoCrossOrigin`, `pmd/SpringCorsWildcard`, `pmd/SpringPasswordEncoder`, `pmd/SpringPermitAllAnyRequest`, `pmd/SpringCsrfDisabled`, `pmd/SpringHardcodedUser`, `pmd/JpaLazyFetching`, `pmd/JpaEntityClass`, `pmd/JpaManyToManyCascade`, `pmd/JpaManyToManySet`, `pmd/JpaVersion`, `pmd/JpaSequenceIds`, `pmd/JpaEnumString`, `pmd/JpaIdentityHashCode`, `pmd/SpringDataDerivedQuery`, `pmd/SpringDataNativeQuery`, `pmd/SpringDataModifyingQuery`, `pmd/SpringDataNoSaveInLoop`, `pmd/SpringDataNoFlush`, `pmd/SpringDataNamedParameters`, `pmd/SpringDataQueryTextBlock`, `pmd/SpringDataBatchOfOne`, `pmd/SpringDataRowWriteInLoop`, `pmd/SpringDataSaveInLoopHelper`, `pmd/SpringDataFilterInQuery`, `pmd/SpringQueryConcatenation` and `unused-option`, or, for the Java sources of the project, a finding as it prints, `<tool>/<rule>` with one of the tools `pmd`, `spotbugs`, `errorprone`, `archunit`, `google-java-format`, `palantir-java-format`, `jacoco`, `checkstyle`, `crap`, `duplicates`, `pit`, `structure`, `coupling`, `spring` and `test-runtime`.

Unless an entry says otherwise:

- **Presets:** Kotlin
- **Analyzers:** `kotlin`
- **Builds:** Gradle
- **Why it is on:** A scan of the Kotlin sources on the Node side, after comments and string bodies are masked, reports it: the Kotlin counterpart of a TypeScript, Java or Python rule that narrows one spot to one allowed form.

<a id="detekt-catch-log-without-exception"></a>

### `detekt/catch-log-without-exception`

A `catch` block that logs a failure without passing the caught exception to the logger.

- **Why it is on:** A scan of the Kotlin sources on the Node side reports it under the tool detekt.
- **Allowed form:** Pass the caught exception to the logger as its own argument so the stack trace is kept (log.error("what failed", e), or logger.error(e) { "what failed" }). e.message, e.toString() and a string template of the exception drop it.
- **Exception:** If this is intended, add `{"rule":"catch-log-without-exception","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md#source-scans)

<a id="detekt-inline-suppression"></a>

### `detekt/inline-suppression`

An inline `@Suppress` of a detekt or ktlint rule, a ruleset, `all` or a compiler warning the kotlinc lint reports.

- **Why it is on:** A `@Suppress` would hide a finding from the report, so a source scan reports every token that targets one.
- **Exception:** No exception applies: the routes are to fix the code, and `exclude` for generated code.
- **Allowed forms by message:**
  - `detekt.<ruleset>`: Suppressing "detekt.style" inline is not allowed. Fix the code the rule flags; to skip generated code, add it to "exclude" in nitpicker.config.json.
  - `UNCHECKED_CAST`: Suppressing "UNCHECKED_CAST" inline is not allowed. Fix the code the compiler warns about.
- **See also:** [Kotlin preset guide](../kotlin-preset.md#one-way-rules)

<a id="detekt-test-without-assertion"></a>

### `detekt/test-without-assertion`

A test method that calls no assertion.

- **Why it is on:** A scan of the Kotlin sources on the Node side reports it under the tool detekt.
- **Allowed form:** Assert the result (assertEquals, assertFailsWith, `shouldBe`, MockK `verify`): this test has no assertion, so it passes whenever the code does not throw. A project helper that asserts is learned from the tests that end with it (conventions kotlin.assertionHelpers).
- **Exception:** If this is intended, add `{"rule":"test-without-assertion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md#source-scans)

<a id="kotlin-source-booleanflagparameter"></a>

### `kotlin-source/BooleanFlagParameter`

An unannotated `Boolean` parameter of a public function that is the condition of an `if`, `when` or `while`; private, `override`, setters, `with*`, `of`/`from`/`valueOf` are skipped.

- **Allowed form:** Split the function into two functions named for each behavior, or pass an enum or a small data class: this boolean parameter switches the function between two behaviors, which makes the call site unreadable.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/BooleanFlagParameter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-catchonlylogsorreturnsdefault"></a>

### `kotlin-source/CatchOnlyLogsOrReturnsDefault`

A `catch` that neither throws, nor uses the exception, nor answers with an error response; log calls and `printStackTrace` do not count (so it is the one finding for a catch that only logs); an interrupt and a retry loop are skipped.

- **Allowed form:** Rethrow it with the cause (`throw OrderException(message, e)`), return a failure result that carries the exception (`Result.failure(e)`), or answer with an error response: this catch only logs the failure or returns a default, and carries on.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/CatchOnlyLogsOrReturnsDefault","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-commentedoutcode"></a>

### `kotlin-source/CommentedOutCode`

A run of line comments, or a block comment, whose first code-shaped line is a declaration, call, assignment, control header, `fun`, `class`, import or return.

- **Allowed form:** Delete the commented-out code; version control keeps it.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/CommentedOutCode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-credentialliteral"></a>

### `kotlin-source/CredentialLiteral`

An AWS key, a GitHub or Slack token, a `sk_live_`/`sk-proj-` key, a private key header, a password in a URL or a `Bearer`/`Basic` value.

- **Allowed form:** Read it from the environment or a secrets manager: this string looks like a credential (access key, token, private key, or a password in a URL).
- **Exception:** If this is intended, add `{"rule":"kotlin-source/CredentialLiteral","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-detachedtestcase"></a>

### `kotlin-source/DetachedTestCase`

(test sources) a public no-argument function with a block body and no return type (or `: Unit`) named like a test (backticks, `test*`, `should*`) without an annotation, in a class that has tests; a helper or data provider that returns a value passes.

- **Allowed form:** Annotate the function with @Test so JUnit runs it, or make it private if it is a helper: this test never runs.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/DetachedTestCase","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-generatedonhandwrittencode"></a>

### `kotlin-source/GeneratedOnHandWrittenCode`

An annotation named `Generated` (any package, also `@get:`/`@set:`) on a class, object, interface, function or constructor (JaCoCo and PIT skip it), as the Java rule; `@GeneratedValue` and `@Generated` on a property pass.

- **Allowed form:** Remove the annotation from hand-written code: JaCoCo and PIT skip a class, function or constructor annotated @Generated, so this is not measured.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/GeneratedOnHandWrittenCode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-genericpackagename"></a>

### `kotlin-source/GenericPackageName`

A package segment `util`, `utils`, `utility`, `helpers`, `manager`, `common`, `commons`, `misc`.

- **Allowed form:** Name this package for what it holds, not utils, helpers, common or misc. Pure logic shared between features goes in the shared package under a name that says what it does.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/GenericPackageName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-generictypename"></a>

### `kotlin-source/GenericTypeName`

A class, interface or object named `*Util(s)`, `*Utility`, `*Utilities`, `*Helper`, `*Manager`, `*Common(s)`, `*Misc`; framework roles and a type that extends one with the same ending are skipped.

- **Allowed form:** Name this type for what it does (`PriceRounder`, `OrderTotals`), not Utils, Helper, Manager, Common or Misc. Pure logic shared between features goes in the shared package under such a name.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/GenericTypeName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-hardcodedsecret"></a>

### `kotlin-source/HardcodedSecret`

A secret-looking literal assigned to a name like `*password`, `*secret`, `*token`, `*apiKey`, also as a named argument, a `"key" to "value"` pair or a `"key", "value"` argument pair.

- **Allowed form:** Read it from the environment or a secrets manager and inject it: this variable holds a hardcoded secret.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/HardcodedSecret","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-httpwithouttimeout"></a>

### `kotlin-source/HttpWithoutTimeout`

A `java.net.http` request built without `.timeout(...)`, an `HttpURLConnection` from an HTTP URL whose block never sets `readTimeout`, `URL(...).readText()`/`readBytes()`/`openStream()`, `RestTemplate()`, `HttpClients.createDefault()`; OkHttp and Ktor pass (their engines set timeouts).

- **Allowed form:** Give the call a deadline: `HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(10))` (java.net.http), `connectTimeout` and `readTimeout` on an `HttpURLConnection`, a client with timeouts (OkHttp, which sets them by default, or Ktor with `install(HttpTimeout) { requestTimeoutMillis = 10_000 }`), `RestTemplateBuilder().connectTimeout(...).readTimeout(...)` for Spring, or `RequestConfig.custom().setResponseTimeout(...)` for the Apache client. This HTTP call has no timeout, so a server that never answers hangs it for good.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/HttpWithoutTimeout","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-iocallinloop"></a>

### `kotlin-source/IoCallInLoop`

A repository, DAO, JDBC or HTTP client call in a `for`, `while` or `do` body or an iterating lambda (`forEach`, `map`, `filter` and similar); paging and polling loops (a `while` or `do` whose condition, `if (...) break` or `?: break` reads what the call returned) and retries (the call in a `try` that leaves the loop) pass; file calls are not checked.

- **Allowed form:** Fetch or write all items at once (`findAllById`, `saveAll`, `deleteAll`, `WHERE id IN (...)`, one batched request): this calls a database, HTTP or repository API once per loop item. Paging, polling and retry loops are fine.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/IoCallInLoop","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-logstringconcatenation"></a>

### `kotlin-source/LogStringConcatenation`

An `info`, `warn`, `error`, `log`, `config`, `warning` or `severe` call on a logger (the levels of the Java rule) whose message is a string template, `+` or `format` with a value that is not a compile-time constant (a literal, a `CONSTANT_CASE` name or a `const val` is one).

- **Allowed form:** Pass values as placeholders (`log.info("user {}", user)`), or give a lambda logger the message (`logger.info { "user $user" }`), not a message built with a string template, `+` or `format`.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/LogStringConcatenation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-mutablemodulestate"></a>

### `kotlin-source/MutableModuleState`

A top-level `var`, or a mutable collection, array, atomic or `MutableStateFlow` in a top-level `val`, or either in an `object` or companion object.

- **Allowed form:** Keep state in an instance: a class whose object the composition root creates and passes in, holding `val`s and immutable `listOf`/`mapOf`. A top-level `var` or a mutable collection in an `object` is shared by the whole program.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/MutableModuleState","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-mutationignoremarker"></a>

### `kotlin-source/MutationIgnoreMarker`

`@DoNotMutate`, `@CoverageIgnore`.

- **Allowed form:** Remove the annotation and kill the mutants with a test: PIT does not mutate code annotated @DoNotMutate or @CoverageIgnore.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/MutationIgnoreMarker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-secretinlog"></a>

### `kotlin-source/SecretInLog`

A secret-named value passed to a log call (any level, Android `Log.d` too) or `print`, directly, in a `+`, in a template or in a lambda message (`logger.info { "token $token" }`).

- **Allowed form:** Log that the secret is set, or a masked tail, instead of the secret itself.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/SecretInLog","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-shellcommand"></a>

### `kotlin-source/ShellCommand`

A shell and its command flag as consecutive literals (`"sh", "-c"`, `"bash", "-c"`, `"cmd", "/c"`, `"powershell", "-Command"`).

- **Allowed form:** Run the program directly with an argument list (`ProcessBuilder("git", "log", ref)`), not through a shell with `-c`.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/ShellCommand","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-sqlstringbuilding"></a>

### `kotlin-source/SqlStringBuilding`

SQL text built from a runtime value with a string template, `+`, `String.format` or `.format`: text that starts like a statement or clause in capitals (`SELECT ... FROM`, `UPDATE ... SET`, `AND name =`), or any case when it reaches a JDBC, Spring `JdbcTemplate`, JPA or R2DBC query call directly or through a `val`.

- **Allowed form:** Pass values as bind parameters: `jdbcTemplate.query("SELECT * FROM users WHERE id = ?", mapper, id)`, `prepareStatement("... WHERE id = ?")` with `setLong(1, id)`, `:id` with `NamedParameterJdbcTemplate` or JPA `setParameter("id", id)`, or a query DSL (Exposed, jOOQ). Build placeholder lists from placeholders alone (`ids.joinToString(", ") { "?" }`), optional filters from literal fragments joined with `" AND "`, and take a table or column name from a constant or an enum. This SQL text is built from a runtime value with a string template, `+` or `format`, so the value can change the statement (SQL injection).
- **Exception:** If this is intended, add `{"rule":"kotlin-source/SqlStringBuilding","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-testclasswithouttestcases"></a>

### `kotlin-source/TestClassWithoutTestCases`

(test sources) a class named `*Test`, `*Tests`, `*TestCase` or `*IT` with no test annotation in it; abstract and open classes, Kotest specs and classes with a superclass, suites and `@Nested` are skipped.

- **Allowed form:** Add @Test functions to the class, or rename it if it is a helper (for example `TestInputGenerator` becomes `InputGenerator`): a test class without tests never runs.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/TestClassWithoutTestCases","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-testhelperinsource"></a>

### `kotlin-source/TestHelperInSource`

A main source that imports JUnit, kotlin.test, Kotest, MockK, Mockito, AssertJ, Truth, Strikt or Hamcrest.

- **Allowed form:** Move the test helper to the test sources (`src/test/kotlin`): production code must not import a test framework.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/TestHelperInSource","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-tlsverificationoff"></a>

### `kotlin-source/TlsVerificationOff`

An empty `checkServerTrusted`, a host-name verifier or trust strategy that returns `true`, `NoopHostnameVerifier`, `TrustAllStrategy`, `TrustSelfSignedStrategy`, Netty's `InsecureTrustManagerFactory` (its use, not its import).

- **Allowed form:** Keep certificate and host-name verification on and trust the certificate authority instead: load it into a `KeyStore` and build the `SSLContext` from `TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply { init(keyStore) }`, use OkHttp `HandshakeCertificates.Builder().addTrustedCertificate(certificate)`, or set `-Djavax.net.ssl.trustStore` for a private CA. This trusts any certificate or host name, so anyone on the network can pose as the server, and turning it off by environment ships the switch to production.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/TlsVerificationOff","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-unsafedeserialization"></a>

### `kotlin-source/UnsafeDeserialization`

`XMLDecoder`, Jackson `enableDefaultTyping`, `activateDefaultTyping` with `LaissezFaireSubTypeValidator`, `JsonTypeInfo.Id.CLASS`/`MINIMAL_CLASS`, `SerializationUtils.deserialize`, Kryo without class registration (`ObjectInputStream` is detekt's `ForbiddenMethodCall`).

- **Allowed form:** Read the data as JSON into a concrete type: `Json.decodeFromString<Order>(text)` with kotlinx.serialization or `mapper.readValue<Order>(text)` with Jackson, with polymorphism by a logical name (a `sealed` class with kotlinx.serialization, or `@JsonTypeInfo(use = JsonTypeInfo.Id.NAME)` with `@JsonSubTypes`). This reads class names or objects from the data, so a crafted payload builds any class on the classpath and runs code.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/UnsafeDeserialization","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-weakhash"></a>

### `kotlin-source/WeakHash`

`MessageDigest`, `Signature`, `DigestUtils` with MD2, MD4, MD5 or SHA-1 (a literal, a constant in the file or a commons-codec constant), commons-codec, Spring, Guava and Okio MD5/SHA-1 helpers, and HMAC-MD5 (`Mac`, `KeyGenerator`, `HmacUtils`, its own message); HMAC-SHA1 passes.

- **Allowed form:** Hash with `MessageDigest.getInstance("SHA-256")` (or SHA-384, SHA-512, SHA3-256), sign with `Mac.getInstance("HmacSHA256")`, and hash passwords with Argon2 or bcrypt (`Argon2PasswordEncoder`, `BCryptPasswordEncoder`): MD5 and SHA-1 are broken hashes, collisions are cheap and brute force is fast. A protocol you do not control that requires one (a legacy signature, an ETag, a WebSocket accept key) is the exception.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/WeakHash","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlinc-cast"></a>

### `kotlinc/cast`

A Kotlin compiler warning: `USELESS_CAST`.

- **Why it is on:** The kotlinc lint compiles the main Kotlin sources with the pinned compiler and reports these warnings as findings, like -Werror on the code the change touched; a build setting cannot hide them.
- **Allowed form:** Remove the cast.
- **Exception:** If this is intended, add `{"rule":"kotlinc/cast","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md#compiler-warnings)

<a id="kotlinc-deprecation"></a>

### `kotlinc/deprecation`

A Kotlin compiler warning: `DEPRECATION`, `TYPEALIAS_EXPANSION_DEPRECATION`.

- **Why it is on:** The kotlinc lint compiles the main Kotlin sources with the pinned compiler and reports these warnings as findings, like -Werror on the code the change touched; a build setting cannot hide them.
- **Allowed form:** Call the replacement the deprecation names (its `ReplaceWith`, or the Javadoc of a Java API).
- **Exception:** If this is intended, add `{"rule":"kotlinc/deprecation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md#compiler-warnings)

<a id="kotlinc-lint-not-run"></a>

### `kotlinc/lint-not-run`

The kotlinc lint could not compile the sources, for example because a compiler plugin could not be loaded.

- **Why it is on:** Without the lint compile, the compiler warnings above are not checked, so the run says so.
- **Allowed form:** No kotlinc lint report from the lint compile (kotlinc exited with an error), so unchecked casts, deprecated calls and redundant casts were not checked. Fix what that compile reports (the main sources, the compile class path and the compiler plugins).
- **Exception:** A descriptive finding: it never fails the gate, so no exception applies.
- **See also:** [Kotlin preset guide](../kotlin-preset.md#compiler-warnings)

<a id="kotlinc-unchecked"></a>

### `kotlinc/unchecked`

A Kotlin compiler warning: `UNCHECKED_CAST`.

- **Why it is on:** The kotlinc lint compiles the main Kotlin sources with the pinned compiler and reports these warnings as findings, like -Werror on the code the change touched; a build setting cannot hide them.
- **Allowed form:** Use a typed API, a checked conversion (`as? List<*>` and a check of each element) or a reified generic function instead of the unchecked cast.
- **Exception:** If this is intended, add `{"rule":"kotlinc/unchecked","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md#compiler-warnings)

<a id="ktfmt-format"></a>

### `ktfmt/format`

A Kotlin file is not formatted with ktfmt.

- **Why it is on:** When the project formats with ktfmt, the format check reports every file it would change.
- **Allowed form:** File is not formatted with ktfmt. Format it with the "Format with ktfmt" command printed at the start of the run. Not your formatter: set kotlin.formatter.
- **Exception:** No exception applies: format the file, or choose another formatter with `kotlin.formatter`.
- **See also:** [Kotlin preset guide](../kotlin-preset.md)

<a id="ktlint-ktlint-rule"></a>

### `ktlint/ktlint.<rule>`

A rule of the ktlint standard ruleset that a Kotlin file breaks.

- **Printed as:** `ktlint/ktlint.<rule>`
- **For example:** `ktlint/ktlint.standard:no-wildcard-imports`
- **Why it is on:** When the project formats with ktlint, the format check reports each rule of the ktlint standard ruleset that a file breaks.
- **Allowed form:** See the tool's documentation: [ktlint standard rules](https://pinterest.github.io/ktlint/latest/rules/standard/).
- **Exception:** No exception applies. Lift this rule with ktlint_standard\_\<rule> = disabled in .editorconfig, which nitpicker reads only when ktlint lists "project" (see the start of the run). Not your formatter: set kotlin.formatter.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [ktlint standard rules](https://pinterest.github.io/ktlint/latest/rules/standard/)

<a id="pmd-assertionincontrolflow"></a>

### `pmd/AssertionInControlFlow`

An assertion that can be skipped: inside an `if` or a `when` whose branches do not all assert, a loop, a safe call, `&&`, `||`, `?:`, a swallowing `try` or `runCatching`, or after an early return.

- **Why it is on:** One of the review rules of the Kotlin preset, a scan of the Kotlin sources on the Node side; it prints as a PMD rule, like the Java rules it mirrors.
- **Allowed form:** Assert unconditionally. An assertion inside an if, a when, a loop, a safe call, a try/catch that swallows the failure or a runCatching can be skipped, so the test passes without checking anything: a loop over an empty list, or a branch the data never takes, checks nothing. Assert in every branch (an if/else or when whose branches all assert or fail is fine), or narrow with assertNotNull, assertIs or `?: fail(...)` instead of an if or a safe call. Put a table of cases in a parameterized test (@ParameterizedTest with @MethodSource or @CsvSource, Kotest withData) and assert every time; for a loop over results, assert the whole collection at once (assertEquals(expected, results), shouldContainExactly, AssertJ containsExactly). Do not return early before the assertions, and let assertion errors escape. An exception fits only a case that cannot be stated unconditionally, such as cases generated at run time.
- **Exception:** If this is intended, add `{"rule":"pmd/AssertionInControlFlow","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md#review-rules)

<a id="pmd-coroutineescapestest"></a>

### `pmd/CoroutineEscapesTest`

A `launch`, `async`, `launchIn`, `stateIn` or `shareIn` on a scope the test does not own (`CoroutineScope(...)`, a scope field, `viewModelScope`) that nothing joins, awaits or cancels.

- **Why it is on:** One of the review rules of the Kotlin preset, a scan of the Kotlin sources on the Node side; it prints as a PMD rule, like the Java rules it mirrors.
- **Allowed form:** This test starts a coroutine that the test does not wait for, so it can still be running, or fail, after the test has passed: a launch, async, launchIn, stateIn or shareIn on CoroutineScope(...), MainScope(), a scope kept in a field or a local, a scope a helper returns, lifecycleScope or viewModelScope without a test Main dispatcher, or a TestScope outside runTest is not a child of the test, and with, run, apply or also on such a scope does not change that. Run the body in runTest (or runBlocking, coroutineScope, supervisorScope) and launch from there, keep the Job or Deferred and join or await it (`val job = scope.launch { ... }; job.join()`), or build the scope on the test dispatcher and drive it with advanceUntilIdle; `backgroundScope.launch` inside runTest is for work that should end with the test. An exception fits only when the test waits through a harness this rule cannot see.
- **Exception:** If this is intended, add `{"rule":"pmd/CoroutineEscapesTest","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md#review-rules)

<a id="pmd-disabledtest"></a>

### `pmd/DisabledTest`

A skipped test: `@Disabled`, `@Ignore`, `@Ignored` (also aliased or carried by an annotation), Kotest `xtest`, `xcontext`, `xdescribe`, `xit`, `xshould`, `xgiven`, a `!` name prefix, a `.config(...)` that never runs, a constant false condition or assumption.

- **Why it is on:** One of the review rules of the Kotlin preset, a scan of the Kotlin sources on the Node side; it prints as a PMD rule, like the Java rules it mirrors.
- **Allowed form:** Fix or delete this test instead of disabling it: @Disabled, @Ignore, @Ignored (also through an alias or an annotation that carries them), an x-prefixed Kotest name (xtest, xcontext, xdescribe, xit, xshould, xgiven), a "!" name prefix, `.config(enabled = false)`, a condition that is always false and an assumption that is always false all skip it while the build stays green, so nothing shows that the behavior it covered is unchecked. Delete the test when the behavior is gone; to run it only where it can run, use a condition on the environment (`@EnabledOnOs`, `@EnabledIfSystemProperty`, an assumption on a real condition). An exception fits only a test that is skipped on purpose until a tracked defect is fixed.
- **Exception:** If this is intended, add `{"rule":"pmd/DisabledTest","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md#review-rules)

<a id="pmd-focusedtest"></a>

### `pmd/FocusedTest`

A Kotest focus that runs only part of the suite: the `f:` name prefix, `ftest`, `fcontext`, `fdescribe`, `fit`, `fshould`, `fgiven`.

- **Why it is on:** One of the review rules of the Kotlin preset, a scan of the Kotlin sources on the Node side; it prints as a PMD rule, like the Java rules it mirrors.
- **Allowed form:** Remove the focus from this test: a Kotest name with the "f:" prefix and the f-prefixed registrations (ftest, fcontext, fdescribe, fit, fshould, fgiven) make Kotest run only the focused tests of the spec, so the rest of the suite is skipped while the build stays green. Run one test while you work with the IDE or a Gradle `--tests` filter, and commit the test without the focus.
- **Exception:** If this is intended, add `{"rule":"pmd/FocusedTest","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md#review-rules)
