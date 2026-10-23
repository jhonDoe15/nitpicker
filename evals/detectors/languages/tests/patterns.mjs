const TEST_FILES = {
  python: [/(?:^|\/)(?:test_[^/]*|[^/]*_test)\.pyi?$/u, /(?:^|\/)tests?\/[^/]+\.py$/u],
  java: [/(?:^|\/)src\/(?:test|it|integrationTest)\//u, /(?:Tests?|IT)\.java$/u],
  kotlin: [/(?:^|\/)src\/(?:test|it|integrationTest)\//u, /(?:Tests?|IT|Spec)\.kt$/u],
};

export const isTestFile = (language, file) =>
  TEST_FILES[language].some((pattern) => pattern.test(file));

// What counts as one assertion, in code with comments and strings blanked out.
const ASSERTIONS = {
  python: /\bassert\b|\bassert[A-Z_]\w*\s*\(|\bpytest\.(?:raises|warns|deprecated_call)\b/gu,
  jvm: /\bassert[A-Z]\w*\s*[(<]|\bassert\b|\b(?:co)?[vV]erify\w*\s*[({]|\bshould[A-Z]\w*|\bexpect(?:That)?\s*\(|\bconfirmVerified\b/gu,
};

// An assertion that cannot fail, in code with comments only blanked out.
const TAUTOLOGIES = {
  python: [
    /\bassert\s+(?:True|1|not\s+False|\(True\))\s*(?:,.*)?$/gmu,
    /\bassert\s+([\w.]+)\s*==\s*\1\s*(?:,.*)?$/gmu,
    /\.assert(?:True\(\s*True|False\(\s*False|IsNone\(\s*None|Equal\(\s*([\w.]+)\s*,\s*\1)\s*[,)]/gu,
  ],
  jvm: [
    /\bassert\s+true\s*[;:]/gu,
    /\bassert(?:True\(\s*true|False\(\s*false|Null\(\s*null)\s*[,)]/gu,
    /\bassertEquals\(\s*([\w."]+)\s*,\s*\1\s*[,)]/gu,
    /\bassertThat\(\s*true\s*\)\s*\.\s*isTrue\(\)/gu,
    /\btrue\s+shouldBe\s+true\b/gu,
  ],
};

// Assertions that check less than the value, by what they check instead.
const WEAK = {
  python: [
    ['is not None', /\bassert\s+[^\n]*?\bis\s+not\s+None\b|\bassertIsNotNone\b/gu],
    ['truthiness', /\bassert\s+(?!True\b|not\b)[A-Za-z_][\w.]*\s*(?:,.*)?$/gmu],
  ],
  jvm: [
    [
      'not null',
      /\bassertNotNull\b|\.isNotNull\(\)|\bshouldNotBeNull\b|\bshouldNotBe\s+null\b|\bassertTrue\(\s*[\w.]+\s*!=\s*null\s*\)/gu,
    ],
  ],
};

// A test turned off by a call in its body rather than by an annotation or decorator.
const BODY_SKIPS = {
  python: /\b(?:pytest\.(?:skip|xfail)|self\.skipTest)\s*\(|\braise\s+(?:unittest\.)?SkipTest\b/u,
  jvm: /\b(?:Assum\w*\.)?(?:assumeTrue\(\s*false\b|assumeFalse\(\s*true\b|assumeThat\(\s*false\b|abort\()/u,
};

const family = (language) => (language === 'python' ? 'python' : 'jvm');

const countMatches = (pattern, text) => [...text.matchAll(pattern)].length;

/**
 * What a test body asserts. `masked` is the body with comments and strings blanked, `kept` the
 * body with only the comments blanked (a tautology compares its operands, strings included).
 * Returns the number of assertions, the tautologies and loosened assertions found, and whether
 * the body skips the test.
 */
export function measureBody(language, { masked, kept }) {
  const kind = family(language);
  const tautologies = TAUTOLOGIES[kind].flatMap((pattern) =>
    [...kept.matchAll(pattern)].map((match) => match[0].trim()),
  );
  return {
    assertions: countMatches(ASSERTIONS[kind], masked),
    tautologies,
    weak: WEAK[kind].flatMap(([label, pattern]) => [...kept.matchAll(pattern)].map(() => label)),
    skipped: BODY_SKIPS[kind].test(masked),
  };
}
