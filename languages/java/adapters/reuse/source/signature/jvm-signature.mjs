import { annotationsEnd, topLevelIndexes } from '../jvm-members.mjs';

const ANGLE_DEPTH = new Map([
  ['<', 1],
  ['>', -1],
]);

function parameterRanges(tokens, close, paren) {
  const ranges = [];
  let from = paren + 1;
  let depth = 0;
  for (const index of topLevelIndexes(close, { from: paren + 1, to: close[paren] })) {
    depth += ANGLE_DEPTH.get(tokens[index].text) ?? 0;
    if (tokens[index].text === ',' && depth === 0) {
      ranges.push({ from, to: index });
      from = index + 1;
    }
  }
  return [...ranges, { from, to: close[paren] }].filter((range) => range.to > range.from);
}

function javaParameterStart(tokens, close, from) {
  const positions = [from];
  for (const index of positions) {
    if (tokens[index]?.text === 'final') {
      positions.push(index + 1);
    } else if (tokens[index]?.text === '@') {
      positions.push(annotationsEnd(tokens, close, index));
    }
  }
  return positions.at(-1);
}

function parameterType(tokens, close, { range, kotlin }) {
  const part = tokens.slice(range.from, range.to);
  if (!kotlin) {
    return tokens.slice(javaParameterStart(tokens, close, range.from), range.to - 1);
  }
  const colon = part.findIndex(({ text }) => text === ':');
  const assign = part.findIndex(({ text }) => text === '=');
  return part.slice(colon + 1, assign === -1 ? undefined : assign);
}

/** The parameter types of a function, joined with commas, such as `int,List<String>`. */
export function signature(structure, { paren }, kotlin) {
  const { tokens, close } = structure;
  if (paren === undefined || close[paren] < 0) {
    return '';
  }
  return parameterRanges(tokens, close, paren)
    .map((range) =>
      parameterType(tokens, close, { range, kotlin })
        .map(({ text }) => text)
        .join(''),
    )
    .join(',');
}
