export const VALUE_CHECK_TEXTS = {
  UncheckedResponseBody: {
    anchor: 'response-bodies-parsed-before-the-status-is-checked',
    summary:
      'A JDK `HttpClient` (`send` with `BodyHandlers`) or OkHttp (`newCall(...).execute()`) response whose `body()` is passed to a JSON parser (`readValue`, `readTree`, `fromJson`, `parseString`, `decodeFromString`, `JSONObject`) before `statusCode()`, `isSuccessful` or any other member of the response is read.',
    why: 'An error status from a proxy, gateway or CDN usually carries an HTML or empty body, so the parser throws an opaque error and the real status is lost. Nitpicker reads the sources of every module for it and prints it as a PMD rule.',
  },
  NanOnlyGuard: {
    anchor: 'nan-only-checks-on-parsed-numbers',
    summary:
      '`Double.isNaN(x)`, `Float.isNaN(x)` or `x.isNaN()` on a local assigned from `Double.parseDouble`, `Double.valueOf`, `Float.parseFloat`, `toDoubleOrNull` or `toFloatOrNull`, in a method that has no `isFinite` or `isInfinite` call, no infinity constant and no relational comparison of that local.',
    why: '`Infinity` and `-Infinity` pass an `isNaN` check, and a text such as "Infinity" or "1e999" parses to them, so the value goes on as a limit or an amount. Nitpicker reads the sources of every module for it and prints it as a PMD rule.',
  },
  NegativeCountArgument: {
    anchor: 'counts-computed-by-subtraction',
    summary:
      '`repeat`, `copyOf`, `new ArrayList<>(n)` (Kotlin also `take`, `takeLast`, `drop`, `dropLast`, `List(n)`) called with a count that is a subtraction of two non-constants, directly or through a local, with no `Math.max`, `coerceAtLeast` or `coerceIn` and no earlier comparison of the two sides.',
    why: 'A negative count throws `IllegalArgumentException` (or `NegativeArraySizeException`) as soon as the right side is the larger one. Nitpicker reads the sources of every module for it and prints it as a PMD rule.',
  },
  IndexBoundOffByOne: {
    anchor: 'index-checks-that-let-the-length-through',
    summary:
      'An `if` whose condition has the disjunct `i > x.size()` (also `x.length()`, `x.length`, `x.count` and the reversed `x.size() < i`), whose branch leaves, followed by `x.get(i)`, `x.charAt(i)` or `x[i]` in the same block or in a later disjunct; also `i <= x.size()` in an `&&` chain or `if` whose branch reads `x[i]`.',
    why: "The one value the check lets through, `i == x.size()`, throws `IndexOutOfBoundsException` instead of getting the guard's intended error. `>` and `<=` are right only for insertion positions. Nitpicker reads the sources of every module for it and prints it as a PMD rule.",
  },
  BackoffShiftOverflow: {
    anchor: 'backoff-delays-that-overflow',
    summary:
      'A product with `1 << n`, `1L << n` (Kotlin `1 shl n`) as one factor, where `n` is a plain name that nothing in the method bounds below about 30 (a comparison with a limit, or `Math.min(n, k)` with `k` at most 30) and either `n` or the method is named like a retry (`attempt`, `retry`, `retries`, `tries`, `backoff`, `delay`, `wait`, `sleep`, `failure`).',
    why: 'For a large attempt count the shift wraps and the product overflows, so the delay turns negative or small and the retries spin or wait for no time at all. A clamp of the shift to the type width does not help. Nitpicker reads the sources of every module for it and prints it as a PMD rule.',
  },
};
