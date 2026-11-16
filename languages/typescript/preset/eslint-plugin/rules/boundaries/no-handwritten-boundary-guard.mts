import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { isNarrowedByInstanceof } from '../analysis/narrowing/instanceof-guards.mts';
import { librariesForFile as untypedLibrariesForFile } from '../../../libraries/file-libraries.mjs';
import { validationBehavior as untypedValidationBehavior } from '../../../libraries/project-libraries.mjs';
import {
  isParsedBySchema as untypedIsParsedBySchema,
  schemaContext as untypedSchemaContext,
} from '../../../libraries/schema-calls.mjs';
import {
  jsdocOptionSchema,
  typePredicateTags,
  withJsdoc,
  type JsdocOptions,
} from '../typed/jsdoc-views.mts';
import { ancestorsOf, nameOf, variableNamed, type SourceCode } from '../typed/node-views.mts';
import { readHeadPolicy, type LibraryChoices } from '../typed/policy-views.mts';

type MessageId = 'typePredicate' | 'inlineNarrowing' | 'overloadCast' | 'unparsedJson' | 'jsonCopy';
type Context = Readonly<TSESLint.RuleContext<MessageId, JsdocOptions>>;
type SchemaContext = Readonly<Record<string, unknown>>;
type ValidationBehavior = {
  readonly name: string;
  readonly phrase: string;
  readonly call: string;
  readonly example: string;
  readonly accepted: readonly unknown[];
};
type ParameterOwner =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression
  | TSESTree.TSDeclareFunction
  | TSESTree.TSEmptyBodyFunctionExpression
  | TSESTree.TSFunctionType
  | TSESTree.TSConstructorType
  | TSESTree.TSMethodSignature
  | TSESTree.TSCallSignatureDeclaration
  | TSESTree.TSConstructSignatureDeclaration;

const librariesForFile: (
  context: { readonly filename: string; readonly cwd: string },
  libraries: LibraryChoices,
) => LibraryChoices = untypedLibrariesForFile;
const validationBehavior: (libraries: LibraryChoices) => ValidationBehavior =
  untypedValidationBehavior;
const schemaContext: (context: Context) => SchemaContext = untypedSchemaContext;
const isParsedBySchema: (
  schema: SchemaContext,
  expression: TSESTree.Node,
  libraries: readonly unknown[],
) => boolean = untypedIsParsedBySchema;

const UNTYPED_KEYWORDS = new Set<string>([
  AST_NODE_TYPES.TSUnknownKeyword,
  AST_NODE_TYPES.TSAnyKeyword,
  AST_NODE_TYPES.TSObjectKeyword,
]);

export function isParameterOwner(node: TSESTree.Node): node is ParameterOwner {
  return (
    node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.TSDeclareFunction ||
    node.type === AST_NODE_TYPES.TSEmptyBodyFunctionExpression ||
    node.type === AST_NODE_TYPES.TSFunctionType ||
    node.type === AST_NODE_TYPES.TSConstructorType ||
    node.type === AST_NODE_TYPES.TSMethodSignature ||
    node.type === AST_NODE_TYPES.TSCallSignatureDeclaration ||
    node.type === AST_NODE_TYPES.TSConstructSignatureDeclaration
  );
}

function isJsonParse(node: TSESTree.CallExpression): boolean {
  return (
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    !node.callee.computed &&
    node.callee.object.type === AST_NODE_TYPES.Identifier &&
    node.callee.object.name === 'JSON' &&
    node.callee.property.type === AST_NODE_TYPES.Identifier &&
    node.callee.property.name === 'parse'
  );
}

function isJsonCopy(node: TSESTree.CallExpression): boolean {
  const [argument] = node.arguments;
  return (
    argument?.type === AST_NODE_TYPES.CallExpression &&
    argument.callee.type === AST_NODE_TYPES.MemberExpression &&
    nameOf(argument.callee.object) === 'JSON' &&
    nameOf(argument.callee.property) === 'stringify'
  );
}

function recordValueType(type: TSESTree.TypeNode): TSESTree.TypeNode | undefined {
  if (type.type !== AST_NODE_TYPES.TSTypeReference || nameOf(type.typeName) !== 'Record') {
    return undefined;
  }
  const [, value] = type.typeArguments?.params ?? [];
  return value;
}

function isUntypedLeaf(type: TSESTree.TypeNode | undefined): boolean {
  if (type === undefined) {
    return false;
  }
  return type.type === AST_NODE_TYPES.TSTypeLiteral
    ? type.members.length === 0
    : UNTYPED_KEYWORDS.has(type.type);
}

function isUntypedInput(type: TSESTree.TypeNode | undefined): boolean {
  const chain = [type];
  for (const current of chain) {
    const value = current === undefined ? undefined : recordValueType(current);
    if (value !== undefined) {
      chain.push(value);
    }
  }
  return isUntypedLeaf(chain.at(-1));
}

function predicateInputType(predicate: TSESTree.TSTypePredicate): TSESTree.TypeNode | undefined {
  const owner = ancestorsOf(predicate).find(isParameterOwner);
  const parameter = owner?.params.find(
    (candidate) => nameOf(candidate) === nameOf(predicate.parameterName),
  );
  return parameter !== undefined && 'typeAnnotation' in parameter
    ? parameter.typeAnnotation?.typeAnnotation
    : undefined;
}

function declaredType(
  variable: TSESLint.Scope.Variable | undefined,
): TSESTree.TypeNode | undefined {
  const definition = variable?.defs.at(0);
  if (definition?.type === TSESLint.Scope.DefinitionType.Parameter) {
    return definition.name.typeAnnotation?.typeAnnotation;
  }
  return definition?.type === TSESLint.Scope.DefinitionType.Variable
    ? definition.node.id.typeAnnotation?.typeAnnotation
    : undefined;
}

function isTypeofObject(node: TSESTree.BinaryExpression): boolean {
  const [typeofSide, literal]: readonly [TSESTree.Node, TSESTree.Node] =
    node.left.type === AST_NODE_TYPES.UnaryExpression
      ? [node.left, node.right]
      : [node.right, node.left];
  return (
    typeofSide.type === AST_NODE_TYPES.UnaryExpression &&
    typeofSide.operator === 'typeof' &&
    literal.type === AST_NODE_TYPES.Literal &&
    literal.value === 'object'
  );
}

function isUnary(node: TSESTree.Node): node is TSESTree.UnaryExpression {
  return node.type === AST_NODE_TYPES.UnaryExpression;
}

function narrowedIdentifier(node: TSESTree.BinaryExpression): TSESTree.Node | undefined {
  if (node.operator === 'in') {
    return node.left.type === AST_NODE_TYPES.Literal && typeof node.left.value === 'string'
      ? node.right
      : undefined;
  }
  if (!(['===', '!==', '==', '!='].includes(node.operator) && isTypeofObject(node))) {
    return undefined;
  }
  return [node.left, node.right].find(isUnary)?.argument;
}

function isInsidePredicate(node: TSESTree.Node): boolean {
  const owner = ancestorsOf(node).find(isParameterOwner);
  return owner?.returnType?.typeAnnotation.type === AST_NODE_TYPES.TSTypePredicate;
}

function statementsOf(node: TSESTree.Node | undefined): readonly TSESTree.Node[] {
  return node?.type === AST_NODE_TYPES.Program ||
    node?.type === AST_NODE_TYPES.BlockStatement ||
    node?.type === AST_NODE_TYPES.TSModuleBlock
    ? node.body
    : [];
}

function declarationOf(statement: TSESTree.Node): TSESTree.Node {
  return statement.type === AST_NODE_TYPES.ExportNamedDeclaration ||
    statement.type === AST_NODE_TYPES.ExportDefaultDeclaration
    ? (statement.declaration ?? statement)
    : statement;
}

function isOverloadCast(node: TSESTree.FunctionDeclaration): boolean {
  const returnType = node.returnType?.typeAnnotation.type;
  const siblings = statementsOf(
    node.parent.type === AST_NODE_TYPES.ExportNamedDeclaration ? node.parent.parent : node.parent,
  );
  return (
    (returnType === AST_NODE_TYPES.TSUnknownKeyword ||
      returnType === AST_NODE_TYPES.TSAnyKeyword) &&
    siblings.some((statement) => {
      const declaration = declarationOf(statement);
      return (
        declaration.type === AST_NODE_TYPES.TSDeclareFunction &&
        declaration.id?.name === node.id?.name
      );
    })
  );
}

function isHandNarrowing(sourceCode: SourceCode, node: TSESTree.BinaryExpression): boolean {
  const identifier = narrowedIdentifier(node);
  return (
    identifier?.type === AST_NODE_TYPES.Identifier &&
    !isInsidePredicate(node) &&
    !isNarrowedByInstanceof(sourceCode, node, identifier.name) &&
    declaredType(variableNamed(sourceCode, identifier))?.type === AST_NODE_TYPES.TSUnknownKeyword
  );
}

function createVisitors(context: Context, rootLibraries: LibraryChoices): TSESLint.RuleListener {
  const { sourceCode } = context;
  const validation = validationBehavior(librariesForFile(context, rootLibraries));
  const schema = schemaContext(context);
  const data = { phrase: validation.phrase, example: validation.example };
  const visitors: TSESLint.RuleListener = {
    TSTypePredicate(node) {
      if (isUntypedInput(predicateInputType(node))) {
        context.report({ node, messageId: 'typePredicate', data });
      }
    },
    BinaryExpression(node) {
      if (isHandNarrowing(sourceCode, node)) {
        context.report({ node, messageId: 'inlineNarrowing', data });
      }
    },
    FunctionDeclaration(node) {
      if (isOverloadCast(node)) {
        context.report({ node, messageId: 'overloadCast' });
      }
    },
    CallExpression(node) {
      if (isJsonParse(node) && !isParsedBySchema(schema, node, validation.accepted)) {
        const messageId = isJsonCopy(node) ? 'jsonCopy' : 'unparsedJson';
        context.report({ node, messageId, data: { ...data, call: validation.call } });
      }
    },
  };
  return withJsdoc(context, visitors, {
    selectTags: typePredicateTags,
    messageId: 'typePredicate',
    data,
  });
}

export function boundaryGuardRule(
  rootLibraries: LibraryChoices,
): TSESLint.RuleModule<MessageId, JsdocOptions> {
  return {
    meta: {
      type: 'problem',
      docs: {
        description:
          'Require external data in adapters to be parsed with a schema instead of a hand-written type guard',
      },
      schema: jsdocOptionSchema,
      messages: {
        typePredicate:
          'Do not hand-write a type guard for unknown input: parse it once at the boundary with {{phrase}} ({{example}}). A predicate over a union (`(result): result is Ok => result.kind === "ok"`) is fine. An exception fits only when the guard is genuinely needed.',
        inlineNarrowing:
          'Do not hand-narrow an `unknown` value with `typeof x === "object"` or `"key" in x`: parse it once at the boundary with {{phrase}} ({{example}}). A caught error is read with `error instanceof Error`. An exception fits only when the narrowing is genuinely needed.',
        overloadCast:
          'This overload implementation returns unknown or any, which makes its overload signatures a cast. Return a typed value, or split it into separate functions. An exception fits only when it is deliberate.',
        unparsedJson:
          'Pass `JSON.parse(text)` straight into `{{call}}(...)` inside the same `try`. An exception fits only when the text is trusted and already typed.',
        jsonCopy:
          'Copy a value with `structuredClone(value)`, not `JSON.parse(JSON.stringify(value))`. An exception fits only when it is deliberate.',
      },
    },
    create: (context) => createVisitors(context, rootLibraries),
  };
}

export const rule = boundaryGuardRule(readHeadPolicy().libraries);
