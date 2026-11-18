# Paths and hosts matched by text

A `String` prefix, suffix or substring check on a path, route, package name or host is an enforceable
`pmd/AffixWithoutBoundary` finding (`languages/java/adapters/review-rules/affix-boundaries/`), in the Java and
Kotlin presets alike. A text prefix also accepts a sibling that only shares the text: `/foo` matches `/foobar`,
`packages/app` matches `packages/app-legacy`, a cookie for `example.com` matches `evilexample.com`, a redirect to
`http://localhost` matches `http://localhost.attacker.example`. Merged fixes in open-source projects
(dev servers, build tools, API gateways and workflow engines) each added the missing separator. The rule is read
from the main sources of every module and printed as a PMD rule, so it runs the same on Gradle and Maven builds.

- **Reported:** `startsWith(x)` where the receiver is a `String` and the argument is named like a path, directory,
  root, base, route, package or domain (`base`, `rootDir`, `basePath`, `packageName`, `getBasePath()`), or is built
  from a path-shaped literal and a value (`"/repos/" + owner`, Kotlin `"/repos/$owner"`); `startsWith` with a bare
  origin (`"http://localhost"`, `"https://example.com"`); `endsWith(x)` where the receiver or the argument is a host
  or domain (`hostname.endsWith(domain)`, but not a bracket such as `endsWith("]")`).
  A prefix named only `prefix` is reported when the receiver is a path, URL or file name.
- **Allowed forms, not reported:** an argument that ends in a separator (`base + "/"`, `base + File.separator`,
  `"$base/"`, `ensureTrailingSlash(base)`, a local initialised that way), an equality test of the same two values
  in the same condition (`path.equals(base) || path.startsWith(base + "/")`), a suffix that starts with a dot or
  `@` (`"." + domain`), a host check guarded by `domain.startsWith(".")`, a `Path` receiver (`Path.startsWith`
  compares whole segments), a plain string literal such as `"/api"` (often a deliberate text prefix), and a
  `startsWith` with an offset, a value normalised earlier in the function (`base = base.endsWith("/") ? base : base + "/"`,
  `base += "/"`), and a check on the character after the prefix (`path.charAt(base.length())`) or on the lengths.
- **Not covered:** receivers whose `String` type the file does not show (a field of another class, a `var` without
  a declared type), `StringUtils` and other helper forms, and `replace` or `removePrefix` used as a containment
  test.

The message names the allowed form and ends with the exception sentence for
`{ "rule": "pmd/AffixWithoutBoundary", "paths": ["<file>"], "reason": "..." }`. Tests:
`adapters/review-rules/affix-boundaries/affix-boundaries.test.mts`. The TypeScript and JavaScript counterpart is
`nitpicker/no-prefix-without-boundary`.
