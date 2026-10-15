import tseslint from 'typescript-eslint';
import { withReportFilter } from './report-filter.mjs';

const baseRule = tseslint.plugin.rules['naming-convention'];

const SCHEMA_ROOTS = new Set(['z', 'v', 'yup']);
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

function isSchemaConstant(identifier) {
  const declarator = identifier.parent;
  if (declarator?.type !== 'VariableDeclarator' || declarator.id !== identifier) {
    return false;
  }
  const root = declarator.init === null ? undefined : chainRoot(declarator.init);
  return root?.type === 'Identifier' && SCHEMA_ROOTS.has(root.name);
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

function isAllowedPascalCase(node) {
  if (node?.type !== 'Identifier' || !PASCAL_CASE.test(node.name)) {
    return false;
  }
  return isSchemaConstant(node) || isComponentParameter(node);
}

export const rule = withReportFilter(
  baseRule,
  (descriptor) => !isAllowedPascalCase(descriptor.node),
);
