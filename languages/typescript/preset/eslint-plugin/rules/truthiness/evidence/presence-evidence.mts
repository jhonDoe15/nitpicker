import {
  AST_NODE_TYPES,
  type ParserServicesWithTypeInformation,
  type TSESTree,
} from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { partsOf } from '../../analysis/narrowing/type-parts.mts';
import { ts } from '../../typed/typescript-views.mts';
import { isPresenceType } from '../presence-types.mts';
import { isSetToFalsy } from './falsy-sites.mts';

export type Evidence = 'generic' | 'literal' | 'assigned';

const PHRASES: Readonly<Record<Evidence, string>> = {
  generic: 'its type is a type parameter, so `0`, `""` and `false` are valid values',
  literal: 'its type names `""` or `false` as a valid value',
  assigned:
    '`""`, `0` or `false` is assigned or passed for it elsewhere in the project or its tests',
};

export function phraseFor(evidence: Evidence): string {
  return PHRASES[evidence];
}

function isNullish(part: TypeScript.Type): boolean {
  return (part.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void)) !== 0;
}

function isFalsyLiteralPart(
  part: TypeScript.Type,
  others: readonly TypeScript.Type[],
  checker: TypeScript.TypeChecker,
): boolean {
  if (part.isStringLiteral()) {
    return part.value === '';
  }
  return (
    (part.flags & ts.TypeFlags.BooleanLiteral) !== 0 &&
    checker.typeToString(part) === 'false' &&
    others.some((other) => (other.flags & ts.TypeFlags.BooleanLiteral) === 0)
  );
}

function typeEvidence(
  type: TypeScript.Type,
  checker: TypeScript.TypeChecker,
): Evidence | undefined {
  const present = partsOf(type).filter((part) => !isNullish(part));
  if (present.some((part) => (part.flags & ts.TypeFlags.TypeParameter) !== 0)) {
    return 'generic';
  }
  return present.some((part) => isFalsyLiteralPart(part, present, checker)) ? 'literal' : undefined;
}

export function typeEvidenceOf(
  type: TypeScript.Type,
  checker: TypeScript.TypeChecker,
): Evidence | undefined {
  return isPresenceType(type, checker) ? typeEvidence(type, checker) : undefined;
}

function symbolOf(
  services: ParserServicesWithTypeInformation,
  node: TSESTree.Node,
): TypeScript.Symbol | undefined {
  const target = node.type === AST_NODE_TYPES.ChainExpression ? node.expression : node;
  return services.getSymbolAtLocation(
    target.type === AST_NODE_TYPES.MemberExpression ? target.property : target,
  );
}

export function nodeEvidenceOf(
  services: ParserServicesWithTypeInformation,
  checker: TypeScript.TypeChecker,
  node: TSESTree.Node,
): Evidence | undefined {
  const type = services.getTypeAtLocation(node);
  if (!isPresenceType(type, checker)) {
    return undefined;
  }
  const found = typeEvidence(type, checker);
  if (found !== undefined) {
    return found;
  }
  return isSetToFalsy(services.program, symbolOf(services, node)) ? 'assigned' : undefined;
}
