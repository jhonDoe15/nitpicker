import { appendingArgument } from '../support/calls.mjs';
import { addingProperty, isPlainObject, keyName } from '../support/objects.mjs';
import { visibleVariable } from '../support/scope.mjs';

function bindsCaught(sourceCode, node, handler) {
  const variable = visibleVariable(sourceCode, node, handler.param.name);
  return variable?.defs.some((definition) => definition.node === handler) === true;
}

export function causeFix(sourceCode, { wrapper, node, handler }) {
  const { optionsIndex } = wrapper;
  const { param } = handler;
  const hasSpread = node.arguments.some((argument) => argument.type === 'SpreadElement');
  if (param?.type !== 'Identifier' || optionsIndex === undefined || hasSpread) {
    return undefined;
  }
  if (!bindsCaught(sourceCode, node, handler)) {
    return undefined;
  }
  const cause = `cause: ${param.name}`;
  const options = node.arguments[optionsIndex];
  if (options === undefined) {
    return node.arguments.length === optionsIndex
      ? appendingArgument(sourceCode, node, `{ ${cause} }`)
      : undefined;
  }
  const hasCause = options.properties?.some((property) => keyName(property) === 'cause');
  return isPlainObject(options) && !hasCause
    ? addingProperty(sourceCode, options, cause)
    : undefined;
}
