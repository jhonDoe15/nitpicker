import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { memberName, staticKey, unwrapped, type Context } from '../../security/security-values.mts';
import { ancestorsOf } from '../../typed/node-views.mts';
import { unversionedEntity, type VersionForm } from './entity-versions.mts';

const LOADERS = new Set([
  'find',
  'findBy',
  'findOne',
  'findOneBy',
  'findOneOrFail',
  'findOneByOrFail',
  'findAll',
  'findByPk',
  'findAndCount',
]);
const SAVERS = new Set(['save', 'persistAndFlush']);
const OBJECT_SAVERS = new Set(['save', 'update']);
const FLUSH = 'flush';
const LOCK_KEYS = new Set(['lock', 'lockMode']);
const FUNCTIONS = new Set<string>([
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
]);
const EXCEPTION =
  'An exception fits only when concurrent writers of the table are ruled out another way, such as a pessimistic lock or a single writer.';

type Candidate = {
  readonly declarator: TSESTree.VariableDeclarator;
  readonly names: ReadonlySet<TSESLint.Scope.Variable>;
  readonly home: TSESTree.Node | undefined;
};

function homeOf(node: TSESTree.Node): TSESTree.Node | undefined {
  return ancestorsOf(node).find((each) => FUNCTIONS.has(each.type));
}

function isLocked(call: TSESTree.CallExpression): boolean {
  return call.arguments.some(
    (argument) =>
      argument.type === AST_NODE_TYPES.ObjectExpression &&
      argument.properties.some((property) => LOCK_KEYS.has(staticKey(property) ?? '')),
  );
}

function isLoad(init: TSESTree.Expression | undefined): boolean {
  const awaited = init === undefined ? undefined : unwrapped(init);
  const call =
    awaited?.type === AST_NODE_TYPES.AwaitExpression ? unwrapped(awaited.argument) : undefined;
  const callee = call?.type === AST_NODE_TYPES.CallExpression ? unwrapped(call.callee) : undefined;
  return (
    call?.type === AST_NODE_TYPES.CallExpression &&
    callee?.type === AST_NODE_TYPES.MemberExpression &&
    LOADERS.has(memberName(callee) ?? '') &&
    !isLocked(call)
  );
}

function loopVariables(
  context: Context,
  reference: TSESLint.Scope.Reference,
): readonly TSESLint.Scope.Variable[] {
  const loop = reference.identifier.parent;
  return loop.type === AST_NODE_TYPES.ForOfStatement &&
    loop.right === reference.identifier &&
    loop.left.type === AST_NODE_TYPES.VariableDeclaration
    ? context.sourceCode.getDeclaredVariables(loop.left)
    : [];
}

function namesOf(
  context: Context,
  variable: TSESLint.Scope.Variable,
): Set<TSESLint.Scope.Variable> {
  const names = new Set([variable]);
  for (const reference of variable.references) {
    for (const element of loopVariables(context, reference)) {
      names.add(element);
    }
  }
  return names;
}

function isFieldWrite(identifier: TSESTree.Node): boolean {
  const target =
    identifier.parent?.type === AST_NODE_TYPES.TSNonNullExpression ? identifier.parent : identifier;
  const member = target.parent;
  if (member?.type !== AST_NODE_TYPES.MemberExpression || member.object !== target) {
    return false;
  }
  const outer = member.parent;
  return (
    (outer.type === AST_NODE_TYPES.AssignmentExpression && outer.left === member) ||
    outer.type === AST_NODE_TYPES.UpdateExpression
  );
}

function isChanged(names: ReadonlySet<TSESLint.Scope.Variable>): boolean {
  return [...names].some((variable) =>
    variable.references.some((reference) => isFieldWrite(reference.identifier)),
  );
}

function holdsAny(names: ReadonlySet<TSESLint.Scope.Variable>, node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.Identifier &&
    [...names].some((variable) => variable.references.some((each) => each.identifier === node))
  );
}

function isSavedThrough(
  call: TSESTree.CallExpression,
  names: ReadonlySet<TSESLint.Scope.Variable>,
): boolean {
  const callee = unwrapped(call.callee);
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  const method = memberName(callee) ?? '';
  const object = unwrapped(callee.object);
  return (
    (SAVERS.has(method) &&
      call.arguments.some((argument) => holdsAny(names, unwrapped(argument)))) ||
    (OBJECT_SAVERS.has(method) && holdsAny(names, object))
  );
}

export const rule: TSESLint.RuleModule<
  VersionForm,
  [],
  { readonly requiresTypeChecking: boolean }
> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow ORM entities that are loaded and saved again without an optimistic-lock version column',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      typeorm: `\`{{entity}}\` is loaded and saved again without a version column, so two requests that update the same row both succeed and the later one silently overwrites the earlier one. Add \`@VersionColumn() version!: number\` to the entity: TypeORM then fails the stale save with an error. ${EXCEPTION}`,
      mikro: `\`{{entity}}\` is loaded and saved again without a version property, so two requests that update the same row both succeed and the later one silently overwrites the earlier one. Add \`@Property({ version: true }) version!: number\` to the entity: MikroORM then fails the stale flush with an OptimisticLockError. ${EXCEPTION}`,
      sequelize: `\`{{entity}}\` is loaded and saved again without a version column, so two requests that update the same row both succeed and the later one silently overwrites the earlier one. Set \`version: true\` in the model options (\`Model.init(attributes, { sequelize, version: true })\`, or \`@Table({ version: true })\`): Sequelize then fails the stale save with an OptimisticLockError. ${EXCEPTION}`,
    },
  },
  create(context) {
    const candidates: Candidate[] = [];
    const calls: TSESTree.CallExpression[] = [];
    return {
      VariableDeclarator(node) {
        const [variable] = isLoad(node.init ?? undefined)
          ? context.sourceCode.getDeclaredVariables(node)
          : [];
        if (variable !== undefined && node.id.type === AST_NODE_TYPES.Identifier) {
          candidates.push({
            declarator: node,
            names: namesOf(context, variable),
            home: homeOf(node),
          });
        }
      },
      CallExpression(node) {
        calls.push(node);
      },
      'Program:exit'() {
        for (const { declarator, names, home } of candidates) {
          const saved = calls.some(
            (call) =>
              homeOf(call) === home &&
              (isSavedThrough(call, names) ||
                (call.callee.type === AST_NODE_TYPES.MemberExpression &&
                  memberName(call.callee) === FLUSH)),
          );
          const found =
            isChanged(names) && saved ? unversionedEntity(context, declarator.id) : undefined;
          if (found !== undefined) {
            context.report({
              node: declarator,
              messageId: found.form,
              data: { entity: found.entity },
            });
          }
        }
      },
    };
  },
};
