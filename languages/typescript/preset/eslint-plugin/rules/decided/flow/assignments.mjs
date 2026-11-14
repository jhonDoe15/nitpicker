import { term } from '../../../../../../../shared/logic/terms.mjs';
import { ts } from '../../../../../typescript-api/typescript-api.mjs';
import { partsOf } from '../../analysis/narrowing/type-parts.mjs';
import { toTerm } from '../../analysis/logic/estree-terms.mjs';

const EXACT = ts.TypeFlags.StringLike | ts.TypeFlags.BooleanLike;

function isConstant(node) {
  if (node.type === 'UnaryExpression') {
    return (
      node.operator === '-' &&
      node.argument.type === 'Literal' &&
      typeof node.argument.value === 'number'
    );
  }
  if (node.type === 'TemplateLiteral') {
    return node.expressions.length === 0;
  }
  return node.type === 'Literal' && node.regex === undefined;
}

function isExactCopy(node, services) {
  if (node.type !== 'Identifier' || services?.program === null || services?.program === undefined) {
    return false;
  }
  return partsOf(services.getTypeAtLocation(node)).every((part) => (part.flags & EXACT) !== 0);
}

function assignmentsOf(node) {
  if (node.type === 'VariableDeclaration') {
    return node.declarations.map(({ id, init }) => ({ target: id, value: init }));
  }
  const expression = node.type === 'ExpressionStatement' ? node.expression : undefined;
  if (expression?.type === 'AssignmentExpression' && expression.operator === '=') {
    return [{ target: expression.left, value: expression.right }];
  }
  return [];
}

function factOf({ target, value }, node, sourceCode) {
  const text = sourceCode.getText(value);
  const line = String(node.loc.start.line);
  return {
    term: term('binary', '===', [toTerm(target, sourceCode), toTerm(value, sourceCode)]),
    names: new Set([target.name, ...(value.type === 'Identifier' ? [value.name] : [])]),
    readsMembers: false,
    reason: `\`${target.name}\` is set to \`${text}\` on line ${line}`,
  };
}

/**
 * What a declaration or a plain assignment statement tells about the variable it sets: it equals a
 * literal, or another variable of a string or boolean type (a number may be NaN).
 */
export function assignedFacts(node, sourceCode) {
  const services = sourceCode.parserServices;
  return assignmentsOf(node)
    .filter(
      ({ target, value }) =>
        target.type === 'Identifier' &&
        value !== null &&
        value !== undefined &&
        value.name !== target.name,
    )
    .filter(({ value }) => isConstant(value) || isExactCopy(value, services))
    .map((found) => factOf(found, node, sourceCode));
}
