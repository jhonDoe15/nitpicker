import { contains, isBound, placedLike, present, rebuild } from '../tree/nodes.mts';
import type { BoundName, NearUnit, TreeNode } from '../tree/tree-types.mts';

export type LabelParts = {
  readonly owner: string;
  readonly name: string;
  readonly repeated: boolean;
};

export type InlinableFunction = {
  readonly parameters: readonly string[];
  readonly statements: readonly TreeNode[];
  readonly owner: string;
  readonly name: string;
};

type Ambiguous = { readonly ambiguous: true };
type HelperBody = Pick<InlinableFunction, 'parameters' | 'statements'>;

export type HelperTable = Map<string, InlinableFunction | Ambiguous>;

export type HelperScope = {
  readonly table: HelperTable;
  readonly file: string;
  readonly owner: string | undefined;
  inlined: number;
};

export type HelperCall = {
  readonly helper: InlinableFunction;
  readonly rest: readonly TreeNode[];
  readonly scope: HelperScope;
};

const INLINE_DEPTH = 2;
const AMBIGUOUS: Ambiguous = Object.freeze({ ambiguous: true });
const LABEL = /^(?:(?<owner>[\w$.]+)\.)?(?<name>[\w$]+)(?:\([^()]*\))?$/u;
const REPEAT = /#\d+$/u;
const IDENTIFIER = /^[\w$]+$/u;
const CLOSED_OVER = new Set(['assign', 'update', 'lambda', 'declare', 'this']);
const SIMPLE_ARGUMENTS = new Set(['literal', 'this']);

export function labelParts(label: string): LabelParts | undefined {
  const groups = LABEL.exec(label.replace(REPEAT, ''))?.groups;
  const name = groups?.['name'];
  return name === undefined
    ? undefined
    : { owner: groups?.['owner'] ?? '', name, repeated: REPEAT.test(label) };
}

function tableKey(file: string, name: string, arity: number): string {
  return JSON.stringify([file, name, arity]);
}

function parameterNames(tree: TreeNode): string[] | undefined {
  const names = present(tree.children[1]).children.map(({ children }) => children[1]);
  const bound: (TreeNode & BoundName)[] = names.filter(isBound);
  return bound.length === names.length ? bound.map(({ value }) => value) : undefined;
}

function isValueJump(statement: TreeNode | undefined): boolean {
  return (
    statement?.kind === 'throw' ||
    (statement?.kind === 'return' && statement.children[0]?.kind !== 'none')
  );
}

function isGuard(statement: TreeNode): boolean {
  const [, then, otherwise] = statement.kind === 'if' ? statement.children : [];
  return (
    otherwise?.kind === 'none' &&
    then?.kind === 'block' &&
    then.children.length === 1 &&
    isValueJump(then.children[0])
  );
}

function helperOf(tree: TreeNode): HelperBody | undefined {
  const parameters = parameterNames(tree);
  const block = tree.children[2];
  const statements = block?.kind === 'block' ? block.children : [];
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

export function helperTable(units: readonly NearUnit[]): HelperTable {
  const table: HelperTable = new Map();
  for (const unit of units) {
    const parts = labelParts(unit.name);
    const body = unit.final && !parts?.repeated ? helperOf(unit.tree) : undefined;
    if (parts !== undefined) {
      const { owner, name } = parts;
      const key = tableKey(unit.file, name, present(unit.tree.children[1]).children.length);
      table.set(key, table.has(key) || body === undefined ? AMBIGUOUS : { ...body, owner, name });
    }
  }
  return table;
}

function calledName(callee: TreeNode): string | undefined {
  if (callee.kind === 'name' && callee.binding === 'free') {
    return IDENTIFIER.test(callee.text ?? '') ? callee.text : undefined;
  }
  return callee.kind === 'member' && callee.children[0]?.kind === 'this' ? callee.value : undefined;
}

function reaches(callee: TreeNode, helper: InlinableFunction, owner: string | undefined): boolean {
  if (callee.kind === 'member') {
    return helper.owner === owner;
  }
  const qualified = [`${helper.owner}#${helper.name}`, `${helper.owner}#${helper.name}()`];
  return (
    (callee.value === helper.name && (helper.owner === owner || helper.owner === '')) ||
    qualified.some(
      (suffix) =>
        callee.value === suffix ||
        callee.value?.endsWith(helper.owner === '' ? suffix : `.${suffix}`) === true,
    )
  );
}

function isSimple(argument: TreeNode): boolean {
  return isBound(argument) || SIMPLE_ARGUMENTS.has(argument.kind);
}

function isHelper(entry: InlinableFunction | Ambiguous): entry is InlinableFunction {
  return entry !== AMBIGUOUS;
}

export function calledHelper(
  node: TreeNode | undefined,
  scope: HelperScope,
): HelperCall | undefined {
  const { table, file } = scope;
  const [callee, ...rest] = node?.kind === 'call' ? node.children : [];
  const name = callee === undefined ? undefined : calledName(callee);
  const found = name === undefined ? undefined : table.get(tableKey(file, name, rest.length));
  return callee !== undefined &&
    found !== undefined &&
    isHelper(found) &&
    reaches(callee, found, scope.owner) &&
    rest.every(isSimple)
    ? { helper: found, rest, scope }
    : undefined;
}

function substituted(
  root: TreeNode,
  { helper, rest, scope }: HelperCall,
  site: TreeNode,
): TreeNode {
  scope.inlined += 1;
  const bindings = new Map(
    helper.parameters.map((name, index): [string, TreeNode] => [name, present(rest[index])]),
  );
  return rebuild(root, (node: TreeNode, children: TreeNode[]) =>
    isBound(node) ? present(bindings.get(node.value)) : placedLike(node, children, site),
  );
}

function spliced(statement: TreeNode, scope: HelperScope): readonly TreeNode[] {
  const call = statement.kind === 'return' ? calledHelper(statement.children[0], scope) : undefined;
  return call === undefined || isExpressionHelper(call.helper)
    ? [statement]
    : call.helper.statements.map((part) => substituted(part, call, statement));
}

export function isExpressionHelper({ statements }: HelperBody): boolean {
  return statements.length === 1 && statements[0]?.kind === 'return';
}

function inlineStep(root: TreeNode, scope: HelperScope): TreeNode {
  return rebuild(root, (node: TreeNode, children: TreeNode[]) => {
    const built = { ...node, children };
    if (node.kind === 'block') {
      return { ...built, children: children.flatMap((child) => spliced(child, scope)) };
    }
    const call = calledHelper(built, scope);
    return call !== undefined && isExpressionHelper(call.helper)
      ? substituted(present(present(call.helper.statements[0]).children[0]), call, node)
      : built;
  });
}

function inlinedTree(unit: NearUnit, table: HelperTable): TreeNode {
  const scope: HelperScope = {
    table,
    file: unit.file,
    owner: labelParts(unit.name)?.owner,
    inlined: 0,
  };
  return Array.from({ length: INLINE_DEPTH }).reduce<TreeNode>((tree) => {
    if (!contains(tree, (node) => calledHelper(node, scope) !== undefined)) {
      return tree;
    }
    const before = scope.inlined;
    const next = inlineStep(tree, scope);
    return scope.inlined === before ? tree : next;
  }, unit.tree);
}

export function inlinedTrees(units: readonly NearUnit[]): Map<string, TreeNode> {
  const table = helperTable(units);
  const trees = new Map<string, TreeNode>();
  for (const unit of units.filter(({ tree }) => tree.kind === 'function')) {
    const tree = inlinedTree(unit, table);
    if (tree !== unit.tree) {
      trees.set(unit.id, tree);
    }
  }
  return trees;
}
