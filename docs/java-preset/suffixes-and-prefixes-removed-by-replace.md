# Suffixes and prefixes removed by replace

A `String.replace` that removes a suffix or a prefix is an enforceable `pmd/AffixRemovedByReplace` finding
(`languages/java/adapters/review-rules/affix-replace/`), in the Java and Kotlin presets alike. `replace` removes
every occurrence of the text, wherever it is: `name.replace(".git", "")` turns `blog.git.io` into `blog.io`,
`className.replace(localeSuffix, "")` also strips matches in the middle of the name, and a path that contains the
root directory twice is rewritten in the wrong place. Merged fixes in open-source projects replaced the call with
an anchored removal.

- **Reported:** `replace(x, "")` where the receiver is a `String` and `x` is a literal that looks like a file or
  URL suffix (`".git"`, `".json"`, `".min"`), or is named like a suffix, prefix, path, directory or root
  (`suffix`, `localeSuffix`, `rootDir`, `basePath`); the replacement is `""` (or `"~"` for a directory).
- **Allowed forms, not reported:** `endsWith` with `substring(0, length - suffix.length())`, `startsWith` with
  `substring`, Kotlin `removeSuffix` and `removePrefix`, an anchored `replaceAll("\\.git$", "")`, and a replace whose
  replacement is not empty.
- **Not covered:** receivers whose `String` type the file does not show, and a pattern passed through a variable
  that is not named like an affix.

The message names the anchored form and ends with the exception sentence for
`{ "rule": "pmd/AffixRemovedByReplace", "paths": ["<file>"], "reason": "..." }`. Tests:
`adapters/review-rules/affix-replace/affix-replace.test.mts`. The TypeScript and JavaScript counterpart is
`nitpicker/no-unanchored-affix-replace`, which also reports a first-occurrence replace of a value read from a
parsed URL or of a home or working directory.
