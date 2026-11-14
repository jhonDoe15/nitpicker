import type TypeScript from 'typescript';
import { ts } from './typed/typescript-compiler.mts';

export function propertyName(node: TypeScript.Node): string | undefined {
  return ts.isPropertyAssignment(node) &&
    (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))
    ? node.name.text
    : undefined;
}
