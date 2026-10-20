const CALLED = /([A-Za-z_]\w*)\s*(?=[({])/g;
const KOTLIN_CALLED = /([A-Za-z_]\w*)\s*(?:<[^<>]*(?:<[^<>]*>[^<>]*)*>\s*)?(?=[({])/g;
const INFIX = /[\w)\]"}]\s+(should(?:[A-Z]\w*)?)\s+(?=[\w"'([{-])/g;
const JAVA_BUILT_IN = /^(?:assert|check|verify)(?:[A-Z]\w*)?$|^(?:fail|failWith)$/;
const KOTLIN_BUILT_IN =
  /^(?:assert|check|verify|coVerify|expect|should)(?:[A-Z]\w*)?$|^(?:confirmVerified|fail|andExpect|forAll)$/;
const VOCABULARY =
  /^(?:expect|ensure|must|should|require|validate|confirm|andExpect|await|until|statusCode|is[A-Z]|has[A-Z])/;

export function calledNames(body, language = 'java') {
  if (language === 'kotlin') {
    return [
      ...[...body.matchAll(KOTLIN_CALLED)].map((match) => match[1]),
      ...[...body.matchAll(INFIX)].map((match) => match[1]),
    ];
  }
  return [...body.matchAll(CALLED)].map((match) => match[1]);
}

export function hasAssertion({ body, language, extra = [] }) {
  const known = new Set(extra);
  const builtIn = language === 'kotlin' ? KOTLIN_BUILT_IN : JAVA_BUILT_IN;
  return calledNames(body, language).some((name) => builtIn.test(name) || known.has(name));
}

export function isHelperName(name) {
  return VOCABULARY.test(name);
}

function statements(body) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (const [index, character] of [...body].entries()) {
    if ('({['.includes(character)) {
      depth += 1;
    } else if (')}]'.includes(character)) {
      depth -= 1;
    }
    if (depth === 0 && character === ';') {
      parts.push(body.slice(start, index));
      start = index + 1;
    }
  }
  return [...parts, body.slice(start)].filter((part) => part.trim() !== '');
}

function lastStatementKotlin(body) {
  const lines = body.split('\n').filter((line) => line.trim() !== '');
  const indent = lines.length === 0 ? 0 : lines[0].search(/\S/);
  const starts = lines
    .map((line, index) => ({ line, index }))
    .filter(
      ({ line }) => line.search(/\S/) === indent && !/^\s*(?:[.)}\]]|\?[.:]|&&|\|\|)/.test(line),
    );
  return starts.length === 0 ? '' : lines.slice(starts.at(-1).index).join('\n');
}

function depthZeroCalls(statement) {
  const depths = [];
  let depth = 0;
  for (const character of statement) {
    depths.push(depth);
    depth += '({['.includes(character) ? 1 : 0;
    depth -= ')}]'.includes(character) ? 1 : 0;
  }
  return [...statement.matchAll(CALLED)].filter((match) => depths[match.index] === 0);
}

export function terminalCall(body, language) {
  const statement =
    language === 'kotlin' ? lastStatementKotlin(body) : (statements(body).at(-1) ?? '');
  return depthZeroCalls(statement).at(-1)?.[1];
}
