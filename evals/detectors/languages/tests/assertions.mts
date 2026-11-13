import type { Family, Language, MaskedViews } from '../../common/types.mts';

const ASSERTIONS: Readonly<Record<Family, RegExp>> = {
  python: /\bassert\b|\bassert[A-Z_]\w*\s*\(|\bpytest\.(?:raises|warns|deprecated_call)\b/gu,
  jvm: new RegExp(
    [
      String.raw`\bassert[A-Z]\w*\s*[(<]|\bassert\b|\b(?:co)?[vV]erify\w*\s*[({]|`,
      String.raw`\bshould[A-Z]\w*|\bexpect(?:That)?\s*\(|\bconfirmVerified\b`,
    ].join(''),
    'gu',
  ),
};

const OPERAND = String.raw`((?:[\w."]|\([^()]*\))+)`;

const TAUTOLOGIES: Readonly<Record<Family, readonly RegExp[]>> = {
  python: [
    /\bassert\s+(?:True|1|not\s+False|\(True\))\s*(?:,.*)?$/gmu,
    new RegExp(String.raw`\bassert\s+${OPERAND}\s*==\s*\1\s*(?:,.*)?$`, 'gmu'),
    /\bassert\b[^\n]*\bor\s+True\b/gu,
    /\bassert\s*\((?:[^()\n]|\([^()\n]*\))*,(?:[^()\n]|\([^()\n]*\))*\)\s*$/gmu,
    new RegExp(
      String.raw`\.assert(?:True\(\s*True|False\(\s*False|IsNone\(\s*None|Equal\(\s*${OPERAND}\s*,\s*\1)\s*[,)]`,
      'gu',
    ),
    /\bexcept\s+(?:AssertionError|BaseException|Exception)\b[^:\n]*:\s*(?:pass|\.\.\.|return)\b/gu,
  ],
  jvm: [
    /\bassert\s+true\s*[;:]/gu,
    /\bassert(?:True\(\s*true|False\(\s*false|Null\(\s*null)\s*[,)]/gu,
    new RegExp(String.raw`\bassertEquals\(\s*${OPERAND}\s*,\s*\1\s*[,)]`, 'gu'),
    new RegExp(String.raw`\bassertTrue\(\s*${OPERAND}\s*==\s*\1\s*[,)]`, 'gu'),
    /\bassertThat\(\s*true\s*\)\s*\.\s*isTrue\(\)/gu,
    /\btrue\s+shouldBe\s+true\b/gu,
  ],
};

const WEAK: Readonly<Record<Family, readonly (readonly [string, RegExp])[]>> = {
  python: [
    ['is not None', /\bassert\s+[^\n]*?\bis\s+not\s+None\b|\bassertIsNotNone\b/gu],
    ['truthiness', /\bassert\s+(?!True\b|not\b)[A-Za-z_][\w.]*\s*(?:,.*)?$/gmu],
  ],
  jvm: [
    [
      'not null',
      new RegExp(
        [
          String.raw`\bassertNotNull\b|\.isNotNull\(\)|\bshouldNotBeNull\b|\bshouldNotBe\s+null\b|`,
          String.raw`\bassertTrue\(\s*[\w.]+\s*!=\s*null\s*\)`,
        ].join(''),
        'gu',
      ),
    ],
    ['does not throw', /\bassertDoesNotThrow\b|\bshouldNotThrowAny\b/gu],
  ],
};

const BODY_SKIPS: Readonly<Record<Family, RegExp>> = {
  python:
    /\b(?:pytest\.(?:skip|xfail|importorskip)|self\.skipTest)\s*\(|\braise\s+(?:unittest\.)?SkipTest\b/u,
  jvm: /\b(?:Assum\w*\.)?(?:assume(?:True|False|That|NotNull)\s*\(|abort\()/u,
};

function family(language: Language): Family {
  return language === 'python' ? 'python' : 'jvm';
}

function countMatches(pattern: RegExp, text: string): number {
  return [...text.matchAll(pattern)].length;
}

export type Measured = {
  assertions: number;
  tautologies: string[];
  weak: string[];
  skipped: boolean;
};

export function measureBody(language: Language, { masked, kept }: MaskedViews): Measured {
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
