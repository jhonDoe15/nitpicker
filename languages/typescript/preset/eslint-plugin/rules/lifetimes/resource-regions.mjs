import { variableNamed } from '../analysis/ancestry.mjs';

const USING_KINDS = new Set(['using', 'await using']);
const DISPOSERS = new Set(['close', 'dispose', 'destroy', 'release', 'disconnect', 'end']);
const DECLARATION_OWNER = 'using declaration';
const FINALLY_OWNER = 'finally block';

function containsRange(outer, inner) {
  return outer.range[0] <= inner.range[0] && inner.range[1] <= outer.range[1];
}

function disposedIdentifier(statement) {
  const expression =
    statement.type === 'ExpressionStatement' && statement.expression.type === 'AwaitExpression'
      ? statement.expression.argument
      : statement.expression;
  const callee = expression?.type === 'CallExpression' ? expression.callee : undefined;
  return callee?.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    DISPOSERS.has(callee.property.name)
    ? callee.object
    : undefined;
}

export function usingRegions(sourceCode, declaration) {
  if (!USING_KINDS.has(declaration.kind)) {
    return [];
  }
  return sourceCode
    .getDeclaredVariables(declaration)
    .map((variable) => ({ variable, region: declaration.parent, owner: DECLARATION_OWNER }));
}

export function finallyRegions(sourceCode, statement) {
  if (statement.finalizer === null) {
    return [];
  }
  return statement.finalizer.body
    .map(disposedIdentifier)
    .filter((identifier) => identifier !== undefined)
    .map((identifier) => variableNamed(sourceCode, identifier))
    .filter(
      (variable) =>
        variable !== undefined &&
        !variable.defs.some((definition) => containsRange(statement.block, definition.name)),
    )
    .map((variable) => ({ variable, region: statement.block, owner: FINALLY_OWNER }));
}

export function referencesIn({ variable, region }) {
  return variable.references
    .filter(({ init, identifier }) => !init && containsRange(region, identifier))
    .map(({ identifier }) => identifier);
}
