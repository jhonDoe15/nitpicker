export const HOLDER = String.raw`(?:[\w.]+\.)?(?:Assertions|Assert)\s*\.\s*|kotlin\.test\.`;
export const NUMBER = String.raw`(?:\d[\d_]*(?:\.\d[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?[fF]?`;

const LITERAL = new RegExp(String.raw`^\(*[-+]?(${NUMBER})\)*$`, 'u');
const RIGHT_OPERAND = new RegExp(
  String.raw`(?<![<>=!])(?:===?|!==?)\s*([-+]?${NUMBER})(?![\w.])`,
  'gu',
);
const LEFT_OPERAND = new RegExp(
  String.raw`(?<![\w.)\]}+*/%-][ \t]{0,16})([-+]?${NUMBER})[ \t]*(?:===?|!==?)(?!=)`,
  'gu',
);
const ARITHMETIC_TAIL = /^\s*[-+*/%]/u;

export function isFractional(text) {
  const found = LITERAL.exec(text.replaceAll(/\s+/gu, ''));
  return found !== null && !Number.isInteger(Number.parseFloat(found[1].replaceAll('_', '')));
}

export function hasFractionalEquality(text) {
  const right = [...text.matchAll(RIGHT_OPERAND)].some(
    (match) =>
      isFractional(match[1]) && !ARITHMETIC_TAIL.test(text.slice(match.index + match[0].length)),
  );
  return right || [...text.matchAll(LEFT_OPERAND)].some((match) => isFractional(match[1]));
}
