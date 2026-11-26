import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  findVariable,
  resolveConstant,
  type SourceContext,
} from '../analysis/constant-resolution.mts';
import { chainOf } from '../typed/node-views.mts';
import { inTemp, nameOfCall, propertyNamed, resolvedValues } from './temp-paths.mts';

const WRITERS = new Set(['writeFile', 'writeFileSync']);

function isStringify(node: TSESTree.Node | undefined): node is TSESTree.CallExpression {
  return (
    node?.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    nameOfCall(node) === 'stringify' &&
    node.callee.object.type === AST_NODE_TYPES.Identifier &&
    node.callee.object.name === 'JSON'
  );
}

function literalObject(
  context: SourceContext,
  node: TSESTree.Node | undefined,
): TSESTree.ObjectExpression | undefined {
  const value = resolveConstant(context, node);
  return value?.type === AST_NODE_TYPES.ObjectExpression &&
    !value.properties.some((property) => property.type === AST_NODE_TYPES.SpreadElement)
    ? value
    : undefined;
}

const TSCONFIG_FILE = /(?:^|[\\/])tsconfig[^\\/]*\.json$/u;
const MAX_STRINGS_DEPTH = 6;

function stringOperands(value: TSESTree.Node): readonly TSESTree.Node[] {
  if (value.type === AST_NODE_TYPES.TemplateLiteral) {
    return value.expressions;
  }
  if (value.type === AST_NODE_TYPES.AwaitExpression) {
    return [value.argument];
  }
  if (value.type === AST_NODE_TYPES.BinaryExpression) {
    return [value.left, value.right];
  }
  return value.type === AST_NODE_TYPES.CallExpression ? value.arguments : [];
}

function ownStrings(value: TSESTree.Node): readonly string[] {
  if (value.type === AST_NODE_TYPES.Literal) {
    return typeof value.value === 'string' ? [value.value] : [];
  }
  return value.type === AST_NODE_TYPES.TemplateLiteral
    ? value.quasis.map((part) => part.value.cooked ?? '')
    : [];
}

function stringsIn(context: SourceContext, node: TSESTree.Node): string[] {
  return [
    ...resolvedValues({ context, node, operandsOf: stringOperands, maxDepth: MAX_STRINGS_DEPTH }),
  ].flatMap(ownStrings);
}

function namesTsconfig(context: SourceContext, target: TSESTree.Node): boolean {
  return stringsIn(context, target).some((part) => TSCONFIG_FILE.test(part));
}

function extendsSibling(config: TSESTree.ObjectExpression): boolean {
  const value = propertyNamed(config, 'extends')?.value;
  return (
    value?.type === AST_NODE_TYPES.Literal &&
    typeof value.value === 'string' &&
    value.value.startsWith('./')
  );
}

function accessRoot(identifier: TSESTree.Node): TSESTree.Node {
  return (
    chainOf(identifier, (current) =>
      current.parent?.type === AST_NODE_TYPES.MemberExpression && current.parent.object === current
        ? current.parent
        : undefined,
    ).at(-1) ?? identifier
  );
}

function isMutated(context: SourceContext, node: TSESTree.Node | undefined): boolean {
  if (node?.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const variable = findVariable(context, node, node.name);
  return (variable?.references ?? []).some((reference) => {
    const root = accessRoot(reference.identifier);
    const parent = root.parent;
    return (
      (root !== reference.identifier &&
        parent?.type === AST_NODE_TYPES.AssignmentExpression &&
        parent.left === root) ||
      (parent?.type === AST_NODE_TYPES.CallExpression &&
        nameOfCall(parent) === 'assign' &&
        parent.arguments[0] === root)
    );
  });
}

function lacksTypeRoots(context: SourceContext, config: TSESTree.ObjectExpression): boolean {
  const options = propertyNamed(config, 'compilerOptions');
  if (options === undefined) {
    return true;
  }
  const body = literalObject(context, options.value);
  return (
    body !== undefined &&
    propertyNamed(body, 'typeRoots') === undefined &&
    propertyNamed(body, 'types') === undefined
  );
}

export const rule: TSESLint.RuleModule<'typeRoots'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require a tsconfig that extends another and is written to a temporary folder to set typeRoots',
    },
    schema: [],
    messages: {
      typeRoots:
        "This tsconfig extends another config but is written to a temporary folder. TypeScript derives the default typeRoots from the folder of the config it opens (the node_modules/@types folders above it), so from here they are not the project's and global types such as jest are not found. Write the type roots of the original config into compilerOptions.typeRoots.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const [target, content] = node.arguments;
        if (!WRITERS.has(nameOfCall(node)) || target === undefined || !inTemp(context, target)) {
          return;
        }
        const serialized = resolveConstant(context, content);
        const config = isStringify(serialized)
          ? literalObject(context, serialized.arguments[0])
          : undefined;
        if (
          config !== undefined &&
          isStringify(serialized) &&
          namesTsconfig(context, target) &&
          !extendsSibling(config) &&
          !isMutated(context, serialized.arguments[0]) &&
          propertyNamed(config, 'extends') !== undefined &&
          lacksTypeRoots(context, config)
        ) {
          context.report({ node, messageId: 'typeRoots' });
        }
      },
    };
  },
};
