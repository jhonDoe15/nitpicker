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

function firstMethod(root) {
  const member = root.parent;
  return member?.type === 'MemberExpression' &&
    member.object === root &&
    !member.computed &&
    member.parent?.type === 'CallExpression' &&
    member.parent.callee === member
    ? member.property.name
    : undefined;
}

function importedSchemaDerivation(sourceCode, root) {
  const imported =
    PASCAL_CASE.test(root.name) &&
    variableNamed(sourceCode, root)?.defs.some(({ type }) => type === 'ImportBinding') === true;
  return imported && SCHEMA_DERIVATIONS.has(firstMethod(root));
}

function schemaDeclarator(identifier) {
  const declarator = identifier.parent;
  return declarator?.type === 'VariableDeclarator' && declarator.id === identifier
    ? declarator
    : undefined;
}

function isSchemaConstant(identifier, sourceCode) {
  const pending = [identifier];
  for (const current of pending) {
    const init = schemaDeclarator(current)?.init;
    const root = init === undefined || init === null ? undefined : chainRoot(init);
    if (root?.type !== 'Identifier' || pending.length > MAX_SCHEMA_DEPTH) {
      return false;
    }
    if (isSchemaLibraryBinding(sourceCode, root)) {
      return true;
    }
    const base = variableNamed(sourceCode, root)?.defs.find(({ type }) => type === 'Variable');
    if (base === undefined) {
      return importedSchemaDerivation(sourceCode, root);
    }
    if (base.parent.kind === 'const' && !pending.includes(base.name)) {
      pending.push(base.name);
    }
  }
  return false;
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
