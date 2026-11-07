import { libraryBinding, variableOf } from '../../../../libraries/module-bindings.mjs';
import { VALIDATION_LIBRARIES } from '../../../../libraries/validation-libraries.mjs';
import { SCHEMA_FORMS } from './schema-forms.mjs';

export const SCHEMA_LIBRARIES = VALIDATION_LIBRARIES.filter(({ id }) => id in SCHEMA_FORMS).map(
  (library) => ({ id: library.id, packages: library.packages, forms: SCHEMA_FORMS[library.id] }),
);

export function propertyName(member) {
  if (member.type !== 'MemberExpression' || member.computed) {
    return undefined;
  }
  return member.property.type === 'Identifier' ? member.property.name : undefined;
}

function isDeclared(variable) {
  return variable !== undefined && variable.defs.length > 0;
}

function bindingOf(sourceCode, identifier) {
  const variable = variableOf(sourceCode, identifier);
  for (const library of SCHEMA_LIBRARIES) {
    const binding = libraryBinding(variable, library.packages);
    if (binding !== undefined) {
      return { library, name: binding.name };
    }
  }
  const global = SCHEMA_LIBRARIES.find(({ forms }) => forms.globals.includes(identifier.name));
  return global !== undefined && !isDeclared(variable)
    ? { library: global, name: undefined }
    : undefined;
}

function isNamespaceBinding(binding) {
  return (
    binding !== undefined &&
    (binding.name === undefined || binding.library.forms.namespaces.includes(binding.name))
  );
}

function namespaceOf(sourceCode, node) {
  if (node.type === 'Identifier') {
    const binding = bindingOf(sourceCode, node);
    return isNamespaceBinding(binding) ? binding.library : undefined;
  }
  const name = propertyName(node);
  if (name === undefined || node.object.type !== 'Identifier') {
    return undefined;
  }
  const binding = bindingOf(sourceCode, node.object);
  return binding?.name === undefined && binding?.library.forms.namespaces.includes(name)
    ? binding.library
    : undefined;
}

export function exportOf(sourceCode, node) {
  if (node.type === 'MemberExpression') {
    const name = propertyName(node);
    const library = name === undefined ? undefined : namespaceOf(sourceCode, node.object);
    return library === undefined ? undefined : { library, name };
  }
  if (node.type !== 'Identifier') {
    return undefined;
  }
  const binding = bindingOf(sourceCode, node);
  return binding === undefined || isNamespaceBinding(binding) ? undefined : binding;
}

export function calledExport(sourceCode, node) {
  return node.type === 'CallExpression' ? exportOf(sourceCode, node.callee) : undefined;
}

export function chainBase(node) {
  const chain = [node];
  for (const current of chain) {
    if (current.type === 'CallExpression') {
      chain.push(current.callee);
    }
    if (current.type === 'MemberExpression') {
      chain.push(current.object);
    }
  }
  return chain.at(-1);
}

export function chainLibrary(sourceCode, node) {
  const base = chainBase(node);
  return base.type === 'Identifier' ? bindingOf(sourceCode, base)?.library : undefined;
}
