# CPD parity

`cpd` in the engine is compared with PMD CPD 7.16.0 as nitpicker's `languages/java/gradle/CpdReport.java` runs it.

- `TokDump.java` (with `CpdReportAccess.java`, both in PMD's `net.sourceforge.pmd.cpd` package to reach its
  token list) prints every CPD token of the listed files as `image, line, column, end line, end column`, the
  same lines the engine writes with `NP_CPD_TOKENS=<file>`. Compile both with `CpdReport.java` against the PMD
  7.16.0 jars and their dependencies, then `java TokDump <out> <file with one path per line>`.
- `compare.py <pmd cpd.xml> <engine cpd.xml>` compares the file list and every duplication (lines, tokens, and
  each mark's path, lines, columns and token indexes).

The fixture answers in `tests/expected/cpd.txt` and `cpd-tokens.txt` come from these two on `tests/fixtures/cpd`.
