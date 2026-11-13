import { EXPRESSIONS, lambdaOf } from './expressions.mjs';
import { EMPTY_CLASS_SCOPE, boundNames, classScope, fileScope } from './names.mjs';
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
import { languageUnits } from './unit-driver.mjs';

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

const JAVA = {
  converters: { ...STATEMENTS, ...EXPRESSIONS },
  context: {},
  isStatementNode,
  fileScope,
  outerScope: () => EMPTY_CLASS_SCOPE,
  boundNames,
  isUnit,
  unitLabel,
  scopeOf,
  functionOf,
};

export function javaUnits(program, file) {
  return languageUnits(JAVA, program, file);
}
