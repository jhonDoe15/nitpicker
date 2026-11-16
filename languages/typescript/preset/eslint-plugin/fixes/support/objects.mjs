import { hasCommentIn, inserting, replacing } from './ranges.mjs';

const SPACES_AFTER = /^[ \t]*/u;

export function keyName(property) {
  if (property.type !== 'Property' || property.computed) {
    return undefined;
  }
  return property.key.type === 'Identifier' ? property.key.name : String(property.key.value);
}

export function isPlainObject(node, { allowSpread = false } = {}) {
  return (
    node?.type === 'ObjectExpression' &&
    node.properties.every((property) =>
      property.type === 'SpreadElement'
        ? allowSpread
        : property.type === 'Property' && !property.computed && property.kind === 'init',
    )
  );
}

export function addingProperty(sourceCode, object, text) {
  const last = object.properties.at(-1);
  if (last !== undefined) {
    return inserting(last.range[1], `, ${text}`);
  }
  return hasCommentIn(sourceCode, object.range)
    ? undefined
    : replacing(object.range, `{ ${text} }`);
}

export function removingProperty(sourceCode, property) {
  const next = sourceCode.getTokenAfter(property);
  const previous = sourceCode.getTokenBefore(property);
  let range = property.range;
  if (next?.value === ',') {
    const spaces = SPACES_AFTER.exec(sourceCode.text.slice(next.range[1]))[0].length;
    range = [property.range[0], next.range[1] + spaces];
  } else if (previous?.value === ',') {
    range = [previous.range[0], property.range[1]];
  } else if (previous?.value === '{' && next?.value === '}') {
    range = [previous.range[1], next.range[0]];
  }
  return hasCommentIn(sourceCode, range) ? undefined : replacing(range, '');
}
