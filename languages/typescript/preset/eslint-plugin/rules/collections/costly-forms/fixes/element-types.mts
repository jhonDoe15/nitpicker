import type { TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { unionMembers } from '../../../support/array-items.mts';
import { typeServices, type Context } from '../../../security/security-values.mts';
import { ts } from '../../../typed/typescript-views.mts';

const NEVER_NAN =
  ts.TypeFlags.StringLike |
  ts.TypeFlags.BooleanLike |
  ts.TypeFlags.BigIntLike |
  ts.TypeFlags.ESSymbolLike |
  ts.TypeFlags.Null |
  ts.TypeFlags.Undefined |
  ts.TypeFlags.Void |
  ts.TypeFlags.Object |
  ts.TypeFlags.NonPrimitive;
const NEVER_UNDEFINED =
  ts.TypeFlags.StringLike |
  ts.TypeFlags.NumberLike |
  ts.TypeFlags.BooleanLike |
  ts.TypeFlags.BigIntLike |
  ts.TypeFlags.ESSymbolLike |
  ts.TypeFlags.Null |
  ts.TypeFlags.Object |
  ts.TypeFlags.NonPrimitive;
const MAX_TEXT = 120;

export function hasMemberWith(type: TypeScript.Type, flags: TypeScript.TypeFlags): boolean {
  return unionMembers(type).some((member) => (member.flags & flags) !== 0);
}

export function canBeNaN(type: TypeScript.Type): boolean {
  return unionMembers(type).some((member) => (member.flags & NEVER_NAN) === 0);
}

export function canBeUndefined(type: TypeScript.Type): boolean {
  return unionMembers(type).some((member) => (member.flags & NEVER_UNDEFINED) === 0);
}

export function isStringLike(type: TypeScript.Type): boolean {
  return unionMembers(type).every((member) => (member.flags & ts.TypeFlags.StringLike) !== 0);
}

export function printedType(
  context: Context,
  site: TSESTree.Node,
  type: TypeScript.Type,
): string | undefined {
  const services = typeServices(context);
  if (services === undefined) {
    return undefined;
  }
  const checker = services.program.getTypeChecker();
  const text = checker.typeToString(
    type,
    services.esTreeNodeToTSNodeMap.get(site),
    ts.TypeFormatFlags.NoTruncation,
  );
  const printable =
    !text.includes('import(') && !text.includes('typeof ') && text.length <= MAX_TEXT;
  return printable && !/\b(?:any|unknown|never)\b/u.test(text) ? text : undefined;
}
