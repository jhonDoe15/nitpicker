import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import tseslint from 'typescript-eslint';
import { nameOf, variableNamed, type SourceCode } from '../typed/node-views.mts';
import {
  createObject,
  pluginRule,
  reportedNode,
  withReportFilter,
  type Context,
  type WrappedDocs,
} from './report-filter.mts';

type MessageId =
  | 'doesNotMatchFormat'
  | 'doesNotMatchFormatTrimmed'
  | 'missingAffix'
  | 'missingUnderscore'
  | 'satisfyCustom'
  | 'unexpectedUnderscore';
type Options = readonly unknown[];

type VariableDefinition = TSESLint.Scope.Definitions.VariableDefinition;

const { DefinitionType } = TSESLint.Scope;
const baseRule = pluginRule<MessageId, Options, WrappedDocs>(tseslint.plugin, 'naming-convention');

const SCHEMA_LIBRARY = /^(?:zod|valibot|yup)(?:\/|$)/;
const COMPONENT_TYPES = new Set([
  'ComponentType',
  'FC',
  'FunctionComponent',
  'ComponentClass',
  'ElementType',
  'JSXElementConstructor',
]);
const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*$/;
const MAX_SCHEMA_DEPTH = 4;
const SCHEMA_DERIVATIONS = new Set([
  'extend',
  'safeExtend',
  'merge',
  'omit',
  'pick',
  'partial',
  'required',
  'strict',
  'array',
  'optional',
  'nullable',
  'refine',
  'superRefine',
  'transform',
  'pipe',
  'brand',
]);

function chainRoot(expression: TSESTree.Node): TSESTree.Node | undefined {
  const chain = [expression];
  for (const current of chain) {
    if (current.type === AST_NODE_TYPES.CallExpression) {
      chain.push(current.callee);
    }
    if (current.type === AST_NODE_TYPES.MemberExpression) {
      chain.push(current.object);
    }
    if (
      current.type === AST_NODE_TYPES.TSAsExpression ||
      current.type === AST_NODE_TYPES.TSSatisfiesExpression
    ) {
      chain.push(current.expression);
    }
  }
  return chain.at(-1);
}

function isSchemaLibraryBinding(sourceCode: SourceCode, identifier: TSESTree.Identifier): boolean {
  return (
    variableNamed(sourceCode, identifier)?.defs.some(
      (definition) =>
        definition.type === DefinitionType.ImportBinding &&
        definition.parent.type === AST_NODE_TYPES.ImportDeclaration &&
        SCHEMA_LIBRARY.test(definition.parent.source.value),
    ) === true
  );
}

function firstMethod(root: TSESTree.Node): string | undefined {
  const member = root.parent;
  return member?.type === AST_NODE_TYPES.MemberExpression &&
    member.object === root &&
    !member.computed &&
    member.parent.type === AST_NODE_TYPES.CallExpression &&
    member.parent.callee === member
    ? nameOf(member.property)
    : undefined;
}

function importedSchemaDerivation(sourceCode: SourceCode, root: TSESTree.Identifier): boolean {
  const imported =
    PASCAL_CASE.test(root.name) &&
    variableNamed(sourceCode, root)?.defs.some(
      ({ type }) => type === DefinitionType.ImportBinding,
    ) === true;
  const method = firstMethod(root);
  return imported && method !== undefined && SCHEMA_DERIVATIONS.has(method);
}

function schemaDeclarator(
  identifier: TSESTree.Identifier,
): TSESTree.VariableDeclarator | undefined {
  const declarator = identifier.parent;
  return declarator.type === AST_NODE_TYPES.VariableDeclarator && declarator.id === identifier
    ? declarator
    : undefined;
}

function isVariableDefinition(
  definition: TSESLint.Scope.Definition,
): definition is VariableDefinition {
  return definition.type === DefinitionType.Variable;
}

function isSchemaConstant(identifier: TSESTree.Identifier, sourceCode: SourceCode): boolean {
  const pending = new Set([identifier]);
  for (const current of pending) {
    const init = schemaDeclarator(current)?.init;
    const root = init === undefined || init === null ? undefined : chainRoot(init);
    if (root?.type !== AST_NODE_TYPES.Identifier || pending.size > MAX_SCHEMA_DEPTH) {
      return false;
    }
    if (isSchemaLibraryBinding(sourceCode, root)) {
      return true;
    }
    const base = variableNamed(sourceCode, root)?.defs.find(isVariableDefinition);
    if (base === undefined) {
      return importedSchemaDerivation(sourceCode, root);
    }
    if (base.parent.kind === 'const' && !pending.has(base.name)) {
      pending.add(base.name);
    }
  }
  return false;
}

function typeName(annotation: TSESTree.TSTypeAnnotation | undefined): string | undefined {
  const typeNode = annotation?.typeAnnotation;
  if (typeNode?.type !== AST_NODE_TYPES.TSTypeReference) {
    return undefined;
  }
  const name = typeNode.typeName;
  return name.type === AST_NODE_TYPES.TSQualifiedName ? name.right.name : nameOf(name);
}

function isComponentParameter(identifier: TSESTree.Identifier): boolean {
  const params: unknown = Reflect.get(identifier.parent, 'params');
  const name = typeName(identifier.typeAnnotation);
  return (
    Array.isArray(params) &&
    params.includes(identifier) &&
    ((name !== undefined && COMPONENT_TYPES.has(name)) || identifier.name.endsWith('Component'))
  );
}

function isAllowedPascalCase(node: TSESTree.Node | undefined, sourceCode: SourceCode): boolean {
  if (node?.type !== AST_NODE_TYPES.Identifier || !PASCAL_CASE.test(node.name)) {
    return false;
  }
  return isSchemaConstant(node, sourceCode) || isComponentParameter(node);
}

const filtered = withReportFilter(
  baseRule,
  (descriptor, context) => !isAllowedPascalCase(reportedNode(descriptor), context.sourceCode),
);

function hasSyntaxServices(services: SourceCode['parserServices']): boolean {
  return (
    services?.esTreeNodeToTSNodeMap !== undefined && services.tsNodeToESTreeNodeMap !== undefined
  );
}

function withSyntaxServices<Ids extends string, Options extends readonly unknown[]>(
  context: Context<Ids, Options>,
): Context<Ids, Options> {
  const { sourceCode } = context;
  if (hasSyntaxServices(sourceCode.parserServices)) {
    return context;
  }
  const parserServices = {
    esTreeNodeToTSNodeMap: new WeakMap(),
    tsNodeToESTreeNodeMap: new WeakMap(),
    program: undefined,
  };
  return createObject(context, {
    sourceCode: { value: createObject(sourceCode, { parserServices: { value: parserServices } }) },
    report: {
      value(descriptor: TSESLint.ReportDescriptor<Ids>): void {
        context.report(descriptor);
      },
    },
  });
}

export const rule: TSESLint.RuleModule<MessageId, Options, WrappedDocs> = {
  ...filtered,
  meta: {
    ...filtered.meta,
    ...(filtered.meta.docs === undefined
      ? {}
      : { docs: { ...filtered.meta.docs, requiresTypeChecking: false } }),
  },
  create(context) {
    return filtered.create(withSyntaxServices(context));
  },
};
