import type TypeScript from 'typescript';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import { chainOf, depthFirst } from '../../../../../shared/traversal.mts';
import { syntaxChildren as untypedSyntaxChildren } from '../../syntax/children.mts';

const api = typescriptApi();

export { chainOf, depthFirst };

export const syntaxChildren: (node: TypeScript.Node) => TypeScript.Node[] = untypedSyntaxChildren;

const effectiveFlags: unknown = Reflect.get(api, 'getEffectiveModifierFlags');

const combinedFlags: unknown = Reflect.get(api, 'getCombinedModifierFlags');

function combinedModifierFlags(node: TypeScript.Node): number {
  const flags: unknown =
    typeof combinedFlags === 'function' ? Reflect.apply(combinedFlags, api, [node]) : 0;
  return typeof flags === 'number' ? flags : 0;
}

function effectiveModifierFlags(node: TypeScript.Node): number {
  const flags: unknown =
    typeof effectiveFlags === 'function' ? Reflect.apply(effectiveFlags, api, [node]) : 0;
  return typeof flags === 'number' ? flags : 0;
}

const typeAnnotation: unknown = Reflect.get(api, 'getEffectiveTypeAnnotationNode');

function isNodeValue(value: unknown): value is TypeScript.Node {
  return typeof value === 'object' && value !== null && 'kind' in value;
}

function effectiveTypeAnnotation(node: TypeScript.Node): TypeScript.TypeNode | undefined {
  const result: unknown =
    typeof typeAnnotation === 'function' ? Reflect.apply(typeAnnotation, api, [node]) : undefined;
  return isNodeValue(result) && api.isTypeNode(result) ? result : undefined;
}

export const ts = {
  ...api,
  getCombinedModifierFlags: combinedModifierFlags,
  getEffectiveModifierFlags: effectiveModifierFlags,
  getEffectiveTypeAnnotationNode: effectiveTypeAnnotation,
};
