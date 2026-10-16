const TESTCASE = /<testcase\b(?:[^>"/]|"[^"]*"|\/(?!>))*(?:\/>|>[\s\S]*?<\/testcase>)/gu;
const CLASSNAME = /\bclassname="([^"]*)"/u;
const SUITE_NAME = /<testsuite\b(?:[^>"]|"[^"]*")*?\bname="([^"]*)"/u;
const XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n';

function classOf(testCase, suiteName) {
  return CLASSNAME.exec(testCase)?.[1] ?? suiteName;
}

function suiteOf(cases, suiteName) {
  return cases.length === 0
    ? undefined
    : `${XML_HEADER}<testsuite name="${suiteName}">${cases.join('')}</testsuite>\n`;
}

export function splitReport(text, isArchunit, fallbackName) {
  const suiteName = SUITE_NAME.exec(text)?.[1] ?? fallbackName;
  const cases = text.match(TESTCASE) ?? [];
  if (cases.length === 0) {
    return isArchunit(suiteName) ? { archunit: text } : { other: text };
  }
  const archunit = cases.filter((testCase) => isArchunit(classOf(testCase, suiteName)));
  if (archunit.length === 0) {
    return { other: text };
  }
  const other = cases.filter((testCase) => !archunit.includes(testCase));
  return {
    archunit: other.length === 0 ? text : suiteOf(archunit, suiteName),
    other: suiteOf(other, suiteName),
  };
}
