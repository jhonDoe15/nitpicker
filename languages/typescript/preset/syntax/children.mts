import type TypeScript from 'typescript';
import { ts } from './typed/typescript-compiler.mts';

export function syntaxChildren(node: TypeScript.Node): TypeScript.Node[] {
  const children: TypeScript.Node[] = [];
  ts.forEachChild(node, (child) => {
    children.push(child);
  });
  return children;
}
