# Index checks that let the length through

A bounds check that compares with `>` instead of `>=` against the size or length, and then reads at the index, is an
enforceable `pmd/IndexBoundOffByOne` finding (`languages/java/adapters/review-rules/value-checks/index-bound/`), in the
Java and Kotlin presets alike. The one value the check lets through, `index == size`, throws
`IndexOutOfBoundsException` instead of getting the guard's error: spring-data-redis's `DefaultRedisList.get` checked
`index > size()` before reading, and Jetty's `HttpURI` checked `c > table.length || !table[c]`. The rule prints as a PMD
rule like the other cross-file rules. The finding is on the line of the comparison.

- **The check:** an `if` whose condition has the `||` operand `i > x.size()` (also `x.length()`, `x.length`, `x.count`,
  or the reversed `x.size() < i`) where `i` is a plain name and `x` a name or member chain, whose branch leaves
  (`return`, `throw`, `continue`, `break`) and has no `else`, and a read `x.get(i)`, `x.charAt(i)`, `x.elementAt(i)` or
  `x[i]` in a later operand or later in the enclosing block. The accepting form `i <= x.size()` in an `&&` chain or `if`
  whose later operand or branch reads `x[i]` is reported too.
- **Allowed forms, not reported:** `i >= x.size()` and `i < x.size()` anywhere after the `if` in the method, an insertion
  position (`x.add(i, v)`, `substring` end bounds), a read of another receiver, an index that is reassigned after the
  check, and a branch that does not leave.
- **Not covered:** a size kept in a local (`int n = x.size(); if (i > n)`), a bound that is a method call other than
  `size`, `length` and `count`, and test sources.

The message names the allowed form and ends with the exception route `pmd/IndexBoundOffByOne`.
