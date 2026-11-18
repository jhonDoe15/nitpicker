import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { stringValue, type SourceContext } from '../analysis/constant-resolution.mts';
import {
  compositionRootOptionsSchema,
  isCompositionRootFile,
  type CompositionRootOptions,
} from '../boundaries/composition-root-files.mts';
import { ancestorsOf, chainOf } from '../typed/node-views.mts';
import { bare, destructuredKey, envSubject, isEnvObject } from './env-reads.mts';

type MessageId = 'undefinedOnly' | 'nullishFallback';
type DefaultedProperty = TSESTree.Property & { readonly value: TSESTree.AssignmentPattern };

const EQUALITY = new Set(['===', '!==', '==', '!=']);
const LOGICAL = new Set(['&&', '||']);
const OWN_CHECKS = new Set(['hasOwn', 'hasOwnProperty']);
const TRIMS = new Set(['trim', 'trimStart', 'trimEnd']);

function isAbsent(node: TSESTree.Node): boolean {
  const plain = bare(node);
  return (
    (plain.type === AST_NODE_TYPES.Identifier && plain.name === 'undefined') ||
    (plain.type === AST_NODE_TYPES.Literal && plain.value === null && !('regex' in plain)) ||
    (plain.type === AST_NODE_TYPES.UnaryExpression && plain.operator === 'void')
  );
}

function typeofSubject(context: SourceContext, node: TSESTree.Node): string | undefined {
  const plain = bare(node);
  return plain.type === AST_NODE_TYPES.UnaryExpression && plain.operator === 'typeof'
    ? envSubject(context, plain.argument)
    : undefined;
}

function comparedSubject(
  context: SourceContext,
  node: TSESTree.BinaryExpression,
): string | undefined {
  const sides = [node.left, node.right];
  const absent = sides.find((side) => isAbsent(side));
  const other = sides.find((side) => side !== absent);
  if (absent !== undefined && other !== undefined) {
    return envSubject(context, other);
  }
  const typeofSide = sides.find((side) => typeofSubject(context, side) !== undefined);
  const text = sides.find((side) => side !== typeofSide);
  return typeofSide !== undefined && stringValue(text) === 'undefined'
    ? typeofSubject(context, typeofSide)
    : undefined;
}

function ownCheckSubject(
  context: SourceContext,
  node: TSESTree.CallExpression,
): string | undefined {
  const { callee } = node;
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    callee.computed ||
    !OWN_CHECKS.has(callee.property.name)
  ) {
    return undefined;
  }
  const [first, second] = node.arguments;
  if (isEnvObject(context, callee.object) && callee.property.name === 'hasOwnProperty') {
    return stringValue(first);
  }
  return first !== undefined && isEnvObject(context, first) ? stringValue(second) : undefined;
}

function joinsConditions(node: TSESTree.Node | undefined): boolean {
  return (
    (node?.type === AST_NODE_TYPES.LogicalExpression && LOGICAL.has(node.operator)) ||
    (node?.type === AST_NODE_TYPES.UnaryExpression && node.operator === '!')
  );
}

function conditionRoot(node: TSESTree.Node): TSESTree.Node {
  return [node, ...ancestorsOf(node)].find((current) => !joinsConditions(current.parent)) ?? node;
}

function leavesOf(root: TSESTree.Node): TSESTree.Node[] {
  const pending = [root];
  const leaves: TSESTree.Node[] = [];
  for (const current of pending) {
    if (current.type === AST_NODE_TYPES.LogicalExpression && LOGICAL.has(current.operator)) {
      pending.push(current.left, current.right);
    } else if (current.type === AST_NODE_TYPES.UnaryExpression && current.operator === '!') {
      pending.push(current.argument);
    } else {
      leaves.push(current);
    }
  }
  return leaves;
}

function trimmedValue(node: TSESTree.Node): TSESTree.Node | undefined {
  const plain = bare(node);
  return plain.type === AST_NODE_TYPES.CallExpression &&
    plain.callee.type === AST_NODE_TYPES.MemberExpression &&
    !plain.callee.computed &&
    TRIMS.has(plain.callee.property.name)
    ? plain.callee.object
    : undefined;
}

function untrimmed(node: TSESTree.Node): TSESTree.Node {
  return bare(chainOf<TSESTree.Node>(node, trimmedValue).at(-1) ?? node);
}

function measuredSubject(context: SourceContext, node: TSESTree.Node): string | undefined {
  return envSubject(context, untrimmed(node));
}

function lengthSubject(context: SourceContext, node: TSESTree.Node): string | undefined {
  const plain = bare(node);
  return plain.type === AST_NODE_TYPES.MemberExpression &&
    !plain.computed &&
    plain.property.name === 'length'
    ? measuredSubject(context, plain.object)
    : undefined;
}

function comparisonSubject(
  context: SourceContext,
  node: TSESTree.BinaryExpression,
): string | undefined {
  const sides = [node.left, node.right];
  const empty = sides.find((side) => stringValue(side) === '');
  if (empty !== undefined) {
    const other = sides.find((side) => side !== empty);
    return other === undefined ? undefined : measuredSubject(context, other);
  }
  return sides.map((side) => lengthSubject(context, side)).find((name) => name !== undefined);
}

function emptinessSubject(context: SourceContext, leaf: TSESTree.Node): string | undefined {
  const plain = bare(leaf);
  if (
    plain.type === AST_NODE_TYPES.CallExpression &&
    plain.callee.type === AST_NODE_TYPES.Identifier
  ) {
    const [argument] = plain.arguments;
    return plain.callee.name === 'Boolean' && argument !== undefined
      ? envSubject(context, argument)
      : undefined;
  }
  const receiver =
    plain.type === AST_NODE_TYPES.CallExpression &&
    plain.callee.type === AST_NODE_TYPES.MemberExpression
      ? measuredSubject(context, plain.callee.object)
      : undefined;
  if (receiver !== undefined) {
    return receiver;
  }
  if (plain.type === AST_NODE_TYPES.BinaryExpression) {
    return comparisonSubject(context, plain);
  }
  return lengthSubject(context, plain) ?? envSubject(context, plain);
}

function testsEmptiness(context: SourceContext, node: TSESTree.Node, subject: string): boolean {
  return leavesOf(conditionRoot(node)).some(
    (leaf) => leaf !== node && emptinessSubject(context, leaf) === subject,
  );
}

function isHarmlessFallback(node: TSESTree.Node): boolean {
  return stringValue(node) === '' || isAbsent(node);
}

function isCheckedDefault(
  property: TSESTree.Property | TSESTree.RestElement,
): property is DefaultedProperty {
  return (
    property.type === AST_NODE_TYPES.Property &&
    property.value.type === AST_NODE_TYPES.AssignmentPattern &&
    !isHarmlessFallback(property.value.right)
  );
}

function defaultedKeys(
  context: SourceContext,
  node: TSESTree.VariableDeclarator,
): DefaultedProperty[] {
  if (
    node.id.type !== AST_NODE_TYPES.ObjectPattern ||
    node.init === null ||
    !isEnvObject(context, node.init)
  ) {
    return [];
  }
  return node.id.properties.filter(isCheckedDefault);
}

export const rule: TSESLint.RuleModule<MessageId, CompositionRootOptions> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Report environment variables tested only for undefined, which counts an empty value as set',
    },
    schema: compositionRootOptionsSchema,
    messages: {
      undefinedOnly:
        "Test `{{name}}` for a value, not only for `undefined`: `{{name}}=` gives `''`, which passes this check, so the feature turns on with nothing to use. Write `if (!process.env.{{name}})`, add an `=== ''` test to the same condition, or parse the environment with a schema that rejects empty strings (`z.string().min(1)`). An exception fits only when an empty value is a real setting here.",
      nullishFallback:
        "Write `process.env.{{name}} || fallback`: `{{name}}=` gives `''`, which `??` and a destructuring default keep, so the fallback is skipped. A schema that rejects empty strings (`z.string().min(1)`) works too. An exception fits only when an empty value is a real setting here.",
    },
  },
  create(context) {
    function report(
      node: TSESTree.Node,
      name: string | undefined,
      messageId: MessageId = 'undefinedOnly',
    ): void {
      if (
        name !== undefined &&
        (messageId !== 'undefinedOnly' || !testsEmptiness(context, node, name))
      ) {
        context.report({ node, messageId, data: { name } });
      }
    }
    return {
      BinaryExpression(node) {
        if (EQUALITY.has(node.operator)) {
          report(node, comparedSubject(context, node));
        } else if (node.operator === 'in' && isEnvObject(context, node.right)) {
          report(node, stringValue(node.left));
        }
      },
      CallExpression(node) {
        report(node, ownCheckSubject(context, node));
      },
      'LogicalExpression[operator="??"], AssignmentExpression[operator="??="]'(
        node: TSESTree.LogicalExpression | TSESTree.AssignmentExpression,
      ): void {
        if (!(isHarmlessFallback(node.right) || isCompositionRootFile(context))) {
          report(node, envSubject(context, node.left), 'nullishFallback');
        }
      },
      VariableDeclarator(node) {
        if (!isCompositionRootFile(context)) {
          for (const property of defaultedKeys(context, node)) {
            report(property, destructuredKey(property), 'nullishFallback');
          }
        }
      },
    };
  },
};
