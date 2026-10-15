const CALL = /^(.+?)\((?:[^()]|\([^()]*\))*\)(?:\[\d+\])?$/u;
const DECLARED_NAME = String.raw`(\x60[^\x60]+\x60|[\p{L}_$][\p{L}\p{N}_$]*)`;
const DECLARATION = new RegExp(String.raw`\b(?:void|fun)\s+${DECLARED_NAME}\s*\(`, 'gu');
const ANNOTATION_LINE = /^\s*@/u;
const BRACES_OUTSIDE_LITERALS = /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|[{}]/gu;
const BRACE_DEPTH = { '{': 1, '}': -1 };

function quoted(text) {
  return JSON.stringify(text).slice(1, -1);
}

function declarations(text) {
  return [...text.matchAll(DECLARATION)].map((match) => ({
    name: match[1].replaceAll('`', ''),
    index: match.index,
  }));
}

function namedByDisplayName(text, name, found) {
  const annotation = text.indexOf(`@DisplayName("${quoted(name)}")`);
  return annotation < 0 ? undefined : found.find((declaration) => declaration.index > annotation);
}

function closingBrace(text, from) {
  const open = text.indexOf('{', from);
  if (open < 0) {
    return text.length - 1;
  }
  let depth = 0;
  for (const token of text.slice(open).matchAll(BRACES_OUTSIDE_LITERALS)) {
    depth += BRACE_DEPTH[token[0]] ?? 0;
    if (depth === 0) {
      return open + token.index;
    }
  }
  return text.length - 1;
}

function methodBlock(text, declaration) {
  const lines = text.slice(0, declaration.index).split('\n');
  const declarationLine = lines.length;
  const annotations = lines.slice(0, -1).reverse();
  const firstAnnotation = annotations.findIndex((line) => !ANNOTATION_LINE.test(line));
  const above = firstAnnotation < 0 ? annotations.length : firstAnnotation;
  const start = text
    .split('\n')
    .slice(0, declarationLine - 1 - above)
    .join('\n').length;
  const end = closingBrace(text, declaration.index);
  return {
    line: declarationLine,
    text: text
      .slice(start, end + 1)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n'),
  };
}

export function testMethod(text, testName) {
  const found = declarations(text);
  const candidates = [CALL.exec(testName)?.[1], testName].filter(Boolean);
  const declaration =
    found.find((entry) => candidates.includes(entry.name)) ??
    namedByDisplayName(text, testName, found);
  return declaration === undefined ? undefined : methodBlock(text, declaration);
}
