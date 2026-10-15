const CALL = /^(.+?)\((?:[^()]|\([^()]*\))*\)(?:\[\d+\])?$/u;
const DECLARED_NAME = String.raw`(\x60[^\x60]+\x60|[\p{L}_$][\p{L}\p{N}_$]*)`;
const DECLARATION = new RegExp(String.raw`\b(?:void|fun)\s+${DECLARED_NAME}\s*\(`, 'gu');
const ANNOTATION_LINE = /^\s*@/u;

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

function skipLiteral(text, start) {
  const quote = text[start];
  let index = start + 1;
  while (index < text.length && text[index] !== quote) {
    index += text[index] === '\\' ? 2 : 1;
  }
  return index;
}

function closingBrace(text, from) {
  let depth = 0;
  for (let index = text.indexOf('{', from); index >= 0 && index < text.length; index += 1) {
    const character = text[index];
    if (character === '"' || character === "'") {
      index = skipLiteral(text, index);
    } else if (character === '{' || character === '}') {
      depth += character === '{' ? 1 : -1;
      if (depth === 0) {
        return index;
      }
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
