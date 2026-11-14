import { chainOf } from '../../../../../shared/traversal.mjs';
import { NONE, at, codeChildren, field, textOf, typeNode } from '../tree/nodes.mjs';
import { joined } from '../tree/units.mjs';
import { languageUnits } from '../tree/unit-driver.mjs';
import { EXPRESSIONS } from './expressions.mjs';
import { boundNames, classMembers, fileScope, memberScope, topLevelScope } from './names.mjs';
import { STATEMENTS, assignedValue } from './statements.mjs';

const BLOCK_KIND = 'block';

const STATEMENT_PARENTS = new Set([
  BLOCK_KIND,
  'statements',
  'for_statement',
  'while_statement',
  'do_while_statement',
]);
const BRANCHING = new Set(['if_expression', 'when_entry', 'when_expression']);
const STATEMENT_ONLY = new Set([
  'property_declaration',
  'assignment',
  'for_statement',
  'while_statement',
  'do_while_statement',
  'function_declaration',
]);
const TYPE_DECLARATIONS = new Set(['class_declaration', 'object_declaration', 'companion_object']);
const UNIT_TYPES = new Set(['function_declaration', 'secondary_constructor', 'getter', 'setter']);
const BODIES = new Set(['function_body', BLOCK_KIND]);

function isConditionOf(node, parent) {
  return parent.childrenForFieldName('condition').some((condition) => condition?.id === node.id);
}

function branchParent(node) {
  return BRANCHING.has(node.parent?.type) && !isConditionOf(node, node.parent)
    ? node.parent
    : undefined;
}

function isStatement(source) {
  return STATEMENT_PARENTS.has(chainOf(source, branchParent).at(-1).parent?.type);
}

const OPEN_MODIFIERS = new Set(['open', 'override', 'abstract']);
const CLOSED_MODIFIERS = new Set(['private', 'final']);

function modifierWords(source) {
  const modifiers = codeChildren(source).find((child) => child.type === 'modifiers');
  return modifiers === undefined ? [] : modifiers.text.split(/\s+/u);
}

function isFinal(source) {
  if (source.type !== 'function_declaration') {
    return false;
  }
  const words = modifierWords(source);
  const owner = source.parent?.type === 'class_body' ? source.parent.parent : undefined;
  return (
    words.some((word) => CLOSED_MODIFIERS.has(word)) ||
    (!words.some((word) => OPEN_MODIFIERS.has(word)) &&
      owner?.children.some((child) => child.type === 'interface') !== true)
  );
}

function isType(node) {
  return node.type.endsWith('_type');
}

function parameterTypes(source) {
  const list = codeChildren(source).find((child) => child.type === 'function_value_parameters');
  return list === undefined
    ? ''
    : codeChildren(list)
        .filter((child) => child.type === 'parameter')
        .map((parameter) => textOf(codeChildren(parameter).find(isType)))
        .join(',');
}

function propertyName(source) {
  const variable = codeChildren(source).find((child) => child.type === 'variable_declaration');
  return codeChildren(variable)[0].text;
}

function functionLabel(source, qualifier) {
  const name = field(source, 'name');
  const receiver = codeChildren(source).find(
    (child) => isType(child) && child.endIndex <= name.startIndex,
  );
  const owner = receiver === undefined ? qualifier : joined(qualifier, textOf(receiver));
  return joined(owner, `${name.text}(${parameterTypes(source)})`);
}

function unitLabel(source, qualifier) {
  if (source.type === 'getter' || source.type === 'setter') {
    const accessor = source.type === 'getter' ? 'get' : 'set';
    return joined(qualifier, `${accessor} ${propertyName(source.parent)}`);
  }
  if (source.type === 'lambda_literal') {
    return qualifier;
  }
  if (source.type === 'secondary_constructor') {
    return joined(qualifier, `<init>(${parameterTypes(source)})`);
  }
  return functionLabel(source, qualifier);
}

function typeName(source) {
  if (source.type === 'companion_object') {
    return field(source, 'name')?.text ?? 'Companion';
  }
  return field(source, 'name')?.text ?? '<object>';
}

function scopeOf(source, entry) {
  if (TYPE_DECLARATIONS.has(source.type)) {
    const qualifier = joined(entry.qualifier, typeName(source));
    const scope = memberScope(entry.scope, {
      qualifier: `${entry.prefix}${qualifier}`,
      members: classMembers(source),
    });
    return { ...entry, qualifier, scope };
  }
  if (source.type === 'enum_entry') {
    return { ...entry, qualifier: joined(entry.qualifier, codeChildren(source)[0].text) };
  }
  if (source.type === 'property_declaration' && assignedValue(source)?.type === 'lambda_literal') {
    return { ...entry, qualifier: joined(entry.qualifier, propertyName(source)) };
  }
  return entry;
}

function isUnit(source) {
  if (source.hasError) {
    return false;
  }
  if (UNIT_TYPES.has(source.type)) {
    return codeChildren(source).some((child) => BODIES.has(child.type));
  }
  return source.type === 'lambda_literal' && source.parent?.type === 'property_declaration';
}

function withDefault(parameters, child, context) {
  if (child.type === 'parameter') {
    return [...parameters, context.get(child)];
  }
  const last = parameters.at(-1);
  if (last === undefined) {
    return parameters;
  }
  const [type, name] = last.children;
  const value = at({ kind: 'expression', value: 'default' }, child, [name, context.get(child)]);
  return [...parameters.slice(0, -1), { ...last, children: [type, value] }];
}

function parametersOf(source, context) {
  const list = codeChildren(source).find((child) => child.type === 'function_value_parameters');
  const parameters = (list === undefined ? [] : codeChildren(list)).reduce(
    (found, child) => withDefault(found, child, context),
    [],
  );
  if (source.type === 'setter') {
    const [name] = codeChildren(source);
    parameters.push(at('parameter', name, [NONE, context.get(name)]));
  }
  return at('parameters', list ?? source, parameters);
}

function functionBody(source, context) {
  const body = codeChildren(source).find((child) => BODIES.has(child.type));
  const [first] = body.type === BLOCK_KIND ? [body] : codeChildren(body);
  if (first.type === BLOCK_KIND) {
    return context.get(first);
  }
  return at(BLOCK_KIND, body, [at('return', body, [context.get(first)])]);
}

function functionOf(source, context) {
  if (source.type === 'lambda_literal') {
    const [parameters, body] = context.get(source).children;
    const block =
      body.kind === BLOCK_KIND ? body : at(BLOCK_KIND, source, [at('return', source, [body])]);
    return at('function', source, [NONE, parameters, block]);
  }
  const name = field(source, 'name');
  const returnType = codeChildren(source).find(
    (child) => isType(child) && (name === undefined || child.startIndex > name.startIndex),
  );
  return at('function', source, [
    typeNode(returnType),
    parametersOf(source, context),
    functionBody(source, context),
  ]);
}

const KOTLIN = {
  converters: { ...STATEMENTS, ...EXPRESSIONS },
  context: { isStatement, isStatementType: (node) => STATEMENT_ONLY.has(node.type) },
  isStatementNode: isStatement,
  fileScope,
  outerScope: topLevelScope,
  boundNames,
  isUnit,
  isFinal,
  unitLabel,
  scopeOf,
  functionOf,
};

export function kotlinUnits(program, file) {
  return languageUnits(KOTLIN, program, file);
}
