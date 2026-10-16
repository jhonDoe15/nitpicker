import ts from 'typescript';
import { allPasses, emptyPasses, objectPasses, unwrapExpression } from '../syntax/passes.mjs';
import { consume, record, referencedComponent } from './state.mjs';

const ELEMENT_FACTORIES = new Set(['createElement', 'jsx', 'jsxs', 'jsxDEV']);
const CLONE_ELEMENT = 'cloneElement';
const DEFAULT_PROPS = 'defaultProps';

export function isElementCall(name) {
  return ELEMENT_FACTORIES.has(name) || name === CLONE_ELEMENT;
}

function propsPasses(props) {
  return props === undefined || props.kind === ts.SyntaxKind.NullKeyword
    ? emptyPasses()
    : objectPasses(props);
}

function factoryPasses(call) {
  const [, props, ...children] = call.arguments;
  if (call.arguments.some(ts.isSpreadElement)) return allPasses();
  const passes = propsPasses(props);
  if (children.length > 0) passes.names.add('children');
  return passes;
}

function handleFactory(call, state) {
  const type = call.arguments[0] && unwrapExpression(call.arguments[0]);
  const target = referencedComponent(type, state);
  if (target === undefined) return;
  consume(type, state);
  record({ target, state, kind: 'call', passes: factoryPasses(call) });
}

function handleCloneForAnyComponent(call, state) {
  state.registry.cloned.push({
    kind: 'call',
    passes: factoryPasses(call),
    role: state.file.role,
    packageDir: state.file.packageDir,
  });
}

export function handleElementCall(call, name, state) {
  if (name === CLONE_ELEMENT) handleCloneForAnyComponent(call, state);
  else handleFactory(call, state);
}

/** `X.defaultProps = { a: 1 }` sets `a` for every render of X. */
export function handleDefaultProps(assignment, state) {
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
