import path from 'node:path';
import { offsetOf } from '../../review-rules/java-sources.mjs';
import { BODY_STATUS } from '../../kotlin/review-rules/validation/constraint-names.mjs';
import { bodyStatus, sourceOf, typeIndex } from './constrained-types.mjs';

const RULE = 'SpringValidRequestBody';
const OPENING = new Set(['(', '<', '[']);
const CLOSING = new Set([')', '>', ']']);
const ANNOTATION = /@\s*[\w.]+(?:\s*\((?:[^()]|\([^()]*\))*\))?/gu;
const WHITESPACE = /\s+/gu;
const VARARGS = /\.\.\.$/u;

function parameterText(text, start) {
  let depth = 0;
  let end = start;
  for (const character of text.slice(start)) {
    depth += OPENING.has(character) ? 1 : 0;
    depth -= CLOSING.has(character) ? 1 : 0;
    if (depth < 0 || (depth === 0 && character === ',')) {
      break;
    }
    end += 1;
  }
  return text.slice(start, end);
}

function bodyType(text, { line, column }) {
  const words = parameterText(text, offsetOf(text, { line, column }))
    .replaceAll(ANNOTATION, ' ')
    .replaceAll(WHITESPACE, ' ')
    .trim()
    .split(' ');
  const [name, ...reversed] = words.toReversed();
  const type = reversed
    .toReversed()
    .filter((word) => word !== 'final')
    .join(' ')
    .replace(VARARGS, '');
  return name === undefined || type === '' ? undefined : type;
}

export function withoutUnconstrainedBodies(findings, { projectRoot, roots, readText }) {
  let index;
  return findings.filter((finding) => {
    if (finding.tool !== 'pmd' || finding.rule !== RULE || finding.location?.line === undefined) {
      return true;
    }
    index ??= typeIndex({ projectRoot, roots, readText });
    const source = sourceOf(index, path.join(projectRoot, finding.path));
    const type =
      source === undefined
        ? undefined
        : bodyType(source.text, { line: finding.location.line, column: finding.location.column });
    return type === undefined || bodyStatus(index, source, type) !== BODY_STATUS.unconstrained;
  });
}
