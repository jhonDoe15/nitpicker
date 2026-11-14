import { boundNames } from '../../tree/names.mjs';
import {
  codeParts,
  descendants,
  field,
  isWritten,
  namedChildren,
  roleOf,
  squashed,
} from '../syntax.mjs';

const THROW = 'throw_statement';

const ALLOWED = new Set([
  'local_variable_declaration',
  'expression_statement',
  'if_statement',
  'for_statement',
  'enhanced_for_statement',
  'while_statement',
  'do_statement',
  'try_statement',
  'try_with_resources_statement',
  THROW,
  'return_statement',
  'block',
  'switch_expression',
  'assert_statement',
]);

const LOOPS = new Set([
  'for_statement',
  'enhanced_for_statement',
  'while_statement',
  'do_statement',
]);
const OWN_SCOPES = new Set(['lambda_expression', 'class_body']);
const LOCAL_TYPES = new Set([
  'class_declaration',
  'interface_declaration',
  'enum_declaration',
  'record_declaration',
]);
const BOTH = 'the run returns a value and also defines one that the code after it uses';
const EARLY = 'the run returns early on some paths';

function ownNodes(statements) {
  const found = [];
  const pending = [...statements];
  for (const node of pending) {
    found.push(node);
    if (!OWN_SCOPES.has(node.type)) {
      pending.push(...node.namedChildren);
    }
  }
  return found;
}

function enclosingWithin(node, statements) {
  const ids = new Set(statements.map(({ id }) => id));
  const found = [];
  const pending = ids.has(node.id) ? [] : [node.parent];
  for (const current of pending) {
    found.push(current);
    if (!ids.has(current.id)) {
      pending.push(current.parent);
    }
  }
  return found;
}

function hasTarget(node, statements) {
  const wanted = node.type === 'break_statement' ? [...LOOPS, 'switch_expression'] : [...LOOPS];
  return enclosingWithin(node, statements).some(({ type }) => wanted.includes(type));
}

function jumpProblem(node, statements) {
  if (node.type === 'return_statement') {
    const final = node.id === statements.at(-1).id && namedChildren(node).length > 0;
    return final ? undefined : EARLY;
  }
  if (node.type === 'break_statement' || node.type === 'continue_statement') {
    const inside = namedChildren(node).length === 0 && hasTarget(node, statements);
    return inside ? undefined : 'the run jumps out of itself';
  }
  return node.type === 'yield_statement' || node.type === 'labeled_statement'
    ? 'the run yields or has a label'
    : undefined;
}

function endsAbruptly(statement) {
  const own = descendants(statement);
  switch (statement.type) {
    case THROW:
      return true;
    case 'if_statement':
      return field(statement, 'alternative') !== undefined;
    case 'while_statement':
      return /^\(\s*true\s*\)$/u.test(field(statement, 'condition').text);
    case 'for_statement':
      return field(statement, 'condition') === undefined;
    case 'block':
    case 'try_statement':
    case 'try_with_resources_statement':
    case 'switch_expression':
      return own.some(({ type }) => type === THROW);
    default:
      return false;
  }
}

function shapeProblem(statements) {
  if (endsAbruptly(statements.at(-1))) {
    return 'the run may end by throwing, so the method could lack a return after the call';
  }
  if (!statements.every(({ type }) => ALLOWED.has(type))) {
    return 'the run has a statement of a kind the shared method cannot take';
  }
  const nodes = ownNodes(statements);
  if (nodes.some(({ type }) => LOCAL_TYPES.has(type))) {
    return 'the run declares a local class';
  }
  return nodes.map((node) => jumpProblem(node, statements)).find(Boolean);
}

function runLocals(statements) {
  return new Set(statements.flatMap((statement) => [...boundNames(statement)]));
}

function writeProblem(method, statements) {
  const own = runLocals(statements);
  const locals = boundNames(method);
  const written = statements
    .flatMap((statement) => descendants(statement))
    .some(
      (node) =>
        node.type === 'identifier' &&
        isWritten(node) &&
        locals.has(node.text) &&
        !own.has(node.text),
    );
  return written ? 'the run writes a variable declared before it' : undefined;
}

function declaredByRun(statements) {
  return statements.flatMap((statement, index) =>
    statement.type === 'local_variable_declaration'
      ? codeParts(statement)
          .filter((child) => child.type === 'variable_declarator')
          .map((declarator, position) => ({ statement, declarator, where: `${index}:${position}` }))
      : [],
  );
}

function usedAfter(method, statements) {
  const end = statements.at(-1).endIndex;
  const later = new Set(
    descendants(field(method, 'body'))
      .filter(
        (node) =>
          node.type === 'identifier' && node.startIndex >= end && roleOf(node) === 'reference',
      )
      .map(({ text }) => text),
  );
  return declaredByRun(statements).filter(({ declarator }) =>
    later.has(field(declarator, 'name').text),
  );
}

function valueOutput([{ statement, declarator, where }]) {
  const type = field(statement, 'type');
  const modifiers = codeParts(statement).find((child) => child.type === 'modifiers');
  const plain = modifiers === undefined || modifiers.text.trim() === 'final';
  if (
    type === undefined ||
    type.text === 'var' ||
    !plain ||
    field(declarator, 'dimensions') !== undefined
  ) {
    return {
      problem:
        'the value that the code after the run uses has a type the shared method cannot name',
    };
  }
  const prefix = modifiers === undefined ? '' : 'final ';
  return {
    output: {
      kind: 'value',
      where,
      name: field(declarator, 'name').text,
      type: squashed(type),
      prefix,
    },
  };
}

function outputOf(method, statements) {
  const endsWithReturn = statements.at(-1).type === 'return_statement';
  const used = usedAfter(method, statements);
  if (used.length > 1) {
    return { problem: 'the run defines more than one value that the code after it uses' };
  }
  if (used.length === 1) {
    return endsWithReturn ? { problem: BOTH } : valueOutput(used);
  }
  return { output: { kind: endsWithReturn ? 'return' : 'none' } };
}

export function runAnalysis(method, statements) {
  const problem = shapeProblem(statements) ?? writeProblem(method, statements);
  return problem === undefined ? outputOf(method, statements) : { problem };
}

function typeWithDimensions(type, owner) {
  const dimensions = field(owner, 'dimensions');
  return dimensions === undefined ? squashed(type) : `${squashed(type)}${squashed(dimensions)}`;
}

function declaredTypes(method, name, before) {
  return descendants(method)
    .filter((node) => node.startIndex < before)
    .flatMap((node) => {
      if (node.type === 'formal_parameter' || node.type === 'enhanced_for_statement') {
        return field(node, 'name')?.text === name
          ? [typeWithDimensions(field(node, 'type'), node)]
          : [];
      }
      if (node.type !== 'local_variable_declaration') {
        return [];
      }
      const declarators = codeParts(node).filter(
        (child) => child.type === 'variable_declarator' && field(child, 'name').text === name,
      );
      return declarators.map((declarator) =>
        field(declarator, 'value') === undefined
          ? undefined
          : typeWithDimensions(field(node, 'type'), declarator),
      );
    });
}

function typeOfInput(method, name, before) {
  const types = declaredTypes(method, name, before);
  const texts = new Set(types);
  const [text] = [...texts];
  return texts.size === 1 && text !== undefined && text !== 'var' ? text : undefined;
}

function firstUse(statements, name) {
  const use = statements
    .flatMap((statement) => descendants(statement))
    .find((node) => node.type === 'identifier' && node.text === name);
  return use === undefined ? Number.MAX_SAFE_INTEGER : use.startIndex;
}

export function inputsOf(sides, bindings) {
  const [own, other] = sides.map(({ statements }) => runLocals(statements));
  if (bindings.some(([left, right]) => own.has(left) !== other.has(right))) {
    return { problem: 'one copy names a local of the run where the other names an outer one' };
  }
  const names = bindings
    .filter(([left]) => !own.has(left))
    .toSorted(
      ([left], [right]) =>
        firstUse(sides[0].statements, left) - firstUse(sides[0].statements, right),
    );
  const inputs = names.map((pair) => ({
    names: pair,
    types: sides.map(({ method, statements }, index) =>
      typeOfInput(method, pair[index], statements[0].startIndex),
    ),
  }));
  const unknown = inputs.some(({ types }) => types[0] === undefined || types[0] !== types[1]);
  return unknown
    ? { problem: 'an input of the run has no declared type, or a different one in each copy' }
    : { inputs: inputs.map(({ names: pair, types }) => ({ names: pair, type: types[0] })) };
}

export function thrownTypes(statements) {
  return ownNodes(statements)
    .filter(({ type }) => type === THROW)
    .map((node) => {
      const [thrown] = namedChildren(node);
      return thrown.type === 'object_creation_expression' ? squashed(field(thrown, 'type')) : '';
    })
    .join(',');
}
