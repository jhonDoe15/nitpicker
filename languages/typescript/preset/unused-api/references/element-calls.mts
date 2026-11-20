import type TypeScript from 'typescript';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import type { Passes, ReferenceState } from '../typed/context-types.mts';
import { allPasses, emptyPasses, objectPasses, unwrapExpression } from '../syntax/passes.mts';
import { consume, record, referencedComponent } from './state.mts';

const ts = typescriptApi();
const ELEMENT_FACTORIES = new Set(['createElement', 'jsx', 'jsxs', 'jsxDEV']);
const CLONE_ELEMENT = 'cloneElement';
const DEFAULT_PROPS = 'defaultProps';

export function isElementCall(name: string | undefined): boolean {
  return (name !== undefined && ELEMENT_FACTORIES.has(name)) || name === CLONE_ELEMENT;
}

function propsPasses(props: TypeScript.Expression | undefined): Passes {
  return props === undefined || props.kind === ts.SyntaxKind.NullKeyword
    ? emptyPasses()
    : objectPasses(props);
}

function factoryPasses(call: TypeScript.CallExpression): Passes {
  const [, props, ...children] = call.arguments;
  if (call.arguments.some(ts.isSpreadElement)) return allPasses();
  const passes = propsPasses(props);
  if (children.length > 0) passes.names.add('children');
  return passes;
}

function handleFactory(call: TypeScript.CallExpression, state: ReferenceState): void {
  const first = call.arguments[0];
  const type = first && unwrapExpression(first);
  const target = referencedComponent(type, state);
  if (target === undefined || type === undefined) return;
  consume(type, state);
  record({ target, state, kind: 'call', passes: factoryPasses(call) });
}

function handleCloneForAnyComponent(call: TypeScript.CallExpression, state: ReferenceState): void {
  state.registry.cloned.push({
    kind: 'call',
    passes: factoryPasses(call),
    role: state.file.role,
    packageDir: state.file.packageDir,
  });
}

export function handleElementCall(
  call: TypeScript.CallExpression,
  name: string | undefined,
  state: ReferenceState,
): void {
  if (name === CLONE_ELEMENT) handleCloneForAnyComponent(call, state);
  else handleFactory(call, state);
}

export function handleDefaultProps(
  assignment: TypeScript.BinaryExpression,
  state: ReferenceState,
): void {
  const { left } = assignment;
  const isDefaults =
    assignment.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isPropertyAccessExpression(left) &&
    left.name.text === DEFAULT_PROPS;
  const target = isDefaults ? referencedComponent(left.expression, state) : undefined;
  if (target !== undefined) {
    record({ target, state, kind: 'defaults', passes: objectPasses(assignment.right) });
  }
}
