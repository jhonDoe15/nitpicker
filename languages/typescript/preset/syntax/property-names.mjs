import { ts } from '../../typescript-api/typescript-api.mjs';

export function propertyName(node) {
  return ts.isPropertyAssignment(node) &&
    (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))
    ? node.name.text
    : undefined;
}
