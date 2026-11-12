# Security checks (find-sec-bugs)

Part of the [Java preset guide](../java-preset.md).

SpotBugs runs with the [find-sec-bugs](https://find-sec-bugs.github.io/) plugin, pinned exactly in
the init script's map (`findSecBugs`) and downloaded at run time like the other tools; it is
LGPL-3.0, run unmodified (see [CONTRIBUTING.md](../../CONTRIBUTING.md#licenses)). It is on for every
Java project, at the same `-medium` confidence as SpotBugs itself, and costs about two seconds of CPU
on a small project plus a taint analysis that grows with the code. Its findings print as
`spotbugs/<PATTERN>` (for example `spotbugs/SQL_INJECTION_SPRING_JDBC`), which is also the `rule` of a
config exception.

Every message is rewritten to the allowed form, for example: "Pass values as bind parameters (...)
and never build query text from input."; the gate appends the shared exception sentence for
`spotbugs/SQL_INJECTION_JPA`, as it does for every rule. The texts live in
`languages/java/adapters/security/advice-groups.mjs`; a test requires one for every pattern of the
pinned plugin version, so a plugin bump that adds a pattern fails until the pattern is either
given advice or excluded with a reason. Identity is the sink plus the enclosing class and method
name, without the parameter types, so two findings of one pattern in different methods are told
apart, and neither a move within a file nor a changed parameter type re-reports them.

What the detectors catch, grouped: SQL, JPQL, LDAP, XPath, command, expression (SpEL, EL, OGNL,
scripts) and template injection; path traversal and file disclosure; XXE; deserialization
(`ObjectInputStream`, `XMLDecoder`, Jackson default typing); SSRF through `URL`; open redirects;
XSS in servlets; HTTP response splitting and log forging; weak digests, DES, ECB, static IVs, hard
coded keys and passwords, predictable random numbers, trust-all `TrustManager`s; and the Spring
detectors: permissive CORS,
entities returned from or bound in controllers, Spring file disclosure and unvalidated redirects.

**What is left out, and why.** Two groups, both in `languages/java/gradle/security/exclude.xml`.
The plugin's informational markers, which say where input enters the code and are not defects
(nothing to fix, so no allowed form and no meaningful exception): the `*_ENDPOINT` patterns
(Spring, JAX-RS, JAX-WS, Struts, Tapestry, Wicket), the `SERVLET_*` source markers and
`COOKIE_USAGE`; they are also low confidence and would not reach the `-medium` report anyway. And
two patterns that nitpicker's own PMD rules already report, so a violation would print twice:
`SPRING_CSRF_UNRESTRICTED_REQUEST_MAPPING` (same shape as `pmd/SpringComposedMapping`) and
`SPRING_CSRF_PROTECTION_DISABLED` (it catches only `csrf().disable()` and flags stateless APIs;
`pmd/SpringCsrfDisabled` catches every form and allows a stateless chain). Everything else the plugin has stays on, including detectors for
frameworks a project may not use (Struts, Android, JSP): they find nothing without those APIs and
cost nothing. Rules that can flag correct code stay on and carry the exception route; the two
common cases are `PREDICTABLE_RANDOM` for `Random` or `ThreadLocalRandom` used for jitter or
sampling, and `WEAK_MESSAGE_DIGEST_MD5` or `_SHA1` for an ETag or a legacy interface.

`languages/java/adapters/java-e2e/preset/security/java-preset-security.e2e.test.mjs` (gated like the
other Java e2e tests) runs the plugin through Gradle on the `gradle-project` fixture and expects
exactly one `SQL_INJECTION_JPA` for a Jakarta `createQuery` built from a parameter, one
`SQL_INJECTION_SPRING_JDBC` for each Spring JDBC call whose query text a helper builds from a
parameter, nothing for the bound query, and no servlet cookie marker.

**Limits.** SpotBugs sees the project's classes without the dependency jars (the Kotlin preset
passes them), because giving SpotBugs the classpath adds core `EI_EXPOSE_REP` reports on every
injected bean. Taint through Spring and Jakarta types is therefore tracked by method signature
only, and find-sec-bugs 1.14.0 knows the `javax.persistence` sinks but not `jakarta.persistence`,
so `languages/java/gradle/security/jakarta-sinks.txt` adds the Jakarta `EntityManager` query
methods as `SQL_INJECTION_JPA` sinks. Server-side request forgery through `RestTemplate`,
`RestClient` and `WebClient` is not in find-sec-bugs. Its custom sinks work for those methods, but
report every URL the analysis cannot trace, which includes a configured base URL
(`baseUrl(properties.baseUrl())`), the allowed form; so `pmd/SpringOutboundUrl` covers it instead.
`languages/java/gradle/security/spring-jdbc-sinks.txt` adds the
`NamedParameterJdbcTemplate` / `NamedParameterJdbcOperations` query methods and `JdbcClient.sql` as
`SQL_INJECTION_SPRING_JDBC` sinks (the plugin only knows `JdbcOperations`), so SQL built in a helper
and passed to the recommended APIs is reported, and `path-sinks.txt` adds `Path.of` as a path
traversal sink next to `Paths.get`. The sink files are given to the plugin joined by the platform
path separator. A query site that `pmd/SpringQueryConcatenation` also reports is shown once, as the
PMD finding, and the cipher patterns that say the same about one call (`CIPHER_INTEGRITY`,
`PADDING_ORACLE` next to `DES_USAGE`, `ECB_MODE`) are reduced to the most specific one. SQL text
that find-sec-bugs cannot see is constant (an `in (?, ?)` list joined from `nCopies`, a ternary of
two literals) is still reported when no PMD finding covers it; bind a collection as `in (:ids)` or
choose the column from a fixed set. Identity ignores the counters of lambdas and anonymous classes
(`lambda$run$3` is `lambda$run`), so an unrelated new lambda does not re-report old findings.
`IMPROPER_UNICODE` is below the `-medium` threshold and not reported, while `CRLF_INJECTION_LOGS`
is reported for a log line built from a tainted value. Not detected: a view or response body
written from input in a `@ResponseBody` string, a value stored in a field and used later, and
taint that leaves the analyzed classes through a library call.

**What find-sec-bugs misses, as PMD rules.** Three checks the TypeScript and Python presets have
are not in the plugin, so `pmd-main-ruleset.xml` adds them for main sources of every Java project
(Gradle and Maven, Spring or not):

| Rule                     | Reports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Allowed form                                                                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pmd/HttpWithoutTimeout` | `HttpClient.newHttpClient()`; an `HttpClient.newBuilder()` without `connectTimeout`, or an `HttpRequest.newBuilder()` without `timeout`, either in the chain that builds it or on the variable that holds the builder; a connection from `url.openConnection()` that is an `HttpURLConnection`, or comes from a URL whose text (in the call, or one or two variables back) starts with `http://` or `https://`, and whose variable does not get both `setConnectTimeout` and `setReadTimeout`, or that is used in the same chain (`openConnection().getInputStream()`); `url.openStream()` on such a URL, which cannot take a timeout; Apache HttpClient 4 and 5 `HttpClients.createDefault()`, `createSystem()` and `createMinimal()`, and `HttpClients.custom()` without `setDefaultRequestConfig`, `setConnectionManager` or `setDefaultSocketConfig`. A builder or connection returned or passed on unused is not judged, nor is a URL that is not evidently HTTP (a file or classpath resource such as `getResource(...).openStream()`). | `HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(10))`, `HttpClient.newBuilder().connectTimeout(...)`, `HttpClients.custom().setDefaultRequestConfig(...)` |
| `pmd/WeakHmac`           | `Mac.getInstance` with `HmacMD5`, `HmacMD4` or `HmacMD2` (any case, also through a constant), Guava `Hashing.hmacMd5`, commons-codec `HmacUtils.hmacMd5*` and `HmacAlgorithms.HMAC_MD5`, and Bouncy Castle `new HMac(new MD5Digest())`. HMAC-SHA1 passes, as in the other presets: HMAC does not rest on collision resistance and protocols such as TOTP fix it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `Mac.getInstance("HmacSHA256")`, `Hashing.hmacSha256`, `HmacAlgorithms.HMAC_SHA_256`                                                                              |
| `pmd/TlsVerificationOff` | Trust-all and accept-any-host objects from libraries, which the plugin does not see because they are not project classes: Netty `InsecureTrustManagerFactory`, Apache HttpClient 4 and 5 `NoopHostnameVerifier`, `AllowAllHostnameVerifier`, `ALLOW_ALL_HOSTNAME_VERIFIER`, `TrustAllStrategy` and `TrustSelfSignedStrategy`; a lambda that returns `true` as a `HostnameVerifier` or `TrustStrategy`; and `System.setProperty("jdk.internal.httpclient.disableHostnameVerification", ...)`. They are reported also inside an `if` on a flag or an environment variable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | A trust store holding the private CA, given to a `TrustManagerFactory` (or a Spring SSL bundle)                                                                   |

A trust-all `X509TrustManager` or `HostnameVerifier` class of the project, anonymous ones included,
is find-sec-bugs' `WEAK_TRUST_MANAGER` and `WEAK_HOSTNAME_VERIFIER`, so the PMD rule leaves classes
alone and each site is reported once. Test sources are not checked: a test server with a
self-signed certificate is normal there. `languages/java/adapters/java-e2e/fixtures/review-rules`
marks the reported and the allowed forms; `java-spring-review.e2e.test.mjs` checks them on Gradle and
Maven.
