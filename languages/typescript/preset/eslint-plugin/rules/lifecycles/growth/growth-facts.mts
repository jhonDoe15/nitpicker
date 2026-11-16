import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf } from '../../typed/node-views.mts';
import {
  functionName,
  isFunctionNode,
  type FunctionNode,
  type NonRoot,
} from '../scope/close-scopes.mts';
import { useKind, type AddUse } from '../scope/collections.mts';

export type Container = TSESTree.ClassBody | FunctionNode;
export type GrowingAdd = AddUse & { readonly use: NonRoot };

const REGISTRATION_NAME = /^(?:init|register)|^on\w*Init/u;
const BOUNDING_READS = new Set<string>(['size', 'length']);

function adderOf(use: NonRoot): FunctionNode | undefined {
  return ancestorsOf(use).find(isFunctionNode);
}

function isConstructor(fn: FunctionNode | undefined): boolean {
  return fn?.parent.type === AST_NODE_TYPES.MethodDefinition && fn.parent.kind === 'constructor';
}

function nameOfAdder(use: NonRoot): string | undefined {
  const adder = adderOf(use);
  return adder === undefined ? undefined : functionName(adder);
}

function isLiteralKey(add: AddUse): boolean {
  const key = add.key ?? addedKey(add);
  return key?.type === AST_NODE_TYPES.Literal;
}

function addedKey(add: AddUse): TSESTree.Node | undefined {
  return add.call.type === AST_NODE_TYPES.CallExpression &&
    (add.method === 'set' || add.method === 'add')
    ? add.call.arguments[0]
    : undefined;
}

function persists(fn: FunctionNode | undefined, container: Container): boolean {
  if (container.type === AST_NODE_TYPES.ClassBody) {
    return fn !== undefined && !isConstructor(fn);
  }
  return fn !== undefined && fn !== container && fn.parent.type !== AST_NODE_TYPES.CallExpression;
}

function returnsClosure(container: Container): boolean {
  if (container.type === AST_NODE_TYPES.ClassBody) {
    return true;
  }
  return (
    container.body.type !== AST_NODE_TYPES.BlockStatement ||
    container.body.body.some((statement) => statement.type === AST_NODE_TYPES.ReturnStatement)
  );
}

export function growingAdds(uses: readonly NonRoot[], container: Container): GrowingAdd[] {
  if (!returnsClosure(container)) {
    return [];
  }
  return uses
    .flatMap((use) => {
      const found = useKind(use);
      return found.kind === 'add' ? [{ use, ...found }] : [];
    })
    .filter(({ use }) => persists(adderOf(use), container))
    .filter((add) => !isLiteralKey(add))
    .filter(({ use }) => !REGISTRATION_NAME.test(nameOfAdder(use) ?? ''));
}

function removesIn(use: NonRoot): boolean {
  const { kind } = useKind(use);
  return (
    kind === 'remove' || kind === 'escape' || (kind === 'reassign' && !isConstructor(adderOf(use)))
  );
}

function boundsSize(use: NonRoot): boolean {
  const found = useKind(use);
  return found.kind === 'read' && BOUNDING_READS.has(found.method ?? '');
}

export function isRemoved(uses: readonly NonRoot[]): boolean {
  return uses.some((use) => removesIn(use) || boundsSize(use));
}

export function adderName(add: GrowingAdd): string {
  const name = nameOfAdder(add.use);
  return name === undefined ? 'a callback' : `${name}()`;
}

export function isDeclaration(use: NonRoot): boolean {
  return use.parent.type === AST_NODE_TYPES.VariableDeclarator && use.parent.id === use;
}

const SERVICE_NAME = /(?:Service|Manager|Registry|Store|Cache|Client|Server|Gateway|Repository)$/u;

export function isLongLived(container: Container, closers: readonly FunctionNode[]): boolean {
  if (container.type !== AST_NODE_TYPES.ClassBody) {
    return closers.length > 0;
  }
  const declaration = container.parent;
  return (
    closers.length > 0 ||
    declaration.decorators.length > 0 ||
    SERVICE_NAME.test(declaration.id?.name ?? '')
  );
}
