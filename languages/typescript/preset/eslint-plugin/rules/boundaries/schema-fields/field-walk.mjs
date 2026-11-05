import { constantInitializer } from '../../analysis/ancestry.mjs';
import { calledExport, chainLibrary, exportOf, propertyName } from './library-nodes.mjs';
import { isNonValidatingMethod } from './schema-forms.mjs';

const MAX_ALIAS_DEPTH = 3;

function isMethodCall(sourceCode, node) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    calledExport(sourceCode, node) === undefined
  );
}

function withoutNonValidatingCalls(sourceCode, expression) {
  const pending = [expression];
  for (const current of pending) {
    if (isMethodCall(sourceCode, current) && isNonValidatingMethod(propertyName(current.callee))) {
      pending.push(current.callee.object);
    }
  }
  return pending.at(-1);
}

function callLeaf(sourceCode, node) {
  const called = calledExport(sourceCode, node);
  if (called === undefined) {
    return undefined;
  }
  const { forms } = called.library;
  const leaf = forms.leaves[called.name];
  if (leaf?.kind === 'call' && (!leaf.noArguments || node.arguments.length === 0)) {
    return { library: called.library, display: leaf.display };
  }
  return forms.casts.includes(called.name) && node.arguments.length === 0
    ? { library: called.library, display: `${forms.namespaces[0]}.${called.name}()`, cast: true }
    : undefined;
}

function valueLeaf(sourceCode, node) {
  const exported = exportOf(sourceCode, node);
  const leaf = exported?.library.forms.leaves[exported.name];
  return leaf?.kind === 'value' ? { library: exported.library, display: leaf.display } : undefined;
}

function stringLeaf(node, owner) {
  const pattern = owner?.forms.stringLeaves;
  return pattern !== undefined &&
    node.type === 'Literal' &&
    typeof node.value === 'string' &&
    pattern.test(node.value)
    ? { library: owner, display: JSON.stringify(node.value.trim()) }
    : undefined;
}

function unvalidatedLeaf(sourceCode, node, owner) {
  switch (node.type) {
    case 'CallExpression':
      return callLeaf(sourceCode, node);
    case 'MemberExpression':
    case 'Identifier':
      return valueLeaf(sourceCode, node);
    default:
      return stringLeaf(node, owner);
  }
}

function recordValue(argument) {
  const property =
    argument?.type === 'ObjectExpression'
      ? argument.properties.find(
          (entry) => entry.type === 'Property' && !entry.computed && entry.key.name === 'value',
        )
      : undefined;
  return property === undefined ? [] : [property.value];
}

function containerChildren(sourceCode, root) {
  const called = calledExport(sourceCode, root);
  if (called === undefined || !called.library.forms.containers.includes(called.name)) {
    return undefined;
  }
  return called.library.forms.containerChildren[called.name] === 'value'
    ? recordValue(root.arguments[0])
    : root.arguments;
}

function elementChildren(sourceCode, root) {
  if (!isMethodCall(sourceCode, root)) {
    return [];
  }
  const mode = chainLibrary(sourceCode, root)?.forms.elementMethods[propertyName(root.callee)];
  if (mode === 'receiver' && root.arguments.length === 0) {
    return [root.callee.object];
  }
  return mode === 'arguments' ? root.arguments : [];
}

function nestedSchemas(sourceCode, root, { depth, owner }) {
  if (root.type === 'Identifier') {
    const initializer = depth < MAX_ALIAS_DEPTH ? constantInitializer(sourceCode, root) : undefined;
    return initializer ? [initializer] : [];
  }
  if (root.type === 'ArrayExpression') {
    const isTuple = owner?.forms.stringLeaves === undefined;
    return isTuple ? root.elements.filter((element) => element !== null) : [];
  }
  return containerChildren(sourceCode, root) ?? elementChildren(sourceCode, root);
}

export function unvalidatedRoot(sourceCode, expression, owner) {
  const pending = expression === undefined ? [] : [{ node: expression, depth: 0 }];
  for (const { node, depth } of pending) {
    const root = withoutNonValidatingCalls(sourceCode, node);
    const leaf = unvalidatedLeaf(sourceCode, root, owner);
    if (leaf !== undefined) {
      return leaf;
    }
    const children = nestedSchemas(sourceCode, root, { depth, owner });
    pending.push(...children.map((child) => ({ node: child, depth: depth + 1 })));
  }
  return undefined;
}

function optionValue(argument, key) {
  if (argument?.type !== 'ObjectExpression') {
    return undefined;
  }
  return argument.properties.find(
    (entry) =>
      entry.type === 'Property' &&
      !entry.computed &&
      (entry.key.name === key || entry.key.value === key),
  )?.value;
}

function isLooseOption(sourceCode, call, [index, key]) {
  const option = optionValue(call.arguments[index], key);
  if (option === undefined) {
    return false;
  }
  if (option.type === 'Literal') {
    return option.value === true;
  }
  return unvalidatedRoot(sourceCode, option) !== undefined;
}

function restArguments(call, rest) {
  if (rest !== 'tail') {
    return [call.arguments[rest]];
  }
  return call.arguments
    .slice(1)
    .flatMap((argument) =>
      argument.type === 'ObjectExpression' ? recordValue(argument) : [argument],
    );
}

function matchesLooseForm(sourceCode, call, form) {
  if (form.unlessFalse && call.arguments[0]?.type === 'Literal') {
    return call.arguments[0].value !== false;
  }
  if (form.rest !== undefined) {
    return restArguments(call, form.rest).some(
      (argument) => unvalidatedRoot(sourceCode, argument) !== undefined,
    );
  }
  return form.option === undefined || isLooseOption(sourceCode, call, form.option);
}

function looseCandidates(sourceCode, call) {
  const called = calledExport(sourceCode, call);
  if (called !== undefined) {
    return called.library.forms.loose
      .filter((form) => form.factory === called.name)
      .map((form) => ({ form, library: called.library }));
  }
  const method = call.callee.type === 'MemberExpression' ? propertyName(call.callee) : undefined;
  const library = method === undefined ? undefined : chainLibrary(sourceCode, call.callee.object);
  return (library?.forms.loose ?? [])
    .filter((form) => form.method === method)
    .map((form) => ({ form, library }));
}

export function looseForm(sourceCode, call) {
  return looseCandidates(sourceCode, call).find(({ form }) =>
    matchesLooseForm(sourceCode, call, form),
  );
}
