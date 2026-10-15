import tseslint from 'typescript-eslint';
import { variableNamed } from '../analysis/ancestry.mjs';
import { withReportFilter } from './report-filter.mjs';

const baseRule = tseslint.plugin.rules['naming-convention'];

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
const WRAPPERS = new Set(['TSAsExpression', 'TSSatisfiesExpression']);

function chainRoot(expression) {
  const chain = [expression];
  for (const current of chain) {
    if (current.type === 'CallExpression') {
      chain.push(current.callee);
    }
    if (current.type === 'MemberExpression') {
      chain.push(current.object);
    }
    if (WRAPPERS.has(current.type)) {
      chain.push(current.expression);
    }
  }
  return chain.at(-1);
}

function isSchemaLibraryBinding(sourceCode, identifier) {
  return (
    variableNamed(sourceCode, identifier)?.defs.some(
      (definition) =>
        definition.type === 'ImportBinding' && SCHEMA_LIBRARY.test(definition.parent.source.value),
    ) === true
  );
}

function isSchemaConstant(identifier, sourceCode) {
  const declarator = identifier.parent;
  if (declarator?.type !== 'VariableDeclarator' || declarator.id !== identifier) {
    return false;
  }
  const root = declarator.init === null ? undefined : chainRoot(declarator.init);
  return root?.type === 'Identifier' && isSchemaLibraryBinding(sourceCode, root);
}

function typeName(annotation) {
  const typeNode = annotation?.typeAnnotation;
  if (typeNode?.type !== 'TSTypeReference') {
    return undefined;
  }
  const name = typeNode.typeName;
  return name.type === 'TSQualifiedName' ? name.right.name : name.name;
}

function isComponentParameter(identifier) {
  const owner = identifier.parent;
  return (
    Array.isArray(owner?.params) &&
    owner.params.includes(identifier) &&
    (COMPONENT_TYPES.has(typeName(identifier.typeAnnotation)) ||
      identifier.name.endsWith('Component'))
  );
}

function isAllowedPascalCase(node, sourceCode) {
  if (node?.type !== 'Identifier' || !PASCAL_CASE.test(node.name)) {
    return false;
  }
  return isSchemaConstant(node, sourceCode) || isComponentParameter(node);
}

const filtered = withReportFilter(
  baseRule,
  (descriptor, context) => !isAllowedPascalCase(descriptor.node, context.sourceCode),
);

function hasSyntaxServices(services) {
  return (
    services?.esTreeNodeToTSNodeMap !== undefined && services.tsNodeToESTreeNodeMap !== undefined
  );
}

function withSyntaxServices(context) {
  const { sourceCode } = context;
  if (hasSyntaxServices(sourceCode.parserServices)) {
    return context;
  }
  const parserServices = {
    esTreeNodeToTSNodeMap: new WeakMap(),
    tsNodeToESTreeNodeMap: new WeakMap(),
    program: undefined,
  };
  return Object.create(context, {
    sourceCode: { value: Object.create(sourceCode, { parserServices: { value: parserServices } }) },
    report: { value: (descriptor) => context.report(descriptor) },
  });
}

export const rule = {
  ...filtered,
  meta: { ...filtered.meta, docs: { ...filtered.meta.docs, requiresTypeChecking: false } },
  create(context) {
    return filtered.create(withSyntaxServices(context));
  },
};
