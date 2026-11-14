# Spring configuration files

Part of the [Java preset guide](../java-preset.md).

Findings with tool `spring`, produced in Node from the project's `application.properties`,
`application.yml`, `application.yaml` and `application-<profile>.(properties|yml|yaml)`. No JVM and
no new dependency: `spring-config-parser.mjs` flattens properties and YAML (nested maps, dotted
keys, comments, quotes, single-line flow maps and sequences, multi-document files) to dotted keys
with their line, `spring-config-files.mjs` finds the files and their profiles, `spring-secrets.mjs`
decides what counts as a literal secret, and `java-spring.mjs` applies the rules (all in
`languages/java/adapters/spring/`); `config-rules/` holds the profile-dependent rules and
`wiring/spring-wiring.mjs` the `@Enable...` scan.

- **Spring projects only.** The checks run only when `manifest.json` says `spring: true` (the
  compile classpath has `spring-context` or `spring-boot`, see Spring rules above). Quarkus,
  Micronaut and plain projects also have `application.*` files with other meanings, so they get no
  `spring` findings; a manifest without the key counts as not Spring.
- **Where.** Files directly in a resource root (`manifest.json`'s `resourceRoots` when present, else
  `src/main/resources`) or in its `config/` directory. Without such files there are no findings; a
  file that cannot be read is skipped.
- **Keys.** Compared in relaxed form (lowercase, `-` and `_` removed, `[0]`-style list indexes
  removed), so `open-in-view`, `openInView` and `open_in_view` are the same key and
  `management.endpoints.web.exposure.include[0]=*` is the key `...include`.
- **Profiles.** A document's profile is the file name's (`application-test.yml`) or the
  `spring.config.activate.on-profile` (legacy `spring.profiles`) of its document: a `---` document in
  YAML, a `#---` or `!---` document in a properties file. The plain `application.*` main document has
  none. The expression is split on `, | & ! ( )` and spaces. A document is exempt from a rule only
  when it has at least one profile, every positive token is exempt for that rule, and the expression
  has no `!`. Test profiles are `test`, a name starting with `test`, any name with a `test`, `tests`,
  `it` or `integration` word (words split on `-`, `_` and `.`, so `integration-test` and `ci-test`),
  and every profile the project's tests use that is not also configured for the main application.
  A profile counts as used by the tests when `application-<profile>.(properties|yml|yaml)` or a
  `spring.profiles.active` value sits under test resources (`src/test/resources`, the sibling
  `resources` of each test source root), or the profile is named by `@ActiveProfiles` or
  `spring.profiles.active=` in the test sources (`src/test/java`, `src/test/kotlin` or the manifest's
  `testSourceRoots`). A profile is not test-only when
  `application-<profile>.(properties|yml|yaml)` also exists in main resources, so `docker`, `k8s` or
  `qa` stay checked; a main-resources file for a profile is exempt only through a test word in its
  name. The set the tests use is measured on the merge base when the run has one, so a branch cannot exempt a profile
  by adding a test that activates it. Words are compared case-insensitively, trailing digits are
  dropped from each word (`prod2`, `stage1`), and a word that begins or ends with a production word
  followed or preceded by a two-letter region or a known word (`testprod`, `prodeu`) counts too, while
  `product`, `staged` and `livestock` do not. A name with a `prod`, `prd`, `production`, `live`,
  `preprod`, `staging`, `stage`, `stg` or `uat` word is never a test or local profile, whatever its
  other words (`prod-test`, `prod-dev`) and even when a test activates it. Local profiles are names
  with a `local`, `dev` or `development` word, so `local-dev` counts. A profile built from a constant
  (`@ActiveProfiles(Profiles.TEST)`) cannot be read; name it with a literal or add an exception for
  the rule.
- **True.** Wherever a rule needs `true`, Spring's spellings `true`, `on`, `yes` and `1` count, in
  any case.
- **Rules**, all enforceable. Each message ends with the exception line to add to
  `nitpicker.config.json`.

| Rule (`spring/<rule>`)       | Fires on                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Exempt profiles  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `open-in-view`               | JPA in the main sources (`jakarta.persistence` or `javax.persistence` import) and `spring.jpa.open-in-view` unset, or true                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | test             |
| `datasource-without-timeout` | `spring.datasource.url` or `spring.datasource.hikari.jdbc-url` naming a database server (an H2, HSQLDB, Derby, SQLite or Testcontainers `jdbc:tc:` URL is skipped) while no live profile sets a non-zero query deadline: `spring.jpa.properties.jakarta.persistence.query.timeout` (or `javax`), `spring.transaction.default-timeout`, `spring.jdbc.template.query-timeout`, `spring.datasource.dbcp2.default-query-timeout`, a Hikari `data-source-properties.socketTimeout` or `oracle.jdbc.ReadTimeout`, a Hikari `data-source-properties.options` or `connection-init-sql` or a Tomcat pool `connection-properties` or `init-sql` that sets `statement_timeout`, `max_execution_time`, `socketTimeout` or `queryTimeout`, or a URL that carries one of them; one deadline in any live profile covers every URL; a zero, `-1` or `PT0S` value sets no limit; a DataSource built in code is left out; one finding per URL line | test, local, dev |
| `ddl-auto`                   | `spring.jpa.hibernate.ddl-auto` or `spring.jpa.properties.hibernate.hbm2ddl.auto` other than `none`/`validate`, or `spring.jpa.generate-ddl` true                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | test, local, dev |
| `risky-startup-flags`        | `spring.main.allow-circular-references`, `allow-bean-definition-overriding` or `lazy-initialization` true                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | test             |
| `actuator-exposure`          | `management.endpoints.web.exposure.include` containing `*` or a sensitive endpoint (below); `management.endpoints.access.default=unrestricted`; `management.endpoint.shutdown.access=unrestricted`; `management.endpoint.heapdump.access` `read-only` or `unrestricted`; `management.endpoint.shutdown.enabled` or `management.endpoints.enabled-by-default` true                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | test, local, dev |
| `error-details`              | `server.error.include-stacktrace`, `include-message` or `include-binding-errors` set to `always` or `on-param`; `include-exception` true; also as a placeholder default (`${X:always}`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | test, local, dev |
| `unsafe-diagnostics`         | `spring.jpa.show-sql` or `spring.jpa.properties.hibernate.show_sql` true; Hibernate bind logging (`org.hibernate.orm.jdbc.bind`, `orm.jdbc.extract`, `type.descriptor.sql`, any parent such as `org.hibernate.type`, and `root`) at TRACE or ALL; `management.endpoint.env.show-values`, `configprops.show-values`, `health.show-details` or `health.show-components` `always`; `spring.h2.console.enabled` or `settings.web-allow-others` true; also as a placeholder default (`${SHOW_SQL:true}`)                                                                                                                                                                                                                                                                                                                                                                                                                              | test, local, dev |
| `active-profile`             | `spring.profiles.active` or `spring.profiles.include` with a literal value in the main (profile-less) document, one finding per line                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | none             |
| `missing-enable`             | `@Scheduled`, `@Async`, the cache annotations, `@PreAuthorize` and friends, or `@Retryable` used in Java or Kotlin while no main class has the matching `@Enable...` and no XML `annotation-driven` element enables it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | none             |
| `literal-secret`             | a literal value under a key whose last segment is, or ends in a separate word that is, a secret word (below)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | test, local, dev |
| `unbound-property`           | a key in an `application*` file (main or test resources) or a test override (`@SpringBootTest` and slice `properties`, `@TestPropertySource(properties)`, `TestPropertyValues`, `withPropertyValues`, `DynamicPropertyRegistry.add`) that binds to no known property, under a group that is described; see below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | none             |

- **Unbound properties.** Spring Boot projects only: the classpath the build records
  (`springClasspath` in `manifest.json`: the main compile, test compile and test runtime classpaths,
  plus `developmentOnly` on Gradle) must hold a `spring-boot-<version>.jar`; without one the rule
  does not run, and Gradle logs a warning when it cannot resolve that classpath.
  Known keys come from `META-INF/spring-configuration-metadata.json` and
  `additional-spring-configuration-metadata.json` in every jar and directory of that classpath and in
  the resource roots; from the project's `@ConfigurationProperties` classes, read from Java and Kotlin
  source (fields, setters, constructor and record parameters, Kotlin properties, nested classes and
  project superclasses; a map, an `Object`, a type outside the project or a `@Bean` method accepts any
  key below it); and from keys the code or resources name: `${...}` placeholders, `getProperty`,
  `getRequiredProperty`, `containsProperty`, `@ConditionalOn...Property`, `springProperty source`
  in logging XML, and `Binder.bind("prefix")`, `getProperty("prefix." + name)` or a key with a
  `$name` template or `%s` part, which accept any key below the fixed part. Keys compare in relaxed
  form; a map or collection property and the keys Spring derives from endpoint and health indicator ids
  (`management.endpoint.<id>.access`, `management.health.<id>.enabled`) accept any suffix. A key is
  judged in full only when the deepest known prefix above it is a metadata `groups` entry, or a prefix
  whose every property the metadata marks removed (`spring.redis`). Under a project properties class,
  which another module or library may extend (`acme.security.token` next to an `acme` class), and under
  a prefix nobody describes (`acme.client.timeout`, or `spring.output.ansi.console-available`, which
  Spring Boot binds without metadata), only a near miss of a known segment at the same place is
  reported (`spring.datsource`: one edit for five or more letters, two for ten or more; digits and a
  plural `s` do not count). The message names the nearest known key, or the replacement the metadata
  gives for a removed key. Declare a key that code reads by name, in a way the scan cannot see, in
  `META-INF/additional-spring-configuration-metadata.json`, which also documents it for IDEs.
- **Literal secrets.** The last key segment, split into words at `-`, `_` and case changes, must
  end in `password`, `passwd`, `passphrase`, `secret`, `token`, `credential(s)`, `api-key` (or `apikey`), `private-key`,
  `secret-key`, `access-key`, `signing-key`, `encryption-key`, `hmac-key`, `jwt-key`, `crypto-key` or
  `master-key`, so `db-password`, `client-secret` and `jwtSecret` match while
  `password-file`, `token-validity-seconds` and `passwords` do not. Settings
  such as `app.require-password=true` are not judged, because booleans (`true`, `false`, `on`,
  `off`, `yes`, `no`) and numbers never count. Also not judged: empty values, YAML `null` and `~`,
  aliases (`*ref`), Maven filtering (`@db.password@`), Jasypt (`ENC(...)`), encrypted or hashed
  prefixes (`{cipher}`, `{bcrypt}`, `{pbkdf2}`, `{scrypt}`, `{argon2}`, `{sha256}`), SpEL
  (`#{...}`) and placeholders: `${DB_PASS}` and `${DB_PASS:}` pass while `${DB_PASS:hunter2}` fires
  on its default. For keys ending in `token`, a single lowercase word such as `header` is read as a
  setting, not a token (`feature.reset-token=header`), so a real token that is one lowercase word
  is missed; `{noop}secret` and every other literal fire. The message names the key and the
  environment variable Spring binds to it (`spring.datasource.password` reads
  `SPRING_DATASOURCE_PASSWORD`), or asks to drop a placeholder's literal default; never the value.
  A last segment that is just `key` takes its parent into account: `stripe.api.key`,
  `jwt.key`, `app.encryption.key` and `app.signing.key` count, `spring.data.redis.key` and
  `app.cache.key` do not. A value that starts with `classpath:` or `file:` points at key material
  instead of holding it and is not judged. Any other key whose value is a URL is checked for a
  credential: `user:password@` in the authority, Oracle's `jdbc:oracle:thin:user/password@host`,
  or a parameter whose name ends in `password`, `pwd`, `secret`, `token`, `api-key`, `api_key` or
  `access-key` (`sslpassword=`, `client_secret=`, `access_token=`) in the query or after `;`, or a
  plain `key=` parameter whose value is a token of 20 or more letters, digits, `-` or `_` (an API
  key such as `?key=AIza...`; `?key=orders` is a setting), with a value that
  is not a `${...}` placeholder or a URI template (`{token}`, `{0}`, `%s`, `<token>`), so
  `jdbc:postgresql://db/shop?user=shop&password=${DB_PASSWORD}` passes. For an `<owner>.key` key,
  algorithm and identifier values (`RS256`, `AES256`, `SECRET_KEY_ID`) and single lowercase words
  (`read`, `rsa`) are settings, not keys. The finding
  is `literal-secret`, names the key and never the value. The Java twin is `SpringValueSecretDefault`,
  which judges the default inside `@Value("${jwt.secret:default}")` by the same words.
- **Actuator.** The sensitive endpoints are `auditevents`, `beans`, `caches`, `conditions`,
  `configprops`, `env`, `heapdump`, `httpexchanges`, `httptrace`, `jolokia`, `logfile`, `loggers`,
  `mappings`, `quartz`, `sessions`, `shutdown` and `threaddump`: they serve configuration, heap or
  thread contents, or change the running application. `health`, `info`, `metrics` and
  `prometheus` pass. A project that serves the sensitive ones only on a separate, non-public
  `management.server.port` adds an exception.
- **Active profiles.** `spring.profiles.active` and `spring.profiles.include` belong in the
  deployment's environment, not in the packaged main file: a literal there turns the dev
  exemptions on in production. Values that come from the environment pass: `${SPRING_PROFILES_ACTIVE}`,
  `${PROFILE:}`, a Maven-filtered `@spring.profiles.active@` and an empty value. A profile document
  or file cannot activate profiles in Spring, so only the main document is read. The message for
  `active` names `SPRING_PROFILES_ACTIVE` per deployment, or `spring.profiles.default` for a
  fallback a deployment can override; the one for `include` names `spring.profiles.group`. A flow
  list (`active: [dev, h2]`) is one finding.
- **Missing `@Enable...`.** Java and Kotlin sources of the main source roots are scanned (comments and
  strings blanked), the Kotlin roots included: the manifest's `kotlinSourceRoots` lists the Kotlin
  plugin's main source directories on Gradle (with the java preset too) and, on Maven, the
  `sourceDirs` of `kotlin-maven-plugin`'s compile configuration, or `src/main/kotlin` when it
  names none for Spring's `@Scheduled`, `@Async`, `@Cacheable`/`@CacheEvict`/`@CachePut`/`@Caching`,
  `@PreAuthorize`/`@PostAuthorize`/`@PreFilter`/`@PostFilter`/`@Secured` and the two `@Retryable`
  annotations (matched through their import or full name, so other libraries' `@Scheduled` do not
  count). When no main class carries `@EnableScheduling`, `@EnableAsync`, `@EnableCaching`,
  `@EnableMethodSecurity` (or the global or reactive form) or `@EnableRetry` /
  `@EnableResilientMethods`, every use gets a finding, identity `enable-<feature>`. XML files in the
  source and resource roots with `<task:annotation-driven/>` (scheduling and async),
  `<cache:annotation-driven/>`, `<retry:annotation-driven/>` or `<security:method-security/>`
  (or `global-method-security`) count as enabling; they are matched by these usual namespace
  prefixes. This check needs no Spring config files. Enabling annotations that come from a library
  jar are not seen; add an exception then.
- **Anchor and identity.** Findings sit at the offending key's line (`location`). A missing
  `open-in-view` is one finding at the main `application.*` file with no line; a directory with only
  profile files (`application-test.yml`, `application-prod.yml`) has none. Identity is the relaxed
  key (plus `#2`, `#3` for repeats in one file); never the line, and never a secret's value.
- **Exceptions.** The printed id works in `exceptions`, for example
  `{ "rule": "spring/open-in-view", "paths": ["src/main/resources/**"], "reason": "..." }`.
- **Limits.** Placeholders (`${...}`) are not judged, except the default of a literal-secret
  value. YAML anchors and aliases are not resolved: `base: &b` followed by a nested map keeps
  its nesting, but `<<: *b` merges and `*ref` values are not expanded. A flow map or sequence that
  continues on later lines (`include: [` ... `]`), multi-line quoted or plain scalars (their
  continuation lines are skipped) and `? ` complex keys are not read; a YAML list of maps is
  skipped. Profile groups and `spring.config.import` files are not followed, and
  `spring.profiles.active` is read only to learn the profiles the tests use.
- **Tests.** `spring-config-parser.test.mjs` (properties and YAML parsing, line endings, byte
  order mark, continuations, escapes, indexes, flow collections, anchors), `spring-secrets.test.mjs`
  (key words, value judgement), `java-spring.test.mjs` (relaxed keys, open-in-view, ddl-auto,
  profile expressions, line stability, exceptions, the configuration hash), `java-spring-rules.test.mjs`
  (the other rules), `unbound-keys/` (metadata jars, properties classes, test overrides, the
  unbound-property rule), `config-rules/config-rules.test.mjs` (active profiles, diagnostics, error
  details, URL credentials), `wiring/spring-wiring.test.mjs` (the `@Enable...` check) and `java-reports.test.mjs`
  (glue, the `spring: true` gate).
- **Fixing with `--fix`.** `nitpicker --fix --rule spring/<rule>` edits `application*.properties`,
  `application*.yml` and `application*.yaml` under `src/main/resources` (and its `config/` folder)
  for each rule below, on Gradle and Maven projects and with the Java and Kotlin presets. Each fix is
  a `review` fix: it runs only when the rule is named, because it changes a value. Only the changed
  files are edited, and every other byte of the file stays as it was (order, quoting, comments, line
  endings, other YAML documents). A recipe uses the rule's own detection code, so it flags what the
  rule flags.

  | Rule                  | Fix                                                                                                                                                                                                            |
  | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `ddl-auto`            | the mode becomes `validate`; `spring.jpa.generate-ddl=true` becomes `false`                                                                                                                                    |
  | `open-in-view`        | `true` becomes `false`; a main file that never sets it gets `spring.jpa.open-in-view=false` in its first document                                                                                              |
  | `error-details`       | `never` (`false` for `include-exception`); in `${NAME:always}` only the default changes                                                                                                                        |
  | `actuator-exposure`   | `*` and the sensitive endpoints leave the list, `health` stays or replaces them; an open `access` becomes `none` (`read-only` for the default) and a shutdown switch is removed                                |
  | `risky-startup-flags` | the line is removed                                                                                                                                                                                            |
  | `unsafe-diagnostics`  | `always` becomes `when-authorized`; other settings are removed, and a YAML parent left empty goes with them                                                                                                    |
  | `literal-secret`      | the literal becomes `${ENV_NAME}`, named like Spring's relaxed binding of the key (`spring.datasource.password` gives `SPRING_DATASOURCE_PASSWORD`); the default of a `${NAME:literal}` placeholder is dropped |
  | `active-profile`      | `spring.profiles.active` becomes `spring.profiles.default`, which a deployment can override                                                                                                                    |

  Not fixed: a credential inside a URL (the variable name is a choice), `spring.profiles.include`
  (it needs a named `spring.profiles.group`), a YAML flow map such as `management: {a: b}`, a value
  with backslash escapes or continuation lines, and files outside `src/main/resources`. Spring Boot
  rejects `spring.profiles.active` inside a profile-specific document, so the rule's allowed form is
  the deployment's environment variable or `spring.profiles.default`, not a move into a profile
  document. A setting the recipe cannot edit is named in a "Fix notes:" line.

  `missing-enable` adds the missing `@EnableScheduling`, `@EnableAsync`, `@EnableCaching`,
  `@EnableMethodSecurity` or `@EnableRetry` (with its import, in sorted position) above the
  `@SpringBootApplication` class of the module, in Java or Kotlin, for the files that changed. It
  is a `review` fix, not a safe one: the annotation switches the feature on, so scheduled jobs start
  to run, methods start to be cached, called asynchronously or checked for roles, which the code did
  not do before. `@Secured` users get `@EnableMethodSecurity(securedEnabled = true)`. With no or
  more than one `@SpringBootApplication` class, or an `@Retryable` of Spring Framework resilience
  (which needs `@EnableResilientMethods`), nothing is edited and a note says so.
