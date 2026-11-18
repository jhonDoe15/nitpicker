import type { TSESTree } from '@typescript-eslint/utils';
import { typeServices, type Context } from '../security/security-values.mts';
import { ts } from '../typed/typescript-views.mts';

export type ValueKind = 'text' | 'literals' | 'number' | 'unknown';

const TEXT_FLAGS = ts.TypeFlags.StringLike;
const NUMBER_FLAGS = ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike | ts.TypeFlags.BigIntLike;

export function valueKind(context: Context, node: TSESTree.Node): ValueKind {
  const services = typeServices(context);
  if (services === undefined) {
    return 'unknown';
  }
  const type = services.getTypeAtLocation(node);
  const members = type.isUnion() ? type.types : [type];
  if (members.every((member) => (member.flags & ts.TypeFlags.StringLiteral) !== 0)) {
    return 'literals';
  }
  if (members.every((member) => (member.flags & NUMBER_FLAGS) !== 0)) {
    return 'number';
  }
  return members.every((member) => (member.flags & TEXT_FLAGS) !== 0) ? 'text' : 'unknown';
}
