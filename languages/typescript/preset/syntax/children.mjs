import ts from 'typescript';

export function syntaxChildren(node) {
  const children = [];
  ts.forEachChild(node, (child) => {
    children.push(child);
  });
  return children;
}
