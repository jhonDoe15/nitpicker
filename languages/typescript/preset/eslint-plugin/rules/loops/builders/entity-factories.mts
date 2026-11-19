import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { TYPEORM } from '../../database/orm-modules.mts';
import { calleeDeclaration, calleeFamily } from '../../queries/receivers/orm-callee.mts';
import { typeServices, type Context } from '../../security/security-values.mts';
import { estreeCallView, ownerName } from '../../support/io/call-views.mts';
import { wordsOf as untypedWordsOf } from '../../../../../../../shared/naming/secret-words.mjs';
import type { Call } from './chain-execution.mts';
import { staysEntity } from './entity-flow.mts';

const wordsOf: (name: string) => string[] = untypedWordsOf;

const FACTORY_OWNERS = new Set(['repo', 'repository']);
const TYPEORM_OWNER = /(?:Repository|EntityManager)$/u;

function declaredName(node: TypeScript.Node): string {
  const name: unknown = 'name' in node ? node.name : undefined;
  const text = typeof name === 'object' && name !== null && 'text' in name ? name.text : undefined;
  return typeof text === 'string' ? text : '';
}

function isTypeOrmFactory(call: TSESTree.CallExpression, context: Context): boolean {
  const declaration = calleeDeclaration(context, call);
  return (
    declaration !== undefined &&
    calleeFamily(context, call) === TYPEORM &&
    TYPEORM_OWNER.test(declaredName(declaration.parent))
  );
}

export function isEntityFactory(call: Call, context: Context): boolean {
  const view = estreeCallView(call, context);
  const { method } = view;
  const owner = ownerName(view);
  const factory =
    method === 'create' && owner !== undefined && FACTORY_OWNERS.has(wordsOf(owner).at(-1) ?? '');
  if (!factory || call.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  return typeServices(context) === undefined
    ? staysEntity(call, context)
    : isTypeOrmFactory(call, context);
}
