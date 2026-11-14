import { contains, isBound, rebuild } from '../tree/nodes.mjs';

const INLINE_DEPTH = 2;
const AMBIGUOUS = Object.freeze({ ambiguous: true });
const LABEL = /^(?:(?<owner>[\w$.]+)\.)?(?<name>[\w$]+)(?:\([^()]*\))?$/u;
const REPEAT = /#\d+$/u;
const IDENTIFIER = /^[\w$]+$/u;
const CLOSED_OVER = new Set(['assign', 'update', 'lambda', 'declare', 'this']);
const SIMPLE_ARGUMENTS = new Set(['literal', 'this']);

function labelParts(label) {
  const groups = LABEL.exec(label.replace(REPEAT, ''))?.groups;
  return groups === undefined
    ? undefined
    : { owner: groups.owner ?? '', name: groups.name, repeated: REPEAT.test(label) };
}

function tableKey(file, name, arity) {
  return JSON.stringify([file, name, arity]);
}

function parameterNames(tree) {
  const names = tree.children[1].children.map(({ children: [, name] }) => name);
  return names.every(isBound) ? names.map(({ value }) => value) : undefined;
}

function isValueJump(statement) {
  return (
    statement?.kind === 'throw' ||
    (statement?.kind === 'return' && statement.children[0]?.kind !== 'none')
  );
}

function isGuard(statement) {
  const [, then, otherwise] = statement.kind === 'if' ? statement.children : [];
  return (
    otherwise?.kind === 'none' &&
    then.kind === 'block' &&
    then.children.length === 1 &&
    isValueJump(then.children[0])
  );
}

function helperOf(tree) {
  const parameters = parameterNames(tree);
  const statements = tree.children[2]?.kind === 'block' ? tree.children[2].children : [];
  const last = statements.at(-1);
  const shaped =
    parameters !== undefined &&
    last?.kind === 'return' &&
    isValueJump(last) &&
    statements.slice(0, -1).every(isGuard);
  const closed =
    shaped &&
    !statements.some((statement) =>
      contains(
        statement,
        (node) => CLOSED_OVER.has(node.kind) || (isBound(node) && !parameters.includes(node.value)),
      ),
    );
  return closed ? { parameters, statements } : undefined;
}

function helperTable(units) {
  const table = new Map();
  for (const unit of units) {
    const parts = labelParts(unit.name);
    const key =
      parts === undefined
        ? undefined
        : tableKey(unit.file, parts.name, unit.tree.children[1].children.length);
    const body = unit.final === true && !parts?.repeated ? helperOf(unit.tree) : undefined;
    if (key !== undefined) {
      const { owner, name } = parts;
      table.set(key, table.has(key) || body === undefined ? AMBIGUOUS : { ...body, owner, name });
    }
  }
  return table;
}

function calledName(callee) {
  if (callee.kind === 'name' && callee.binding === 'free') {
    return IDENTIFIER.test(callee.text ?? '') ? callee.text : undefined;
  }
  return callee.kind === 'member' && callee.children[0].kind === 'this' ? callee.value : undefined;
}

function reaches(callee, helper, owner) {
  if (callee.kind === 'member') {
    return helper.owner === owner;
  }
  const qualified = [`${helper.owner}#${helper.name}`, `${helper.owner}#${helper.name}()`];
  return (
    (callee.value === helper.name && (helper.owner === owner || helper.owner === '')) ||
    qualified.some(
      (suffix) =>
        callee.value === suffix ||
        callee.value.endsWith(helper.owner === '' ? suffix : `.${suffix}`),
    )
  );
}

function isSimple(argument) {
  return isBound(argument) || SIMPLE_ARGUMENTS.has(argument.kind);
}

function calledHelper(node, scope) {
  const { table, file } = scope;
  const [callee, ...rest] = node?.kind === 'call' ? node.children : [];
  const name = callee === undefined ? undefined : calledName(callee);
  const helper = name === undefined ? undefined : table.get(tableKey(file, name, rest.length));
  return helper !== undefined &&
    helper !== AMBIGUOUS &&
    reaches(callee, helper, scope.owner) &&
    rest.every(isSimple)
    ? { helper, rest, scope }
    : undefined;
}

function substituted(root, { helper, rest, scope }, site) {
  scope.inlined += 1;
  const bindings = new Map(helper.parameters.map((name, index) => [name, rest[index]]));
  return rebuild(root, (node, children) =>
    isBound(node)
      ? bindings.get(node.value)
      : { ...node, children, start: site.start, end: site.end },
  );
}

function spliced(statement, scope) {
  const call = statement.kind === 'return' ? calledHelper(statement.children[0], scope) : undefined;
  return call === undefined || isExpressionHelper(call.helper)
    ? [statement]
    : call.helper.statements.map((part) => substituted(part, call, statement));
}

function isExpressionHelper({ statements }) {
  return statements.length === 1 && statements[0].kind === 'return';
}

function inlineStep(root, scope) {
  return rebuild(root, (node, children) => {
    const built = { ...node, children };
    if (node.kind === 'block') {
      return { ...built, children: children.flatMap((child) => spliced(child, scope)) };
    }
    const call = calledHelper(built, scope);
    return call !== undefined && isExpressionHelper(call.helper)
      ? substituted(call.helper.statements[0].children[0], call, node)
      : built;
  });
}

function inlinedTree(unit, table) {
  const scope = { table, file: unit.file, owner: labelParts(unit.name)?.owner, inlined: 0 };
  return Array.from({ length: INLINE_DEPTH }).reduce((tree) => {
    if (!contains(tree, (node) => calledHelper(node, scope) !== undefined)) {
      return tree;
    }
    const before = scope.inlined;
    const next = inlineStep(tree, scope);
    return scope.inlined === before ? tree : next;
  }, unit.tree);
}

export function inlinedTrees(units) {
  const table = helperTable(units);
  const trees = new Map();
  for (const unit of units.filter(({ tree }) => tree?.kind === 'function')) {
    const tree = inlinedTree(unit, table);
    if (tree !== unit.tree) {
      trees.set(unit.id, tree);
    }
  }
  return trees;
}
