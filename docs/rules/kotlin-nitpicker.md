# Kotlin: nitpicker source checks

The Kotlin source checks, the compiler warnings and the ktlint and ktfmt format checks of the Kotlin preset. This page lists 31 rules. [All pages](README.md).

The guide for these rules: [docs/kotlin-preset.md#source-checks](../kotlin-preset.md#source-checks).

Unless an entry says otherwise:

- **Presets:** Kotlin
- **Analyzers:** `kotlin`
- **Builds:** Gradle and Maven
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

An inline suppression of a detekt or ktlint rule.

- **Why it is on:** A `@Suppress` would hide a finding from the report, so a source scan reports every token that targets a detekt or ktlint rule.
- **Allowed form:** Remove the suppression and fix the finding: `@Suppress` of a detekt or ktlint rule, a ruleset, `all` or one of the compiler warnings the kotlinc lint reports would hide it from the report. For generated code the routes are `exclude` and the code itself.
- **Exception:** No exception applies; the way out is to fix the finding, `exclude` for generated code, or the code itself.
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

An unannotated `Boolean` parameter of a public function that is the condition of an `if`, `when` or `while`.

- **Allowed form:** Split the function into two functions named for each behavior, or pass an enum or a small data class: this boolean parameter switches the function between two behaviors, which makes the call site unreadable.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/BooleanFlagParameter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-catchonlylogsorreturnsdefault"></a>

### `kotlin-source/CatchOnlyLogsOrReturnsDefault`

A `catch` that neither throws, nor uses the exception, nor answers with an error response.

- **Allowed form:** Rethrow it with the cause (`throw OrderException(message, e)`), return a failure result that carries the exception (`Result.failure(e)`), or answer with an error response: this catch only logs the failure or returns a default, and carries on.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/CatchOnlyLogsOrReturnsDefault","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-commentedoutcode"></a>

### `kotlin-source/CommentedOutCode`

Commented-out code.

- **Allowed form:** Delete the commented-out code; version control keeps it.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/CommentedOutCode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-credentialliteral"></a>

### `kotlin-source/CredentialLiteral`

A literal credential: an AWS key, a GitHub or Slack token, a private key header, a password in a URL.

- **Allowed form:** Read it from the environment or a secrets manager: this string looks like a credential (access key, token, private key, or a password in a URL).
- **Exception:** If this is intended, add `{"rule":"kotlin-source/CredentialLiteral","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-detachedtestcase"></a>

### `kotlin-source/DetachedTestCase`

A test-named public function without a test annotation, in a class that has tests.

- **Allowed form:** Annotate the function with @Test so JUnit runs it, or make it private if it is a helper: this test never runs.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/DetachedTestCase","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-generatedonhandwrittencode"></a>

### `kotlin-source/GeneratedOnHandWrittenCode`

A `Generated` annotation on hand-written code, which JaCoCo and PIT skip.

- **Allowed form:** Remove the annotation from hand-written code: JaCoCo and PIT skip a class, function or constructor annotated @Generated, so this is not measured.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/GeneratedOnHandWrittenCode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-genericpackagename"></a>

### `kotlin-source/GenericPackageName`

A package segment named `util`, `helpers`, `manager`, `common`, `misc` or the like.

- **Allowed form:** Name this package for what it holds, not utils, helpers, common or misc. Pure logic shared between features goes in the shared package under a name that says what it does.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/GenericPackageName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-generictypename"></a>

### `kotlin-source/GenericTypeName`

A class, interface or object named `Util`, `Helper`, `Manager`, `Common`, `Misc` or the like.

- **Allowed form:** Name this type for what it does (`PriceRounder`, `OrderTotals`), not Utils, Helper, Manager, Common or Misc. Pure logic shared between features goes in the shared package under such a name.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/GenericTypeName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-hardcodedsecret"></a>

### `kotlin-source/HardcodedSecret`

A secret-looking literal assigned to a name such as `password`, `secret`, `token` or `apiKey`.

- **Allowed form:** Read it from the environment or a secrets manager and inject it: this variable holds a hardcoded secret.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/HardcodedSecret","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-httpwithouttimeout"></a>

### `kotlin-source/HttpWithoutTimeout`

An HTTP request or client built without a timeout.

- **Allowed form:** Give the call a deadline: `HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(10))` (java.net.http), `connectTimeout` and `readTimeout` on an `HttpURLConnection`, a client with timeouts (OkHttp, which sets them by default, or Ktor with `install(HttpTimeout) { requestTimeoutMillis = 10_000 }`), `RestTemplateBuilder().connectTimeout(...).readTimeout(...)` for Spring, or `RequestConfig.custom().setResponseTimeout(...)` for the Apache client. This HTTP call has no timeout, so a server that never answers hangs it for good.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/HttpWithoutTimeout","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-iocallinloop"></a>

### `kotlin-source/IoCallInLoop`

A repository, DAO, JDBC or HTTP client call inside a loop.

- **Allowed form:** Fetch or write all items at once (`findAllById`, `saveAll`, `deleteAll`, `WHERE id IN (...)`, one batched request): this calls a database, HTTP or repository API once per loop item. Paging, polling and retry loops are fine.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/IoCallInLoop","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-logstringconcatenation"></a>

### `kotlin-source/LogStringConcatenation`

A log call whose message is built with a template, `+` or `format` from a runtime value.

- **Allowed form:** Pass values as placeholders (`log.info("user {}", user)`), or give a lambda logger the message (`logger.info { "user $user" }`), not a message built with a string template, `+` or `format`.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/LogStringConcatenation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-mutablemodulestate"></a>

### `kotlin-source/MutableModuleState`

A top-level `var`, or a mutable collection, array, atomic or flow in a top-level `val`, an `object` or a companion object.

- **Allowed form:** Keep state in an instance: a class whose object the composition root creates and passes in, holding `val`s and immutable `listOf`/`mapOf`. A top-level `var` or a mutable collection in an `object` is shared by the whole program.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/MutableModuleState","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-mutationignoremarker"></a>

### `kotlin-source/MutationIgnoreMarker`

`@DoNotMutate` or `@CoverageIgnore` on a declaration.

- **Allowed form:** Remove the annotation and kill the mutants with a test: PIT does not mutate code annotated @DoNotMutate or @CoverageIgnore.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/MutationIgnoreMarker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-secretinlog"></a>

### `kotlin-source/SecretInLog`

A secret-named value passed to a log call or `print`.

- **Allowed form:** Log that the secret is set, or a masked tail, instead of the secret itself.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/SecretInLog","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-shellcommand"></a>

### `kotlin-source/ShellCommand`

A shell and its command flag passed as arguments (`"sh", "-c"`).

- **Allowed form:** Run the program directly with an argument list (`ProcessBuilder("git", "log", ref)`), not through a shell with `-c`.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/ShellCommand","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-sqlstringbuilding"></a>

### `kotlin-source/SqlStringBuilding`

SQL text built from a runtime value with a template, `+` or `format`.

- **Allowed form:** Pass values as bind parameters: `jdbcTemplate.query("SELECT * FROM users WHERE id = ?", mapper, id)`, `prepareStatement("... WHERE id = ?")` with `setLong(1, id)`, `:id` with `NamedParameterJdbcTemplate` or JPA `setParameter("id", id)`, or a query DSL (Exposed, jOOQ). Build placeholder lists from placeholders alone (`ids.joinToString(", ") { "?" }`), optional filters from literal fragments joined with `" AND "`, and take a table or column name from a constant or an enum. This SQL text is built from a runtime value with a string template, `+` or `format`, so the value can change the statement (SQL injection).
- **Exception:** If this is intended, add `{"rule":"kotlin-source/SqlStringBuilding","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-testclasswithouttestcases"></a>

### `kotlin-source/TestClassWithoutTestCases`

A test-named class in the test sources without a test.

- **Allowed form:** Add @Test functions to the class, or rename it if it is a helper (for example `TestInputGenerator` becomes `InputGenerator`): a test class without tests never runs.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/TestClassWithoutTestCases","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-testhelperinsource"></a>

### `kotlin-source/TestHelperInSource`

A main source that imports a test framework.

- **Allowed form:** Move the test helper to the test sources (`src/test/kotlin`): production code must not import a test framework.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/TestHelperInSource","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-tlsverificationoff"></a>

### `kotlin-source/TlsVerificationOff`

TLS certificate or host-name verification switched off.

- **Allowed form:** Keep certificate and host-name verification on and trust the certificate authority instead: load it into a `KeyStore` and build the `SSLContext` from `TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply { init(keyStore) }`, use OkHttp `HandshakeCertificates.Builder().addTrustedCertificate(certificate)`, or set `-Djavax.net.ssl.trustStore` for a private CA. This trusts any certificate or host name, so anyone on the network can pose as the server, and turning it off by environment ships the switch to production.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/TlsVerificationOff","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-unsafedeserialization"></a>

### `kotlin-source/UnsafeDeserialization`

Deserialization that instantiates attacker-chosen types (`XMLDecoder`, default typing, Kryo without registration).

- **Allowed form:** Read the data as JSON into a concrete type: `Json.decodeFromString<Order>(text)` with kotlinx.serialization or `mapper.readValue<Order>(text)` with Jackson, with polymorphism by a logical name (a `sealed` class with kotlinx.serialization, or `@JsonTypeInfo(use = JsonTypeInfo.Id.NAME)` with `@JsonSubTypes`). This reads class names or objects from the data, so a crafted payload builds any class on the classpath and runs code.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/UnsafeDeserialization","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-weakhash"></a>

### `kotlin-source/WeakHash`

MD2, MD4, MD5 or SHA-1 for hashing or signing, or HMAC-MD5.

- **Allowed form:** Hash with `MessageDigest.getInstance("SHA-256")` (or SHA-384, SHA-512, SHA3-256), sign with `Mac.getInstance("HmacSHA256")`, and hash passwords with Argon2 or bcrypt (`Argon2PasswordEncoder`, `BCryptPasswordEncoder`): MD5 and SHA-1 are broken hashes, collisions are cheap and brute force is fast. A protocol you do not control that requires one (a legacy signature, an ETag, a WebSocket accept key) is the exception.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/WeakHash","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlinc-cast"></a>

### `kotlinc/cast`

A useless cast (`USELESS_CAST`).

- **Why it is on:** The kotlinc lint compiles the main Kotlin sources with the pinned compiler and reports these warnings as findings, like -Werror on the code the change touched; a build setting cannot hide them.
- **Allowed form:** Remove the cast.
- **Exception:** If this is intended, add `{"rule":"kotlinc/cast","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md#compiler-warnings)

<a id="kotlinc-deprecation"></a>

### `kotlinc/deprecation`

A use of a deprecated API (`DEPRECATION`, `TYPEALIAS_EXPANSION_DEPRECATION`).

- **Why it is on:** The kotlinc lint compiles the main Kotlin sources with the pinned compiler and reports these warnings as findings, like -Werror on the code the change touched; a build setting cannot hide them.
- **Allowed form:** Call the replacement the deprecation names (`ReplaceWith`, or the Java Javadoc).
- **Exception:** If this is intended, add `{"rule":"kotlinc/deprecation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md#compiler-warnings)

<a id="kotlinc-lint-not-run"></a>

### `kotlinc/lint-not-run`

The kotlinc lint could not compile the sources, for example because a compiler plugin could not be loaded.

- **Why it is on:** The kotlinc lint compiles the main Kotlin sources with the pinned compiler and reports these warnings as findings, like -Werror on the code the change touched; a build setting cannot hide them.
- **Allowed form:** Fix the first compiler error the message names so that the lint can run.
- **Exception:** A descriptive finding: it never fails the gate, so no exception applies.
- **See also:** [Kotlin preset guide](../kotlin-preset.md#compiler-warnings)

<a id="kotlinc-unchecked"></a>

### `kotlinc/unchecked`

An unchecked cast (`UNCHECKED_CAST`).

- **Why it is on:** The kotlinc lint compiles the main Kotlin sources with the pinned compiler and reports these warnings as findings, like -Werror on the code the change touched; a build setting cannot hide them.
- **Allowed form:** Use a typed API, a checked conversion (`as? List<*>`) or a reified function.
- **Exception:** If this is intended, add `{"rule":"kotlinc/unchecked","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md#compiler-warnings)

<a id="ktfmt-format"></a>

### `ktfmt/format`

A file is not formatted with ktfmt.

- **Why it is on:** When the project formats with ktfmt, the format check reports every file it would change.
- **Allowed form:** Run ktfmt on the file; it fixes the layout.
- **Exception:** If this is intended, add `{"rule":"ktfmt/format","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md)

<a id="ktlint-ktlint-rule"></a>

### `ktlint/ktlint.<rule>`

A ktlint formatting rule.

- **Printed as:** `ktlint/ktlint.<rule>`
- **Why it is on:** When the project formats with ktlint, the format check reports each rule of the ktlint standard ruleset that a file breaks.
- **Allowed form:** Run `ktlint --format` on the file; it fixes the layout. Not your formatter: set `kotlin.formatter` in nitpicker.config.json.
- **Exception:** If this is intended, add `{"rule":"ktlint/ktlint.<rule>","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset.md)
