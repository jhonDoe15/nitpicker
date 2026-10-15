# Complete output expectations

These factories hold complete expected outputs for tests that previously matched
only selected fields. Literal fields remain explicit; factories do not read the
current production output to construct expected values.

`exactText` in `../output-expectations.mjs` escapes literal text and anchors the
pattern to the entire string. Interpolated regular expressions describe fields
that vary, such as bounded temporary directory suffixes, fixed-width hashes, and
numeric elapsed times. They must not replace whole output sections with arbitrary
wildcards. Use ordinary complete objects and arrays where output is deterministic.

When behavior changes, review the entire expected result rather than recording a
partial fragment. These files are fixture data and are excluded from the published
package under the existing fixture policy.
