import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { findVariable } from '../../analysis/constant-resolution.mts';
import { awaited } from '../../effects/lazy-relations.mts';
import { childrenOf } from '../../loops/loop-shapes.mts';
import type { Context } from '../../security/security-values.mts';
import { ormSite } from '../../support/orm/sites.mts';
import { contains } from '../../typed/node-views.mts';
import { appendAll } from '../../../../../../../shared/lists/lists.mts';

const ORMS = ['prisma', 'typeorm', 'kysely', 'knex', 'drizzle', 'sequelize', 'mikro'];
const MAX_DEPTH = 3;

function initOf(identifier: TSESTree.Identifier, context: Context): TSESTree.Node | undefined {
  const definition = findVariable(context, identifier, identifier.name)?.defs[0];
  if (definition?.node.type !== AST_NODE_TYPES.VariableDeclarator) {
    return undefined;
  }
  return awaited(definition.node.init ?? undefined);
}

function identifiersIn(node: TSESTree.Node, context: Context): TSESTree.Identifier[] {
  const pending = [node];
  for (const current of pending) {
    appendAll(pending, childrenOf(current, context.sourceCode.visitorKeys));
  }
  return pending.filter((each) => each.type === AST_NODE_TYPES.Identifier);
}

function isWrite(init: TSESTree.Node): boolean {
  return init.type === AST_NODE_TYPES.CallExpression && ormSite(init, 'write', ORMS) !== undefined;
}

export function writtenValue(
  args: readonly TSESTree.Node[],
  { context, body }: { readonly context: Context; readonly body: TSESTree.Node },
): TSESTree.Node | undefined {
  const pending = args.flatMap((argument) => identifiersIn(argument, context));
  const seen = new Set<TSESTree.Identifier>();
  for (const [index, identifier] of pending.entries()) {
    const init = seen.has(identifier) ? undefined : initOf(identifier, context);
    seen.add(identifier);
    if (init === undefined || !contains(body, init)) {
      continue;
    }
    if (isWrite(init)) {
      return init;
    }
    if (index < MAX_DEPTH * args.length) {
      appendAll(pending, identifiersIn(init, context));
    }
  }
  return undefined;
}
