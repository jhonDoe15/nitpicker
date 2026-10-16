import { closingIndex } from '../kotlin-source.mjs';

const TEST_CLASS =
  /((?:@[\w.]+(?:\([^)]*\))?\s+)*)((?:(?:abstract|open|sealed|private|internal|public|data|inner)\s+)*)class\s+([A-Z]\w*(?:Test|Tests|TestCase|IT))\b([^{\n]*)\{/g;
const TEST_ANNOTATION =
  /@(?:[\w.]+\.)?(?:Test|ParameterizedTest|RepeatedTest|TestFactory|TestTemplate|Property|Example|Nested)\b/;
const SUPERCLASS_CALL = /:\s*(?:[^,{]*,\s*)*[A-Z][\w.]*\s*(?:<[^>]*>)?\s*\(/;
const SUITE = /@(?:Suite|SelectClasses|SelectPackages|RunWith|Cucumber\w*|IncludeEngines)\b/;
const FUNCTION =
  /(^|\n)([ \t]*)((?:(?:private|public|internal|protected|override|suspend|open)\s+)*)fun\s+(`[^`]+`|[A-Za-z_]\w*)\s*\(\s*\)/g;
const TEST_NAME = /^`.+`$|^test[A-Z_]|^should[A-Z_]/;
const TEST_FRAMEWORK =
  /^\s*import\s+(?:org\.junit|kotlin\.test|io\.kotest|io\.mockk|org\.mockito|org\.assertj|com\.google\.common\.truth|strikt|org\.hamcrest)\b[\w.*]*/m;

export const TEST_MESSAGES = {
  TestClassWithoutTestCases:
    'Add @Test functions to the class, or rename it if it is a helper (for example `TestInputGenerator` becomes `InputGenerator`): a test class without tests never runs.',
  DetachedTestCase:
    'Annotate the function with @Test so JUnit runs it, or make it private if it is a helper: this test never runs.',
  TestHelperInSource:
    'Move the test helper to the test sources (`src/test/kotlin`): production code must not import a test framework.',
};

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
      SUPERCLASS_CALL.test(header) ||
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
