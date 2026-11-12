import { ts } from '../../typescript-api/typescript-api.mjs';

export function syntaxChildren(node) {
  const children = [];
  ts.forEachChild(node, (child) => {
    children.push(child);
  });
  return children;
}
