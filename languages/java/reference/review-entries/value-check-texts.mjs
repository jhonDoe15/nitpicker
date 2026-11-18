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
};
