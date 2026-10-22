import { closingIndex } from '../kotlin-source.mjs';

const CLASS_MODIFIERS = 'abstract|open|sealed|private|internal|public|data|inner';
const TEST_CLASS = new RegExp(
  [
    String.raw`((?:@[\w.]+(?:\([^)]*\))?\s+)*)((?:(?:${CLASS_MODIFIERS})\s+)*)`,
    String.raw`class\s+([A-Z]\w*(?:Test|Tests|TestCase|IT))\b([^{\n]*)\{`,
  ].join(''),
  'g',
);
const TEST_ANNOTATIONS =
  'Test|ParameterizedTest|RepeatedTest|TestFactory|TestTemplate|Property|Example|Nested';
const TEST_ANNOTATION = new RegExp(String.raw`@(?:[\w.]+\.)?(?:${TEST_ANNOTATIONS})\b`);
const SUPERTYPE_CALL = /^\s*[A-Z][\w.]*\s*(?:<[^>]*>\s*)?\(/;
const SUITE = /@(?:Suite|SelectClasses|SelectPackages|RunWith|Cucumber\w*|IncludeEngines)\b/;
const FUNCTION_MODIFIERS = 'private|public|internal|protected|override|suspend|open';
const FUNCTION = new RegExp(
  String.raw`(^|\n)([ \t]*)((?:(?:${FUNCTION_MODIFIERS})\s+)*)fun\s+(\`[^\`]+\`|[A-Za-z_]\w*)\s*\(\s*\)(?:\s*:\s*Unit\b)?\s*\{`,
  'g',
);
const TEST_NAME = /^`.+`$|^test[A-Z_]|^should[A-Z_]/;
const TEST_PACKAGES = [
  String.raw`org\.junit`,
  String.raw`kotlin\.test`,
  String.raw`io\.kotest`,
  String.raw`io\.mockk`,
  String.raw`org\.mockito`,
  String.raw`org\.assertj`,
  String.raw`com\.google\.common\.truth`,
  'strikt',
  String.raw`org\.hamcrest`,
];
const TEST_FRAMEWORK = new RegExp(
  String.raw`^\s*import\s+(?:${TEST_PACKAGES.join('|')})\b[\w.*]*`,
  'm',
);

export const TEST_MESSAGES = {
  TestClassWithoutTestCases:
    'Add @Test functions to the class, or rename it if it is a helper (for example `TestInputGenerator` becomes `InputGenerator`): a test class without tests never runs.',
  DetachedTestCase:
    'Annotate the function with @Test so JUnit runs it, or make it private if it is a helper: this test never runs.',
  TestHelperInSource:
    'Move the test helper to the test sources (`src/test/kotlin`): production code must not import a test framework.',
};

function hasSuperclassCall(header) {
  const colon = header.indexOf(':');
  return (
    colon !== -1 &&
    header
      .slice(colon + 1)
      .split(',')
      .some((part) => SUPERTYPE_CALL.test(part))
  );
}

function annotatedBefore(body, index) {
  const before = body.slice(0, index).trimEnd();
  return /@[\w.]+(?:\([^)]*\))?$/.test(before);
}

function detached(scanned, open, close) {
  const body = scanned.code.slice(open, close);
  return [...body.matchAll(FUNCTION)].flatMap((match) => {
    const [, lead, indent, modifiers, name] = match;
    const index = match.index + lead.length + indent.length;
    if (/\b(?:private|override)\b/.test(modifiers) || !TEST_NAME.test(name)) {
      return [];
    }
    return annotatedBefore(body, index)
      ? []
      : [{ rule: 'DetachedTestCase', offset: open + index, subject: name }];
  });
}

export function testClassesWithoutTests(scanned) {
  return [...scanned.code.matchAll(TEST_CLASS)].flatMap((match) => {
    const [, annotations, modifiers, name, header] = match;
    const open = match.index + match[0].length - 1;
    const close = closingIndex(scanned.code, open);
    const body = scanned.code.slice(open, close);
    if (
      /\b(?:abstract|open|sealed)\b/.test(modifiers) ||
      hasSuperclassCall(header) ||
      SUITE.test(annotations) ||
      TEST_ANNOTATION.test(annotations)
    ) {
      return [];
    }
    if (!TEST_ANNOTATION.test(body)) {
      return [{ rule: 'TestClassWithoutTestCases', offset: match.index, subject: name }];
    }
    return detached(scanned, open, close);
  });
}

export function testHelpersInSource(scanned) {
  const imported = TEST_FRAMEWORK.exec(scanned.code);
  return imported === null
    ? []
    : [
        {
          rule: 'TestHelperInSource',
          offset: imported.index + imported[0].search(/\S/),
          subject: imported[0].trim(),
        },
      ];
}
