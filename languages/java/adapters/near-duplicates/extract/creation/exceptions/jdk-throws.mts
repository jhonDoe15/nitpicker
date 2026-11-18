export const SAFE_JDK: ReadonlySet<string> = new Set([
  'java.lang.Exception',
  'java.lang.RuntimeException',
  'java.lang.IllegalArgumentException',
  'java.lang.IllegalStateException',
  'java.lang.UnsupportedOperationException',
  'java.lang.Error',
  'java.io.IOException',
]);
export const JDK_THROWS: ReadonlyMap<string, string[]> = new Map([
  ['java.net.URL', ['MalformedURLException']],
  ['java.net.URI', ['URISyntaxException']],
  ['java.io.FileInputStream', ['FileNotFoundException']],
  ['java.io.FileOutputStream', ['FileNotFoundException']],
  ['java.lang.StringBuilder', []],
  ['java.lang.StringBuffer', []],
  ['java.util.ArrayList', []],
  ['java.util.LinkedList', []],
  ['java.util.HashSet', []],
  ['java.util.TreeSet', []],
  ['java.util.HashMap', []],
]);
