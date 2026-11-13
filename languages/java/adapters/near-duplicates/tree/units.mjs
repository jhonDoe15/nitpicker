import { depthFirst } from '../../../../../shared/traversal.mjs';
import { uniqueNames, withSnippet } from '../../../../../shared/near-duplicates/unit-parts.mjs';
import { EXPRESSIONS, lambdaOf } from './expressions.mjs';
import {
  EMPTY_CLASS_SCOPE,
  boundNames,
  classScope,
  fileScope,
  methodNode,
  nameNode,
} from './names.mjs';
import {
  NONE,
  at,
  codeChildren,
  field,
  isStatementNode,
  opaque,
  textOf,
  typeNode,
} from './nodes.mjs';
import { STATEMENTS } from './statements.mjs';

const CONVERTERS = { ...STATEMENTS, ...EXPRESSIONS };

const TOKEN = /[\w$]+|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\S/gu;

const TYPE_DECLARATIONS = new Set([
  'class_declaration',
  'interface_declaration',
  'enum_declaration',
  'record_declaration',
  'annotation_type_declaration',
]);

const UNIT_TYPES = new Set([
  'method_declaration',
  'constructor_declaration',
  'compact_constructor_declaration',
]);

function joined(qualifier, part) {
  return qualifier === '' ? part : `${qualifier}.${part}`;
}

function parameterTypes(source) {
  const parameters = field(source, 'parameters');
  if (parameters === undefined) {
    return '';
  }
  return codeChildren(parameters)
    .filter((parameter) => parameter.type !== 'receiver_parameter')
    .map((parameter) =>
      textOf(
        field(parameter, 'type') ??
          codeChildren(parameter).find((child) => child.type !== 'modifiers'),
      ),
    )
    .join(',');
}

function unitLabel(source, qualifier) {
  if (source.type === 'lambda_expression') {
    return qualifier;
  }
  const name = source.type === 'method_declaration' ? field(source, 'name').text : '<init>';
  return joined(qualifier, `${name}(${parameterTypes(source)})`);
}

function anonymousLabel(source, qualifier) {
  const owner =
    source.parent?.type === 'variable_declarator'
      ? field(source.parent, 'name').text
      : `new ${textOf(field(source, 'type'))}`;
  return joined(qualifier, owner);
}

function scopeOf(source, entry) {
  if (TYPE_DECLARATIONS.has(source.type)) {
    const qualifier = joined(entry.qualifier, field(source, 'name').text);
    const scope = classScope(entry.scope, {
      qualifier: `${entry.prefix}${qualifier}`,
      body: field(source, 'body'),
    });
    return { ...entry, qualifier, scope };
  }
  if (source.type === 'object_creation_expression' || source.type === 'enum_constant') {
    const body =
      codeChildren(source).find((child) => child.type === 'class_body') ?? field(source, 'body');
    const qualifier =
      source.type === 'enum_constant'
        ? joined(entry.qualifier, field(source, 'name').text)
        : anonymousLabel(source, entry.qualifier);
    return body === undefined
      ? entry
      : {
          ...entry,
          qualifier,
          scope: classScope(entry.scope, { qualifier: `${entry.prefix}${qualifier}`, body }),
        };
  }
  if (
    source.type === 'variable_declarator' &&
    field(source, 'value')?.type === 'lambda_expression'
  ) {
    return { ...entry, qualifier: joined(entry.qualifier, field(source, 'name').text) };
  }
  return entry;
}

function isUnit(source) {
  if (UNIT_TYPES.has(source.type)) {
    return field(source, 'body') !== undefined;
  }
  return source.type === 'lambda_expression' && source.parent?.type === 'variable_declarator';
}

function unitRoots(program, packageName) {
  const prefix = packageName === '' ? '' : `${packageName}.`;
  const pending = [{ node: program, qualifier: '', prefix, scope: EMPTY_CLASS_SCOPE }];
  const roots = [];
  for (const entry of pending) {
    if (entry.node !== program && isUnit(entry.node)) {
      roots.push({ ...entry, label: unitLabel(entry.node, entry.qualifier) });
    } else {
      const inner = scopeOf(entry.node, entry);
      pending.push(...codeChildren(entry.node).map((node) => ({ ...inner, node })));
    }
  }
  return roots.toSorted((left, right) => left.node.startIndex - right.node.startIndex);
}

function convertedTree(root, names) {
  const converted = new Map();
  const context = {
    get: (source) =>
      converted.get(source.id) ??
      opaque(isStatementNode(source) ? 'statement' : 'expression', source),
    name: (text, source) => ({ ...at('name', source), ...nameNode(text, names) }),
    method: (text, source) => ({ ...at('name', source), ...methodNode(text, names) }),
  };
  for (const source of [...depthFirst(root, codeChildren)].toReversed()) {
    const convert = CONVERTERS[source.type];
    if (convert !== undefined) {
      converted.set(source.id, withSnippet(convert(source, context), source.text));
    }
  }
  return context;
}

function functionOf(source, context) {
  if (source.type === 'lambda_expression') {
    const lambda = lambdaOf(source, context);
    const [parameters, body] = lambda.children;
    const block =
      body.kind === 'block' ? body : at('block', source, [at('return', source, [body])]);
    return at('function', source, [NONE, parameters, block]);
  }
  const parameters = field(source, 'parameters');
  const list =
    parameters === undefined
      ? []
      : codeChildren(parameters).filter((child) => child.type !== 'receiver_parameter');
  return at('function', source, [
    typeNode(field(source, 'type')),
    at(
      'parameters',
      parameters ?? source,
      list.map((parameter) => context.get(parameter)),
    ),
    context.get(field(source, 'body')),
  ]);
}

function unitOf(root, file) {
  const names = { bound: boundNames(root.node), scope: root.scope, file };
  const tree = functionOf(root.node, convertedTree(root.node, names));
  const tokens = root.node.text.match(TOKEN)?.length ?? 0;
  return { name: root.label, start: tree.start, end: tree.end, tokens, tree };
}

export function javaUnits(program, file) {
  const scope = fileScope(program);
  return uniqueNames(unitRoots(program, scope.packageName).map((root) => unitOf(root, scope))).map(
    (unit) => ({
      id: `${file}#${unit.name}`,
      file,
      ...unit,
    }),
  );
}
