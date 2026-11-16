import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  jsdocOptionSchema,
  triStateBooleanTags,
  withJsdoc,
  type JsdocOptions,
} from '../typed/jsdoc-views.mts';
import { ancestorsOf, nameOf } from '../typed/node-views.mts';

type FunctionLike =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression
  | TSESTree.TSDeclareFunction
  | TSESTree.TSEmptyBodyFunctionExpression
  | TSESTree.TSFunctionType
  | TSESTree.TSMethodSignature;
type MemberLike = TSESTree.TSPropertySignature | TSESTree.PropertyDefinition;
type ParameterWrapper =
  TSESTree.AssignmentPattern | TSESTree.RestElement | TSESTree.TSParameterProperty;
type TypeOwner = TSESTree.TSTypeAliasDeclaration | TSESTree.TSInterfaceDeclaration;

const ABSENT = new Set<string>([AST_NODE_TYPES.TSUndefinedKeyword, AST_NODE_TYPES.TSNullKeyword]);
const FUNCTIONS = [
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
  AST_NODE_TYPES.TSDeclareFunction,
  AST_NODE_TYPES.TSEmptyBodyFunctionExpression,
  AST_NODE_TYPES.TSFunctionType,
  AST_NODE_TYPES.TSMethodSignature,
];

function isParameterWrapper(node: TSESTree.Node): node is ParameterWrapper {
  return (
    node.type === AST_NODE_TYPES.AssignmentPattern ||
    node.type === AST_NODE_TYPES.RestElement ||
    node.type === AST_NODE_TYPES.TSParameterProperty
  );
}

function literalValue(node: TSESTree.TypeNode): TSESTree.Literal['value'] | undefined {
  return node.type === AST_NODE_TYPES.TSLiteralType && node.literal.type === AST_NODE_TYPES.Literal
    ? node.literal.value
    : undefined;
}

function isBooleanMembers(members: TSESTree.TypeNode[]): boolean {
  if (members.length === 1) {
    return members[0]?.type === AST_NODE_TYPES.TSBooleanKeyword;
  }
  const values = members.map(literalValue);
  return members.length === 2 && values.includes(true) && values.includes(false);
}

function isTriStateUnion(node: TSESTree.TypeNode): boolean {
  if (node.type !== AST_NODE_TYPES.TSUnionType) {
    return false;
  }
  const absent = node.types.filter((member) => ABSENT.has(member.type));
  return (
    absent.length > 0 && isBooleanMembers(node.types.filter((member) => !ABSENT.has(member.type)))
  );
}

function resolvedType(node: TSESTree.TypeNode): TSESTree.TypeNode {
  return node.type === AST_NODE_TYPES.TSTypeReference &&
    nameOf(node.typeName) === 'Promise' &&
    node.typeArguments?.params.length === 1
    ? (node.typeArguments.params[0] ?? node)
    : node;
}

function isTriState(annotation: TSESTree.TSTypeAnnotation | undefined): boolean {
  const type = annotation?.typeAnnotation;
  return type !== undefined && isTriStateUnion(resolvedType(type));
}

const PROPS_NAME = /Props$/;

function isPropsType(node: TSESTree.Node): boolean {
  const owner = ancestorsOf(node).find(
    (ancestor): ancestor is TypeOwner =>
      ancestor.type === AST_NODE_TYPES.TSTypeAliasDeclaration ||
      ancestor.type === AST_NODE_TYPES.TSInterfaceDeclaration,
  );
  return owner !== undefined && PROPS_NAME.test(owner.id.name);
}

function isOptionalBooleanMember(node: MemberLike): boolean {
  return (
    node.optional && node.typeAnnotation?.typeAnnotation.type === AST_NODE_TYPES.TSBooleanKeyword
  );
}

function isOverride(owner: TSESTree.Node | undefined): boolean {
  return owner?.type === AST_NODE_TYPES.MethodDefinition && owner.override;
}

function isOptionalBoolean(parameter: TSESTree.Node): boolean {
  return (
    parameter.type === AST_NODE_TYPES.Identifier &&
    parameter.optional &&
    parameter.typeAnnotation?.typeAnnotation.type === AST_NODE_TYPES.TSBooleanKeyword
  );
}

function unwrapped(parameter: ParameterWrapper): TSESTree.Node {
  if (parameter.type === AST_NODE_TYPES.AssignmentPattern) {
    return parameter.left;
  }
  return parameter.type === AST_NODE_TYPES.TSParameterProperty
    ? parameter.parameter
    : parameter.argument;
}

function bareParameter(parameter: TSESTree.Node): TSESTree.Node {
  const chain = [parameter];
  for (const current of chain) {
    if (isParameterWrapper(current)) {
      chain.push(unwrapped(current));
    }
  }
  return chain.at(-1) ?? parameter;
}

export const rule: TSESLint.RuleModule<'triStateBoolean', JsdocOptions> = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow a boolean that can also be undefined or null' },
    schema: jsdocOptionSchema,
    messages: {
      triStateBoolean:
        "{{ name }} is a boolean that can also be absent, so it has three states: true, false and nothing. Take a required `boolean`, or name each state in a union of string literals (`'on' | 'off' | 'auto'`).",
    },
  },
  create(context) {
    function report(node: TSESTree.Node, name: string): void {
      context.report({ node, messageId: 'triStateBoolean', data: { name } });
    }

    function checkParameter(parameter: TSESTree.Node): void {
      const bare = bareParameter(parameter);
      if (
        bare.type === AST_NODE_TYPES.Identifier &&
        (isTriState(bare.typeAnnotation) || isOptionalBoolean(bare))
      ) {
        report(bare, `\`${bare.name}\``);
      }
    }

    function checkFunction(node: FunctionLike): void {
      if (isOverride(node.parent)) {
        return;
      }
      for (const parameter of node.params) {
        checkParameter(parameter);
      }
      const { returnType } = node;
      if (returnType !== undefined && isTriState(returnType)) {
        report(returnType, 'The return value');
      }
    }

    function checkMember(node: MemberLike): void {
      const optionalBoolean = isOptionalBooleanMember(node) && !isPropsType(node);
      if ((isTriState(node.typeAnnotation) || optionalBoolean) && !isOverride(node)) {
        report(node, `\`${nameOf(node.key) ?? 'this member'}\``);
      }
    }

    const visitors: TSESLint.RuleListener = {
      ...Object.fromEntries(FUNCTIONS.map((type) => [type, checkFunction])),
      TSPropertySignature: checkMember,
      PropertyDefinition: checkMember,
    };
    return withJsdoc(context, visitors, {
      selectTags: triStateBooleanTags,
      messageId: 'triStateBoolean',
      data: { name: 'This JSDoc type' },
    });
  },
};
